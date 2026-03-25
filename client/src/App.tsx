import { useState, useRef, useEffect, useCallback } from "react";
import type { DisplayMessage, Citation, DocInfo, RoutingDecision, CaseListItem, SavedCase, CaseMemory, ConversationTurn } from "./types.ts";
import { extractPdfText } from "./adapters/pdfExtract.ts";
import { generatePdfReport } from "./adapters/pdfReport.tsx";
import type { ReportData } from "./adapters/pdfReport.tsx";
import { citationToHighlight } from "./adapters/pdfViewer.tsx";
import type { IHighlight } from "./adapters/pdfViewer.tsx";
import { useStreamProcessor } from "./hooks/useStreamProcessor.ts";

import { CaseSidebar } from "./components/sidebar/CaseSidebar.tsx";
import { AppHeader } from "./components/layout/AppHeader.tsx";
import { IntakeNotification } from "./components/layout/IntakeNotification.tsx";
import { HitlReplyCard } from "./components/layout/HitlReplyCard.tsx";
import { PreviewPane } from "./components/layout/PreviewPane.tsx";
import { MessageList } from "./components/chat/MessageList.tsx";
import { ChatInput } from "./components/input/ChatInput.tsx";

export default function App() {
  const [displayMessages, setDisplayMessages] = useState<DisplayMessage[]>([]);
  const [history, setHistory] = useState<ConversationTurn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [toolRunning, setToolRunning] = useState<string | null>(null);

  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [caseName, setCaseName] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [pendingDocs, setPendingDocs] = useState<Array<{ file: File; name: string; url: string }>>([]);
  const [sessionDocs, setSessionDocs] = useState<DocInfo[]>([]);
  const [nextDocId, setNextDocId] = useState(1);

  const [previewPdf, setPreviewPdf] = useState<{ url: string; name: string } | null>(null);
  const [activeCitation, setActiveCitation] = useState<Citation | null>(null);
  const [highlightKey, setHighlightKey] = useState(0);

  const [intakeNotification, setIntakeNotification] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [collapsedAgents, setCollapsedAgents] = useState<Set<number>>(new Set());

  // Settings
  const [humanInTheLoop, setHumanInTheLoop] = useState(() => localStorage.getItem("mlex_hitl") === "true");
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => { localStorage.setItem("mlex_hitl", String(humanInTheLoop)); }, [humanInTheLoop]);

  // HITL pause state — pipeline stopped, waiting for user clarification answer
  const [hitlPaused, setHitlPaused] = useState(false);
  const [hitlQuestion, setHitlQuestion] = useState("");
  const [hitlReason, setHitlReason] = useState("");
  const [hitlAnswer, setHitlAnswer] = useState("");
  const hitlContextRef = useRef<{ docText?: string; userMessage: string } | null>(null);
  const hitlRoutingRef = useRef<RoutingDecision | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollToRef = useRef<((h: IHighlight) => void) | null>(null);
  const previewPaneRef = useRef<HTMLDivElement>(null);
  const pendingCitationRef = useRef<Citation | null>(null);
  const sessionDocsRef = useRef<DocInfo[]>([]);
  useEffect(() => { sessionDocsRef.current = sessionDocs; }, [sessionDocs]);

  const activeCaseIdRef = useRef<string | null>(null);
  useEffect(() => { activeCaseIdRef.current = activeCaseId; }, [activeCaseId]);
  const caseNameRef = useRef("");
  useEffect(() => { caseNameRef.current = caseName; }, [caseName]);

  const nextDocIdRef = useRef(1);
  useEffect(() => { nextDocIdRef.current = nextDocId; }, [nextDocId]);
  const historyRef = useRef<ConversationTurn[]>([]);
  useEffect(() => { historyRef.current = history; }, [history]);

  const intakeAnalyzeRef = useRef<((filename: string, url: string) => Promise<void>) | null>(null);
  const intakeAnalyzeFileRef = useRef<((file: File) => Promise<void>) | null>(null);
  const intakeQueueRef = useRef<Array<{ filename: string; url: string }>>([]);

  const { processStream } = useStreamProcessor({
    setDisplayMessages,
    setHistory,
    setLoading,
    setStreaming,
    setToolRunning,
    onHitlPause: (question, reason) => {
      setHitlPaused(true);
      setHitlQuestion(question);
      setHitlReason(reason);
    },
    onHitlRouting: (routing) => { hitlRoutingRef.current = routing; },
  });

  function toggleAgentCollapse(idx: number) {
    setCollapsedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayMessages, loading]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }, [input]);

  useEffect(() => {
    const eventsUrl = import.meta.env.DEV ? "http://localhost:3001/events" : "/events";
    const es = new EventSource(eventsUrl);
    es.onopen = () => console.log("[sse] Connected to", eventsUrl);
    es.onerror = (e) => console.error("[sse] Error:", e);
    es.onmessage = (e) => {
      console.log("[sse] Message:", e.data);
      try {
        const data = JSON.parse(e.data);
        if (data.type === "new_document") {
          setIntakeNotification(data.filename);
          intakeAnalyzeRef.current?.(data.filename, `${data.url}`);
        }
      } catch (err) { console.error("[sse] Handler error:", err); }
    };
    return () => es.close();
  }, []);

  useEffect(() => { fetchCases(); }, []);

  useEffect(() => {
    if (!streaming && activeCaseIdRef.current && displayMessages.length > 0) {
      saveCase(displayMessages, history);
      saveMemory(displayMessages);
    }
  }, [streaming]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!previewPdf || !pendingCitationRef.current) return;
    const pending = pendingCitationRef.current;
    let cancelled = false;
    let initAttempts = 0;

    const waitForInit = () => {
      if (cancelled) return;
      const firstPage = previewPaneRef.current?.querySelector('[data-page-number="1"]');
      const canvas = firstPage?.querySelector("canvas") as HTMLCanvasElement | null;
      if (canvas && canvas.offsetHeight > 0) {
        scrollThenWaitForTextLayer();
      } else if (initAttempts < 40) {
        initAttempts++;
        setTimeout(waitForInit, 100);
      }
    };

    const scrollThenWaitForTextLayer = () => {
      if (cancelled) return;
      const pdfViewer = previewPaneRef.current?.querySelector(".pdfViewer") as HTMLElement | null;
      const pageEl = pdfViewer?.querySelector(`[data-page-number="${pending.page}"]`) as HTMLElement | null;
      if (pdfViewer && pageEl) {
        const dims = sessionDocsRef.current.find((d) => d.id === pending.docId)?.pageDims ?? {};
        const dim = dims[pending.page];
        const scale = dim ? pageEl.offsetHeight / dim.h : 1;
        const lineOffsetFromPageTop = dim ? (dim.h - pending.y2) * scale : 0;
        (pdfViewer.parentElement as HTMLElement).scrollTo({
          top: pageEl.offsetTop + lineOffsetFromPageTop - 80,
          behavior: "smooth",
        });
      }
      waitForTextLayer(0);
    };

    const waitForTextLayer = (attempts: number) => {
      if (cancelled) return;
      const targetPage = previewPaneRef.current?.querySelector(`[data-page-number="${pending.page}"]`);
      const textLayer = targetPage?.querySelector(".textLayer") as HTMLElement | null;
      if (textLayer && textLayer.children.length > 0) {
        pendingCitationRef.current = null;
        setActiveCitation(pending);
      } else if (attempts < 40) {
        setTimeout(() => waitForTextLayer(attempts + 1), 100);
      }
    };

    setTimeout(waitForInit, 100);
    return () => { cancelled = true; };
  }, [previewPdf]);

  useEffect(() => {
    if (!activeCitation || !previewPdf) return;
    let cancelled = false;
    let attempts = 0;

    const tryScroll = () => {
      if (cancelled) return;
      const pdfViewer = previewPaneRef.current?.querySelector(".pdfViewer") as HTMLElement | null;
      const pageEl = pdfViewer?.querySelector(`[data-page-number="${activeCitation.page}"]`) as HTMLElement | null;

      if (pdfViewer && pageEl) {
        const dims = sessionDocs.find((d) => d.id === activeCitation.docId)?.pageDims ?? {};
        const dim = dims[activeCitation.page];
        const scale = dim ? pageEl.offsetHeight / dim.h : 1;
        const lineOffsetFromPageTop = dim ? (dim.h - activeCitation.y2) * scale : 0;
        (pdfViewer.parentElement as HTMLElement).scrollTo({
          top: pageEl.offsetTop + lineOffsetFromPageTop - 80,
          behavior: "smooth",
        });
        if (scrollToRef.current) {
          try { scrollToRef.current(citationToHighlight(activeCitation, sessionDocs)); } catch (_) {}
        }
        const page = activeCitation.page;
        const targetPage = previewPaneRef.current?.querySelector(`[data-page-number="${page}"]`);
        const textLayer = targetPage?.querySelector(".textLayer") as HTMLElement | null;
        if (!textLayer || textLayer.children.length === 0) {
          const waitForLayer = (retries: number) => {
            if (cancelled) return;
            const tp = previewPaneRef.current?.querySelector(`[data-page-number="${page}"]`);
            const tl = tp?.querySelector(".textLayer") as HTMLElement | null;
            if (tl && tl.children.length > 0) {
              setHighlightKey((k) => k + 1);
            } else if (retries < 30) {
              setTimeout(() => waitForLayer(retries + 1), 100);
            }
          };
          waitForLayer(0);
        }
      } else if (attempts < 20) {
        attempts++;
        setTimeout(tryScroll, 250);
      }
    };

    const timer = setTimeout(tryScroll, 150);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [activeCitation, previewPdf]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const newDocs = files.map((file) => ({ file, name: file.name, url: URL.createObjectURL(file) }));
    setPendingDocs((prev) => [...prev, ...newDocs]);
    e.target.value = "";
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave() {
    setDragOver(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type === "application/pdf");
    if (!files.length) return;
    files.forEach((file) => intakeAnalyzeFileRef.current?.(file));
  }

  function removePendingDoc(index: number) {
    setPendingDocs((prev) => {
      URL.revokeObjectURL(prev[index].url);
      return prev.filter((_, i) => i !== index);
    });
  }

  function handleCitationClick(citation: Citation) {
    const doc = sessionDocs.find((d) => d.id === citation.docId);
    if (!doc) return;
    if (!previewPdf || previewPdf.url !== doc.url) {
      pendingCitationRef.current = citation;
      setActiveCitation(null);
      setPreviewPdf({ url: doc.url, name: doc.name });
    } else {
      setActiveCitation(citation);
    }
  }

  function handleViewDoc(doc: DocInfo) {
    setActiveCitation(null);
    setPreviewPdf({ url: doc.url, name: doc.name });
  }

  async function fetchCases() {
    try {
      const res = await fetch("/cases");
      if (res.ok) setCases(await res.json());
    } catch { /* server may not be running */ }
  }

  async function saveCase(msgs: DisplayMessage[], hist: ConversationTurn[]) {
    const id = activeCaseIdRef.current;
    if (!id) return;
    let name = caseNameRef.current;
    if (!name) {
      const firstDoc = msgs.find((m) => m.docs?.length)?.docs?.[0];
      name = firstDoc
        ? firstDoc.name.replace(/\.pdf$/i, "")
        : `Case ${new Date().toLocaleDateString()}`;
      setCaseName(name);
      caseNameRef.current = name;
    }
    const urlMap = new Map<string, string>();
    for (const doc of sessionDocsRef.current) {
      if (!doc.url.startsWith("blob:")) continue;
      try {
        const blob = await fetch(doc.url).then((r) => r.blob());
        const res = await fetch(`/cases/${id}/docs`, {
          method: "POST",
          headers: { "Content-Type": "application/pdf", "x-filename": doc.name },
          body: blob,
        });
        if (res.ok) {
          const { url } = await res.json();
          urlMap.set(doc.url, `${url}`);
        }
      } catch { /* ignore */ }
    }
    const serialized = msgs.map((m) => ({
      ...m,
      docs: m.docs?.map((d) => ({
        ...d,
        url: urlMap.get(d.url) ?? (d.url.startsWith("blob:") ? "" : d.url),
      })),
    }));
    try {
      await fetch(`/cases/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, history: hist, displayMessages: serialized }),
      });
      fetchCases();
    } catch { /* ignore */ }
  }

  async function saveMemory(msgs: DisplayMessage[], feedbackToAdd?: string) {
    const id = activeCaseIdRef.current;
    if (!id) return;
    let documentType = "";
    let parties: CaseMemory["parties"] = [];
    let keyRisks: string[] = [];
    let overallRiskLevel: string | undefined;
    let draftType: string | undefined;
    const existingFeedback: string[] = [];

    for (const msg of msgs) {
      if (msg.extractedFacts) {
        documentType = msg.extractedFacts.document_type;
        parties = msg.extractedFacts.parties.map((p) => ({ role: p.role, name: p.name }));
      }
      if (msg.risks) {
        keyRisks = msg.risks.risks.slice(0, 6).map((r) => r.description.slice(0, 80));
        overallRiskLevel = msg.risks.overall_risk_level;
      }
      if (msg.draft) draftType = msg.draft.draft_type;
      if (msg.draftReview?.status === "rejected" && msg.draftReview.comment) {
        existingFeedback.push(msg.draftReview.comment);
      }
    }

    if (!documentType) return;
    const feedbackPatterns = feedbackToAdd
      ? [...new Set([...existingFeedback, feedbackToAdd])]
      : existingFeedback;

    const memory: CaseMemory = {
      caseId: id,
      caseName: caseNameRef.current || "Untitled Case",
      documentType,
      parties,
      keyRisks,
      overallRiskLevel,
      draftType,
      feedbackPatterns,
    };

    try {
      await fetch("/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(memory),
      });
    } catch { /* ignore */ }
  }

  async function loadCase(id: string) {
    try {
      const res = await fetch(`/cases/${id}`);
      if (!res.ok) return;
      const data: SavedCase = await res.json();
      setActiveCaseId(data.id);
      activeCaseIdRef.current = data.id;
      setCaseName(data.name);
      caseNameRef.current = data.name;
      setHistory(data.history);
      setDisplayMessages(data.displayMessages);
      const loadedDocs: DocInfo[] = [];
      for (const msg of data.displayMessages) {
        for (const doc of msg.docs ?? []) {
          if (!loadedDocs.find((d) => d.id === doc.id)) loadedDocs.push(doc);
        }
      }
      setSessionDocs(loadedDocs);
      setNextDocId(Math.max(0, ...loadedDocs.map((d) => d.id)) + 1);
      setPreviewPdf(null);
      setActiveCitation(null);
      setInput("");
      setPendingDocs([]);
    } catch { /* ignore */ }
  }

  async function deleteCase(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    await fetch(`/cases/${id}`, { method: "DELETE" });
    if (activeCaseIdRef.current === id) startNewCase();
    fetchCases();
  }

  function startNewCase() {
    setActiveCaseId(null);
    activeCaseIdRef.current = null;
    setCaseName("");
    caseNameRef.current = "";
    setHistory([]);
    setDisplayMessages([]);
    setSessionDocs([]);
    setNextDocId(1);
    setPreviewPdf(null);
    setActiveCitation(null);
    setInput("");
    setPendingDocs([]);
  }

  async function intakeAnalyze(filename: string, serverUrl: string) {
    if (loading) {
      intakeQueueRef.current.push({ filename, url: serverUrl });
      return;
    }
    if (!activeCaseIdRef.current) {
      const newId = `case_${Date.now()}`;
      setActiveCaseId(newId);
      activeCaseIdRef.current = newId;
    }
    setLoading(true);
    try {
      const response = await fetch(serverUrl);
      const blob = await response.blob();
      const file = new File([blob], filename, { type: "application/pdf" });
      const objectUrl = URL.createObjectURL(file);
      const { text: rawText, pageDims } = await extractPdfText(file);

      const docId = nextDocIdRef.current;
      const prefixedText = rawText.replace(/^\[p/gm, `[d${docId}\u00B7p`);
      const newDoc: DocInfo = { id: docId, name: filename, url: objectUrl, pageDims };

      setSessionDocs((prev) => [...prev, newDoc]);
      setNextDocId(docId + 1);
      setDisplayMessages((prev) => [
        ...prev,
        { role: "user", text: `Analyze: ${filename}`, docs: [newDoc], isIntake: true },
      ]);

      const docText = `=== Document ${docId}: ${filename} ===\n${prefixedText.trim()}\n\n`;
      const userMessage = `Please analyze this document: ${filename}`;
      hitlContextRef.current = { docText, userMessage };
      const res = await fetch("/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userMessage, history: historyRef.current, docText, humanInTheLoop }),
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      await processStream(res);
    } catch (err) {
      setDisplayMessages((prev) => [...prev, { role: "assistant", text: `Intake error: ${String(err)}` }]);
    } finally {
      setLoading(false);
      setStreaming(false);
      setToolRunning(null);
      const next = intakeQueueRef.current.shift();
      if (next) intakeAnalyzeRef.current?.(next.filename, next.url);
    }
  }
  intakeAnalyzeRef.current = intakeAnalyze;

  async function intakeAnalyzeFile(file: File) {
    if (loading) {
      intakeQueueRef.current.push({ filename: file.name, url: URL.createObjectURL(file) });
      return;
    }
    if (!activeCaseIdRef.current) {
      const newId = `case_${Date.now()}`;
      setActiveCaseId(newId);
      activeCaseIdRef.current = newId;
    }
    setLoading(true);
    try {
      const objectUrl = URL.createObjectURL(file);
      const { text: rawText, pageDims } = await extractPdfText(file);
      const docId = nextDocIdRef.current;
      const prefixedText = rawText.replace(/^\[p/gm, `[d${docId}\u00B7p`);
      const newDoc: DocInfo = { id: docId, name: file.name, url: objectUrl, pageDims };
      setSessionDocs((prev) => [...prev, newDoc]);
      setNextDocId(docId + 1);
      setDisplayMessages((prev) => [
        ...prev,
        { role: "user", text: `Analyze: ${file.name}`, docs: [newDoc], isIntake: true },
      ]);
      const docText = `=== Document ${docId}: ${file.name} ===\n${prefixedText.trim()}\n\n`;
      const userMessage = `Please analyze this document: ${file.name}`;
      hitlContextRef.current = { docText, userMessage };
      const res = await fetch("/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userMessage, history: historyRef.current, docText, humanInTheLoop }),
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      await processStream(res);
    } catch (err) {
      setDisplayMessages((prev) => [...prev, { role: "assistant", text: `Intake error: ${String(err)}` }]);
    } finally {
      setLoading(false);
      setStreaming(false);
      setToolRunning(null);
      const next = intakeQueueRef.current.shift();
      if (next) intakeAnalyzeRef.current?.(next.filename, next.url);
    }
  }
  intakeAnalyzeFileRef.current = intakeAnalyzeFile;

  async function send() {
    const text = input.trim();
    if ((!text && pendingDocs.length === 0) || loading) return;

    const docsToSend = [...pendingDocs];
    setInput("");
    setPendingDocs([]);

    if (!activeCaseIdRef.current) {
      const newId = `case_${Date.now()}`;
      setActiveCaseId(newId);
      activeCaseIdRef.current = newId;
    }

    setLoading(true);
    try {
      let docId = nextDocId;
      const newDocs: DocInfo[] = [];
      let combinedDocText = "";

      for (const pending of docsToSend) {
        const { text: rawText, pageDims } = await extractPdfText(pending.file);
        const prefixedText = rawText.replace(/^\[p/gm, `[d${docId}\u00B7p`);
        newDocs.push({ id: docId, name: pending.name, url: pending.url, pageDims });
        combinedDocText += `=== Document ${docId}: ${pending.name} ===\n${prefixedText.trim()}\n\n`;
        docId++;
      }

      if (newDocs.length > 0) {
        setSessionDocs((prev) => [...prev, ...newDocs]);
        setNextDocId(docId);
      }

      setDisplayMessages((prev) => [
        ...prev,
        {
          role: "user",
          text: text || `Analyze: ${docsToSend.map((d) => d.name).join(", ")}`,
          docs: newDocs,
        },
      ]);

      if (combinedDocText) hitlContextRef.current = { docText: combinedDocText, userMessage: text };
      const res = await fetch("/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userMessage: text,
          history,
          docText: combinedDocText || undefined,
          humanInTheLoop: combinedDocText ? humanInTheLoop : false,
        }),
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      await processStream(res);
    } catch (err) {
      setDisplayMessages((prev) => [
        ...prev,
        { role: "assistant", text: `Error: ${String(err)}` },
      ]);
    } finally {
      setLoading(false);
      setStreaming(false);
      setToolRunning(null);
    }
  }

  async function sendHitlAnswer(answer: string) {
    const ctx = hitlContextRef.current;
    if (!ctx) return;
    setHitlPaused(false);
    setHitlQuestion("");
    setHitlReason("");
    setHitlAnswer("");
    if (answer.trim()) {
      setDisplayMessages((prev) => [...prev, { role: "user", text: answer }]);
    }
    setLoading(true);
    try {
      const res = await fetch("/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userMessage: ctx.userMessage,
          history,
          docText: ctx.docText,
          humanInTheLoop: false,
          clarificationAnswer: answer.trim() || undefined,
          existingRouting: hitlRoutingRef.current ?? undefined,
        }),
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      await processStream(res);
    } catch (err) {
      setDisplayMessages((prev) => [...prev, { role: "assistant", text: `Error: ${String(err)}` }]);
    } finally {
      setLoading(false);
      setStreaming(false);
      setToolRunning(null);
    }
  }

  function approveDraft(msgIndex: number) {
    setDisplayMessages((prev) => {
      const msgs = [...prev];
      msgs[msgIndex] = {
        ...msgs[msgIndex],
        draftReview: { status: "approved", timestamp: new Date().toISOString() },
      };
      return msgs;
    });
  }

  async function rejectDraft(msgIndex: number, comment: string) {
    setDisplayMessages((prev) => {
      const msgs = [...prev];
      msgs[msgIndex] = {
        ...msgs[msgIndex],
        draftReview: { status: "rejected", comment, timestamp: new Date().toISOString() },
      };
      return msgs;
    });

    saveMemory(displayMessages, comment);

    const feedbackMsg = `Please revise the draft based on this feedback:\n\n${comment}`;
    setLoading(true);
    try {
      setDisplayMessages((prev) => [...prev, { role: "user", text: feedbackMsg }]);
      const res = await fetch("/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userMessage: feedbackMsg, history }),
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      await processStream(res);
    } catch (err) {
      setDisplayMessages((prev) => [...prev, { role: "assistant", text: `Error: ${String(err)}` }]);
    } finally {
      setLoading(false);
      setStreaming(false);
      setToolRunning(null);
    }
  }

  async function answerClarification(msgIndex: number, answer: string) {
    setDisplayMessages((prev) => {
      const msgs = [...prev];
      msgs[msgIndex] = {
        ...msgs[msgIndex],
        clarification: { ...msgs[msgIndex].clarification!, answer },
      };
      return msgs;
    });

    setLoading(true);
    try {
      setDisplayMessages((prev) => [...prev, { role: "user", text: answer }]);
      const res = await fetch("/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userMessage: answer, history }),
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      await processStream(res);
    } catch (err) {
      setDisplayMessages((prev) => [...prev, { role: "assistant", text: `Error: ${String(err)}` }]);
    } finally {
      setLoading(false);
      setStreaming(false);
      setToolRunning(null);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const activeDocDims = activeCitation
    ? sessionDocs.find((d) => d.id === activeCitation.docId)?.pageDims
    : null;
  const highlights: IHighlight[] =
    activeCitation && activeDocDims?.[activeCitation.page] && highlightKey >= 0
      ? [citationToHighlight(activeCitation, sessionDocs)]
      : [];

  const reportData: ReportData | null = (() => {
    let facts: ReportData["facts"];
    let draft: ReportData["draft"];
    let draftApproved = false;
    let risks: ReportData["risks"];
    let legalContext: ReportData["legalContext"];

    for (const msg of displayMessages) {
      if (msg.extractedFacts) facts = msg.extractedFacts;
      if (msg.draft) {
        draft = msg.draft;
        draftApproved = msg.draftReview?.status === "approved";
      }
      if (msg.risks) risks = msg.risks;
      if (msg.legalContext) legalContext = msg.legalContext;
    }

    if (!facts && !draft && !risks && !legalContext) return null;
    return {
      caseName: caseName || "Untitled Case",
      generatedAt: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
      facts,
      draft,
      draftApproved,
      risks,
      legalContext,
    };
  })();

  async function exportReport() {
    if (!reportData || exporting) return;
    setExporting(true);
    try {
      const filename = `${reportData.caseName.replace(/[^a-z0-9]/gi, "-").toLowerCase()}-mlex-report.pdf`;
      await generatePdfReport(reportData, filename);
    } finally {
      setExporting(false);
    }
  }

  const handleScrollRef = useCallback((scrollTo: (h: IHighlight) => void) => {
    scrollToRef.current = scrollTo;
  }, []);

  return (
    <div className={`layout${sidebarOpen ? " layout-sidebar" : ""}${previewPdf ? " layout-preview" : ""}`}>
      <CaseSidebar
        cases={cases}
        activeCaseId={activeCaseId}
        caseName={caseName}
        onLoad={loadCase}
        onDelete={deleteCase}
        onNew={startNewCase}
        onRename={(name) => { setCaseName(name); caseNameRef.current = name; }}
      />

      <div className="app">
        <AppHeader
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((o) => !o)}
          reportData={reportData}
          exporting={exporting}
          onExportReport={exportReport}
          humanInTheLoop={humanInTheLoop}
          onHumanInTheLoopChange={setHumanInTheLoop}
          settingsOpen={settingsOpen}
          onToggleSettings={() => setSettingsOpen((o) => !o)}
        />

        {intakeNotification && (
          <IntakeNotification
            filename={intakeNotification}
            onClose={() => setIntakeNotification(null)}
          />
        )}

        <MessageList
          displayMessages={displayMessages}
          loading={loading}
          streaming={streaming}
          bottomRef={bottomRef}
          collapsedAgents={collapsedAgents}
          onToggleCollapse={toggleAgentCollapse}
          onCitationClick={handleCitationClick}
          onApproveDraft={approveDraft}
          onRejectDraft={rejectDraft}
          onAnswerClarification={answerClarification}
          onViewDoc={handleViewDoc}
        />

        {hitlPaused && (
          <HitlReplyCard
            question={hitlQuestion}
            reason={hitlReason}
            answer={hitlAnswer}
            loading={loading}
            onAnswerChange={setHitlAnswer}
            onSubmit={() => sendHitlAnswer(hitlAnswer)}
            onSkip={() => sendHitlAnswer("")}
          />
        )}

        <ChatInput
          input={input}
          onInputChange={setInput}
          loading={loading}
          pendingDocs={pendingDocs}
          onRemovePendingDoc={removePendingDoc}
          fileInputRef={fileInputRef}
          textareaRef={textareaRef}
          onSend={send}
          onFileChange={handleFileChange}
          onKeyDown={handleKeyDown}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          dragOver={dragOver}
        />
      </div>

      {previewPdf && (
        <PreviewPane
          pdf={previewPdf}
          highlights={highlights}
          activeCitationId={activeCitation ? String(activeCitation.id) : null}
          paneRef={previewPaneRef}
          onScrollRef={handleScrollRef}
          onClose={() => { setPreviewPdf(null); setActiveCitation(null); }}
        />
      )}
    </div>
  );
}

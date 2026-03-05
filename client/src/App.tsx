import { useState, useRef, useEffect, useCallback } from "react";
import {
  PdfLoader,
  PdfHighlighter,
  Highlight,
  Popup,
} from "react-pdf-highlighter";
import type { IHighlight, ScaledPosition } from "react-pdf-highlighter";
import type { DisplayMessage, Citation, PageDims } from "./types.ts";
import { extractTextWithBBoxes } from "./pdfExtract.ts";

// ── Constants ─────────────────────────────────────────────────────────────────

const WORKER_SRC = `https://unpkg.com/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs`;

const CITATION_RE = /\[p(\d+)·l(\d+)·bbox:(\d+),(\d+),(\d+),(\d+)\]/g;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Strip citation tags, return clean text + citation list. */
function parseCitations(raw: string): { text: string; citations: Citation[] } {
  const citations: Citation[] = [];
  let nextId = 1;
  const text = raw.replace(CITATION_RE, (_match, page, _line, x1, y1, x2, y2) => {
    const alreadyHave = citations.find(
      (c) => c.page === +page && c.x1 === +x1 && c.y1 === +y1
    );
    if (alreadyHave) return `[${alreadyHave.id}]`;
    citations.push({ id: nextId, page: +page, x1: +x1, y1: +y1, x2: +x2, y2: +y2, quote: "" });
    return `[${nextId++}]`;
  });
  return { text, citations };
}

/** Convert a Citation to an IHighlight for react-pdf-highlighter. */
function citationToHighlight(c: Citation, dims: PageDims): IHighlight {
  const dim = dims[c.page] ?? { w: 612, h: 792 };
  const rect = { x1: c.x1, y1: c.y1, x2: c.x2, y2: c.y2, width: dim.w, height: dim.h, pageNumber: c.page };
  return {
    id: String(c.id),
    content: { text: c.quote || `Citation ${c.id}` },
    comment: { text: `[${c.id}]`, emoji: "📄" },
    position: {
      boundingRect: rect,
      rects: [rect],
      pageNumber: c.page,
      usePdfCoordinates: true,
    } as ScaledPosition,
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MlexAvatar() {
  return (
    <div className="avatar">
      <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="20" cy="20" r="20" fill="#1B3A6B" />
        <text x="20" y="25" textAnchor="middle" fill="white" fontSize="13" fontWeight="700" fontFamily="Inter, system-ui, sans-serif">ML</text>
      </svg>
    </div>
  );
}

function SendIcon({ disabled }: { disabled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="send-icon">
      <circle cx="12" cy="12" r="12" fill={disabled ? "#D1CBC4" : "#1B3A6B"} />
      <path d="M12 17V8M8 12L12 8L16 12" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Renders assistant text with inline citation superscripts as clickable buttons. */
function AssistantText({
  text,
  citations,
  onCitationClick,
  streaming,
  isLast,
}: {
  text: string;
  citations: Citation[];
  onCitationClick: (c: Citation) => void;
  streaming: boolean;
  isLast: boolean;
}) {
  const parts = text.split(/(\[\d+\])/g);
  return (
    <p className="assistant-text">
      {parts.map((part, i) => {
        const match = part.match(/^\[(\d+)\]$/);
        if (match) {
          const id = +match[1];
          const citation = citations.find((c) => c.id === id);
          if (citation) {
            return (
              <button key={i} className="citation-btn" onClick={() => onCitationClick(citation)} title={`Jump to source (page ${citation.page})`}>
                {id}
              </button>
            );
          }
        }
        return <span key={i}>{part}</span>;
      })}
      {streaming && isLast && <span className="cursor" />}
    </p>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [displayMessages, setDisplayMessages] = useState<DisplayMessage[]>([]);
  const [history, setHistory] = useState<unknown[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [pendingPdf, setPendingPdf] = useState<{ file: File; name: string; url: string } | null>(null);
  const [previewPdf, setPreviewPdf] = useState<{ url: string; name: string } | null>(null);
  const [pageDims, setPageDims] = useState<PageDims>({});
  const [activeCitation, setActiveCitation] = useState<Citation | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollToRef = useRef<((h: IHighlight) => void) | null>(null);
  const previewPaneRef = useRef<HTMLDivElement>(null);
  const pendingCitationRef = useRef<Citation | null>(null);
  // Always-current pageDims for use inside async callbacks.
  const pageDimsRef = useRef<PageDims>({});
  useEffect(() => { pageDimsRef.current = pageDims; }, [pageDims]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayMessages, loading]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }, [input]);

  // ROOT CAUSE: React StrictMode double-invokes init(), causing the pdfjs viewer
  // to stay wired to eventBus1 while PdfHighlighter's listeners move to eventBus2.
  // textlayerrendered fires on eventBus1 → renderHighlightLayers() is never called.
  // componentDidUpdate *does* call renderHighlightLayers() when highlights change,
  // but findOrCreateHighlightLayer() needs textLayer to be non-null — which only
  // happens after pdfjs renders the page (requires scrolling there first).
  //
  // FIX: on first open, defer activeCitation until:
  //   1. pdfjs has initialised (page-1 canvas has height)
  //   2. we scroll to the target page so pdfjs renders it
  //   3. target page's .textLayer element exists in the DOM
  // Then setting activeCitation triggers componentDidUpdate → renderHighlightLayers()
  // → findOrCreateHighlightLayer() finds a valid textLayer → highlight renders.
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
        const dim = pageDimsRef.current[pending.page];
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

  // Scroll to the cited line whenever activeCitation changes.
  useEffect(() => {
    if (!activeCitation || !previewPdf) return;

    let cancelled = false;
    let attempts = 0;

    const tryScroll = () => {
      if (cancelled) return;
      const pdfViewer = previewPaneRef.current?.querySelector(".pdfViewer") as HTMLElement | null;
      const pageEl = pdfViewer?.querySelector(`[data-page-number="${activeCitation.page}"]`) as HTMLElement | null;

      if (pdfViewer && pageEl) {
        const dim = pageDims[activeCitation.page];
        const scale = dim ? pageEl.offsetHeight / dim.h : 1;
        const lineOffsetFromPageTop = dim ? (dim.h - activeCitation.y2) * scale : 0;
        (pdfViewer.parentElement as HTMLElement).scrollTo({
          top: pageEl.offsetTop + lineOffsetFromPageTop - 80,
          behavior: "smooth",
        });
        if (scrollToRef.current) {
          try { scrollToRef.current(citationToHighlight(activeCitation, pageDims)); } catch (_) {}
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
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPendingPdf({ file, name: file.name, url });
    e.target.value = "";
  }

  function removePendingPdf() {
    if (pendingPdf) URL.revokeObjectURL(pendingPdf.url);
    setPendingPdf(null);
  }

  function handleCitationClick(citation: Citation, pdfUrl: string, pdfName: string) {
    if (!previewPdf || previewPdf.url !== pdfUrl) {
      // Pane is opening fresh. Defer activeCitation until PdfHighlighter is ready.
      pendingCitationRef.current = citation;
      setActiveCitation(null);
      setPreviewPdf({ url: pdfUrl, name: pdfName });
    } else {
      // Pane already open — set directly, PdfHighlighter is already initialized.
      setActiveCitation(citation);
    }
  }

  async function send() {
    const text = input.trim();
    if ((!text && !pendingPdf) || loading) return;

    const pdfSnapshot = pendingPdf;
    setInput("");
    setPendingPdf(null);

    setDisplayMessages((prev) => [
      ...prev,
      {
        role: "user",
        text: text || `Analyze: ${pdfSnapshot?.name}`,
        pdfUrl: pdfSnapshot?.url,
        pdfName: pdfSnapshot?.name,
      },
    ]);
    setLoading(true);

    try {
      let docPayload: { extractedText: string; name: string; pageDims: PageDims } | undefined;
      if (pdfSnapshot) {
        const { text: extractedText, pageDims: dims } = await extractTextWithBBoxes(pdfSnapshot.file);
        setPageDims(dims);
        docPayload = { extractedText, name: pdfSnapshot.name, pageDims: dims };
      }

      const res = await fetch("http://localhost:3001/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userMessage: text, history, doc: docPayload }),
      });

      if (!res.ok) throw new Error(`Server error: ${res.status}`);

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let started = false;
      let rawAccum = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";

        for (const part of parts) {
          if (!part.startsWith("data: ")) continue;
          const data = JSON.parse(part.slice(6));

          if (data.type === "chunk") {
            rawAccum += data.text;
            const { text: cleanText, citations } = parseCitations(rawAccum);

            if (!started) {
              started = true;
              setLoading(false);
              setStreaming(true);
              setDisplayMessages((prev) => [
                ...prev,
                { role: "assistant", text: cleanText, toolLogs: [], citations },
              ]);
            } else {
              setDisplayMessages((prev) => {
                const msgs = [...prev];
                const last = msgs[msgs.length - 1];
                return [...msgs.slice(0, -1), { ...last, text: cleanText, citations }];
              });
            }
          } else if (data.type === "tool") {
            setDisplayMessages((prev) => {
              const msgs = [...prev];
              const last = msgs[msgs.length - 1];
              const toolLogs = [...(last.toolLogs ?? []), { name: data.name, input: data.input, result: data.result }];
              return [...msgs.slice(0, -1), { ...last, toolLogs }];
            });
          } else if (data.type === "done") {
            setHistory(data.history);
            if (data.pageDims) setPageDims(data.pageDims);
          } else if (data.type === "error") {
            throw new Error(data.error);
          }
        }
      }

      if (!started) {
        setDisplayMessages((prev) => [
          ...prev,
          { role: "assistant", text: "(no response)", toolLogs: [], citations: [] },
        ]);
      }
    } catch (err) {
      setDisplayMessages((prev) => [
        ...prev,
        { role: "assistant", text: `Error: ${String(err)}` },
      ]);
    } finally {
      setLoading(false);
      setStreaming(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  // Only the active citation is shown as a highlight — one at a time, no clutter.
  const highlights: IHighlight[] = activeCitation && pageDims[activeCitation.page]
    ? [citationToHighlight(activeCitation, pageDims)]
    : [];

  const isEmpty = displayMessages.length === 0 && !loading;
  const canSend = !loading && (!!input.trim() || !!pendingPdf);

  const handleScrollRef = useCallback((scrollTo: (h: IHighlight) => void) => {
    scrollToRef.current = scrollTo;
  }, []);

  return (
    <div className={`layout ${previewPdf ? "layout-split" : ""}`}>
      {/* ── Chat pane ── */}
      <div className="app">
        <header className="header">
          <div className="header-inner">
            <span className="header-logo">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="22" height="22">
                <circle cx="12" cy="12" r="12" fill="#1B3A6B" />
                <text x="12" y="16" textAnchor="middle" fill="white" fontSize="7.5" fontWeight="700" fontFamily="Inter, system-ui, sans-serif">ML</text>
              </svg>
            </span>
            <span className="header-title">MLex</span>
            <span className="header-model">McDermott Will &amp; Schulte</span>
          </div>
        </header>

        <div className="messages">
          {isEmpty && (
            <div className="empty-state">
              <div className="empty-logo">
                <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="40" cy="40" r="40" fill="#E8EDF5" />
                  <text x="40" y="50" textAnchor="middle" fill="#1B3A6B" fontSize="22" fontWeight="700" fontFamily="Inter, system-ui, sans-serif">ML</text>
                </svg>
              </div>
              <h2>How can I help you today?</h2>
              <p className="empty-subtitle">Your AI legal assistant by McDermott Will &amp; Schulte</p>
            </div>
          )}

          {displayMessages.map((msg, i) => {
            const prevUserMsg = msg.role === "assistant"
              ? displayMessages.slice(0, i).reverse().find((m) => m.role === "user")
              : null;

            return (
              <div key={i} className={`message-row message-row-${msg.role}`}>
                {msg.role === "assistant" && <MlexAvatar />}
                <div className={`message-content message-content-${msg.role}`}>
                  {msg.role === "assistant" ? (
                    <>
                      {msg.toolLogs && msg.toolLogs.length > 0 && (
                        <details className="tool-logs">
                          <summary>
                            <span className="tool-logs-icon">⚙</span>
                            Used {msg.toolLogs.length} tool{msg.toolLogs.length !== 1 ? "s" : ""}
                          </summary>
                          <div className="tool-logs-body">
                            {msg.toolLogs.map((log, j) => (
                              <div key={j} className="tool-log">
                                <div className="tool-log-header">
                                  <span className="tool-name">{log.name}</span>
                                </div>
                                <pre className="tool-input">{JSON.stringify(log.input, null, 2)}</pre>
                                <pre className="tool-result">{log.result}</pre>
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                      <AssistantText
                        text={msg.text}
                        citations={msg.citations ?? []}
                        onCitationClick={(c) => {
                          const pdfUrl = prevUserMsg?.pdfUrl;
                          const pdfName = prevUserMsg?.pdfName;
                          if (pdfUrl && pdfName) handleCitationClick(c, pdfUrl, pdfName);
                        }}
                        streaming={streaming}
                        isLast={i === displayMessages.length - 1}
                      />
                    </>
                  ) : (
                    <div className="user-bubble">
                      {msg.pdfName && (
                        <div className="pdf-chip pdf-chip-message">
                          <span className="pdf-chip-icon">📄</span>
                          <span className="pdf-chip-name">{msg.pdfName}</span>
                          {msg.pdfUrl && (
                            <button
                              className="pdf-preview-btn"
                              onClick={() => {
                                setActiveCitation(null);
                                setPreviewPdf({ url: msg.pdfUrl!, name: msg.pdfName! });
                              }}
                            >
                              Preview
                            </button>
                          )}
                        </div>
                      )}
                      {msg.text && msg.text !== `Analyze: ${msg.pdfName}` && (
                        <span>{msg.text}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {loading && (
            <div className="message-row message-row-assistant">
              <MlexAvatar />
              <div className="message-content message-content-assistant">
                <div className="typing">
                  <span className="dot" />
                  <span className="dot" />
                  <span className="dot" />
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        <div className="input-wrap">
          {pendingPdf && (
            <div className="pdf-chip">
              <span className="pdf-chip-icon">📄</span>
              <span className="pdf-chip-name">{pendingPdf.name}</span>
              <button className="pdf-chip-remove" onClick={removePendingPdf} aria-label="Remove">×</button>
            </div>
          )}
          <div className="input-card">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />
            <button
              className="attach-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              aria-label="Attach PDF"
              title="Attach PDF"
            >
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="18" height="18">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={pendingPdf ? `Ask about ${pendingPdf.name}...` : "Message MLex..."}
              rows={1}
              disabled={loading}
            />
            <button className="send-btn" onClick={send} disabled={!canSend} aria-label="Send">
              <SendIcon disabled={!canSend} />
            </button>
          </div>
          <p className="input-hint">Enter to send &middot; Shift+Enter for newline</p>
        </div>
      </div>

      {/* ── Preview pane ── */}
      {previewPdf && (
        <div className="preview-pane" ref={previewPaneRef}>
          <div className="preview-header">
            <span className="preview-title">📄 {previewPdf.name}</span>
            <button
              className="preview-close"
              onClick={() => { setPreviewPdf(null); setActiveCitation(null); }}
              aria-label="Close preview"
            >
              ×
            </button>
          </div>
          <div className="preview-body">
            <PdfLoader url={previewPdf.url} workerSrc={WORKER_SRC} beforeLoad={<div className="pdf-loading">Loading…</div>}>
              {(pdfDocument) => (
                <PdfHighlighter
                  pdfDocument={pdfDocument}
                  highlights={highlights}
                  onScrollChange={() => {}}
                  scrollRef={handleScrollRef}
                  pdfScaleValue="page-width"
                  onSelectionFinished={() => null}
                  enableAreaSelection={() => false}
                  highlightTransform={(highlight, _index, _setTip, _hideTip, _viewportToScaled, _screenshot, isScrolledTo) => (
                    <Popup
                      popupContent={<div className="highlight-popup">{highlight.comment.text}</div>}
                      onMouseOver={() => {}}
                      onMouseOut={() => {}}
                      key={highlight.id}
                    >
                      <Highlight
                        isScrolledTo={isScrolledTo || highlight.id === String(activeCitation?.id)}
                        position={highlight.position}
                        comment={highlight.comment}
                      />
                    </Popup>
                  )}
                />
              )}
            </PdfLoader>
          </div>
        </div>
      )}
    </div>
  );
}

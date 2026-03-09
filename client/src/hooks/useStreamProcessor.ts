// Shared SSE stream processor — eliminates the duplicated streaming loop across all 4 send handlers.
import type { DisplayMessage, ExtractedFacts, DocumentDraft, DocumentRisks, LegalContext, ConversationTurn } from "../types.ts";
import { parseCitations, stripPlanningPhrases } from "../utils/citations.ts";

type SSEData = {
  type: string;
  text?: string;
  name?: string;
  input?: unknown;
  result?: string;
  history?: ConversationTurn[];
  error?: string;
  question?: string;
  reason?: string;
  canProceed?: boolean;
};

interface UseStreamProcessorOptions {
  setDisplayMessages: React.Dispatch<React.SetStateAction<DisplayMessage[]>>;
  setHistory: React.Dispatch<React.SetStateAction<ConversationTurn[]>>;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setStreaming: React.Dispatch<React.SetStateAction<boolean>>;
  setToolRunning: React.Dispatch<React.SetStateAction<string | null>>;
}

/**
 * Returns a `processStream` function that reads an SSE response and updates all
 * display state. Each of the 4 send handlers calls this after setting up its request.
 *
 * The caller is responsible for try/catch/finally (loading, streaming, toolRunning cleanup).
 */
export function useStreamProcessor({
  setDisplayMessages,
  setHistory,
  setLoading,
  setStreaming,
  setToolRunning,
}: UseStreamProcessorOptions) {
  async function processStream(res: Response): Promise<void> {
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
        let data: SSEData;
        try { data = JSON.parse(part.slice(6)); } catch { continue; }

        if (data.type === "chunk") {
          setToolRunning(null);
          rawAccum += data.text;
          const { text: cleanText, citations } = parseCitations(stripPlanningPhrases(rawAccum));
          if (!started) {
            started = true;
            setLoading(false);
            setStreaming(true);
            setDisplayMessages((prev) => [...prev, { role: "assistant", text: cleanText, toolLogs: [], citations }]);
          } else {
            setDisplayMessages((prev) => {
              const msgs = [...prev];
              const last = msgs[msgs.length - 1];
              return [...msgs.slice(0, -1), { ...last, text: cleanText, citations }];
            });
          }
        } else if (data.type === "tool") {
          if (!started) {
            started = true;
            setLoading(false);
            setStreaming(true);
            setDisplayMessages((prev) => [...prev, { role: "assistant", text: "", toolLogs: [], citations: [] }]);
          }
          setToolRunning(data.name ?? null);
          setDisplayMessages((prev) => {
            const msgs = [...prev];
            const last = msgs[msgs.length - 1];
            const toolLogs = [...(last.toolLogs ?? []), { name: data.name ?? "", input: data.input, result: data.result ?? "" }];
            const update: Partial<DisplayMessage> = { toolLogs };
            if (data.name === "extract_key_facts" && data.input) update.extractedFacts = data.input as ExtractedFacts;
            if (data.name === "draft_document" && data.input) update.draft = data.input as DocumentDraft;
            if (data.name === "flag_risks" && data.input) update.risks = data.input as DocumentRisks;
            if (data.name === "save_legal_context" && data.input) update.legalContext = data.input as LegalContext;
            return [...msgs.slice(0, -1), { ...last, ...update }];
          });
        } else if (data.type === "clarification") {
          const clarification = { question: data.question ?? "", reason: data.reason ?? "", canProceed: data.canProceed ?? true };
          if (!started) {
            started = true;
            setLoading(false);
            setStreaming(true);
            setDisplayMessages((prev) => [...prev, { role: "assistant", text: "", toolLogs: [], citations: [], clarification }]);
          } else {
            setDisplayMessages((prev) => {
              const msgs = [...prev];
              const last = msgs[msgs.length - 1];
              return [...msgs.slice(0, -1), { ...last, clarification }];
            });
          }
        } else if (data.type === "done") {
          if (data.history) setHistory(data.history);
        } else if (data.type === "error") {
          throw new Error(data.error);
        }
      }
    }

    if (!started) {
      setDisplayMessages((prev) => [...prev, { role: "assistant", text: "(no response)", toolLogs: [], citations: [] }]);
    }
  }

  return { processStream };
}

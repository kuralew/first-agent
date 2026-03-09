// Shared SSE stream processor — eliminates the duplicated streaming loop across all 4 send handlers.
import type { DisplayMessage, ExtractedFacts, DocumentDraft, DocumentRisks, LegalContext, QualityResult, ConversationTurn } from "../types.ts";
import { parseCitations, stripPlanningPhrases } from "../utils/citations.ts";

// Static label map — used when creating fallback bubbles (no prior agent_start)
const AGENT_LABELS: Record<string, string> = {
  analyst:    "Analyst",
  researcher: "Researcher",
  drafter:    "Drafter",
  quality:    "Quality",
  main:       "MLex",
};

type SSEData = {
  type: string;
  agentId?: string;
  label?: string;
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
    let anyStarted = false;

    // Per-agent tracking — keyed by agentId
    // agentSeen: synchronous check (updated immediately, not deferred inside setState)
    // agentMsgIndex: actual array index, only reliable inside setState callbacks
    const agentSeen     = new Set<string>();
    const agentMsgIndex = new Map<string, number>();
    const agentRawAccum = new Map<string, string>();

    function ensureBubble(agentId: string, label?: string) {
      if (agentSeen.has(agentId)) return;
      agentSeen.add(agentId);
      if (!anyStarted) {
        anyStarted = true;
        setLoading(false);
        setStreaming(true);
      }
      const resolvedLabel = label ?? AGENT_LABELS[agentId] ?? agentId;
      setDisplayMessages((prev) => {
        agentMsgIndex.set(agentId, prev.length);
        return [...prev, { role: "assistant", text: "", toolLogs: [], citations: [], agentLabel: resolvedLabel }];
      });
    }

    function updateMsgAt(agentId: string, updater: (msg: DisplayMessage) => DisplayMessage) {
      setDisplayMessages((prev) => {
        const idx = agentMsgIndex.get(agentId);
        if (idx === undefined) return prev;
        const msgs = [...prev];
        msgs[idx] = updater(msgs[idx]);
        return msgs;
      });
    }

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

        if (data.type === "agent_start") {
          const agentId = data.agentId ?? "main";
          const label = data.label ?? AGENT_LABELS[agentId] ?? agentId;
          agentRawAccum.set(agentId, "");
          ensureBubble(agentId, label);

        } else if (data.type === "chunk") {
          const agentId = data.agentId ?? "main";
          ensureBubble(agentId);
          const raw = (agentRawAccum.get(agentId) ?? "") + (data.text ?? "");
          agentRawAccum.set(agentId, raw);
          const { text: cleanText, citations } = parseCitations(stripPlanningPhrases(raw));
          updateMsgAt(agentId, (msg) => ({ ...msg, text: cleanText, citations, toolRunning: undefined }));

        } else if (data.type === "tool") {
          const agentId = data.agentId ?? "main";
          ensureBubble(agentId);
          updateMsgAt(agentId, (msg) => {
            const toolLogs = [...(msg.toolLogs ?? []), { name: data.name ?? "", input: data.input, result: data.result ?? "" }];
            const update: Partial<DisplayMessage> = { toolLogs, toolRunning: data.name };
            if (data.name === "extract_key_facts" && data.input) update.extractedFacts = data.input as ExtractedFacts;
            if (data.name === "draft_document"     && data.input) update.draft = data.input as DocumentDraft;
            if (data.name === "flag_risks"          && data.input) update.risks = data.input as DocumentRisks;
            if (data.name === "save_legal_context"  && data.input) update.legalContext = data.input as LegalContext;
            if (data.name === "assess_quality"      && data.input) update.qualityResult = data.input as QualityResult;
            return { ...msg, ...update };
          });

        } else if (data.type === "clarification") {
          const agentId = data.agentId ?? "main";
          const clarification = { question: data.question ?? "", reason: data.reason ?? "", canProceed: data.canProceed ?? true };
          ensureBubble(agentId);
          updateMsgAt(agentId, (msg) => ({ ...msg, clarification }));

        } else if (data.type === "done") {
          if (data.history) setHistory(data.history);
        } else if (data.type === "error") {
          throw new Error(data.error);
        }
      }
    }

    if (!anyStarted) {
      setDisplayMessages((prev) => [...prev, { role: "assistant", text: "(no response)", toolLogs: [], citations: [] }]);
    }
  }

  return { processStream };
}

import Anthropic from "@anthropic-ai/sdk";
import { toolDefinitions, executeTool } from "./tools.js";
import { MODEL, TOOL_DELAY_MS } from "./config.js";
import { streamWithRetry, runAgentStream } from "./agent.js";
import type { ToolLogCallback, ClarificationCallback } from "./agent.js";

// ── Tool whitelists ───────────────────────────────────────────────────────────

const ANALYST_TOOLS    = toolDefinitions.filter(t => ["extract_key_facts", "flag_risks"].includes(t.name));
const RESEARCHER_TOOLS = toolDefinitions.filter(t => ["search_legal", "save_legal_context"].includes(t.name));
const DRAFTER_TOOLS    = toolDefinitions.filter(t => ["draft_document"].includes(t.name));
const QUALITY_TOOLS    = toolDefinitions.filter(t => ["assess_quality"].includes(t.name));

// ── Callback types with agentId ───────────────────────────────────────────────

export type AgentChunkCallback  = (agentId: string, text: string) => void;
export type AgentToolCallback   = (agentId: string, name: string, input: unknown, result: string) => void;
export type AgentStartCallback  = (agentId: string, label: string) => void;

// ── Result interfaces ─────────────────────────────────────────────────────────

interface AnalystResult {
  extractedFacts: Record<string, unknown> | null;
  flaggedRisks: Record<string, unknown> | null;
}

interface ResearcherResult {
  legalContext: Record<string, unknown> | null;
}

// ── System prompts ────────────────────────────────────────────────────────────

const CITATION_RULES = `
CITATION RULES
Every factual statement derived from a document must end with its citation tag. No exceptions.
Placement: tag belongs at the end of the sentence it supports, after the closing period.
Single-line fact: "The contract was signed on June 1st.[d1·p2·l5·bbox:72,400,300,414]"
Multi-line passage — cite FIRST and LAST boundary lines only.
Cross-document fact — cite both sources.
Copy every tag exactly as it appears in the source.
`.trim();

const ANALYST_SYSTEM = `You are the MLex Analyst sub-agent at McDermott Will & Schulte.

Your sole job: call extract_key_facts then flag_risks on the provided document(s).

${CITATION_RULES}

Call extract_key_facts first — capture ALL parties, facts, key dates, and amounts with citations.
Then call flag_risks — order risks CRITICAL → LOW. Cite every risk with its source line.

After both tool calls complete, write a concise Document Brief:
- Identify what the document is
- Under each section, one fact per line, one sentence each
- End every factual sentence with its citation tag

Call tools immediately and silently. Never narrate ("I'll now call…", "Let me…").`;

const RESEARCHER_SYSTEM = `You are the MLex Researcher sub-agent at McDermott Will & Schulte.

Your sole job: call search_legal with 2–4 targeted queries derived from the document's specific legal issues, then call save_legal_context to synthesize findings.

Research is strictly supplemental context — do NOT allege new document facts.
Do NOT use [d·p·l] citation tags for research findings.

After save_legal_context completes, confirm in one sentence that research is saved.`;

const DRAFTER_SYSTEM = `You are the MLex Drafter sub-agent at McDermott Will & Schulte.

You will receive a structured Analyst Summary with extracted facts and flagged risks.
Your sole job: call draft_document to produce a complete, professional draft appropriate for the document type.

Draft type mapping:
- complaint → Response/Answer
- contract → Obligations & Risk Summary memo
- consent order → Compliance Action Plan
- deposition → Key Testimony Summary
- regulatory filing → Response memo
- multiple documents → Synthesis memo

Write complete, substantive content. Use markdown (## headers, bullet lists).
After the tool call, write one paragraph summarising what you drafted and key strategic decisions.

Call tools immediately and silently. No narration.`;

const QUALITY_SYSTEM = `You are the MLex Quality sub-agent at McDermott Will & Schulte.

You will receive the complete analysis from the Analyst and Drafter.
Your sole job: call assess_quality with honest evaluations.

If overall_ready is false, state the gaps found.
If overall_ready is true, respond: "Quality gate passed."

Call assess_quality immediately. No narration.`;

// ── Analyst result formatter (for Drafter context) ────────────────────────────

function formatAnalystSummary(result: AnalystResult): string {
  const lines: string[] = ["=== ANALYST SUMMARY (use as your primary source) ==="];

  const f = result.extractedFacts as {
    document_type?: string;
    parties?: Array<{ role: string; name: string; citation?: string }>;
    facts?: Array<{ category: string; item: string; citation?: string }>;
    key_dates?: Array<{ date: string; description: string; citation?: string }>;
    amounts?: Array<{ amount: string; description: string; citation?: string }>;
  } | null;

  if (f) {
    if (f.document_type) lines.push(`Document Type: ${f.document_type}`);
    if (f.parties?.length) {
      lines.push("\nParties:");
      for (const p of f.parties) lines.push(`  - ${p.role}: ${p.name}${p.citation ? " " + p.citation : ""}`);
    }
    if (f.facts?.length) {
      lines.push("\nKey Facts:");
      for (const fc of f.facts) lines.push(`  - [${fc.category}] ${fc.item}${fc.citation ? " " + fc.citation : ""}`);
    }
    if (f.key_dates?.length) {
      lines.push("\nKey Dates:");
      for (const d of f.key_dates) lines.push(`  - ${d.date}: ${d.description}${d.citation ? " " + d.citation : ""}`);
    }
    if (f.amounts?.length) {
      lines.push("\nAmounts:");
      for (const a of f.amounts) lines.push(`  - ${a.amount}: ${a.description}${a.citation ? " " + a.citation : ""}`);
    }
  }

  const r = result.flaggedRisks as {
    overall_risk_level?: string;
    summary?: string;
    risks?: Array<{ severity: string; category: string; description: string; recommendation: string; citation?: string }>;
  } | null;

  if (r) {
    lines.push(`\nOverall Risk Level: ${r.overall_risk_level}`);
    if (r.summary) lines.push(`Risk Summary: ${r.summary}`);
    if (r.risks?.length) {
      lines.push("\nRisks:");
      for (const rk of r.risks) {
        lines.push(`  - [${rk.severity}] ${rk.category}: ${rk.description}${rk.citation ? " " + rk.citation : ""}`);
        lines.push(`    Recommendation: ${rk.recommendation}`);
      }
    }
  }

  lines.push("=== END ANALYST SUMMARY ===");
  return lines.join("\n");
}

// ── Generic sub-agent runner ──────────────────────────────────────────────────

async function runSubAgent(params: {
  messages: Anthropic.MessageParam[];
  system: string;
  tools: Anthropic.Tool[];
  onChunk?: (text: string) => void;
  onToolLog: ToolLogCallback;
  captureInputs?: (name: string, input: Record<string, unknown>) => void;
}): Promise<void> {
  const { messages, system, tools, onChunk = () => {}, onToolLog, captureInputs } = params;

  while (true) {
    const final = await streamWithRetry(
      { model: MODEL, max_tokens: 8000, system, tools, messages },
      onChunk
    );
    messages.push({ role: "assistant", content: final.content });

    if (final.stop_reason === "end_turn") return;

    if (final.stop_reason === "tool_use") {
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of final.content) {
        if (block.type !== "tool_use") continue;
        const input = block.input as Record<string, unknown>;
        captureInputs?.(block.name, input);
        const result = await executeTool(block.name, input);
        onToolLog(block.name, input, result);
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result });
      }

      messages.push({ role: "user", content: toolResults });
      await new Promise(r => setTimeout(r, TOOL_DELAY_MS));
      continue;
    }

    return;
  }
}

// ── Sub-agent functions ───────────────────────────────────────────────────────

async function runAnalystAgent(
  messages: Anthropic.MessageParam[],
  onChunk: (text: string) => void,
  onToolLog: ToolLogCallback,
  memoryContext?: string
): Promise<AnalystResult> {
  const result: AnalystResult = { extractedFacts: null, flaggedRisks: null };
  const system = memoryContext ? `${ANALYST_SYSTEM}\n\n${memoryContext}` : ANALYST_SYSTEM;

  await runSubAgent({
    messages,
    system,
    tools: ANALYST_TOOLS,
    onChunk,
    onToolLog,
    captureInputs: (name, input) => {
      if (name === "extract_key_facts") result.extractedFacts = input;
      if (name === "flag_risks")        result.flaggedRisks   = input;
    },
  });

  return result;
}

async function runResearcherAgent(
  messages: Anthropic.MessageParam[],
  onToolLog: ToolLogCallback
): Promise<ResearcherResult> {
  const result: ResearcherResult = { legalContext: null };

  await runSubAgent({
    messages,
    system: RESEARCHER_SYSTEM,
    tools: RESEARCHER_TOOLS,
    onToolLog,
    captureInputs: (name, input) => {
      if (name === "save_legal_context") result.legalContext = input;
    },
  });

  return result;
}

async function runDrafterAgent(
  originalMessages: Anthropic.MessageParam[],
  analystResult: AnalystResult,
  onChunk: (text: string) => void,
  onToolLog: ToolLogCallback
): Promise<void> {
  // Inject analyst context into system prompt — avoids consecutive user messages.
  const system = `${DRAFTER_SYSTEM}\n\n${formatAnalystSummary(analystResult)}`;

  await runSubAgent({
    messages: originalMessages,
    system,
    tools: DRAFTER_TOOLS,
    onChunk,
    onToolLog,
  });
}

async function runQualityAgent(
  originalMessages: Anthropic.MessageParam[],
  analystResult: AnalystResult,
  researcherResult: ResearcherResult,
  onChunk: (text: string) => void,
  onToolLog: ToolLogCallback
): Promise<void> {
  const researchSummary = (researcherResult.legalContext as { summary?: string } | null)?.summary
    ?? "No research completed.";
  const findingsCount = ((researcherResult.legalContext as { findings?: unknown[] } | null)?.findings ?? []).length;

  const qualityContext = [
    "=== QUALITY REVIEW INPUT ===",
    formatAnalystSummary(analystResult),
    `\nResearcher summary: ${researchSummary}`,
    `Findings captured: ${findingsCount}`,
    "=== END QUALITY REVIEW INPUT ===",
  ].join("\n");

  // Inject full context into system prompt — avoids consecutive user messages.
  const system = `${QUALITY_SYSTEM}\n\n${qualityContext}`;

  await runSubAgent({
    messages: originalMessages,
    system,
    tools: QUALITY_TOOLS,
    onChunk,
    onToolLog,
  });
}

// ── Main orchestrator ─────────────────────────────────────────────────────────

export async function runOrchestration(
  messages: Anthropic.MessageParam[],
  onChunk: AgentChunkCallback,
  onToolLog?: AgentToolCallback,
  onClarification?: ClarificationCallback,
  memoryContext?: string,
  onAgentStart?: AgentStartCallback
): Promise<void> {
  // Detect whether this is a document analysis request.
  const lastMsg = messages[messages.length - 1];
  const userText = typeof lastMsg.content === "string"
    ? lastMsg.content
    : (lastMsg.content as Array<{ type: string; text?: string }>)
        .filter(b => b.type === "text")
        .map(b => b.text ?? "")
        .join("");

  const isDocumentRequest = userText.includes("=== Document");

  // Non-document requests (follow-up questions, chat) go to the single agent.
  if (!isDocumentRequest) {
    onAgentStart?.("main", "MLex");
    return runAgentStream(
      messages,
      (text) => onChunk("main", text),
      onToolLog ? (name, input, result) => onToolLog("main", name, input, result) : undefined,
      onClarification,
      memoryContext
    );
  }

  const toolLog = (agentId: string): ToolLogCallback => (name, input, result) => {
    onToolLog?.(agentId, name, input, result);
    if (!onToolLog) console.log(`  [tool:${agentId}] ${name}`);
  };

  const copy = () => JSON.parse(JSON.stringify(messages)) as Anthropic.MessageParam[];

  // Kick off Researcher immediately in the background — it runs the whole time.
  console.log("[orchestrator] Starting Researcher in background");
  onAgentStart?.("researcher", "Researcher");
  const researcherPromise = runResearcherAgent(copy(), toolLog("researcher"))
    .catch((err) => {
      console.error("[orchestrator] Researcher failed (non-fatal):", err);
      return { legalContext: null } as ResearcherResult;
    });

  // Phase 1: Analyst streams to client.
  console.log("[orchestrator] Phase 1: Analyst");
  onAgentStart?.("analyst", "Analyst");
  let analystResult: AnalystResult = { extractedFacts: null, flaggedRisks: null };
  try {
    analystResult = await runAnalystAgent(
      copy(),
      (text) => onChunk("analyst", text),
      toolLog("analyst"),
      memoryContext
    );
    console.log("[orchestrator] Analyst done — facts:", !!analystResult.extractedFacts, "risks:", !!analystResult.flaggedRisks);
  } catch (err) {
    console.error("[orchestrator] Analyst failed:", err);
  }

  // Phase 2: Drafter starts immediately after Analyst — does NOT wait for Researcher.
  // No agent_start here — the bubble is created on first chunk/tool event to avoid an empty cursor.
  console.log("[orchestrator] Phase 2: Drafter");
  try {
    await runDrafterAgent(
      copy(),
      analystResult,
      (text) => onChunk("drafter", text),
      toolLog("drafter")
    );
    console.log("[orchestrator] Drafter done");
  } catch (err) {
    console.error("[orchestrator] Drafter failed:", err);
  }

  // Now collect Researcher result (should be done by this point).
  const researcherResult = await researcherPromise;
  console.log("[orchestrator] Researcher collected — context:", !!researcherResult.legalContext);

  // Phase 3: Quality check — show result to user.
  console.log("[orchestrator] Phase 3: Quality");
  onAgentStart?.("quality", "Quality");
  try {
    await runQualityAgent(
      copy(),
      analystResult,
      researcherResult,
      (text) => onChunk("quality", text),
      toolLog("quality")
    );
  } catch (err) {
    console.error("[orchestrator] Quality failed:", err);
  }

  console.log("[orchestrator] Done");
}

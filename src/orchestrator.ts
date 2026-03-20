import Anthropic from "@anthropic-ai/sdk";
import { toolDefinitions, executeTool } from "./tools.js";
import { MODEL, TOOL_DELAY_MS } from "./config.js";
import { streamWithRetry, runAgentStream } from "./agent.js";
import type { ToolLogCallback, ClarificationCallback } from "./agent.js";

// ── Tool whitelists ───────────────────────────────────────────────────────────

const ROUTER_TOOLS     = toolDefinitions.filter(t => t.name === "route_document");
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

interface DrafterResult {
  draft: { draft_type: string; title: string; content: string } | null;
}

interface QualityAssessment {
  facts_adequate: boolean;
  draft_adequate: boolean;
  risks_adequate: boolean;
  research_adequate: boolean;
  gaps: string[];
  overall_ready: boolean;
}

interface RoutingDecision {
  document_type: string;
  run_researcher: boolean;
  researcher_focus?: string;
  rationale: string;
  clarification_question?: string;
  clarification_reason?: string;
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

function buildRouterSystem(humanInTheLoop: boolean): string {
  const hitlSection = humanInTheLoop
    ? `\n- clarification_question: (HITL mode is ON) ALWAYS include one useful question for the user. Pick the single most valuable question for this document type — e.g. the user's primary concern, specific risks to focus on, governing jurisdiction if unclear, intended use of the analysis, or the counterparty relationship. Make it specific to this document, not generic.
- clarification_reason: one sentence explaining how the answer will improve the analysis\n`
    : "";

  return `You are the MLex Router at McDermott Will & Schulte.

Your only job: classify the document and decide the optimal analysis pipeline.

Call route_document immediately with:
- document_type: the specific legal document type (e.g. "FTC Complaint", "Employment Contract", "NDA", "Consent Order")
- run_researcher: true ONLY when external legal research adds real value:
  YES → regulatory complaints, employment disputes, IP/patent cases, novel legal issues, litigation
  NO  → standard NDAs, simple vendor contracts, routine consent orders, straightforward agreements
- researcher_focus: if run_researcher=true, the specific legal area to search (e.g. "FTC deceptive practices precedents 2020-2024")
- rationale: one sentence explaining your decision${hitlSection}

Call route_document immediately. No narration, no preamble.`;
}

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

Your sole job: call search_legal with 1–2 highly targeted queries on the document's most critical legal issues, then call save_legal_context to synthesize findings.

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

CRITICAL — ROUTING DECISIONS:
The Router agent decided which sub-agents to run. You MUST respect those decisions:
- If an agent was marked SKIPPED in the routing section, set its corresponding adequate field to true.
  Never flag a skipped agent as a gap — it was a deliberate pipeline decision, not a failure.
- Only flag gaps for agents that actually ran and produced inadequate output.

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

async function runRouterAgent(
  messages: Anthropic.MessageParam[],
  onChunk: (text: string) => void,
  onToolLog: ToolLogCallback,
  humanInTheLoop = false
): Promise<RoutingDecision> {
  let decision: RoutingDecision | null = null;

  await runSubAgent({
    messages,
    system: buildRouterSystem(humanInTheLoop),
    tools: ROUTER_TOOLS,
    onChunk,
    onToolLog,
    captureInputs: (name, input) => {
      if (name === "route_document") decision = input as unknown as RoutingDecision;
    },
  });

  // Fallback if router fails — run full pipeline
  return decision ?? {
    document_type: "Unknown",
    run_researcher: true,
    rationale: "Router failed — running full pipeline as fallback",
  };
}

async function runResearcherAgent(
  messages: Anthropic.MessageParam[],
  onToolLog: ToolLogCallback,
  focusHint?: string
): Promise<ResearcherResult> {
  const result: ResearcherResult = { legalContext: null };
  const system = focusHint
    ? `${RESEARCHER_SYSTEM}\n\nFocus your search specifically on: ${focusHint}`
    : RESEARCHER_SYSTEM;

  await runSubAgent({
    messages,
    system,
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
  onToolLog: ToolLogCallback,
  qualityGaps?: string[]
): Promise<DrafterResult> {
  let system = `${DRAFTER_SYSTEM}\n\n${formatAnalystSummary(analystResult)}`;

  if (qualityGaps && qualityGaps.length > 0) {
    system += [
      "\n\n=== QUALITY FEEDBACK — previous draft failed ===",
      "The previous draft did not pass quality review. Fix ALL of these gaps:",
      qualityGaps.map((g) => `  - ${g}`).join("\n"),
      "=== END QUALITY FEEDBACK ===",
    ].join("\n");
  }

  const result: DrafterResult = { draft: null };

  await runSubAgent({
    messages: originalMessages,
    system,
    tools: DRAFTER_TOOLS,
    onChunk,
    onToolLog,
    captureInputs: (name, input) => {
      if (name === "draft_document") {
        result.draft = input as { draft_type: string; title: string; content: string };
      }
    },
  });

  return result;
}

async function runQualityAgent(
  originalMessages: Anthropic.MessageParam[],
  analystResult: AnalystResult,
  researcherResult: ResearcherResult,
  drafterResult: DrafterResult,
  routing: RoutingDecision,
  onChunk: (text: string) => void,
  onToolLog: ToolLogCallback
): Promise<QualityAssessment | null> {
  const researchSection = routing.run_researcher
    ? (() => {
        const summary = (researcherResult.legalContext as { summary?: string } | null)?.summary
          ?? "No research completed.";
        const findingsCount = ((researcherResult.legalContext as { findings?: unknown[] } | null)?.findings ?? []).length;
        return `\nResearcher summary: ${summary}\nFindings captured: ${findingsCount}`;
      })()
    : `\nResearcher: SKIPPED — Router determined research does not add value for this document type (${routing.document_type}). Set research_adequate = true.`;

  const draftSection = drafterResult.draft
    ? [
        `\n=== DRAFT TO REVIEW ===`,
        `Type: ${drafterResult.draft.draft_type}`,
        `Title: ${drafterResult.draft.title}`,
        `\n${drafterResult.draft.content}`,
        `=== END DRAFT ===`,
      ].join("\n")
    : "\n=== DRAFT TO REVIEW ===\nNo draft was produced.\n=== END DRAFT ===";

  const routingSection = [
    "\n=== ROUTING DECISION (AUTHORITATIVE — respect this) ===",
    `Document type: ${routing.document_type}`,
    `Researcher: ${routing.run_researcher ? "RAN" : "SKIPPED (set research_adequate = true)"}`,
    routing.researcher_focus ? `Researcher focus: ${routing.researcher_focus}` : "",
    `Rationale: ${routing.rationale}`,
    "=== END ROUTING DECISION ===",
  ].filter(Boolean).join("\n");

  const qualityContext = [
    "=== QUALITY REVIEW INPUT ===",
    routingSection,
    formatAnalystSummary(analystResult),
    researchSection,
    draftSection,
    "=== END QUALITY REVIEW INPUT ===",
  ].join("\n");

  const system = `${QUALITY_SYSTEM}\n\n${qualityContext}`;

  let assessment: QualityAssessment | null = null;

  await runSubAgent({
    messages: originalMessages,
    system,
    tools: QUALITY_TOOLS,
    onChunk,
    onToolLog,
    captureInputs: (name, input) => {
      if (name === "assess_quality") assessment = input as unknown as QualityAssessment;
    },
  });

  return assessment;
}

// ── Main orchestrator ─────────────────────────────────────────────────────────

export interface OrchestrationOptions {
  humanInTheLoop?: boolean;
  clarificationAnswer?: string;
  onHitlPause?: (question: string, reason: string) => void;
}

export async function runOrchestration(
  messages: Anthropic.MessageParam[],
  onChunk: AgentChunkCallback,
  onToolLog?: AgentToolCallback,
  onClarification?: ClarificationCallback,
  memoryContext?: string,
  onAgentStart?: AgentStartCallback,
  options?: OrchestrationOptions
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

  const { humanInTheLoop = false, clarificationAnswer, onHitlPause } = options ?? {};

  // If a clarification answer was provided, inject it into the messages context.
  if (clarificationAnswer) {
    const lastMsg = messages[messages.length - 1];
    const existingText = typeof lastMsg.content === "string"
      ? lastMsg.content
      : (lastMsg.content as Array<{ type: string; text?: string }>)
          .filter(b => b.type === "text").map(b => b.text ?? "").join("");
    messages[messages.length - 1] = {
      role: "user",
      content: `[Clarification provided by user: ${clarificationAnswer}]\n\n${existingText}`,
    };
  }

  // Phase 0: Router — classify document and decide pipeline.
  console.log("[orchestrator] Phase 0: Router");
  onAgentStart?.("router", "Router");
  let routing: RoutingDecision = { document_type: "Unknown", run_researcher: true, rationale: "Default" };
  try {
    routing = await runRouterAgent(
      copy(),
      (text) => onChunk("router", text),
      toolLog("router"),
      humanInTheLoop && !clarificationAnswer  // only ask if HITL on AND no answer yet
    );
    console.log(`[orchestrator] Routing decision: ${routing.document_type} — researcher: ${routing.run_researcher}`);
  } catch (err) {
    console.error("[orchestrator] Router failed — using full pipeline:", err);
  }

  // HITL pause — Router found a clarification question and no answer has been provided yet.
  if (humanInTheLoop && !clarificationAnswer && routing.clarification_question) {
    console.log("[orchestrator] HITL pause — emitting clarification question");
    onHitlPause?.(routing.clarification_question, routing.clarification_reason ?? "");
    return; // pipeline stops here; resumes on next request with clarificationAnswer
  }

  // Kick off Researcher in background only if routing says it adds value.
  let researcherPromise: Promise<ResearcherResult>;
  if (routing.run_researcher) {
    console.log("[orchestrator] Starting Researcher in background");
    onAgentStart?.("researcher", "Researcher");
    researcherPromise = runResearcherAgent(copy(), toolLog("researcher"), routing.researcher_focus)
      .catch((err) => {
        console.error("[orchestrator] Researcher failed (non-fatal):", err);
        return { legalContext: null } as ResearcherResult;
      });
  } else {
    console.log("[orchestrator] Skipping Researcher (routing decision)");
    researcherPromise = Promise.resolve({ legalContext: null });
  }

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

  const MAX_RETRIES = 2; // up to 2 retries after initial draft = 3 total attempts

  // Phase 2: Initial Drafter run.
  // No agent_start — bubble created on first event to avoid an empty cursor during LLM latency.
  console.log("[orchestrator] Phase 2: Drafter (attempt 1)");
  let drafterResult: DrafterResult = { draft: null };
  try {
    drafterResult = await runDrafterAgent(
      copy(),
      analystResult,
      (text) => onChunk("drafter", text),
      toolLog("drafter")
    );
    console.log("[orchestrator] Drafter done — draft captured:", !!drafterResult.draft);
  } catch (err) {
    console.error("[orchestrator] Drafter failed:", err);
  }

  // Collect Researcher now — it has had the full Analyst + Drafter time to run concurrently.
  const researcherResult = await researcherPromise;
  console.log("[orchestrator] Researcher collected — context:", !!researcherResult.legalContext);

  // Phase 3: Quality → Drafter feedback loop.
  let qualityGaps: string[] = [];
  let lastQualityAgentId = "quality";
  let exhausted = false;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const qualityAgentId = attempt === 0 ? "quality"         : `quality_r${attempt}`;
    const qualityLabel   = attempt === 0 ? "Quality"         : `Quality · Check ${attempt + 1}`;
    lastQualityAgentId = qualityAgentId;

    console.log(`[orchestrator] Quality check ${attempt + 1}`);
    onAgentStart?.(qualityAgentId, qualityLabel);

    let assessment: QualityAssessment | null = null;
    try {
      assessment = await runQualityAgent(
        copy(),
        analystResult,
        researcherResult,
        drafterResult,
        routing,
        (text) => onChunk(qualityAgentId, text),
        toolLog(qualityAgentId)
      );
      console.log(`[orchestrator] Quality check ${attempt + 1} — ready:`, assessment?.overall_ready);
    } catch (err) {
      console.error(`[orchestrator] Quality check ${attempt + 1} failed:`, err);
      break;
    }

    // Pass or no assessment — done.
    if (!assessment || assessment.overall_ready) break;

    // Fail — collect gaps, retry Drafter if retries remain.
    qualityGaps = assessment.gaps ?? [];
    console.log(`[orchestrator] Quality gaps:`, qualityGaps);

    if (attempt >= MAX_RETRIES) {
      exhausted = true;
      console.log("[orchestrator] Max retries reached — stopping.");
      break;
    }

    const retryNum      = attempt + 1;
    const retryAgentId  = `drafter_r${retryNum}`;
    const retryLabel    = `Drafter · Retry ${retryNum}`;

    console.log(`[orchestrator] Drafter retry ${retryNum}`);
    onAgentStart?.(retryAgentId, retryLabel);
    try {
      drafterResult = await runDrafterAgent(
        copy(),
        analystResult,
        (text) => onChunk(retryAgentId, text),
        toolLog(retryAgentId),
        qualityGaps
      );
      console.log(`[orchestrator] Drafter retry ${retryNum} done — draft captured:`, !!drafterResult.draft);
    } catch (err) {
      console.error(`[orchestrator] Drafter retry ${retryNum} failed:`, err);
      break;
    }
  }

  if (exhausted) {
    const gapList = qualityGaps.map((g, i) => `\n- Gap ${i + 1}: ${g}`).join("");
    onChunk(lastQualityAgentId,
      `\n\n**Quality could not be resolved after ${MAX_RETRIES + 1} attempts.**` +
      ` The following gaps remain:${gapList}\n\n` +
      `Please use the **Request Revision** button to provide additional guidance.`
    );
  }

  console.log("[orchestrator] Done");
}

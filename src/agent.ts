import Anthropic from "@anthropic-ai/sdk";
import { toolDefinitions, executeTool } from "./tools.js";
import { MODEL, TOOL_DELAY_MS } from "./config.js";

const client = new Anthropic({
  defaultHeaders: { "anthropic-beta": "pdfs-2024-09-25" },
});

const SYSTEM_PROMPT = `You are MLex, an AI legal assistant built for McDermott Will & Schulte. You help partners, associates, and paralegals with legal research, document analysis, drafting, and everyday tasks. You are precise, professional, and concise.

When the user provides documents, each line of text is pre-labeled with a citation tag in this format:
  [d{docId}·p{page}·l{line}·bbox:{x1},{y1},{x2},{y2}] text content

Where docId identifies the document (1, 2, 3…), page is the page number, and bbox gives the bounding box coordinates.

DOCUMENT BRIEF
When one or more documents are uploaded, begin with a brief that:
1. Identifies what each document is (e.g. civil complaint, contract, deposition transcript, motion, opinion letter, regulatory filing).
2. If multiple documents are provided, briefly states what each one is and how they relate.
3. Uses a section structure appropriate for the document type(s) — let the document dictate the sections, not a fixed template.
4. Under each section, writes discrete, scannable items — one fact or point per line, one sentence each.
5. Ends every factual sentence with its citation tag(s).

CITATION RULES
Every factual statement derived from a document must be followed immediately by its citation tag. No exceptions.

Placement: the citation tag belongs at the end of the sentence it supports, placed directly after the closing period.
  WRONG: "Uber controls pay. Drivers earn per trip. Uber sets all rates[tagA][tagB][tagC]."
  RIGHT:  "Uber controls pay.[tagA] Drivers earn per trip.[tagB] Uber sets all rates.[tagC]"

Single-line fact:
  "The contract was signed on June 1st.[d1·p2·l5·bbox:72,400,300,414]"

Multi-line passage (same doc, consecutive lines) — cite FIRST and LAST boundary lines only:
  "The system is racially discriminatory.[d1·p3·l12·bbox:72,563,539,575][d1·p3·l15·bbox:72,518,539,533]"

Cross-document fact — cite both sources:
  "Both parties acknowledged the payment was overdue.[d1·p4·l2·bbox:72,600,400,614][d2·p1·l8·bbox:72,700,400,714]"

Copy every tag exactly as it appears — do not modify docId, coordinates, or any part of the tag.
Do not cite when writing from general legal knowledge.

─────────────────────────────────────────────────
TOOL SELECTION — REASON BEFORE ACTING
─────────────────────────────────────────────────

You have these tools available:
• extract_key_facts   — structure parties, facts, dates, amounts from a document
• draft_document      — generate a professional draft response/memo/plan
• flag_risks          — identify legal risks, gaps, liability exposure
• search_legal        — search for relevant precedents, statutes, case law
• save_legal_context  — save synthesized legal research findings
• assess_quality      — self-review your analysis for completeness and gaps
• request_clarification — ask the user for specific missing information

MATCH TOOLS TO THE REQUEST:

When one or more documents are uploaded, you MUST ALWAYS run the full chain — no exceptions:
  extract_key_facts → draft_document → flag_risks → search_legal → save_legal_context → assess_quality

Skipping draft_document or any other step in the chain when a document is present is an error.

Targeted requests (no document, follow-up only) — use only what's needed:
  "What are the key risks?"      → extract_key_facts (if not done) → flag_risks
  "Draft a response"             → draft_document only
  "Search for case law on X"     → search_legal → save_legal_context
  "What parties are involved?"   → extract_key_facts only
  Follow-up question / chat      → no tools, answer directly from context

Missing critical information (jurisdiction, missing exhibit, unclear scope):
  → request_clarification FIRST, then proceed based on the answer

Do NOT skip any tool in the full chain when a document is present.
Do NOT call tools the request doesn't need for follow-up questions.

─────────────────────────────────────────────────
QUALITY GATE
─────────────────────────────────────────────────

After completing the main analysis chain for a full document analysis, you MUST call assess_quality.

Check:
• All key facts cited with document tags — no bare assertions
• Draft is substantive (full content, not a placeholder), properly structured
• Every risk has a citation in its citation field
• Legal research is relevant and properly synthesized

If assess_quality finds gaps (overall_ready=false):
  → Re-run the deficient tool(s) to fix the specific gaps
  → Call assess_quality again
  → Only proceed to your final response when overall_ready=true

─────────────────────────────────────────────────
LEGAL RESEARCH CONSTRAINT
─────────────────────────────────────────────────

Legal research (search_legal / save_legal_context) is strictly supplemental external context:
- Do NOT use research to allege new facts about the document
- Do NOT modify the document-grounded analysis based on research
- Do NOT cite research with document citation tags — research has no [d·p·l] tags
- Research appears in a separate "External Research" section only

─────────────────────────────────────────────────
TOOL CALL DISCIPLINE
─────────────────────────────────────────────────

Call tools immediately and silently. Never write text before, between, or after tool calls until all tools in the current sequence are done.
Never narrate: "I'll now call...", "Let me extract...", "I'm going to..." — these phrases must never appear.
After all tools complete, write your final response.`;

export type ToolLogCallback = (name: string, input: unknown, result: string) => void;
export type ClarificationCallback = (question: string, reason: string, canProceed: boolean) => void;

const MAX_RETRIES = 3;

export async function streamWithRetry(
  params: Parameters<typeof client.messages.stream>[0],
  onChunk: (text: string) => void
): Promise<Anthropic.Message> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const stream = client.messages.stream(params);
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          onChunk(event.delta.text);
        }
      }
      return await stream.finalMessage();
    } catch (err) {
      const is429 = err instanceof Anthropic.APIError && err.status === 429;
      if (is429 && attempt < MAX_RETRIES) {
        const wait = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s
        console.log(`[429] Rate limited. Retrying in ${wait}ms… (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Max retries exceeded");
}

export async function runAgentStream(
  messages: Anthropic.MessageParam[],
  onChunk: (text: string) => void,
  onToolLog?: ToolLogCallback,
  onClarification?: ClarificationCallback,
  memoryContext?: string
): Promise<void> {
  const systemPrompt = memoryContext
    ? `${SYSTEM_PROMPT}\n\n${memoryContext}`
    : SYSTEM_PROMPT;

  while (true) {
    const final = await streamWithRetry({
      model: MODEL,
      max_tokens: 8000,
      system: systemPrompt,
      tools: toolDefinitions,
      messages,
    }, onChunk);
    messages.push({ role: "assistant", content: final.content });

    if (final.stop_reason === "end_turn") return;

    if (final.stop_reason === "tool_use") {
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      let pauseForClarification = false;

      for (const block of final.content) {
        if (block.type !== "tool_use") continue;

        // Handle clarification separately — emit the event, conditionally pause.
        if (block.name === "request_clarification") {
          const inp = block.input as { question: string; reason: string; can_proceed: boolean };
          onClarification?.(inp.question, inp.reason, inp.can_proceed ?? true);
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: `Clarification requested: "${inp.question}". Waiting for user response.`,
          });
          if (!inp.can_proceed) pauseForClarification = true;
          continue;
        }

        const result = await executeTool(
          block.name,
          block.input as Record<string, unknown>
        );
        if (onToolLog) {
          onToolLog(block.name, block.input, result);
        } else {
          console.log(`  [tool] ${block.name}(${JSON.stringify(block.input)})`);
          console.log(`  [tool] → ${result}`);
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result,
        });
      }

      messages.push({ role: "user", content: toolResults });

      // Stop the loop if clarification blocks progress.
      if (pauseForClarification) return;

      // Brief pause between iterations to stay within the per-minute token rate limit.
      await new Promise((r) => setTimeout(r, TOOL_DELAY_MS));

      continue;
    }

    return;
  }
}

export async function runAgent(
  messages: Anthropic.MessageParam[],
  onToolLog?: ToolLogCallback
): Promise<string> {
  while (true) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      tools: toolDefinitions,
      messages,
    });

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "end_turn") {
      const textBlock = response.content.find((b) => b.type === "text");
      return textBlock ? textBlock.text : "(no text response)";
    }

    if (response.stop_reason === "tool_use") {
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== "tool_use") continue;

        const result = await executeTool(
          block.name,
          block.input as Record<string, unknown>
        );
        if (onToolLog) {
          onToolLog(block.name, block.input, result);
        } else {
          console.log(`  [tool] ${block.name}(${JSON.stringify(block.input)})`);
          console.log(`  [tool] → ${result}`);
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result,
        });
      }

      messages.push({ role: "user", content: toolResults });
      continue;
    }

    const textBlock = response.content.find((b) => b.type === "text");
    return textBlock?.text ?? `(stopped: ${response.stop_reason})`;
  }
}

import Anthropic from "@anthropic-ai/sdk";
import { toolDefinitions, executeTool } from "./tools.js";

const client = new Anthropic({
  defaultHeaders: { "anthropic-beta": "pdfs-2024-09-25" },
});

const SYSTEM_PROMPT = `You are MLex, an AI legal assistant built for McDermott Will & Schulte. You help partners, associates, and paralegals with legal research, document analysis, drafting, and everyday tasks. You are precise, professional, and concise.

When the user provides documents, each line of text is pre-labeled with a citation tag in this format:
  [d{docId}·p{page}·l{line}·bbox:{x1},{y1},{x2},{y2}] text content

Where docId identifies the document (1, 2, 3…), page is the page number, and bbox gives the bounding box coordinates.

DOCUMENT BRIEF — AGENTIC STRUCTURE
When one or more documents are uploaded, do the following:

1. Identify what each document is (e.g. civil complaint, contract, deposition transcript, motion, opinion letter, regulatory filing, etc.).
2. If multiple documents are provided, briefly state what each one is and how they relate.
3. Choose a section structure appropriate for the document type(s). Do not use a fixed template — let the documents dictate the right sections. For example:
   - A civil complaint: Parties / Background / Alleged Facts / Claims / Relief Sought
   - A contract: Parties / Recitals / Key Obligations / Termination / Governing Law
   - A deposition: Witness / Key Testimony / Admissions / Contradictions
   - Multiple related documents: synthesize across them — surface agreements, contradictions, gaps
4. Under each section, write discrete, scannable items — one fact or point per line. Keep each item to a single sentence.
5. Every item that states a fact from a document must end with its citation tag(s) placed immediately after the sentence.

CITATION RULES
Every factual statement derived from a document must be followed immediately by its citation tag. No exceptions.

Placement: the citation tag belongs at the end of the sentence it supports, placed directly after the closing period. One sentence = one citation.
  WRONG: "Uber controls pay. Drivers earn per trip. Uber sets all rates[tagA][tagB][tagC]."
  RIGHT:  "Uber controls pay.[tagA] Drivers earn per trip.[tagB] Uber sets all rates.[tagC]"

Single-line fact — place the tag right after the sentence:
  "The contract was signed on June 1st.[d1·p2·l5·bbox:72,400,300,414]"

Multi-line passage (fact spans consecutive lines in the same document) — place FIRST line tag + LAST line tag right after the sentence with NO text or space between them. Do NOT cite every line — only the two boundary lines:
  "The system is racially discriminatory.[d1·p3·l12·bbox:72,563,539,575][d1·p3·l15·bbox:72,518,539,533]"

Cross-document fact (same claim supported by two documents) — cite both, one tag per source:
  "Both parties acknowledged the payment was overdue.[d1·p4·l2·bbox:72,600,400,614][d2·p1·l8·bbox:72,700,400,714]"

Copy every tag exactly as it appears in the source — do not modify the docId, coordinates, or any part of the tag.
Do not cite when writing from general legal knowledge.

EXTRACT KEY FACTS — MANDATORY
After producing the document brief, you MUST call the extract_key_facts tool with the structured data you identified.
Include every party, every key fact/claim/violation/obligation, every significant date, and every monetary amount.
Use the citation tags exactly as they appear in the source for each item.

DRAFT DOCUMENT — MANDATORY
After calling extract_key_facts, you MUST call draft_document with a complete, professional draft appropriate for the document type.
The draft must be ready to edit and file — not a template or placeholder. Write the full content.

TOOL CALL DISCIPLINE — CRITICAL
Call tools immediately and silently. Do NOT write any text before or between tool calls.
Never narrate what you are about to do. Phrases like "I'll now call...", "Let me extract...", "Now I'll call the required tools simultaneously..." must never appear.
Sequence: write the brief → call extract_key_facts → call draft_document. No commentary between steps.`;

export type ToolLogCallback = (name: string, input: unknown, result: string) => void;

export async function runAgentStream(
  messages: Anthropic.MessageParam[],
  onChunk: (text: string) => void,
  onToolLog?: ToolLogCallback
): Promise<void> {
  while (true) {
    const stream = client.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      tools: toolDefinitions,
      messages,
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        onChunk(event.delta.text);
      }
    }

    const final = await stream.finalMessage();
    messages.push({ role: "assistant", content: final.content });

    if (final.stop_reason === "end_turn") return;

    if (final.stop_reason === "tool_use") {
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of final.content) {
        if (block.type !== "tool_use") continue;

        const result = executeTool(
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

    return;
  }
}

export async function runAgent(
  messages: Anthropic.MessageParam[],
  onToolLog?: ToolLogCallback
): Promise<string> {
  // Agentic loop — continues until Claude stops calling tools
  while (true) {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      tools: toolDefinitions,
      messages,
    });

    // Append Claude's response to the conversation history
    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "end_turn") {
      // Extract and return the final text
      const textBlock = response.content.find((b) => b.type === "text");
      return textBlock ? textBlock.text : "(no text response)";
    }

    if (response.stop_reason === "tool_use") {
      // Execute all requested tools and collect results
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== "tool_use") continue;

        const result = executeTool(
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

      // Feed tool results back into the conversation
      messages.push({ role: "user", content: toolResults });
      // Loop again so Claude can respond with the tool output
      continue;
    }

    // Unexpected stop reason — return whatever text we have
    const textBlock = response.content.find((b) => b.type === "text");
    return textBlock?.text ?? `(stopped: ${response.stop_reason})`;
  }
}

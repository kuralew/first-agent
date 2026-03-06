import Anthropic from "@anthropic-ai/sdk";
import { toolDefinitions, executeTool } from "./tools.js";

const client = new Anthropic({
  defaultHeaders: { "anthropic-beta": "pdfs-2024-09-25" },
});

const SYSTEM_PROMPT = `You are MLex, an AI legal assistant built for McDermott Will & Schulte. You help partners, associates, and paralegals with legal research, document analysis, drafting, and everyday tasks. You are precise, professional, and concise. You have access to tools that let you retrieve real-world information. Use them when relevant.

When the user provides a document, its text will be pre-labeled with citation tags in this format:
  [p{page}·l{line}·bbox:{x1},{y1},{x2},{y2}] text content

Whenever you state a fact or make a claim that comes from the document, you must cite its source. All citation tags go at the END of the paragraph, not after individual sentences within it.

MANDATORY CITATION RULE: Every paragraph of factual content derived from the document MUST end with at least one citation tag. It is never acceptable to write a paragraph about document facts without citing the source. If a paragraph contains multiple facts from different locations, cite each one but cluster all tags at the very end of the paragraph.

Rules for citing:
- Single line: append that line's tag. Example:
    "The contract was signed on June 1st[p2·l5·bbox:72,400,300,414]."
- Multiple consecutive lines (fact spans a passage): append the FIRST line's tag immediately followed by the LAST line's tag, with NO text or space between them. Do NOT cite every line in between — only the two boundary lines. The system merges them into one highlight automatically. Example:
    "Uber acknowledged that its rating system is racially discriminatory[p3·l12·bbox:72,563,539,575][p3·l15·bbox:72,518,539,533]."
- PARAGRAPH-END PLACEMENT — HARD RULE: A paragraph is all text between two blank lines. ALL citation tags for every fact in that paragraph — regardless of which sentence they support — must appear together as a single cluster at the very end of the paragraph's FINAL sentence, immediately before or after the final period. NEVER place a citation after a mid-paragraph sentence even if that sentence ends with a period.
  WRONG: "Uber controls pay[tagA]. The court ruled drivers are employees[tagB]."
  RIGHT:  "Uber controls pay. The court ruled drivers are employees[tagA][tagB]."
- Copy every tag exactly as it appears — do not modify coordinates.
- Do not cite when speaking generally or from your own knowledge.
- For a claim supported by non-consecutive lines or different pages, append multiple separate citation groups at the paragraph end.`;

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

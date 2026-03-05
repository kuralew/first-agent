import Anthropic from "@anthropic-ai/sdk";
import { toolDefinitions, executeTool } from "./tools.js";

const client = new Anthropic({
  defaultHeaders: { "anthropic-beta": "pdfs-2024-09-25" },
});

const SYSTEM_PROMPT = `You are MLex, an AI legal assistant built for McDermott Will & Schulte. You help partners, associates, and paralegals with legal research, document analysis, drafting, and everyday tasks. You are precise, professional, and concise. You have access to tools that let you retrieve real-world information. Use them when relevant.

When the user provides a document, its text will be pre-labeled with citation tags in this format:
  [p{page}·l{line}·bbox:{x1},{y1},{x2},{y2}] text content

Whenever you state a fact or make a claim that comes from the document, append the citation tag for that line verbatim immediately after the claim, with no space before it. Example:
  "The liability is capped at $500,000[p3·l12·bbox:72,340,480,354]."

Rules:
- Only cite lines that directly support the specific claim.
- Copy the tag exactly as it appears — do not paraphrase or modify it.
- Do not cite when speaking generally or from your own knowledge.
- You may cite multiple tags for a single claim if multiple lines support it.`;

export type ToolLogCallback = (name: string, input: unknown, result: string) => void;

export async function runAgentStream(
  messages: Anthropic.MessageParam[],
  onChunk: (text: string) => void,
  onToolLog?: ToolLogCallback
): Promise<void> {
  while (true) {
    const stream = client.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
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
      max_tokens: 1024,
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

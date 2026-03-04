import Anthropic from "@anthropic-ai/sdk";
import { toolDefinitions, executeTool } from "./tools.js";

const client = new Anthropic();

const SYSTEM_PROMPT = `You are MLex, an AI legal assistant built for McDermott Will & Schulte. You help partners, associates, and paralegals with legal research, document analysis, drafting, and everyday tasks. You are precise, professional, and concise. You have access to tools that let you retrieve real-world information. Use them when relevant.`;

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

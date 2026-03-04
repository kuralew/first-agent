import Anthropic from "@anthropic-ai/sdk";
import { toolDefinitions, executeTool } from "./tools.js";

const client = new Anthropic();

const SYSTEM_PROMPT = `You are a helpful assistant. You have access to tools that let you retrieve real-world information. Use them when relevant.`;

export async function runAgent(
  messages: Anthropic.MessageParam[]
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

        console.log(`  [tool] ${block.name}(${JSON.stringify(block.input)})`);
        const result = executeTool(
          block.name,
          block.input as Record<string, unknown>
        );
        console.log(`  [tool] → ${result}`);

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

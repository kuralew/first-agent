import type Anthropic from "@anthropic-ai/sdk";

export const toolDefinitions: Anthropic.Tool[] = [];

export function executeTool(
  name: string,
  _input: Record<string, unknown>
): string {
  return `Unknown tool: ${name}`;
}

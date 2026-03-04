import type Anthropic from "@anthropic-ai/sdk";

// Tool definitions sent to Claude
export const toolDefinitions: Anthropic.Tool[] = [
  {
    name: "get_current_time",
    description:
      "Returns the current date and time. Use this when the user asks what time or date it is.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
];

// Tool execution — add new tools as cases here
export function executeTool(
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _input: Record<string, any>
): string {
  switch (name) {
    case "get_current_time": {
      const now = new Date();
      return now.toLocaleString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZoneName: "short",
      });
    }

    default:
      return `Unknown tool: ${name}`;
  }
}

export interface ToolLog {
  name: string;
  input: unknown;
  result: string;
}

export interface DisplayMessage {
  role: "user" | "assistant";
  text: string;
  toolLogs?: ToolLog[];
}

export interface ChatRequest {
  userMessage: string;
  history: unknown[];
}

export interface ChatResponse {
  reply: string;
  history: unknown[];
  toolLogs: ToolLog[];
}

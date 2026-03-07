export interface ToolLog {
  name: string;
  input: unknown;
  result: string;
}

export interface Citation {
  id: number;
  docId: number;
  page: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  quote: string;
}

export interface PageDims {
  [page: number]: { w: number; h: number };
}

export interface DocInfo {
  id: number;      // 1-indexed, stable across the conversation
  name: string;
  url: string;     // blob URL
  pageDims: PageDims;
}

export interface DisplayMessage {
  role: "user" | "assistant";
  text: string;
  toolLogs?: ToolLog[];
  docs?: DocInfo[];        // documents uploaded in this user message
  citations?: Citation[];
}

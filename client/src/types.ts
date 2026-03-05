export interface ToolLog {
  name: string;
  input: unknown;
  result: string;
}

export interface Citation {
  id: number;
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

export interface DisplayMessage {
  role: "user" | "assistant";
  text: string;
  toolLogs?: ToolLog[];
  pdfUrl?: string;
  pdfName?: string;
  citations?: Citation[];
}

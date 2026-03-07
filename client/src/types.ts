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

export interface ExtractedParty {
  role: string;
  name: string;
  citation?: string;
}

export interface ExtractedFact {
  category: string;
  item: string;
  citation?: string;
}

export interface KeyDate {
  date: string;
  description: string;
  citation?: string;
}

export interface KeyAmount {
  amount: string;
  description: string;
  citation?: string;
}

export interface ExtractedFacts {
  document_type: string;
  parties: ExtractedParty[];
  facts: ExtractedFact[];
  key_dates?: KeyDate[];
  amounts?: KeyAmount[];
}

export interface DisplayMessage {
  role: "user" | "assistant";
  text: string;
  toolLogs?: ToolLog[];
  docs?: DocInfo[];
  citations?: Citation[];
  extractedFacts?: ExtractedFacts;
}

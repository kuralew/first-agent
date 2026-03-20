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

export interface DocumentDraft {
  draft_type: string;
  title: string;
  content: string;
}

export type ReviewStatus = "pending" | "approved" | "rejected";

export interface DraftReview {
  status: ReviewStatus;
  comment?: string;
  timestamp: string;
}

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface RiskItem {
  severity: RiskLevel;
  category: string;
  description: string;
  recommendation: string;
  citation?: string;
}

export interface DocumentRisks {
  overall_risk_level: RiskLevel;
  risks: RiskItem[];
  summary: string;
}

export interface LegalSource {
  title: string;
  url: string;
  description: string;
}

export interface LegalFinding {
  claim_context: string;
  research: string;
  implication: string;
  sources?: string[];
}

export interface LegalContext {
  summary: string;
  findings: LegalFinding[];
}

export interface RoutingDecision {
  document_type: string;
  run_researcher: boolean;
  researcher_focus?: string;
  rationale: string;
}

export interface QualityResult {
  facts_adequate: boolean;
  draft_adequate: boolean;
  risks_adequate: boolean;
  research_adequate: boolean;
  gaps: string[];
  overall_ready: boolean;
}

export interface CaseMemory {
  caseId: string;
  caseName: string;
  documentType: string;
  parties: Array<{ role: string; name: string }>;
  keyRisks: string[];
  overallRiskLevel?: string;
  draftType?: string;
  feedbackPatterns: string[];
}

export interface CaseListItem {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

/** Typed Anthropic conversation turn — mirrors MessageParam without importing the SDK on the client. */
export interface ConversationTurn {
  role: "user" | "assistant";
  content: unknown;
}

export interface SavedCase extends CaseListItem {
  history: ConversationTurn[];
  displayMessages: DisplayMessage[];
}

export interface ClarificationRequest {
  question: string;
  reason: string;
  canProceed: boolean;
  answer?: string;  // set when the user has answered
}

export interface DisplayMessage {
  role: "user" | "assistant";
  text: string;
  toolLogs?: ToolLog[];
  docs?: DocInfo[];
  citations?: Citation[];
  extractedFacts?: ExtractedFacts;
  draft?: DocumentDraft;
  draftReview?: DraftReview;
  risks?: DocumentRisks;
  legalContext?: LegalContext;
  clarification?: ClarificationRequest;
  isIntake?: boolean;   // true when triggered by the file watcher, not the user
  agentLabel?: string;        // e.g. "Analyst", "Researcher", "Drafter" — for multi-agent bubbles
  routingDecision?: RoutingDecision; // captured from route_document tool
  toolRunning?: string;   // currently-running tool name for this bubble's spinner
  qualityResult?: QualityResult; // captured from assess_quality tool
}

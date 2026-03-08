import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  PdfLoader,
  PdfHighlighter,
  Highlight,
  Popup,
} from "react-pdf-highlighter";
import type { IHighlight, ScaledPosition } from "react-pdf-highlighter";
import type { DisplayMessage, Citation, DocInfo, ExtractedFacts, DocumentDraft, DocumentRisks, RiskLevel, LegalContext, CaseListItem, SavedCase } from "./types.ts";
import { extractTextWithBBoxes } from "./pdfExtract.ts";

// ── Constants ─────────────────────────────────────────────────────────────────

const WORKER_SRC = `https://unpkg.com/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs`;

// Matches [d{docId}·p{page}·l{line}·bbox:{x1},{y1},{x2},{y2}]
const CITATION_RE = /\[d(\d+)·p(\d+)·l(\d+)·bbox:(\d+),(\d+),(\d+),(\d+)\]/g;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Strip citation tags from raw text and return clean text + citation list.
 *
 * Consecutive tags from the same doc+page with only whitespace between them
 * are treated as a range and merged into one citation whose bbox spans the
 * full passage.
 */
// Phrases Claude sometimes emits before calling tools — strip them from display.
const PLANNING_PHRASES = [
  /^Now I['']ll call the required tools simultaneously\.?\n?/im,
  /^I['']ll now call\b[^\n]*\n?/im,
  /^Let me (now |)call\b[^\n]*\n?/im,
  /^I['']ll call\b[^\n]*\n?/im,
  /^Now(,| I['']ll)\b[^\n]*tools[^\n]*\n?/im,
];

function stripPlanningPhrases(text: string): string {
  let out = text;
  for (const re of PLANNING_PHRASES) out = out.replace(re, "");
  return out;
}

function parseCitations(raw: string): { text: string; citations: Citation[] } {
  type TagMatch = {
    index: number; end: number;
    docId: number; page: number;
    x1: number; y1: number; x2: number; y2: number;
  };

  const tags: TagMatch[] = [];
  const re = new RegExp(CITATION_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    tags.push({
      index: m.index, end: m.index + m[0].length,
      docId: +m[1], page: +m[2],
      x1: +m[4], y1: +m[5], x2: +m[6], y2: +m[7],
    });
  }

  // Group consecutive same-doc+page tags (only whitespace between) into ranges.
  const groups: TagMatch[][] = [];
  for (const tag of tags) {
    const last = groups[groups.length - 1];
    const prev = last?.[last.length - 1];
    if (
      prev &&
      prev.docId === tag.docId &&
      prev.page === tag.page &&
      /^\s*$/.test(raw.slice(prev.end, tag.index))
    ) {
      last.push(tag);
    } else {
      groups.push([tag]);
    }
  }

  // Merge each group into one citation with a bbox spanning the full passage.
  const citations: Citation[] = [];
  const replacements: { start: number; end: number; label: string }[] = [];
  let nextId = 1;

  for (const group of groups) {
    const docId = group[0].docId;
    const page = group[0].page;
    const x1 = Math.min(...group.map((t) => t.x1));
    const y1 = Math.min(...group.map((t) => t.y1));
    const x2 = Math.max(...group.map((t) => t.x2));
    const y2 = Math.max(...group.map((t) => t.y2));
    const existing = citations.find(
      (c) => c.docId === docId && c.page === page && c.x1 === x1 && c.y1 === y1
    );
    const id = existing ? existing.id : nextId;
    if (!existing) {
      citations.push({ id, docId, page, x1, y1, x2, y2, quote: "" });
      nextId++;
    }
    replacements.push({
      start: group[0].index,
      end: group[group.length - 1].end,
      label: "[" + id + "]",
    });
  }

  // Apply back-to-front so earlier indexes stay valid.
  let text = raw;
  for (const rep of [...replacements].reverse()) {
    text = text.slice(0, rep.start) + rep.label + text.slice(rep.end);
  }

  // Strip trailing incomplete citation tag that may appear during streaming.
  text = text.replace(/\[d?\d[^\]]*$/, "");

  return { text, citations };
}

/** Convert a Citation to an IHighlight for react-pdf-highlighter. */
function citationToHighlight(c: Citation, docs: DocInfo[]): IHighlight {
  const doc = docs.find((d) => d.id === c.docId);
  const dim = doc?.pageDims[c.page] ?? { w: 612, h: 792 };
  const rect = {
    x1: c.x1, y1: c.y1, x2: c.x2, y2: c.y2,
    width: dim.w, height: dim.h, pageNumber: c.page,
  };
  return {
    id: String(c.id),
    content: { text: c.quote || `Citation ${c.id}` },
    comment: { text: `[${c.id}]`, emoji: "📄" },
    position: {
      boundingRect: rect,
      rects: [rect],
      pageNumber: c.page,
      usePdfCoordinates: true,
    } as ScaledPosition,
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MlexAvatar() {
  return (
    <div className="avatar">
      <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="20" cy="20" r="20" fill="#1B3A6B" />
        <text x="20" y="25" textAnchor="middle" fill="white" fontSize="13" fontWeight="700" fontFamily="Inter, system-ui, sans-serif">ML</text>
      </svg>
    </div>
  );
}

function SendIcon({ disabled }: { disabled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="send-icon">
      <circle cx="12" cy="12" r="12" fill={disabled ? "#D1CBC4" : "#1B3A6B"} />
      <path d="M12 17V8M8 12L12 8L16 12" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Renders assistant text with markdown formatting and inline citation buttons. */
function AssistantText({
  text,
  citations,
  onCitationClick,
  streaming,
  toolRunning,
  isLast,
}: {
  text: string;
  citations: Citation[];
  onCitationClick: (c: Citation) => void;
  streaming: boolean;
  toolRunning: string | null;
  isLast: boolean;
}) {
  const renderInline = (str: string) => {
    const parts = str.split(/(\[\d+\])/g);
    return parts.map((part, i) => {
      const match = part.match(/^\[(\d+)\]$/);
      if (match) {
        const id = +match[1];
        const citation = citations.find((c) => c.id === id);
        if (citation) {
          return (
            <button
              key={i}
              className="citation-btn"
              onClick={() => onCitationClick(citation)}
              title={`Jump to source — Doc ${citation.docId}, page ${citation.page}`}
            >
              {id}
            </button>
          );
        }
      }
      return <span key={i}>{part}</span>;
    });
  };

  const injectCitations = (children: React.ReactNode): React.ReactNode => {
    if (Array.isArray(children)) {
      return children.flatMap((child) =>
        typeof child === "string" ? renderInline(child) : [child]
      );
    }
    if (typeof children === "string") return renderInline(children);
    return children;
  };

  return (
    <div className="assistant-text">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p>{injectCitations(children)}</p>,
          li: ({ children }) => <li>{injectCitations(children)}</li>,
          td: ({ children }) => <td>{injectCitations(children)}</td>,
          th: ({ children }) => <th>{injectCitations(children)}</th>,
          h1: ({ children }) => <h1>{injectCitations(children)}</h1>,
          h2: ({ children }) => <h2>{injectCitations(children)}</h2>,
          h3: ({ children }) => <h3>{injectCitations(children)}</h3>,
          hr: () => null,
        }}
      >
        {text}
      </ReactMarkdown>
      {streaming && isLast && !toolRunning && <span className="cursor" />}
      {streaming && isLast && toolRunning && (
        <span className="thinking-label">
          <svg className="thinking-icon" viewBox="0 0 20 20" width="19" height="19" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="10" cy="10" r="8.2" stroke="currentColor" strokeWidth="1.3" strokeDasharray="3.5 2" />
            <circle cx="10" cy="3.2" r="1.6" fill="currentColor" />
            <circle cx="15.7" cy="13.1" r="1.6" fill="currentColor" />
            <circle cx="4.3" cy="13.1" r="1.6" fill="currentColor" />
          </svg>
          {({
            extract_key_facts:   "Extracting facts",
            draft_document:      "Drafting document",
            flag_risks:          "Flagging risks",
            search_legal:        "Searching legal precedents",
            save_legal_context:  "Saving legal context",
          } as Record<string, string>)[toolRunning] ?? "Working"}
          <span className="thinking-dots"><span>.</span><span>.</span><span>.</span></span>
        </span>
      )}
    </div>
  );
}

/** Renders extracted key facts as a structured, exportable card. */
function FactsCard({
  facts,
  onCitationClick,
}: {
  facts: ExtractedFacts;
  onCitationClick: (c: Citation) => void;
}) {
  // Parse a raw citation tag string into a Citation object for button rendering.
  // Handles full format [d1·p4·l26·bbox:x1,y1,x2,y2] and partial [d1·p4·l26] (no bbox).
  function parseSingleTag(tag: string | undefined, fallbackId: number): Citation | null {
    if (!tag) return null;
    const full = tag.match(/\[d(\d+)·p(\d+)·l(\d+)·bbox:(\d+),(\d+),(\d+),(\d+)\]/);
    if (full) return { id: fallbackId, docId: +full[1], page: +full[2], x1: +full[4], y1: +full[5], x2: +full[6], y2: +full[7], quote: "" };
    const partial = tag.match(/\[d(\d+)·p(\d+)/);
    if (partial) return { id: fallbackId, docId: +partial[1], page: +partial[2], x1: 0, y1: 0, x2: 0, y2: 0, quote: "" };
    return null;
  }

  function CitationButton({ tag, id }: { tag?: string; id: number }) {
    const c = parseSingleTag(tag, id);
    if (!c) return null;
    return (
      <button
        className="citation-btn"
        onClick={() => onCitationClick(c)}
        title={`Jump to source — Doc ${c.docId}, page ${c.page}`}
      >
        ↗
      </button>
    );
  }

  // Renders plain text, converting any embedded [d1·p2·...] tags into ↗ buttons.
  // Uses the shared citationCounter from the enclosing scope so IDs never collide.
  const renderInlineText = (text: string) => {
    const parts = text.split(/(\[d\d+·[^\]]+\])/g);
    return parts.map((part, i) => {
      if (/^\[d\d+·/.test(part)) {
        const c = parseSingleTag(part, citationCounter++);
        if (c) return <button key={i} className="citation-btn" onClick={() => onCitationClick(c)} title={`Jump to source — Doc ${c.docId}, page ${c.page}`}>↗</button>;
      }
      return <span key={i}>{part}</span>;
    });
  };

  // Group facts by category.
  const byCategory = facts.facts.reduce<Record<string, typeof facts.facts>>((acc, f) => {
    (acc[f.category] = acc[f.category] ?? []).push(f);
    return acc;
  }, {});

  function exportJson() {
    const blob = new Blob([JSON.stringify(facts, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "extracted-facts.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  let citationCounter = 5000;

  return (
    <div className="facts-card">
      <div className="facts-card-header">
        <div className="facts-card-title">
          <span className="facts-card-icon">⬡</span>
          <span>Extracted Facts</span>
          <span className="facts-card-doctype">{facts.document_type}</span>
        </div>
        <button className="facts-export-btn" onClick={exportJson} title="Export as JSON">
          Export JSON
        </button>
      </div>

      {/* Parties */}
      {facts.parties.length > 0 && (
        <div className="facts-section">
          <div className="facts-section-label">Parties</div>
          <table className="facts-table">
            <tbody>
              {facts.parties.map((p, i) => (
                <tr key={i}>
                  <td className="facts-role">{p.role}</td>
                  <td className="facts-name">
                    {p.name}
                    <CitationButton tag={p.citation} id={citationCounter++} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Facts by category */}
      {Object.entries(byCategory).map(([category, items]) => (
        <div className="facts-section" key={category}>
          <div className="facts-section-label">{category}</div>
          <ul className="facts-list">
            {items.map((f, i) => (
              <li key={i}>
                {renderInlineText(f.item)}
                <CitationButton tag={f.citation} id={citationCounter++} />
              </li>
            ))}
          </ul>
        </div>
      ))}

      {/* Key Dates */}
      {facts.key_dates && facts.key_dates.length > 0 && (
        <div className="facts-section">
          <div className="facts-section-label">Key Dates</div>
          <ul className="facts-list">
            {facts.key_dates.map((d, i) => (
              <li key={i}>
                <span className="facts-date">{d.date}</span>
                <span className="facts-date-desc">{renderInlineText(d.description)}</span>
                <CitationButton tag={d.citation} id={citationCounter++} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Amounts */}
      {facts.amounts && facts.amounts.length > 0 && (
        <div className="facts-section">
          <div className="facts-section-label">Amounts</div>
          <ul className="facts-list">
            {facts.amounts.map((a, i) => (
              <li key={i}>
                <span className="facts-amount">{a.amount}</span>
                <span className="facts-date-desc">{renderInlineText(a.description)}</span>
                <CitationButton tag={a.citation} id={citationCounter++} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Renders a drafted document with markdown preview and .docx download. */
function DraftCard({ draft }: { draft: DocumentDraft }) {
  const [expanded, setExpanded] = useState(true);

  async function downloadDocx() {
    const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import("docx");

    const children: InstanceType<typeof Paragraph>[] = [];

    // Title
    children.push(
      new Paragraph({ text: draft.title, heading: HeadingLevel.TITLE })
    );

    // Parse markdown line by line into docx paragraphs.
    for (const line of draft.content.split("\n")) {
      if (line.startsWith("## ")) {
        children.push(new Paragraph({ text: line.slice(3), heading: HeadingLevel.HEADING_2 }));
      } else if (line.startsWith("# ")) {
        children.push(new Paragraph({ text: line.slice(2), heading: HeadingLevel.HEADING_1 }));
      } else if (line.startsWith("- ") || line.startsWith("* ")) {
        children.push(new Paragraph({ text: line.slice(2), bullet: { level: 0 } }));
      } else if (line.trim() === "") {
        children.push(new Paragraph({ text: "" }));
      } else {
        // Handle inline **bold** spans.
        const parts = line.split(/(\*\*[^*]+\*\*)/g);
        const runs = parts.map((p) => {
          if (p.startsWith("**") && p.endsWith("**")) {
            return new TextRun({ text: p.slice(2, -2), bold: true });
          }
          return new TextRun({ text: p });
        });
        children.push(new Paragraph({ children: runs }));
      }
    }

    const doc = new Document({ sections: [{ children }] });
    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${draft.title.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="draft-card">
      <div className="draft-card-header">
        <div className="draft-card-title">
          <span className="draft-card-icon">✦</span>
          <span className="draft-card-type">{draft.draft_type}</span>
          <span className="draft-card-name">{draft.title}</span>
        </div>
        <div className="draft-card-actions">
          <button className="draft-download-btn" onClick={downloadDocx} title="Download as .docx">
            Download .docx
          </button>
          <button
            className="draft-toggle-btn"
            onClick={() => setExpanded((e) => !e)}
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? "▲" : "▼"}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="draft-body">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{draft.content}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}

/** Renders the flagged risks card. */
function RisksCard({
  risks,
  onCitationClick,
}: {
  risks: DocumentRisks;
  onCitationClick: (c: Citation) => void;
}) {
  const LEVEL_COLOR: Record<RiskLevel, string> = {
    LOW: "#2E7D32",
    MEDIUM: "#E65100",
    HIGH: "#B71C1C",
    CRITICAL: "#6A0000",
  };

  function parseSingleTag(tag: string | undefined, fallbackId: number): Citation | null {
    if (!tag) return null;
    const full = tag.match(/\[d(\d+)·p(\d+)·l(\d+)·bbox:(\d+),(\d+),(\d+),(\d+)\]/);
    if (full) return { id: fallbackId, docId: +full[1], page: +full[2], x1: +full[4], y1: +full[5], x2: +full[6], y2: +full[7], quote: "" };
    const partial = tag.match(/\[d(\d+)·p(\d+)/);
    if (partial) return { id: fallbackId, docId: +partial[1], page: +partial[2], x1: 0, y1: 0, x2: 0, y2: 0, quote: "" };
    return null;
  }

  function CitationButton({ tag, id }: { tag?: string; id: number }) {
    const c = parseSingleTag(tag, id);
    if (!c) return null;
    return (
      <button
        className="citation-btn"
        onClick={() => onCitationClick(c)}
        title={`Jump to source — Doc ${c.docId}, page ${c.page}`}
      >
        ↗
      </button>
    );
  }

  const renderInlineText = (text: string) => {
    const parts = text.split(/(\[d\d+·[^\]]+\])/g);
    return parts.map((part, i) => {
      if (/^\[d\d+·/.test(part)) {
        const c = parseSingleTag(part, citationCounter++);
        if (c) return <button key={i} className="citation-btn" onClick={() => onCitationClick(c)} title={`Jump to source — Doc ${c.docId}, page ${c.page}`}>↗</button>;
      }
      return <span key={i}>{part}</span>;
    });
  };

  let citationCounter = 9000;

  return (
    <div className="risks-card">
      <div className="risks-card-header">
        <div className="risks-card-title">
          <span className="risks-card-icon">⚠</span>
          <span>Risk Assessment</span>
          <span
            className="risks-overall-badge"
            style={{ background: LEVEL_COLOR[risks.overall_risk_level] }}
          >
            {risks.overall_risk_level}
          </span>
        </div>
      </div>

      <p className="risks-summary">{risks.summary}</p>

      <div className="risks-list">
        {risks.risks.map((r, i) => (
          <div key={i} className="risk-item" data-severity={r.severity}>
            <div className="risk-item-header">
              <span
                className="risk-severity"
                style={{ color: LEVEL_COLOR[r.severity] }}
              >
                {r.severity}
              </span>
              <span className="risk-category">{r.category}</span>
              <CitationButton tag={r.citation} id={citationCounter++} />
            </div>
            <p className="risk-description">{renderInlineText(r.description)}</p>
            <p className="risk-recommendation">
              <span className="risk-rec-label">Recommendation: </span>
              {renderInlineText(r.recommendation)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Renders legal research findings as a clearly-labeled external research card. */
function LegalContextCard({ context }: { context: LegalContext }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="legal-card">
      <div className="legal-card-header">
        <div className="legal-card-title">
          <span className="legal-card-icon">⚖</span>
          <span>External Research</span>
          <span className="legal-card-badge">Supplemental — not document-grounded</span>
        </div>
        <button
          className="legal-card-toggle"
          onClick={() => setExpanded((e) => !e)}
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? "▲" : "▼"}
        </button>
      </div>

      {expanded && (
        <>
          <p className="legal-card-summary">{context.summary}</p>
          <div className="legal-findings">
            {context.findings.map((f, i) => (
              <div key={i} className="legal-finding">
                <div className="legal-finding-context">{f.claim_context}</div>
                <div className="legal-finding-research">{f.research}</div>
                <div className="legal-finding-implication">{f.implication}</div>
                {f.sources && f.sources.length > 0 && (
                  <div className="legal-finding-sources">
                    {f.sources.map((src, j) => (
                      <a key={j} href={src} target="_blank" rel="noopener noreferrer" className="legal-source-link">
                        {j + 1}. {src.replace(/^https?:\/\//, "").split("/")[0]}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Case sidebar ──────────────────────────────────────────────────────────────

function formatRelativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function CaseSidebar({
  cases,
  activeCaseId,
  caseName,
  onLoad,
  onDelete,
  onNew,
  onRename,
}: {
  cases: CaseListItem[];
  activeCaseId: string | null;
  caseName: string;
  onLoad: (id: string) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onNew: () => void;
  onRename: (name: string) => void;
}) {
  return (
    <div className="case-sidebar">
      <div className="case-sidebar-header">
        <span className="case-sidebar-title">Cases</span>
        <button className="case-new-btn" onClick={onNew} title="New case">＋</button>
      </div>

      {activeCaseId && (
        <div className="case-active-name">
          <input
            className="case-name-input"
            value={caseName}
            onChange={(e) => onRename(e.target.value)}
            placeholder="Name this case…"
          />
        </div>
      )}

      <div className="case-list">
        {cases.length === 0 ? (
          <div className="case-empty">No saved cases yet</div>
        ) : (
          cases.map((c) => (
            <div
              key={c.id}
              className={`case-item${c.id === activeCaseId ? " case-item-active" : ""}`}
              onClick={() => onLoad(c.id)}
            >
              <div className="case-item-name">{c.name}</div>
              <div className="case-item-meta">{formatRelativeDate(c.updatedAt)}</div>
              <button
                className="case-delete-btn"
                onClick={(e) => onDelete(c.id, e)}
                title="Delete case"
              >×</button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [displayMessages, setDisplayMessages] = useState<DisplayMessage[]>([]);
  const [history, setHistory] = useState<unknown[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [toolRunning, setToolRunning] = useState<string | null>(null);

  // Case memory
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [caseName, setCaseName] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Docs staged in the input area, not yet sent.
  const [pendingDocs, setPendingDocs] = useState<
    Array<{ file: File; name: string; url: string }>
  >([]);

  // All documents seen in this conversation, keyed by stable docId.
  const [sessionDocs, setSessionDocs] = useState<DocInfo[]>([]);
  // Monotonically increasing counter for assigning docIds.
  const [nextDocId, setNextDocId] = useState(1);

  const [previewPdf, setPreviewPdf] = useState<{ url: string; name: string } | null>(null);
  const [activeCitation, setActiveCitation] = useState<Citation | null>(null);
  // Bumped after scroll when textLayer wasn't ready; forces re-render →
  // new highlights reference → PdfHighlighter.componentDidUpdate → renderHighlightLayers().
  const [highlightKey, setHighlightKey] = useState(0);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollToRef = useRef<((h: IHighlight) => void) | null>(null);
  const previewPaneRef = useRef<HTMLDivElement>(null);
  const pendingCitationRef = useRef<Citation | null>(null);
  // Always-current sessionDocs for use inside async callbacks.
  const sessionDocsRef = useRef<DocInfo[]>([]);
  useEffect(() => { sessionDocsRef.current = sessionDocs; }, [sessionDocs]);

  // Always-current case refs — needed inside async streaming callbacks.
  const activeCaseIdRef = useRef<string | null>(null);
  useEffect(() => { activeCaseIdRef.current = activeCaseId; }, [activeCaseId]);
  const caseNameRef = useRef("");
  useEffect(() => { caseNameRef.current = caseName; }, [caseName]);

  // Intake pipeline state.
  const [intakeNotification, setIntakeNotification] = useState<string | null>(null);
  // Refs so async intake callback always sees latest values.
  const nextDocIdRef = useRef(1);
  useEffect(() => { nextDocIdRef.current = nextDocId; }, [nextDocId]);
  const historyRef = useRef<unknown[]>([]);
  useEffect(() => { historyRef.current = history; }, [history]);
  // Ref to intakeAnalyze so the EventSource effect can call it without re-subscribing.
  const intakeAnalyzeRef = useRef<((filename: string, url: string) => Promise<void>) | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayMessages, loading]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }, [input]);

  // Connect to server-sent events; auto-analyze any PDF dropped in ./inbox/.
  useEffect(() => {
    const es = new EventSource("http://localhost:3001/events");
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "new_document") {
          setIntakeNotification(data.filename);
          intakeAnalyzeRef.current?.(data.filename, `http://localhost:3001${data.url}`);
        }
      } catch { /* ignore malformed events */ }
    };
    return () => es.close();
  }, []);

  // Load case list on mount.
  useEffect(() => { fetchCases(); }, []);

  // Auto-save whenever streaming ends and we have an active case.
  // Using streaming as the sole dep is intentional — we read the latest committed
  // displayMessages and history (React has already flushed all state updates by
  // the time this effect runs after streaming→false).
  useEffect(() => {
    if (!streaming && activeCaseIdRef.current && displayMessages.length > 0) {
      saveCase(displayMessages, history);
    }
  }, [streaming]); // eslint-disable-line react-hooks/exhaustive-deps

  // When the preview pane first opens (previewPdf changes), wait for pdfjs to
  // initialise, scroll to the pending citation's page, then wait for the
  // textLayer to render before setting activeCitation. This avoids the
  // StrictMode double-init bug where renderHighlightLayers() runs before
  // the textLayer exists.
  useEffect(() => {
    if (!previewPdf || !pendingCitationRef.current) return;

    const pending = pendingCitationRef.current;
    let cancelled = false;
    let initAttempts = 0;

    const waitForInit = () => {
      if (cancelled) return;
      const firstPage = previewPaneRef.current?.querySelector('[data-page-number="1"]');
      const canvas = firstPage?.querySelector("canvas") as HTMLCanvasElement | null;
      if (canvas && canvas.offsetHeight > 0) {
        scrollThenWaitForTextLayer();
      } else if (initAttempts < 40) {
        initAttempts++;
        setTimeout(waitForInit, 100);
      }
    };

    const scrollThenWaitForTextLayer = () => {
      if (cancelled) return;
      const pdfViewer = previewPaneRef.current?.querySelector(".pdfViewer") as HTMLElement | null;
      const pageEl = pdfViewer?.querySelector(
        `[data-page-number="${pending.page}"]`
      ) as HTMLElement | null;
      if (pdfViewer && pageEl) {
        const dims = sessionDocsRef.current.find((d) => d.id === pending.docId)?.pageDims ?? {};
        const dim = dims[pending.page];
        const scale = dim ? pageEl.offsetHeight / dim.h : 1;
        const lineOffsetFromPageTop = dim ? (dim.h - pending.y2) * scale : 0;
        (pdfViewer.parentElement as HTMLElement).scrollTo({
          top: pageEl.offsetTop + lineOffsetFromPageTop - 80,
          behavior: "smooth",
        });
      }
      waitForTextLayer(0);
    };

    const waitForTextLayer = (attempts: number) => {
      if (cancelled) return;
      const targetPage = previewPaneRef.current?.querySelector(
        `[data-page-number="${pending.page}"]`
      );
      const textLayer = targetPage?.querySelector(".textLayer") as HTMLElement | null;
      if (textLayer && textLayer.children.length > 0) {
        pendingCitationRef.current = null;
        setActiveCitation(pending);
      } else if (attempts < 40) {
        setTimeout(() => waitForTextLayer(attempts + 1), 100);
      }
    };

    setTimeout(waitForInit, 100);
    return () => { cancelled = true; };
  }, [previewPdf]);

  // Scroll to cited line whenever activeCitation changes. If the target page's
  // textLayer isn't in the DOM yet (off-screen), poll until it appears then
  // bump highlightKey to force a re-render → new highlights reference →
  // PdfHighlighter.componentDidUpdate → renderHighlightLayers() with live textLayer.
  useEffect(() => {
    if (!activeCitation || !previewPdf) return;

    let cancelled = false;
    let attempts = 0;

    const tryScroll = () => {
      if (cancelled) return;
      const pdfViewer = previewPaneRef.current?.querySelector(".pdfViewer") as HTMLElement | null;
      const pageEl = pdfViewer?.querySelector(
        `[data-page-number="${activeCitation.page}"]`
      ) as HTMLElement | null;

      if (pdfViewer && pageEl) {
        const dims = sessionDocs.find((d) => d.id === activeCitation.docId)?.pageDims ?? {};
        const dim = dims[activeCitation.page];
        const scale = dim ? pageEl.offsetHeight / dim.h : 1;
        const lineOffsetFromPageTop = dim ? (dim.h - activeCitation.y2) * scale : 0;
        (pdfViewer.parentElement as HTMLElement).scrollTo({
          top: pageEl.offsetTop + lineOffsetFromPageTop - 80,
          behavior: "smooth",
        });
        if (scrollToRef.current) {
          try { scrollToRef.current(citationToHighlight(activeCitation, sessionDocs)); } catch (_) {}
        }

        const page = activeCitation.page;
        const targetPage = previewPaneRef.current?.querySelector(`[data-page-number="${page}"]`);
        const textLayer = targetPage?.querySelector(".textLayer") as HTMLElement | null;
        if (!textLayer || textLayer.children.length === 0) {
          const waitForLayer = (retries: number) => {
            if (cancelled) return;
            const tp = previewPaneRef.current?.querySelector(`[data-page-number="${page}"]`);
            const tl = tp?.querySelector(".textLayer") as HTMLElement | null;
            if (tl && tl.children.length > 0) {
              setHighlightKey((k) => k + 1);
            } else if (retries < 30) {
              setTimeout(() => waitForLayer(retries + 1), 100);
            }
          };
          waitForLayer(0);
        }
      } else if (attempts < 20) {
        attempts++;
        setTimeout(tryScroll, 250);
      }
    };

    const timer = setTimeout(tryScroll, 150);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [activeCitation, previewPdf]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const newDocs = files.map((file) => ({
      file,
      name: file.name,
      url: URL.createObjectURL(file),
    }));
    setPendingDocs((prev) => [...prev, ...newDocs]);
    e.target.value = "";
  }

  function removePendingDoc(index: number) {
    setPendingDocs((prev) => {
      URL.revokeObjectURL(prev[index].url);
      return prev.filter((_, i) => i !== index);
    });
  }

  function handleCitationClick(citation: Citation) {
    const doc = sessionDocs.find((d) => d.id === citation.docId);
    if (!doc) return;

    if (!previewPdf || previewPdf.url !== doc.url) {
      // Pane is opening or switching to a different doc.
      // Defer activeCitation until PdfHighlighter is initialised for the new doc.
      pendingCitationRef.current = citation;
      setActiveCitation(null);
      setPreviewPdf({ url: doc.url, name: doc.name });
    } else {
      // Same doc already open — set directly.
      setActiveCitation(citation);
    }
  }

  async function fetchCases() {
    try {
      const res = await fetch("http://localhost:3001/cases");
      if (res.ok) setCases(await res.json());
    } catch { /* server may not be running */ }
  }

  async function saveCase(msgs: DisplayMessage[], hist: unknown[]) {
    const id = activeCaseIdRef.current;
    if (!id) return;
    let name = caseNameRef.current;
    if (!name) {
      const firstDoc = msgs.find((m) => m.docs?.length)?.docs?.[0];
      name = firstDoc
        ? firstDoc.name.replace(/\.pdf$/i, "")
        : `Case ${new Date().toLocaleDateString()}`;
      setCaseName(name);
      caseNameRef.current = name;
    }
    // Strip blob URLs — they're session-only and can't be persisted.
    const serialized = msgs.map((m) => ({
      ...m,
      docs: m.docs?.map((d) => ({ ...d, url: "", pageDims: {} })),
    }));
    try {
      await fetch(`http://localhost:3001/cases/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, history: hist, displayMessages: serialized }),
      });
      fetchCases();
    } catch { /* ignore */ }
  }

  async function loadCase(id: string) {
    try {
      const res = await fetch(`http://localhost:3001/cases/${id}`);
      if (!res.ok) return;
      const data: SavedCase = await res.json();
      setActiveCaseId(data.id);
      activeCaseIdRef.current = data.id;
      setCaseName(data.name);
      caseNameRef.current = data.name;
      setHistory(data.history);
      setDisplayMessages(data.displayMessages);
      // Rebuild sessionDocs from saved messages (no blob URLs — View is hidden).
      const loadedDocs: DocInfo[] = [];
      for (const msg of data.displayMessages) {
        for (const doc of msg.docs ?? []) {
          if (!loadedDocs.find((d) => d.id === doc.id)) loadedDocs.push(doc);
        }
      }
      setSessionDocs(loadedDocs);
      setNextDocId(Math.max(0, ...loadedDocs.map((d) => d.id)) + 1);
      setPreviewPdf(null);
      setActiveCitation(null);
      setInput("");
      setPendingDocs([]);
    } catch { /* ignore */ }
  }

  async function deleteCase(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    await fetch(`http://localhost:3001/cases/${id}`, { method: "DELETE" });
    if (activeCaseIdRef.current === id) startNewCase();
    fetchCases();
  }

  function startNewCase() {
    setActiveCaseId(null);
    activeCaseIdRef.current = null;
    setCaseName("");
    caseNameRef.current = "";
    setHistory([]);
    setDisplayMessages([]);
    setSessionDocs([]);
    setNextDocId(1);
    setPreviewPdf(null);
    setActiveCitation(null);
    setInput("");
    setPendingDocs([]);
  }

  async function intakeAnalyze(filename: string, serverUrl: string) {
    if (loading) return;
    if (!activeCaseIdRef.current) {
      const newId = `case_${Date.now()}`;
      setActiveCaseId(newId);
      activeCaseIdRef.current = newId;
    }
    setLoading(true);
    try {
      const response = await fetch(serverUrl);
      const blob = await response.blob();
      const file = new File([blob], filename, { type: "application/pdf" });
      const objectUrl = URL.createObjectURL(file);
      const { text: rawText, pageDims } = await extractTextWithBBoxes(file);

      const docId = nextDocIdRef.current;
      const prefixedText = rawText.replace(/^\[p/gm, `[d${docId}\u00B7p`);
      const newDoc: DocInfo = { id: docId, name: filename, url: objectUrl, pageDims };

      setSessionDocs((prev) => [...prev, newDoc]);
      setNextDocId(docId + 1);
      setDisplayMessages((prev) => [
        ...prev,
        { role: "user", text: `Analyze: ${filename}`, docs: [newDoc], isIntake: true },
      ]);

      const res = await fetch("http://localhost:3001/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userMessage: `Please analyze this document: ${filename}`,
          history: historyRef.current,
          docText: `=== Document ${docId}: ${filename} ===\n${prefixedText.trim()}\n\n`,
        }),
      });

      if (!res.ok) throw new Error(`Server error: ${res.status}`);

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let started = false;
      let rawAccum = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          if (!part.startsWith("data: ")) continue;
          let data: { type: string; text?: string; name?: string; input?: unknown; result?: string; history?: unknown[]; error?: string; };
          try { data = JSON.parse(part.slice(6)); } catch { continue; }
          if (data.type === "chunk") {
            setToolRunning(null);
            rawAccum += data.text;
            const { text: cleanText, citations } = parseCitations(stripPlanningPhrases(rawAccum));
            if (!started) {
              started = true;
              setLoading(false);
              setStreaming(true);
              setDisplayMessages((prev) => [...prev, { role: "assistant", text: cleanText, toolLogs: [], citations }]);
            } else {
              setDisplayMessages((prev) => {
                const msgs = [...prev];
                const last = msgs[msgs.length - 1];
                return [...msgs.slice(0, -1), { ...last, text: cleanText, citations }];
              });
            }
          } else if (data.type === "tool") {
            setToolRunning(data.name ?? null);
            setDisplayMessages((prev) => {
              const msgs = [...prev];
              const last = msgs[msgs.length - 1];
              const toolLogs = [...(last.toolLogs ?? []), { name: data.name ?? "", input: data.input, result: data.result ?? "" }];
              const update: Partial<DisplayMessage> = { toolLogs };
              if (data.name === "extract_key_facts" && data.input) update.extractedFacts = data.input as ExtractedFacts;
              if (data.name === "draft_document" && data.input) update.draft = data.input as DocumentDraft;
              if (data.name === "flag_risks" && data.input) update.risks = data.input as DocumentRisks;
              if (data.name === "save_legal_context" && data.input) update.legalContext = data.input as LegalContext;
              return [...msgs.slice(0, -1), { ...last, ...update }];
            });
          } else if (data.type === "done") {
            if (data.history) setHistory(data.history);
          } else if (data.type === "error") {
            throw new Error(data.error);
          }
        }
      }

      if (!started) {
        setDisplayMessages((prev) => [...prev, { role: "assistant", text: "(no response)", toolLogs: [], citations: [] }]);
      }
    } catch (err) {
      setDisplayMessages((prev) => [...prev, { role: "assistant", text: `Intake error: ${String(err)}` }]);
    } finally {
      setLoading(false);
      setStreaming(false);
      setToolRunning(null);
    }
  }
  // Keep ref current so the EventSource effect always calls the latest version.
  intakeAnalyzeRef.current = intakeAnalyze;

  async function send() {
    const text = input.trim();
    if ((!text && pendingDocs.length === 0) || loading) return;

    const docsToSend = [...pendingDocs];
    setInput("");
    setPendingDocs([]);

    if (!activeCaseIdRef.current) {
      const newId = `case_${Date.now()}`;
      setActiveCaseId(newId);
      activeCaseIdRef.current = newId;
    }

    setLoading(true);

    try {
      // Extract text for each pending doc, assign stable docIds, prefix tags.
      let docId = nextDocId;
      const newDocs: DocInfo[] = [];
      let combinedDocText = "";

      for (const pending of docsToSend) {
        const { text: rawText, pageDims } = await extractTextWithBBoxes(pending.file);
        // Prefix each citation tag with the document ID: [p → [d{N}·p
        const prefixedText = rawText.replace(/^\[p/gm, `[d${docId}\u00B7p`);
        newDocs.push({ id: docId, name: pending.name, url: pending.url, pageDims });
        combinedDocText += `=== Document ${docId}: ${pending.name} ===\n${prefixedText.trim()}\n\n`;
        docId++;
      }

      if (newDocs.length > 0) {
        setSessionDocs((prev) => [...prev, ...newDocs]);
        setNextDocId(docId);
      }

      setDisplayMessages((prev) => [
        ...prev,
        {
          role: "user",
          text: text || `Analyze: ${docsToSend.map((d) => d.name).join(", ")}`,
          docs: newDocs,
        },
      ]);

      const res = await fetch("http://localhost:3001/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userMessage: text,
          history,
          docText: combinedDocText || undefined,
        }),
      });

      if (!res.ok) throw new Error(`Server error: ${res.status}`);

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let started = false;
      let rawAccum = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";

        for (const part of parts) {
          if (!part.startsWith("data: ")) continue;
          let data: {
            type: string;
            text?: string;
            name?: string;
            input?: unknown;
            result?: string;
            history?: unknown[];
            error?: string;
          };
          try { data = JSON.parse(part.slice(6)); } catch { continue; }

          if (data.type === "chunk") {
            setToolRunning(null);
            rawAccum += data.text;
            const { text: cleanText, citations } = parseCitations(stripPlanningPhrases(rawAccum));

            if (!started) {
              started = true;
              setLoading(false);
              setStreaming(true);
              setDisplayMessages((prev) => [
                ...prev,
                { role: "assistant", text: cleanText, toolLogs: [], citations },
              ]);
            } else {
              setDisplayMessages((prev) => {
                const msgs = [...prev];
                const last = msgs[msgs.length - 1];
                return [...msgs.slice(0, -1), { ...last, text: cleanText, citations }];
              });
            }
          } else if (data.type === "tool") {
            setToolRunning(data.name ?? null);
            setDisplayMessages((prev) => {
              const msgs = [...prev];
              const last = msgs[msgs.length - 1];
              const toolLogs = [
                ...(last.toolLogs ?? []),
                { name: data.name ?? "", input: data.input, result: data.result ?? "" },
              ];
              const update: Partial<DisplayMessage> = { toolLogs };
              if (data.name === "extract_key_facts" && data.input) {
                update.extractedFacts = data.input as ExtractedFacts;
              }
              if (data.name === "draft_document" && data.input) {
                update.draft = data.input as DocumentDraft;
              }
              if (data.name === "flag_risks" && data.input) {
                update.risks = data.input as DocumentRisks;
              }
              if (data.name === "save_legal_context" && data.input) {
                update.legalContext = data.input as LegalContext;
              }
              return [...msgs.slice(0, -1), { ...last, ...update }];
            });
          } else if (data.type === "done") {
            if (data.history) setHistory(data.history);
          } else if (data.type === "error") {
            throw new Error(data.error);
          }
        }
      }

      if (!started) {
        setDisplayMessages((prev) => [
          ...prev,
          { role: "assistant", text: "(no response)", toolLogs: [], citations: [] },
        ]);
      }
    } catch (err) {
      setDisplayMessages((prev) => [
        ...prev,
        { role: "assistant", text: `Error: ${String(err)}` },
      ]);
    } finally {
      setLoading(false);
      setStreaming(false);
      setToolRunning(null);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  // Only the active citation is highlighted — one at a time, no clutter.
  // highlightKey is read here so a state bump causes a re-render and a new
  // array reference, which triggers PdfHighlighter.componentDidUpdate.
  const activeDocDims = activeCitation
    ? sessionDocs.find((d) => d.id === activeCitation.docId)?.pageDims
    : null;
  const highlights: IHighlight[] =
    activeCitation && activeDocDims?.[activeCitation.page] && highlightKey >= 0
      ? [citationToHighlight(activeCitation, sessionDocs)]
      : [];

  const isEmpty = displayMessages.length === 0 && !loading;
  const canSend = !loading && (!!input.trim() || pendingDocs.length > 0);

  const handleScrollRef = useCallback((scrollTo: (h: IHighlight) => void) => {
    scrollToRef.current = scrollTo;
  }, []);

  return (
    <div className={`layout${sidebarOpen ? " layout-sidebar" : ""}${previewPdf ? " layout-preview" : ""}`}>
      <CaseSidebar
        cases={cases}
        activeCaseId={activeCaseId}
        caseName={caseName}
        onLoad={loadCase}
        onDelete={deleteCase}
        onNew={startNewCase}
        onRename={(name) => { setCaseName(name); caseNameRef.current = name; }}
      />
      {/* ── Chat pane ── */}
      <div className="app">
        <header className="header">
          <div className="header-inner">
            <button
              className="sidebar-toggle"
              onClick={() => setSidebarOpen((o) => !o)}
              title={sidebarOpen ? "Hide cases" : "Show cases"}
            >
              <svg viewBox="0 0 18 14" fill="none" width="18" height="14">
                <rect y="0" width="18" height="2" rx="1" fill="currentColor" />
                <rect y="6" width="12" height="2" rx="1" fill="currentColor" />
                <rect y="12" width="18" height="2" rx="1" fill="currentColor" />
              </svg>
            </button>
            <span className="header-logo">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="22" height="22">
                <circle cx="12" cy="12" r="12" fill="#1B3A6B" />
                <text x="12" y="16" textAnchor="middle" fill="white" fontSize="7.5" fontWeight="700" fontFamily="Inter, system-ui, sans-serif">ML</text>
              </svg>
            </span>
            <span className="header-title">MLex</span>
            <span className="header-model">McDermott Will &amp; Schulte</span>
          </div>
        </header>

        {intakeNotification && (
          <div className="intake-notification">
            <span className="intake-notification-icon">⚡</span>
            <span>Auto-analyzing: <strong>{intakeNotification}</strong></span>
            <button className="intake-notification-close" onClick={() => setIntakeNotification(null)}>×</button>
          </div>
        )}

        <div className="messages">
          {isEmpty && (
            <div className="empty-state">
              <div className="empty-logo">
                <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="40" cy="40" r="40" fill="#E8EDF5" />
                  <text x="40" y="50" textAnchor="middle" fill="#1B3A6B" fontSize="22" fontWeight="700" fontFamily="Inter, system-ui, sans-serif">ML</text>
                </svg>
              </div>
              <h2>How can I help you today?</h2>
              <p className="empty-subtitle">Your AI legal assistant by McDermott Will &amp; Schulte</p>
            </div>
          )}

          {displayMessages.map((msg, i) => (
            <div key={i} className={`message-row message-row-${msg.role}`}>
              {msg.role === "assistant" && <MlexAvatar />}
              <div className={`message-content message-content-${msg.role}`}>
                {msg.role === "assistant" ? (
                  <>
                    {msg.toolLogs && msg.toolLogs.length > 0 && (
                      <details className="tool-logs">
                        <summary>
                          <span className="tool-logs-icon">⚙</span>
                          Used {msg.toolLogs.length} tool{msg.toolLogs.length !== 1 ? "s" : ""}
                        </summary>
                        <div className="tool-logs-body">
                          {msg.toolLogs.map((log, j) => (
                            <div key={j} className="tool-log">
                              <div className="tool-log-header">
                                <span className="tool-name">{log.name}</span>
                              </div>
                              <pre className="tool-input">{JSON.stringify(log.input, null, 2)}</pre>
                              <pre className="tool-result">{log.result}</pre>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                    {msg.extractedFacts && (
                      <FactsCard
                        facts={msg.extractedFacts}
                        onCitationClick={handleCitationClick}
                      />
                    )}
                    {msg.draft && <DraftCard draft={msg.draft} />}
                    {msg.risks && (
                      <RisksCard
                        risks={msg.risks}
                        onCitationClick={handleCitationClick}
                      />
                    )}
                    {msg.legalContext && (
                      <LegalContextCard context={msg.legalContext} />
                    )}
                    <AssistantText
                      text={msg.text}
                      citations={msg.citations ?? []}
                      onCitationClick={handleCitationClick}
                      streaming={streaming}
                      toolRunning={toolRunning}
                      isLast={i === displayMessages.length - 1}
                    />
                  </>
                ) : (
                  <div className="user-message-stack">
                    {msg.isIntake && (
                      <div className="intake-badge">⚡ Auto-analyzed from inbox</div>
                    )}
                    {msg.docs?.map((doc) => (
                      <div key={doc.id} className="user-attachment-card">
                        <div className="user-attachment-icon">
                          <svg viewBox="0 0 24 24" fill="none" width="18" height="18">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                            <polyline points="14 2 14 8 20 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                            <line x1="16" y1="13" x2="8" y2="13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                            <line x1="16" y1="17" x2="8" y2="17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                          </svg>
                        </div>
                        <div className="user-attachment-info">
                          <span className="user-attachment-name">{doc.name}</span>
                          <span className="user-attachment-meta">PDF Document</span>
                        </div>
                        {doc.url && <button
                          className="user-attachment-view"
                          onClick={() => {
                            setActiveCitation(null);
                            setPreviewPdf({ url: doc.url, name: doc.name });
                          }}
                        >
                          View
                        </button>}
                      </div>
                    ))}
                    {msg.text &&
                      msg.text !== `Analyze: ${msg.docs?.map((d) => d.name).join(", ")}` && (
                        <div className="user-bubble-text">{msg.text}</div>
                      )}
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="message-row message-row-assistant">
              <MlexAvatar />
              <div className="message-content message-content-assistant">
                <div className="typing">
                  <span className="dot" />
                  <span className="dot" />
                  <span className="dot" />
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        <div className="input-wrap">
          {pendingDocs.length > 0 && (
            <div className="pdf-chips">
              {pendingDocs.map((doc, i) => (
                <div key={i} className="pdf-chip">
                  <span className="pdf-chip-icon">📄</span>
                  <span className="pdf-chip-name">{doc.name}</span>
                  <button
                    className="pdf-chip-remove"
                    onClick={() => removePendingDoc(i)}
                    aria-label="Remove"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="input-card">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              multiple
              style={{ display: "none" }}
              onChange={handleFileChange}
            />
            <button
              className="attach-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              aria-label="Attach PDF"
              title="Attach PDF"
            >
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="18" height="18">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                pendingDocs.length > 0
                  ? `Ask about ${pendingDocs.map((d) => d.name).join(", ")}...`
                  : "Message MLex..."
              }
              rows={1}
              disabled={loading}
            />
            <button className="send-btn" onClick={send} disabled={!canSend} aria-label="Send">
              <SendIcon disabled={!canSend} />
            </button>
          </div>
          <p className="input-hint">Enter to send &middot; Shift+Enter for newline</p>
        </div>
      </div>

      {/* ── Preview pane ── */}
      {previewPdf && (
        <div className="preview-pane" ref={previewPaneRef}>
          <div className="preview-header">
            <span className="preview-title">📄 {previewPdf.name}</span>
            <button
              className="preview-close"
              onClick={() => { setPreviewPdf(null); setActiveCitation(null); }}
              aria-label="Close preview"
            >
              ×
            </button>
          </div>
          <div className="preview-body">
            <PdfLoader url={previewPdf.url} workerSrc={WORKER_SRC} beforeLoad={<div className="pdf-loading">Loading…</div>}>
              {(pdfDocument) => (
                <PdfHighlighter
                  pdfDocument={pdfDocument}
                  highlights={highlights}
                  onScrollChange={() => {}}
                  scrollRef={handleScrollRef}
                  pdfScaleValue="page-width"
                  onSelectionFinished={() => null}
                  enableAreaSelection={() => false}
                  highlightTransform={(highlight, _index, _setTip, _hideTip, _viewportToScaled, _screenshot, isScrolledTo) => (
                    <Popup
                      popupContent={<div className="highlight-popup">{highlight.comment.text}</div>}
                      onMouseOver={() => {}}
                      onMouseOut={() => {}}
                      key={highlight.id}
                    >
                      <Highlight
                        isScrolledTo={isScrolledTo || highlight.id === String(activeCitation?.id)}
                        position={highlight.position}
                        comment={highlight.comment}
                      />
                    </Popup>
                  )}
                />
              )}
            </PdfLoader>
          </div>
        </div>
      )}
    </div>
  );
}

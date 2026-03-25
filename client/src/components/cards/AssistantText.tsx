import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Citation } from "../../types.ts";

const TOOL_LABELS: Record<string, string> = {
  extract_key_facts:     "Extracting facts",
  draft_document:        "Drafting document",
  flag_risks:            "Flagging risks",
  search_legal:          "Searching legal precedents",
  save_legal_context:    "Saving legal context",
  assess_quality:        "Reviewing quality",
  request_clarification: "Requesting clarification",
};

export function AssistantText({
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
      {streaming && isLast && !toolRunning && text && <span className="cursor" />}
      {streaming && isLast && (toolRunning || !text) && (
        <span className="thinking-label">
          <svg className="thinking-icon" viewBox="0 0 20 20" width="19" height="19" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="10" cy="10" r="8.2" stroke="currentColor" strokeWidth="1.3" strokeDasharray="3.5 2" />
            <circle cx="10" cy="3.2" r="1.6" fill="currentColor" />
            <circle cx="15.7" cy="13.1" r="1.6" fill="currentColor" />
            <circle cx="4.3" cy="13.1" r="1.6" fill="currentColor" />
          </svg>
          {toolRunning ? (TOOL_LABELS[toolRunning] ?? "Working") : "Thinking"}
          <span className="thinking-dots"><span>.</span><span>.</span><span>.</span></span>
        </span>
      )}
    </div>
  );
}

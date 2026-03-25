import type { DisplayMessage, DocInfo } from "../../types.ts";

export function UserMessage({
  msg,
  onViewDoc,
}: {
  msg: DisplayMessage;
  onViewDoc: (doc: DocInfo) => void;
}) {
  return (
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
          {doc.url && (
            <button
              className="user-attachment-view"
              onClick={() => onViewDoc(doc)}
            >
              View
            </button>
          )}
        </div>
      ))}
      {msg.text &&
        msg.text !== `Analyze: ${msg.docs?.map((d) => d.name).join(", ")}` && (
          <div className="user-bubble-text">{msg.text}</div>
        )}
    </div>
  );
}

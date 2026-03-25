export function HitlReplyCard({
  question,
  reason,
  answer,
  loading,
  onAnswerChange,
  onSubmit,
  onSkip,
}: {
  question: string;
  reason: string;
  answer: string;
  loading: boolean;
  onAnswerChange: (value: string) => void;
  onSubmit: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="hitl-reply-wrap">
      <div className="hitl-reply-card">
        <div className="hitl-reply-header">
          <svg className="hitl-reply-icon" viewBox="0 0 20 20" fill="none" width="16" height="16">
            <circle cx="10" cy="10" r="8.5" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M10 6v4.5M10 13.5v.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          <span className="hitl-reply-title">Clarification needed before analysis</span>
        </div>
        <div className="hitl-reply-question">{question}</div>
        {reason && <div className="hitl-reply-reason">{reason}</div>}
        <textarea
          className="hitl-reply-input"
          value={answer}
          onChange={(e) => onAnswerChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSubmit(); }
          }}
          placeholder="Type your answer..."
          rows={2}
          autoFocus
        />
        <div className="hitl-reply-actions">
          <button className="hitl-skip-btn" onClick={onSkip}>Skip</button>
          <button className="hitl-submit-btn" onClick={onSubmit} disabled={loading}>Submit</button>
        </div>
      </div>
    </div>
  );
}

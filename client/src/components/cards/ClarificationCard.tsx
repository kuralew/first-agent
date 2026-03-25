import { useState, memo } from "react";
import type { ClarificationRequest } from "../../types.ts";

export const ClarificationCard = memo(function ClarificationCard({
  clarification,
  onAnswer,
}: {
  clarification: ClarificationRequest;
  onAnswer: (answer: string) => void;
}) {
  const [answer, setAnswer] = useState(clarification.answer ?? "");
  const answered = !!clarification.answer;

  function submit() {
    const trimmed = answer.trim();
    if (!trimmed || answered) return;
    onAnswer(trimmed);
  }

  return (
    <div className="clarification-card">
      <div className="clarification-header">
        <span className="clarification-icon">?</span>
        <span className="clarification-label">Clarification needed</span>
      </div>
      <div className="clarification-question">{clarification.question}</div>
      {clarification.reason && (
        <div className="clarification-reason">{clarification.reason}</div>
      )}
      {answered ? (
        <div className="clarification-answered">
          <span className="clarification-answered-label">Your answer:</span>
          {clarification.answer}
        </div>
      ) : (
        <div className="clarification-input-row">
          <input
            className="clarification-input"
            type="text"
            placeholder="Type your answer…"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            autoFocus
          />
          <button
            className="clarification-submit-btn"
            onClick={submit}
            disabled={!answer.trim()}
          >
            Submit
          </button>
        </div>
      )}
    </div>
  );
});

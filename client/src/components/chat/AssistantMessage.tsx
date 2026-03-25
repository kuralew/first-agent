import type { DisplayMessage, Citation } from "../../types.ts";
import { AssistantText } from "../cards/AssistantText.tsx";
import { FactsCard } from "../cards/FactsCard.tsx";
import { DraftCard } from "../cards/DraftCard.tsx";
import { RisksCard } from "../cards/RisksCard.tsx";
import { LegalContextCard } from "../cards/LegalContextCard.tsx";
import { ClarificationCard } from "../cards/ClarificationCard.tsx";
import { QualityCard } from "../cards/QualityCard.tsx";
import { RoutingCard } from "../cards/RoutingCard.tsx";

export function AssistantMessage({
  msg,
  msgIndex,
  isLast,
  streaming,
  collapsed,
  onToggleCollapse,
  onCitationClick,
  onApproveDraft,
  onRejectDraft,
  onAnswerClarification,
}: {
  msg: DisplayMessage;
  msgIndex: number;
  isLast: boolean;
  streaming: boolean;
  collapsed: boolean;
  onToggleCollapse: (idx: number) => void;
  onCitationClick: (c: Citation) => void;
  onApproveDraft: (msgIndex: number) => void;
  onRejectDraft: (msgIndex: number, comment: string) => void;
  onAnswerClarification: (msgIndex: number, answer: string) => void;
}) {
  return (
    <>
      {msg.agentLabel && (
        <button
          className="agent-label-btn"
          onClick={() => onToggleCollapse(msgIndex)}
          aria-expanded={!collapsed}
        >
          <span className="agent-label">{msg.agentLabel}</span>
          <svg
            className={`agent-chevron${collapsed ? " agent-chevron--collapsed" : ""}`}
            viewBox="0 0 12 12" fill="none" width="11" height="11"
          >
            <path d="M2 4.5L6 8.5L10 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      )}
      {!collapsed && (
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
          {msg.routingDecision && (
            <RoutingCard decision={msg.routingDecision} />
          )}
          {msg.extractedFacts && (
            <FactsCard facts={msg.extractedFacts} onCitationClick={onCitationClick} />
          )}
          {msg.draft && (
            <DraftCard
              draft={msg.draft}
              review={msg.draftReview}
              onApprove={() => onApproveDraft(msgIndex)}
              onReject={(comment) => onRejectDraft(msgIndex, comment)}
            />
          )}
          {msg.risks && (
            <RisksCard risks={msg.risks} onCitationClick={onCitationClick} />
          )}
          {msg.legalContext && (
            <LegalContextCard context={msg.legalContext} />
          )}
          {msg.qualityResult && (
            <QualityCard result={msg.qualityResult} />
          )}
          {msg.clarification && (
            <ClarificationCard
              clarification={msg.clarification}
              onAnswer={(answer) => onAnswerClarification(msgIndex, answer)}
            />
          )}
          <AssistantText
            text={msg.text}
            citations={msg.citations ?? []}
            onCitationClick={onCitationClick}
            streaming={streaming}
            toolRunning={msg.toolRunning ?? null}
            isLast={isLast}
          />
        </>
      )}
    </>
  );
}

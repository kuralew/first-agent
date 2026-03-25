import type { DisplayMessage, Citation, DocInfo } from "../../types.ts";
import { MlexAvatar } from "../common/MlexAvatar.tsx";
import { AssistantMessage } from "./AssistantMessage.tsx";
import { UserMessage } from "./UserMessage.tsx";
import { EmptyState } from "./EmptyState.tsx";
import { TypingIndicator } from "./TypingIndicator.tsx";

export function MessageList({
  displayMessages,
  loading,
  streaming,
  bottomRef,
  collapsedAgents,
  onToggleCollapse,
  onCitationClick,
  onApproveDraft,
  onRejectDraft,
  onAnswerClarification,
  onViewDoc,
}: {
  displayMessages: DisplayMessage[];
  loading: boolean;
  streaming: boolean;
  bottomRef: React.RefObject<HTMLDivElement>;
  collapsedAgents: Set<number>;
  onToggleCollapse: (idx: number) => void;
  onCitationClick: (c: Citation) => void;
  onApproveDraft: (msgIndex: number) => void;
  onRejectDraft: (msgIndex: number, comment: string) => void;
  onAnswerClarification: (msgIndex: number, answer: string) => void;
  onViewDoc: (doc: DocInfo) => void;
}) {
  const isEmpty = displayMessages.length === 0 && !loading;

  return (
    <div className="messages">
      {isEmpty && <EmptyState />}

      {displayMessages.map((msg, i) => (
        <div key={i} className={`message-row message-row-${msg.role}`}>
          {msg.role === "assistant" && <MlexAvatar />}
          <div className={`message-content message-content-${msg.role}`}>
            {msg.role === "assistant" ? (
              <AssistantMessage
                msg={msg}
                msgIndex={i}
                isLast={i === displayMessages.length - 1 || !!msg.toolRunning}
                streaming={streaming}
                collapsed={collapsedAgents.has(i)}
                onToggleCollapse={onToggleCollapse}
                onCitationClick={onCitationClick}
                onApproveDraft={onApproveDraft}
                onRejectDraft={onRejectDraft}
                onAnswerClarification={onAnswerClarification}
              />
            ) : (
              <UserMessage msg={msg} onViewDoc={onViewDoc} />
            )}
          </div>
        </div>
      ))}

      {loading && <TypingIndicator />}

      <div ref={bottomRef} />
    </div>
  );
}

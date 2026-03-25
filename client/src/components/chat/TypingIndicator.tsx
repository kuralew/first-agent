import { MlexAvatar } from "../common/MlexAvatar.tsx";

export function TypingIndicator() {
  return (
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
  );
}

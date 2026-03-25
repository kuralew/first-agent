import { SendIcon } from "../common/SendIcon.tsx";
import { PdfChips } from "./PdfChips.tsx";

export function ChatInput({
  input,
  onInputChange,
  loading,
  pendingDocs,
  onRemovePendingDoc,
  fileInputRef,
  textareaRef,
  onSend,
  onFileChange,
  onKeyDown,
  onDragOver,
  onDragLeave,
  onDrop,
  dragOver,
}: {
  input: string;
  onInputChange: (value: string) => void;
  loading: boolean;
  pendingDocs: Array<{ file: File; name: string; url: string }>;
  onRemovePendingDoc: (index: number) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  onSend: () => void;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  dragOver: boolean;
}) {
  const canSend = !loading && (!!input.trim() || pendingDocs.length > 0);

  return (
    <div className="input-wrap">
      {pendingDocs.length > 0 && (
        <PdfChips pendingDocs={pendingDocs} onRemove={onRemovePendingDoc} />
      )}
      <div
        className={`input-card${dragOver ? " drag-over" : ""}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          multiple
          style={{ display: "none" }}
          onChange={onFileChange}
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
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={
            pendingDocs.length > 0
              ? `Ask about ${pendingDocs.map((d) => d.name).join(", ")}...`
              : "Message MLex..."
          }
          rows={1}
          disabled={loading}
        />
        <button className="send-btn" onClick={onSend} disabled={!canSend} aria-label="Send">
          <SendIcon disabled={!canSend} />
        </button>
      </div>
      <p className="input-hint">Enter to send &middot; Shift+Enter for newline</p>
    </div>
  );
}

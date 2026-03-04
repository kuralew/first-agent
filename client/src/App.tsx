import { useState, useRef, useEffect } from "react";
import { Document, Page } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import type { DisplayMessage } from "./types.ts";

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

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function App() {
  const [displayMessages, setDisplayMessages] = useState<DisplayMessage[]>([]);
  const [history, setHistory] = useState<unknown[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [pendingPdf, setPendingPdf] = useState<{ file: File; name: string; url: string } | null>(null);
  const [previewPdf, setPreviewPdf] = useState<{ url: string; name: string } | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayMessages, loading]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }, [input]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPendingPdf({ file, name: file.name, url });
    e.target.value = "";
  }

  function removePendingPdf() {
    if (pendingPdf) URL.revokeObjectURL(pendingPdf.url);
    setPendingPdf(null);
  }

  async function send() {
    const text = input.trim();
    if ((!text && !pendingPdf) || loading) return;

    const pdfSnapshot = pendingPdf;
    setInput("");
    setPendingPdf(null);

    setDisplayMessages((prev) => [
      ...prev,
      {
        role: "user",
        text: text || `Analyze: ${pdfSnapshot?.name}`,
        pdfUrl: pdfSnapshot?.url,
        pdfName: pdfSnapshot?.name,
      },
    ]);
    setLoading(true);

    try {
      let pdfPayload: { base64: string; name: string } | undefined;
      if (pdfSnapshot) {
        const base64 = await fileToBase64(pdfSnapshot.file);
        pdfPayload = { base64, name: pdfSnapshot.name };
      }

      const res = await fetch("http://localhost:3001/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userMessage: text, history, pdf: pdfPayload }),
      });

      if (!res.ok) throw new Error(`Server error: ${res.status}`);

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let started = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";

        for (const part of parts) {
          if (!part.startsWith("data: ")) continue;
          const data = JSON.parse(part.slice(6));

          if (data.type === "chunk") {
            if (!started) {
              started = true;
              setLoading(false);
              setStreaming(true);
              setDisplayMessages((prev) => [
                ...prev,
                { role: "assistant", text: data.text, toolLogs: [] },
              ]);
            } else {
              setDisplayMessages((prev) => {
                const msgs = [...prev];
                const last = msgs[msgs.length - 1];
                return [...msgs.slice(0, -1), { ...last, text: last.text + data.text }];
              });
            }
          } else if (data.type === "tool") {
            setDisplayMessages((prev) => {
              const msgs = [...prev];
              const last = msgs[msgs.length - 1];
              const toolLogs = [...(last.toolLogs ?? []), { name: data.name, input: data.input, result: data.result }];
              return [...msgs.slice(0, -1), { ...last, toolLogs }];
            });
          } else if (data.type === "done") {
            setHistory(data.history);
          } else if (data.type === "error") {
            throw new Error(data.error);
          }
        }
      }

      if (!started) {
        setDisplayMessages((prev) => [
          ...prev,
          { role: "assistant", text: "(no response)", toolLogs: [] },
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
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const isEmpty = displayMessages.length === 0 && !loading;
  const canSend = !loading && (!!input.trim() || !!pendingPdf);

  return (
    <div className={`layout ${previewPdf ? "layout-split" : ""}`}>
      {/* ── Chat pane ── */}
      <div className="app">
        <header className="header">
          <div className="header-inner">
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
                    <p className="assistant-text">
                      {msg.text}
                      {streaming && i === displayMessages.length - 1 && <span className="cursor" />}
                    </p>
                  </>
                ) : (
                  <div className="user-bubble">
                    {msg.pdfName && (
                      <div className="pdf-chip pdf-chip-message">
                        <span className="pdf-chip-icon">📄</span>
                        <span className="pdf-chip-name">{msg.pdfName}</span>
                        {msg.pdfUrl && (
                          <button
                            className="pdf-preview-btn"
                            onClick={() => {
                              setCurrentPage(1);
                              setPreviewPdf({ url: msg.pdfUrl!, name: msg.pdfName! });
                            }}
                          >
                            Preview
                          </button>
                        )}
                      </div>
                    )}
                    {msg.text && msg.text !== `Analyze: ${msg.pdfName}` && (
                      <span>{msg.text}</span>
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
          {pendingPdf && (
            <div className="pdf-chip">
              <span className="pdf-chip-icon">📄</span>
              <span className="pdf-chip-name">{pendingPdf.name}</span>
              <button className="pdf-chip-remove" onClick={removePendingPdf} aria-label="Remove">×</button>
            </div>
          )}
          <div className="input-card">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
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
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={pendingPdf ? `Ask about ${pendingPdf.name}...` : "Message MLex..."}
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
        <div className="preview-pane">
          <div className="preview-header">
            <span className="preview-title">📄 {previewPdf.name}</span>
            <div className="preview-nav">
              <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage <= 1}>‹</button>
              <span>{currentPage} / {numPages}</span>
              <button onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))} disabled={currentPage >= numPages}>›</button>
            </div>
            <button className="preview-close" onClick={() => setPreviewPdf(null)} aria-label="Close preview">×</button>
          </div>
          <div className="preview-body">
            <Document
              file={previewPdf.url}
              onLoadSuccess={({ numPages }) => { setNumPages(numPages); setCurrentPage(1); }}
            >
              <Page pageNumber={currentPage} width={460} />
            </Document>
          </div>
        </div>
      )}
    </div>
  );
}

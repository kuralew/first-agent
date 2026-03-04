import { useState, useRef, useEffect } from "react";
import type { DisplayMessage, ChatRequest, ChatResponse } from "./types.ts";

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
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="send-icon"
    >
      <circle cx="12" cy="12" r="12" fill={disabled ? "#D1CBC4" : "#1B3A6B"} />
      <path
        d="M12 17V8M8 12L12 8L16 12"
        stroke="white"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function App() {
  const [displayMessages, setDisplayMessages] = useState<DisplayMessage[]>([]);
  const [history, setHistory] = useState<unknown[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayMessages, loading]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }, [input]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setDisplayMessages((prev) => [...prev, { role: "user", text }]);
    setLoading(true);

    try {
      const body: ChatRequest = { userMessage: text, history };
      const res = await fetch("http://localhost:3001/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error(`Server error: ${res.status}`);

      const data: ChatResponse = await res.json();
      setHistory(data.history);
      setDisplayMessages((prev) => [
        ...prev,
        { role: "assistant", text: data.reply, toolLogs: data.toolLogs },
      ]);
    } catch (err) {
      setDisplayMessages((prev) => [
        ...prev,
        { role: "assistant", text: `Error: ${String(err)}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const isEmpty = displayMessages.length === 0 && !loading;

  return (
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
                  <p className="assistant-text">{msg.text}</p>
                </>
              ) : (
                <div className="user-bubble">{msg.text}</div>
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
        <div className="input-card">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message MLex..."
            rows={1}
            disabled={loading}
          />
          <button
            className="send-btn"
            onClick={send}
            disabled={loading || !input.trim()}
            aria-label="Send"
          >
            <SendIcon disabled={loading || !input.trim()} />
          </button>
        </div>
        <p className="input-hint">Enter to send · Shift+Enter for newline</p>
      </div>
    </div>
  );
}

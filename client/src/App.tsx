import { useState, useRef, useEffect } from "react";
import type { DisplayMessage, ChatRequest, ChatResponse } from "./types.ts";

function ClaudeAvatar() {
  return (
    <div className="avatar">
      <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="20" cy="20" r="20" fill="#CC785C" />
        <path
          d="M20 10 C14 10 10 14.5 10 20 C10 25.5 14 30 20 30 C23 30 25.5 28.8 27.3 26.8 L25.1 24.8 C23.8 26.2 22 27 20 27 C15.6 27 13 23.9 13 20 C13 16.1 15.6 13 20 13 C22 13 23.8 13.8 25.1 15.2 L27.3 13.2 C25.5 11.2 23 10 20 10Z"
          fill="white"
        />
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
      <circle cx="12" cy="12" r="12" fill={disabled ? "#D1CBC4" : "#1A1A1A"} />
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
              <circle cx="12" cy="12" r="12" fill="#CC785C" />
              <path d="M12 6C8.7 6 6 8.7 6 12C6 15.3 8.7 18 12 18C13.8 18 15.3 17.3 16.4 16.1L14.9 14.7C14.1 15.5 13.1 16 12 16C9.8 16 8 14.2 8 12C8 9.8 9.8 8 12 8C13.1 8 14.1 8.5 14.9 9.3L16.4 7.9C15.3 6.7 13.8 6 12 6Z" fill="white"/>
            </svg>
          </span>
          <span className="header-title">Claude</span>
          <span className="header-model">first-agent</span>
        </div>
      </header>

      <div className="messages">
        {isEmpty && (
          <div className="empty-state">
            <div className="empty-logo">
              <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="40" cy="40" r="40" fill="#F0E8E2" />
                <path d="M40 14C26.7 14 16 24.7 16 38C16 51.3 26.7 62 40 62C46.6 62 52.5 59.4 56.8 55.1L52.7 51.2C49.6 54.3 45.4 56.2 40.8 56.2C30.4 56.2 22 47.8 22 37.4C22 27 30.4 18.6 40.8 18.6C45.4 18.6 49.6 20.5 52.7 23.6L56.8 19.7C52.5 15.4 46.6 13 40 13L40 14Z" fill="#CC785C"/>
              </svg>
            </div>
            <h2>How can I help you today?</h2>
          </div>
        )}

        {displayMessages.map((msg, i) => (
          <div key={i} className={`message-row message-row-${msg.role}`}>
            {msg.role === "assistant" && <ClaudeAvatar />}
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
            <ClaudeAvatar />
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
            placeholder="Message Claude..."
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

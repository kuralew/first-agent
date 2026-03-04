import { useState, useRef, useEffect } from "react";
import type { DisplayMessage, ChatRequest, ChatResponse } from "./types.ts";

export default function App() {
  const [displayMessages, setDisplayMessages] = useState<DisplayMessage[]>([]);
  const [history, setHistory] = useState<unknown[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayMessages, loading]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setDisplayMessages((prev) => [...prev, { role: "user", text }]);
    setLoading(true);

    try {
      const body: ChatRequest = { userMessage: text, history };
      const res = await fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new Error(`Server error: ${res.status}`);
      }

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

  return (
    <div className="container">
      <header className="header">
        <h1>First Agent</h1>
      </header>

      <div className="messages">
        {displayMessages.map((msg, i) => (
          <div key={i} className={`message message-${msg.role}`}>
            <div className="bubble">{msg.text}</div>
            {msg.toolLogs && msg.toolLogs.length > 0 && (
              <details className="tool-logs">
                <summary>{msg.toolLogs.length} tool call{msg.toolLogs.length !== 1 ? "s" : ""}</summary>
                {msg.toolLogs.map((log, j) => (
                  <div key={j} className="tool-log">
                    <span className="tool-name">{log.name}</span>
                    <pre className="tool-input">{JSON.stringify(log.input, null, 2)}</pre>
                    <pre className="tool-result">→ {log.result}</pre>
                  </div>
                ))}
              </details>
            )}
          </div>
        ))}
        {loading && (
          <div className="message message-assistant">
            <div className="bubble loading">
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="input-area">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message (Enter to send, Shift+Enter for newline)"
          rows={3}
          disabled={loading}
        />
        <button onClick={send} disabled={loading || !input.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}

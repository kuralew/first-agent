import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { watch } from "chokidar";
import type Anthropic from "@anthropic-ai/sdk";
import { runAgent, runAgentStream } from "./agent.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(
  cors({
    origin: /^http:\/\/localhost:\d+$/,
  })
);

// ── Intake inbox ─────────────────────────────────────────────────────────────

const inboxDir = path.join(__dirname, "../../inbox");
if (!fs.existsSync(inboxDir)) fs.mkdirSync(inboxDir, { recursive: true });

// Serve inbox PDFs so the client can load them for extraction.
app.use("/inbox", express.static(inboxDir));

// SSE client registry — every open /events connection gets intake broadcasts.
const sseClients = new Set<express.Response>();

function broadcast(data: object) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) client.write(msg);
}

// Persistent SSE endpoint — client connects once on mount and listens.
app.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);
  sseClients.add(res);
  req.on("close", () => sseClients.delete(res));
});

// Watch inbox — when a PDF drops, broadcast to all connected clients.
watch(inboxDir, { ignoreInitial: true, awaitWriteFinish: { stabilityThreshold: 1200 } })
  .on("add", (filePath) => {
    if (!filePath.toLowerCase().endsWith(".pdf")) return;
    const filename = path.basename(filePath);
    console.log(`[intake] New document detected: ${filename}`);
    broadcast({ type: "new_document", filename, url: `/inbox/${encodeURIComponent(filename)}` });
  });

app.post("/chat", async (req, res) => {
  const { userMessage, history = [] } = req.body as {
    userMessage: string;
    history: Anthropic.MessageParam[];
  };

  const messages: Anthropic.MessageParam[] = [
    ...history,
    { role: "user", content: userMessage },
  ];

  const toolLogs: Array<{ name: string; input: unknown; result: string }> = [];

  try {
    const reply = await runAgent(messages, (name, input, result) => {
      toolLogs.push({ name, input, result });
    });

    res.json({ reply, history: messages, toolLogs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

app.post("/chat/stream", async (req, res) => {
  const { userMessage, history = [], docText } = req.body as {
    userMessage: string;
    history: Anthropic.MessageParam[];
    // Pre-assembled, labeled, doc-ID-prefixed text for all uploaded documents.
    // Format: "=== Document 1: name.pdf ===\n[d1·p1·l0·bbox:...]..."
    docText?: string;
  };

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const userText = docText
      ? `${userMessage || "Please analyze these documents."}\n\n${docText}`
      : userMessage;

    const messages: Anthropic.MessageParam[] = [
      ...history,
      { role: "user", content: userText },
    ];

    await runAgentStream(
      messages,
      (text) => send({ type: "chunk", text }),
      (name, input, result) => send({ type: "tool", name, input, result })
    );
    send({ type: "done", history: messages });
  } catch (err) {
    console.error(err);
    send({ type: "error", error: String(err) });
  } finally {
    res.end();
  }
});

// Serve built client in production
const clientDist = path.join(__dirname, "../../client/dist");
app.use(express.static(clientDist));
app.get("*", (_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"));
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

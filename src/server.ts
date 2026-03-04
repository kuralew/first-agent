import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type Anthropic from "@anthropic-ai/sdk";
import { runAgent, runAgentStream } from "./agent.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());
app.use(
  cors({
    origin: /^http:\/\/localhost:\d+$/,
  })
);

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

function sanitizeMessages(
  messages: Anthropic.MessageParam[]
): Anthropic.MessageParam[] {
  return messages.map((msg) => {
    if (!Array.isArray(msg.content)) return msg;
    const hasDoc = (msg.content as any[]).some((b) => b.type === "document");
    if (!hasDoc) return msg;
    // Strip document blocks — keep only text, unwrap if single text block
    const textBlocks = (msg.content as any[]).filter((b) => b.type === "text");
    return {
      ...msg,
      content:
        textBlocks.length === 1 ? textBlocks[0].text : textBlocks,
    };
  });
}

app.post("/chat/stream", async (req, res) => {
  const { userMessage, history = [], pdf } = req.body as {
    userMessage: string;
    history: Anthropic.MessageParam[];
    pdf?: { base64: string; name: string };
  };

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  const userContent: unknown = pdf
    ? [
        {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: pdf.base64 },
        },
        { type: "text", text: userMessage || "Please analyze this document." },
      ]
    : userMessage;

  const messages: Anthropic.MessageParam[] = [
    ...history,
    { role: "user", content: userContent as Anthropic.MessageParam["content"] },
  ];

  try {
    await runAgentStream(
      messages,
      (text) => send({ type: "chunk", text }),
      (name, input, result) => send({ type: "tool", name, input, result })
    );
    send({ type: "done", history: sanitizeMessages(messages) });
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

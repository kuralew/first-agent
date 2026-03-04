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

app.post("/chat/stream", async (req, res) => {
  const { userMessage, history = [] } = req.body as {
    userMessage: string;
    history: Anthropic.MessageParam[];
  };

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  const messages: Anthropic.MessageParam[] = [
    ...history,
    { role: "user", content: userMessage },
  ];

  try {
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

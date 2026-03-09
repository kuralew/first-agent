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

// ── Case memory ──────────────────────────────────────────────────────────────

const memoriesDir = path.join(__dirname, "../../memories");
if (!fs.existsSync(memoriesDir)) fs.mkdirSync(memoriesDir, { recursive: true });

interface CaseMemory {
  caseId: string;
  caseName: string;
  documentType: string;
  parties: Array<{ role: string; name: string }>;
  keyRisks: string[];
  overallRiskLevel?: string;
  draftType?: string;
  feedbackPatterns: string[];
  createdAt: string;
  updatedAt: string;
}

function loadRecentMemories(limit = 8): CaseMemory[] {
  try {
    return fs.readdirSync(memoriesDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        try { return JSON.parse(fs.readFileSync(path.join(memoriesDir, f), "utf-8")) as CaseMemory; }
        catch { return null; }
      })
      .filter(Boolean) as CaseMemory[]
      ;
  } catch { return []; }
}

function formatMemoriesForPrompt(memories: CaseMemory[]): string {
  if (memories.length === 0) return "";
  const sorted = [...memories].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  ).slice(0, 8);

  const lines = sorted.map((m, i) => {
    const date = new Date(m.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const parties = m.parties.slice(0, 3).map((p) => `${p.name} (${p.role})`).join(", ");
    const risks = m.keyRisks.slice(0, 4).join("; ");
    const feedback = m.feedbackPatterns.length
      ? `\n   Attorney feedback: ${m.feedbackPatterns.map((f) => `"${f}"`).join(" · ")}`
      : "";
    return [
      `Case ${i + 1} — "${m.caseName}" (${m.documentType}) · ${date}`,
      parties ? `   Parties: ${parties}` : null,
      risks ? `   Key risks: ${risks}${m.overallRiskLevel ? ` [OVERALL: ${m.overallRiskLevel}]` : ""}` : null,
      m.draftType ? `   Draft produced: ${m.draftType}` : null,
      feedback,
    ].filter(Boolean).join("\n");
  });

  return [
    "─────────────────────────────────────────────────",
    "FIRM MEMORY — PAST CASE PATTERNS",
    "─────────────────────────────────────────────────",
    "Use the following past case summaries as supplemental context when relevant.",
    "Do NOT fabricate current-document facts from past cases.",
    "Do NOT use [d·p·l] citation tags for past case references — they are patterns only.",
    "",
    ...lines,
    "─────────────────────────────────────────────────",
  ].join("\n");
}

// Save or update a case memory.
app.post("/memories", (req, res) => {
  const mem = req.body as Partial<CaseMemory>;
  if (!mem.caseId) return res.status(400).json({ error: "caseId required" });
  const id = mem.caseId.replace(/[^a-zA-Z0-9_-]/g, "");
  const file = path.join(memoriesDir, `${id}.json`);
  try {
    const existing: CaseMemory | null = fs.existsSync(file)
      ? JSON.parse(fs.readFileSync(file, "utf-8"))
      : null;
    const updated: CaseMemory = {
      caseId: id,
      caseName: mem.caseName ?? existing?.caseName ?? "Untitled",
      documentType: mem.documentType ?? existing?.documentType ?? "Unknown",
      parties: mem.parties ?? existing?.parties ?? [],
      keyRisks: mem.keyRisks ?? existing?.keyRisks ?? [],
      overallRiskLevel: mem.overallRiskLevel ?? existing?.overallRiskLevel,
      draftType: mem.draftType ?? existing?.draftType,
      feedbackPatterns: mem.feedbackPatterns ?? existing?.feedbackPatterns ?? [],
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(file, JSON.stringify(updated, null, 2));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Case storage ─────────────────────────────────────────────────────────────

const casesDir = path.join(__dirname, "../../cases");
if (!fs.existsSync(casesDir)) fs.mkdirSync(casesDir, { recursive: true });

function sanitizeCaseId(id: string) {
  return id.replace(/[^a-zA-Z0-9_-]/g, "");
}

app.get("/cases", (_req, res) => {
  try {
    const files = fs.readdirSync(casesDir).filter((f) => f.endsWith(".json"));
    const cases = files
      .map((f) => {
        try {
          const raw = JSON.parse(fs.readFileSync(path.join(casesDir, f), "utf-8"));
          return { id: raw.id, name: raw.name, createdAt: raw.createdAt, updatedAt: raw.updatedAt };
        } catch { return null; }
      })
      .filter(Boolean)
      .sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    res.json(cases);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/cases/:id", (req, res) => {
  const file = path.join(casesDir, `${sanitizeCaseId(req.params.id)}.json`);
  if (!fs.existsSync(file)) return res.status(404).json({ error: "Not found" });
  try {
    res.json(JSON.parse(fs.readFileSync(file, "utf-8")));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/cases/:id", (req, res) => {
  const id = sanitizeCaseId(req.params.id);
  const file = path.join(casesDir, `${id}.json`);
  try {
    const existing = fs.existsSync(file)
      ? JSON.parse(fs.readFileSync(file, "utf-8"))
      : null;
    const data = {
      id,
      name: req.body.name ?? "Untitled Case",
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      history: req.body.history ?? [],
      displayMessages: req.body.displayMessages ?? [],
    };
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.delete("/cases/:id", (req, res) => {
  const id = sanitizeCaseId(req.params.id);
  const file = path.join(casesDir, `${id}.json`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  // Also remove uploaded docs folder if present.
  const docsDir = path.join(casesDir, id, "docs");
  if (fs.existsSync(docsDir)) fs.rmSync(docsDir, { recursive: true, force: true });
  res.json({ ok: true });
});

// Upload a PDF for a case — stored at ./cases/{id}/docs/{filename}.
app.post(
  "/cases/:id/docs",
  express.raw({ type: "application/pdf", limit: "100mb" }),
  (req, res) => {
    const id = sanitizeCaseId(req.params.id);
    const filename = path.basename((req.headers["x-filename"] as string) || "document.pdf");
    const docsDir = path.join(casesDir, id, "docs");
    if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });
    fs.writeFileSync(path.join(docsDir, filename), req.body as Buffer);
    res.json({ url: `/cases/${id}/docs/${encodeURIComponent(filename)}` });
  }
);

// Serve uploaded PDFs.
app.get("/cases/:id/docs/:filename", (req, res) => {
  const id = sanitizeCaseId(req.params.id);
  const filename = path.basename(req.params.filename);
  const file = path.join(casesDir, id, "docs", filename);
  if (!fs.existsSync(file)) return res.status(404).send("Not found");
  res.sendFile(file);
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

    const recentMemories = loadRecentMemories();
    const memoryContext = formatMemoriesForPrompt(recentMemories);

    await runAgentStream(
      messages,
      (text) => send({ type: "chunk", text }),
      (name, input, result) => send({ type: "tool", name, input, result }),
      (question, reason, canProceed) => send({ type: "clarification", question, reason, canProceed }),
      memoryContext || undefined
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

# MLex — Claude Code Instructions

## Project
MLex is an AI legal assistant for McDermott Will & Schulte. It analyzes legal documents (PDFs), extracts facts, drafts responses, flags risks, researches legal precedents, and learns from attorney feedback across cases.

## Stack
- **Backend**: Node.js + Express + TypeScript (`src/`)
- **Frontend**: React + Vite + TypeScript (`client/src/`)
- **AI**: Anthropic Claude Sonnet 4.6 via `@anthropic-ai/sdk`
- **PDF extraction**: pdfjs-dist (client-side, with bbox coordinates)
- **PDF viewer**: react-pdf-highlighter
- **PDF generation**: @react-pdf/renderer (lazy-loaded)
- **Legal search**: Tavily API (`TAVILY_API_KEY`)

## Commands
```bash
npm run server        # Start backend (tsx watch, port 3001)
npm run client        # Start frontend (Vite dev, port 5173)
npm run build:client  # Build frontend to client/dist/
```

## Key Directories
```
first-agent/
├── src/
│   ├── agent.ts          # System prompt + agentic loop (runAgentStream, runAgent)
│   ├── orchestrator.ts   # Multi-agent pipeline (Router → Analyst + Researcher → Drafter → Quality)
│   ├── tools.ts          # Tool definitions + executeTool (8 tools)
│   ├── server.ts         # Express API + memory injection + SSE streaming
│   ├── config.ts         # Constants (PORT, MODEL, MAX_DOC_CHARS, etc.)
│   ├── adapters/
│   │   └── search.ts     # Tavily legal search adapter
│   └── index.ts          # CLI entry point
├── client/src/
│   ├── App.tsx           # Main React app (all UI, SSE handlers, state)
│   ├── App.css           # All styles
│   ├── types.ts          # Shared TypeScript interfaces
│   ├── hooks/
│   │   └── useStreamProcessor.ts  # Shared SSE stream handler
│   ├── utils/
│   │   └── citations.ts  # Citation parsing utilities
│   └── adapters/
│       ├── pdfExtract.ts # Client-side PDF text + bbox extraction
│       ├── pdfViewer.tsx # react-pdf-highlighter wrapper
│       └── pdfReport.tsx # PDF report generator (lazy-loaded)
├── inbox/            # Drop PDFs here for auto-intake (watched by chokidar)
├── cases/            # Saved case JSON files + uploaded PDFs
└── memories/         # Per-case memory JSON files (cross-case learning)
```

## Architecture

### Multi-Agent Pipeline (`src/orchestrator.ts`)
Document analysis runs through a dedicated orchestrator, not the single agent:

```
Router ──► Analyst ──────────────────────────────► Drafter ──► Quality
               │                                        ▲           │
               └──► Researcher (if needed) ─────────────┘    retry loop
                    [runs in parallel with Analyst]           (up to 3x)
```

| Agent | Purpose |
|---|---|
| **Router** | Classifies document type, decides whether Researcher adds value, optionally asks one HITL clarification question |
| **Analyst** | Extracts facts + flags risks (runs `extract_key_facts` then `flag_risks`) |
| **Researcher** | Runs Tavily legal search, saves findings via `save_legal_context`. Skipped for simple NDAs/contracts |
| **Drafter** | Produces a complete professional draft document based on Analyst + Researcher output |
| **Quality** | Reviews all output, scores each dimension, retries Drafter if gaps found (max 3 attempts) |

Non-document requests (follow-up chat) bypass the orchestrator and go to `runAgentStream` directly.

### Backend API (`src/server.ts`)
| Endpoint | Purpose |
|---|---|
| `GET /events` | SSE stream for intake notifications |
| `POST /chat/stream` | Main chat endpoint — streams agent events (chunk, tool, agent_start, hitl_pause, done) |
| `POST /chat` | Non-streaming fallback |
| `GET/POST/DELETE /cases/:id` | Case CRUD |
| `POST /cases/:id/docs` | Upload PDF for a case |
| `GET /cases/:id/docs/:filename` | Serve uploaded PDF |
| `POST /memories` | Upsert case memory |
| `GET /inbox/*` | Serve inbox PDFs |

Request body for `/chat/stream`:
```ts
{
  userMessage: string;
  history: MessageParam[];
  docText?: string;           // pre-extracted PDF text with bbox tags
  humanInTheLoop?: boolean;   // enables HITL clarification before analysis
  clarificationAnswer?: string; // user's answer to HITL question
  existingRouting?: RoutingDecision; // skip Router re-run on HITL follow-up
}
```

### SSE Event Types
| Event | Payload |
|---|---|
| `agent_start` | `{ agentId, label }` — new agent bubble |
| `chunk` | `{ agentId, text }` — streaming text |
| `tool` | `{ agentId, name, input, result }` — tool call |
| `clarification` | `{ agentId, question, reason, canProceed }` — mid-pipeline clarification |
| `hitl_pause` | `{ question, reason }` — HITL pause before pipeline |
| `done` | `{ history, awaitingClarification?, routingDecision? }` |
| `error` | `{ error }` |

### Tools (`src/tools.ts`)
| Tool | Agent | Purpose |
|---|---|---|
| `route_document` | Router | Classify doc + decide pipeline. Optional `clarification_question` when HITL on |
| `extract_key_facts` | Analyst | Parties, facts, dates, amounts with citations |
| `flag_risks` | Analyst | Legal risks with severity + citations |
| `search_legal` | Researcher | Tavily search (max 2 queries, 3 results each) |
| `save_legal_context` | Researcher | Persist synthesized research findings |
| `draft_document` | Drafter | Full professional draft document |
| `assess_quality` | Quality | Self-review gate — scores all dimensions |
| `request_clarification` | Any | Pause and ask user for missing info |

### Frontend (`client/src/App.tsx`)
- SSE stream handled by `useStreamProcessor` hook (shared across all send handlers)
- Per-agent bubbles: each agent gets a labeled, collapsible bubble
- Agent labels are clickable toggles (chevron) to collapse/expand content
- Settings panel (gear icon in header): **Human-in-the-loop** toggle (localStorage)
- HITL reply card appears above input when pipeline is paused
- Cards rendered per message: `RoutingCard`, `FactsCard`, `DraftCard`, `RisksCard`, `LegalContextCard`, `QualityCard`, `ClarificationCard`
- Auto-saves case + memory when streaming ends

### Memory System
- One JSON file per case in `memories/`
- Schema: `{ caseId, caseName, documentType, parties[], keyRisks[], overallRiskLevel, draftType, feedbackPatterns[] }`
- Last 8 memories injected into system prompt on every `/chat/stream` request
- Memory updated when draft is rejected with attorney feedback

### Citation System
- PDF text extracted client-side with line-level bbox coordinates
- Each line tagged: `[d{docId}·p{page}·l{line}·bbox:{x1},{y1},{x2},{y2}]`
- Claude embeds tags in responses; client strips and renders as clickable citation buttons
- Clicking a citation opens the PDF viewer and highlights the source line

## Conventions
- Always branch off `main` for new features: `git checkout -b feature/<name>`
- Always open a PR — never push directly to `main`
- Merge only when user says to merge
- Commit message format: `feat:`, `fix:`, `chore:` with Co-Authored-By footer
- Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>

## Environment Variables (`.env`)
```
ANTHROPIC_API_KEY=...
TAVILY_API_KEY=...    # For search_legal tool (free tier — use sparingly, max 2 queries/request)
```

## Rate Limits
Org limit: 30,000 input tokens/minute on claude-sonnet-4-6.
Mitigations: doc text capped at `MAX_DOC_CHARS`, history trimmed to `MAX_HISTORY` messages, 2s delay between tool iterations.

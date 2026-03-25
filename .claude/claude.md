# MLex — Claude Code Instructions

## Project
MLex is an AI legal assistant for McDermott Will & Schulte. It analyzes legal documents (PDFs), extracts facts, drafts responses, flags risks, researches precedents, and learns from attorney feedback across cases.

## Stack
- **Backend**: Node.js + Express + TypeScript (`src/`)
- **Frontend**: React + Vite + TypeScript (`client/src/`)
- **AI**: Anthropic Claude Sonnet 4.6 via `@anthropic-ai/sdk`
- **PDF extraction**: pdfjs-dist (client-side, with bbox coordinates)
- **PDF viewer**: react-pdf-highlighter
- **PDF generation**: @react-pdf/renderer (lazy-loaded)

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
│   ├── agent.ts      # System prompt + agentic loop (runAgentStream, runAgent)
│   ├── tools.ts      # Tool definitions + executeTool (7 tools)
│   ├── server.ts     # Express API + memory injection + SSE streaming
│   └── index.ts      # CLI entry point
├── client/src/
│   ├── App.tsx       # Main React app (all UI, SSE handlers, state)
│   ├── App.css       # All styles
│   ├── types.ts      # Shared TypeScript interfaces
│   ├── ReportPdf.tsx # PDF report generator (lazy-loaded)
│   └── pdfExtract.ts # Client-side PDF text + bbox extraction
├── inbox/            # Drop PDFs here for auto-intake (watched by chokidar)
├── cases/            # Saved case JSON files + uploaded PDFs
└── memories/         # Per-case memory JSON files (cross-case learning)
```

## Architecture

### Backend API (`src/server.ts`)
| Endpoint | Purpose |
|---|---|
| `GET /events` | SSE stream for intake notifications |
| `POST /chat/stream` | Main chat endpoint — streams chunks, tool events, clarifications |
| `POST /chat` | Non-streaming fallback |
| `GET/POST/DELETE /cases/:id` | Case CRUD |
| `POST /cases/:id/docs` | Upload PDF for a case |
| `GET /cases/:id/docs/:filename` | Serve uploaded PDF |
| `POST /memories` | Upsert case memory |
| `GET /inbox/*` | Serve inbox PDFs |

### Agent Loop (`src/agent.ts`)
- `runAgentStream` — streaming agentic loop with tool execution
- Injects `memoryContext` (past case patterns) into system prompt on every call
- Emits SSE events: `chunk`, `tool`, `clarification`, `done`, `error`
- 2-second delay between tool iterations (rate limit mitigation)
- History trimmed to last 12 messages server-side

### Tools (`src/tools.ts`)
| Tool | Purpose |
|---|---|
| `extract_key_facts` | Parties, facts, dates, amounts from document |
| `draft_document` | Full professional draft (response, memo, plan) |
| `flag_risks` | Legal risks with severity + citations |
| `search_legal` | Brave Search for precedents/statutes |
| `save_legal_context` | Persist synthesized research findings |
| `assess_quality` | Self-review quality gate — re-runs deficient tools |
| `request_clarification` | Pause agent and ask user for missing info |

**Rule**: When a document is present, always run the full chain:
`extract_key_facts → draft_document → flag_risks → search_legal → save_legal_context → assess_quality`

### Frontend (`client/src/App.tsx`)
- 4 SSE streaming handlers: `send()`, `intakeAnalyze()`, `rejectDraft()`, `answerClarification()`
- Tool events create the assistant message immediately (before chunks arrive)
- Cards rendered per message: `FactsCard`, `DraftCard`, `RisksCard`, `LegalContextCard`, `ClarificationCard`
- Auto-saves case + memory when streaming ends
- Feedback patterns saved to memory on draft rejection

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
BRAVE_API_KEY=...     # For search_legal tool
```

## Rate Limits
Org limit: 30,000 input tokens/minute on claude-sonnet-4-6.
Mitigations in place: doc text capped at 16k chars, history trimmed to 12 messages, 2s delay between tool iterations.

## Code Quality & Security System

This repo uses a three-layer security and code quality system.

### Layer 1 — Claude Code (pre-commit)
Before every commit, two reviews must run:
- /code-review — checks code quality and team standards
- /security-review — checks for security vulnerabilities (OWASP)

Both are enforced automatically via hooks. If either finds issues, use 
/remediation to fix them.

### Standards
- Team coding standards are in .claude/skills/team-standards/SKILL.md
- Fix instructions are in .claude/skills/remediation/remediation-logic.md

### Layer 2 — Git Hooks
GitLeaks runs on every commit to detect secrets. If it blocks a commit,
use /remediation with the finding to fix it.

### Layer 3 — CI/CD Pipeline
SonarQube, Dependabot, and GitLeaks run on every PR. Findings route
back to /remediation for fixes.
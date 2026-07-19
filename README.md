# Agent Platform

> **M.Tech AIML Dissertation — BITS Pilani WILP**
> Student: Abhay Jain (2024AA05171)

A **config-file-driven, composable AI Agent Platform** that lets teams define, deploy, and chain AI agents purely through YAML configuration — no custom code required. Agents handle tickets, retrieve knowledge, call external tools via MCP, escalate to each other, and expose a real-time WebSocket API that the bundled Ticket Tracker UI consumes live.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Packages](#packages)
  - [core](#agentplatformcore)
  - [cli](#agentplatformcli)
  - [agent-builder](#agent-builder-ui)
  - [ui (Ticket Tracker)](#ui-ticket-tracker)
- [Agent Configuration (`agent.yaml`)](#agent-configuration-agentyaml)
- [Getting Started](#getting-started)
- [CLI Reference](#cli-reference)
- [API Reference](#api-reference)
- [WebSocket Protocol](#websocket-protocol)
- [Knowledge Sources](#knowledge-sources)
- [Skills](#skills)
- [MCP Tools](#mcp-tools)
- [Routing & Escalation](#routing--escalation)
- [LLM Providers](#llm-providers)
- [Development](#development)
- [Tech Stack](#tech-stack)

---

## Overview

Most AI agent frameworks require writing code. This platform takes a different approach: **everything is configuration**.

```
agent.yaml  ──►  agent-platform start  ──►  Running agent
                                              │
                                  REST + WebSocket API
                                              │
                               Ticket Tracker UI (live chain)
```

Key capabilities:

| Capability | How |
|---|---|
| Multi-provider LLM | Anthropic, OpenAI, Azure OpenAI, Ollama — swap with one config line |
| Retrieval-Augmented Generation | Markdown docs, log folders, Knowledge Graph (GraphRAG) |
| MCP tool integration | Any MCP server (Confluence, GitLab, PagerDuty, etc.) via SSE transport |
| Multi-agent chaining | Agents escalate tickets to each other by ID |
| Real-time UI | WebSocket events drive a live ticket lifecycle visualiser |
| Visual config builder | Drag-and-drop agent builder UI generates the YAML |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Agent Platform                           │
│                                                                 │
│  ┌──────────────┐     ┌──────────────┐     ┌────────────────┐  │
│  │ Agent Builder│     │  Ticket      │     │   CLI          │  │
│  │ UI           │     │  Tracker UI  │     │  agent-platform│  │
│  │ (port 3001)  │     │  (port 3000) │     │                │  │
│  └──────┬───────┘     └──────┬───────┘     └───────┬────────┘  │
│         │ generates           │ REST + WS            │ start     │
│         ▼                    │                      ▼           │
│      agent.yaml ─────────────┼──────► AgentManager             │
│                              │         ├── ConfigValidator       │
│                              │         ├── LLMProvider           │
│                              │         │   (Anthropic/OpenAI/…) │
│                              │         ├── RAGPipeline           │
│                              │         │   ├── MarkdownProcessor │
│                              │         │   ├── FolderProcessor   │
│                              │         │   └── GraphProcessor    │
│                              │         ├── SkillExecutor         │
│                              │         ├── MCPClient(s)          │
│                              │         ├── AgentRouter           │
│                              │         ├── Store (JSON persist)  │
│                              └─────────┤ AgentServer             │
│                                        │   ├── HTTP REST API     │
│                                        │   └── WebSocket         │
└────────────────────────────────────────┴────────────────────────┘
```

### Ticket Flow

```
User submits ticket
        │
        ▼
POST /api/tickets ──► AgentManager.createTicket()
        │
        ├── Stores ticket, emits  ticket.created  WS event
        │
        ├── Runs on_ticket skills:
        │       ├── RAG: query knowledge sources
        │       ├── emit  agent.kb_lookup_complete  WS event
        │       ├── LLM: render prompt template + call model
        │       └── emit  agent.skill_complete  WS event
        │
        ├── Router evaluates:
        │       ├── ESCALATE → emit ticket.escalated, hand off to next agent
        │       └── RESOLVE  → emit ticket.resolved
        │
        └── Escalation timer (escalate_after_minutes)
```

---

## Project Structure

```
agent-platform/
├── packages/
│   ├── core/                    # Runtime library
│   │   └── src/
│   │       ├── agent/           # AgentManager (main orchestrator)
│   │       ├── config/          # YAML validator + Zod schemas
│   │       ├── knowledge/       # Markdown, Folder, Graph processors
│   │       ├── llm/             # LLM adapters (Anthropic, OpenAI, Azure, Ollama)
│   │       ├── mcp/             # MCP client (SSE transport)
│   │       ├── rag/             # RAG pipeline (cosine similarity, graph search)
│   │       ├── router/          # Escalation router
│   │       ├── server/          # HTTP REST + WebSocket server
│   │       ├── skills/          # Skill executor (template rendering)
│   │       ├── store/           # Ticket store (in-memory + JSON persistence)
│   │       ├── utils/           # Cosine similarity
│   │       └── types.ts         # Shared domain types
│   │
│   ├── cli/                     # agent-platform CLI
│   │   └── src/
│   │       ├── commands/        # validate, start, chat, init
│   │       └── index.ts         # Commander entry point
│   │
│   ├── agent-builder/           # Visual agent config UI (port 3001)
│   │   └── src/
│   │       ├── sections/        # Form sections (LLM, Knowledge, Skills, MCP, Routing)
│   │       ├── store/           # Zustand form state
│   │       ├── lib/             # YAML ↔ form conversion, validation, presets
│   │       └── App.tsx          # Split-panel layout
│   │
│   └── ui/                      # Ticket Tracker UI (port 3000)
│       └── src/
│           ├── components/      # Chain visualiser, EventNode, CommentThread
│           ├── pages/           # TicketList, TicketDetail
│           ├── store/           # Zustand (live WS state)
│           ├── hooks/           # useTicketSocket (WS + exponential backoff)
│           └── types/           # TicketWSEvent, ChainNode, etc.
│
├── tsconfig.json                # Root: strict, Node16, exactOptionalPropertyTypes
└── pnpm-workspace.yaml
```

---

## Packages

### `@agent-platform/core`

The runtime engine. All other packages depend on this.

**Key exports:**

```typescript
import {
  AgentManager,      // Main orchestrator — start(configPath), createTicket()
  AgentServer,       // HTTP + WebSocket server
  RAGPipeline,       // Multi-source retrieval
  SkillExecutor,     // Template rendering + LLM call
  MCPClient,         // MCP server connection
  Store,             // Ticket persistence
  AgentRouter,       // Escalation logic
  ConfigValidator,   // YAML schema validation
  createLLMProvider, // Factory: AnthropicAdapter | OpenAIAdapter | AzureOpenAIAdapter | OllamaAdapter
} from '@agent-platform/core';
```

**Use programmatically:**

```typescript
import { AgentManager } from '@agent-platform/core';

const manager = new AgentManager();
await manager.start('./agent.yaml');

// Create a ticket programmatically
const ticket = await manager.createTicket({
  title: 'Order execution failed — TKT-0047',
  description: 'FIX session dropped at 14:32 UTC. Order queue is stuck.',
  priority: 'P1',
  raised_by: 'trader-desk-1',
});

// Listen to events
manager.on('ticket.resolved', ({ ticket_id }) => {
  console.log(`Ticket ${ticket_id} resolved`);
});

manager.on('ws', (event) => {
  // Every WebSocket event emitted to connected clients
  console.log(event.type, event.payload);
});
```

---

### `@agent-platform/cli`

```
npm install -g @agent-platform/cli   # (after publishing)
# or: pnpm --filter @agent-platform/cli build && node packages/cli/dist/index.js
```

See [CLI Reference](#cli-reference) below.

---

### Agent Builder UI

A standalone React + Vite app on **port 3001**. No backend required — runs entirely in the browser.

```bash
cd packages/agent-builder
pnpm dev         # http://localhost:3001
pnpm build       # production build
```

**Features:**
- Six-section form: Agent Info → LLM → Knowledge → Skills → MCP Tools → Routing
- Live YAML preview that updates as you type, with syntax highlighting
- Real-time validation (required fields, env var refs, Azure/Ollama specific checks)
- Paste-to-import: paste an existing `agent.yaml`, the form populates automatically
- Four built-in presets: Trader Support, Production Support, Dev Agent (OpenAI), Local Ollama
- Copy to clipboard / download as `<agent-name>.yaml`
- LocalStorage persistence — work survives page refresh

---

### UI (Ticket Tracker)

A React + Vite app on **port 3000** that visualises the full ticket lifecycle as a multi-agent chain.

```bash
cd packages/ui
VITE_USE_MOCK=true pnpm dev          # mock data (default)
VITE_API_URL=http://localhost:8001 VITE_USE_MOCK=false pnpm dev  # live agent
```

**Features:**
- Dynamic chain visualisation — N-column CSS Grid, one column per agent participant
- Role-aware views (`?role=trader|support|dev|full`) — each role sees different detail levels
- Live WebSocket updates — new nodes appear as the agent processes the ticket
- Expandable event nodes with per-type detail panels (KB lookup, L1/L2 analysis, resolution)
- Comment thread with agent vs. human distinction
- Ticket list with filter/sort, CSV export, 30 s auto-refetch
- Share link button (copies URL with current role)

---

## Agent Configuration (`agent.yaml`)

A complete example:

```yaml
agent:
  name: trader-support          # lowercase, hyphens only — used as agent ID
  display_name: Trader Support Agent
  description: L1 trading-desk support — handles order, position and market queries
  version: 1.0.0
  icon: 📈

llm:
  provider: anthropic           # anthropic | openai | azure | ollama
  model: claude-sonnet-4-6
  api_key: ${ANTHROPIC_API_KEY} # always use env var refs, never hardcode
  temperature: 0.1
  max_tokens: 4096
  system_prompt: |
    You are a Production Support AI agent specialised in trading-desk incident triage.
    Always verify facts from the KB before answering. Escalate if unsure.

knowledge:
  embedding_model: text-embedding-3-small
  vector_store: local           # local | chroma | qdrant
  vector_store_path: ./data/vectors/trader-support/
  sources:
    - id: runbooks
      type: markdown
      path: ./kb/runbooks/
      glob: '**/*.md'
      refresh: on_change        # on_change | hourly | daily | manual
      metadata:
        category: runbook
        priority: high

    - id: platform_logs
      type: folder
      path: /var/log/platform/
      watch: true
      index_strategy: tail      # full | tail | incremental
      tail_lines: 10000
      refresh: live
      filters:
        include: ['*.log', '*.err']
        exclude: ['*.gz']

    - id: platform_kg
      type: knowledge_graph
      path: ./kg/platform_kg.json
      format: graphrag
      traversal_depth: 3
      refresh: daily

skills:
  - id: l1_analysis
    name: L1 Incident Analysis
    description: Generate a structured L1 triage report
    trigger: on_ticket          # on_ticket | on_escalation | on_message | explicit
    prompt_template: ./prompts/l1_analysis.md
    inputs:
      - name: title
        type: string
        required: true
      - name: description
        type: string
        required: true
    output:
      format: structured        # plain | markdown | structured
      schema: ./schemas/l1_report.json

mcps:
  - id: confluence
    name: Confluence
    url: ${CONFLUENCE_MCP_URL}
    auth_type: bearer           # bearer | basic | none
    auth_token: ${CONFLUENCE_TOKEN}
    enabled: true
    tools:                      # leave empty to allow all tools
      - search_pages
      - get_page_content

routing:
  escalate_to: prod-support     # agent ID to hand off unresolved tickets
  escalate_after_minutes: 15    # auto-escalate if not resolved within this time
  escalate_on_skill: l1_analysis  # escalate when this skill outputs ESCALATE
  accepts_from:                 # only accept tickets from these agent IDs
    - ticket-ingestion
  ticket_system:
    type: jira                  # internal | jira | servicenow

interface:
  mode: both                    # chat | api | both
  api_port: 8001
  session_timeout_minutes: 60
```

### Prompt Template Format

Prompt templates are Markdown files with `{{variable}}` placeholders:

```markdown
# L1 Incident Analysis

**Ticket:** {{title}}
**Description:** {{description}}

You have access to the retrieved knowledge above. Based on this context:

1. Identify the failure component
2. Match against known failure modes
3. List recommended remediation steps
4. State your decision: RESOLVE or ESCALATE

Respond in valid JSON matching the output schema.
```

### Knowledge Graph Format (GraphRAG)

```json
{
  "entities": [
    { "id": "svc-fix", "type": "service", "label": "FIX Gateway", "properties": { "team": "trading-infra", "port": 4001 } },
    { "id": "svc-oms", "type": "service", "label": "Order Management System", "properties": { "team": "trading-core" } }
  ],
  "relationships": [
    { "from": "svc-oms", "to": "svc-fix", "type": "DEPENDS_ON", "properties": { "protocol": "FIX 4.4" } }
  ]
}
```

---

## Getting Started

### Prerequisites

- Node.js ≥ 20
- pnpm ≥ 8 (`npm install -g pnpm`)

### Install

```bash
git clone <repo-url>
cd agent-platform
pnpm install
```

### Build core and CLI

```bash
pnpm --filter @agent-platform/core build
pnpm --filter @agent-platform/cli build
```

### Scaffold your first agent

```bash
node packages/cli/dist/index.js init my-agent
cd my-agent
cp .env.example .env
# Edit .env and set ANTHROPIC_API_KEY=sk-...
```

### Validate the config

```bash
node ../packages/cli/dist/index.js validate agent.yaml
```

### Start the agent

```bash
node ../packages/cli/dist/index.js start agent.yaml
# Agent running on http://localhost:8001
```

### Or use interactive chat mode

```bash
node ../packages/cli/dist/index.js chat agent.yaml
# Agent ready. Type a message to create a ticket.
You: FIX session dropped, order queue is stuck
  [thinking] Running l1_analysis…
  [KB] Found 3 relevant chunks
  ✓ Skill "l1_analysis" done in 4823ms
```

### Start the Ticket Tracker UI

```bash
cd packages/ui
VITE_API_URL=http://localhost:8001 VITE_USE_MOCK=false pnpm dev
# http://localhost:3000
```

### Start the Agent Builder UI

```bash
cd packages/agent-builder
pnpm dev
# http://localhost:3001
```

---

## CLI Reference

```
Usage: agent-platform [command] [options]

Commands:
  init <name>       Scaffold a new agent project directory
  validate <config> Validate an agent.yaml configuration file
  start <config>    Start an agent (HTTP REST + WebSocket API)
  chat <config>     Start an agent with interactive terminal chat
  help              Display help
```

### `agent-platform init <name>`

Creates a new directory with:

```
<name>/
├── agent.yaml               # Pre-filled agent config
├── prompts/
│   └── l1_analysis.md       # Starter prompt template
├── kb/                      # Knowledge base directory
│   └── README.md
├── data/vectors/            # Vector store directory
└── .env.example             # Environment variable template
```

### `agent-platform validate <config>`

Checks:
- YAML parse validity
- Zod schema conformance (all required fields, valid enums)
- Environment variable presence (`${VAR}` refs must be set)
- Prompt template file existence
- JSON schema file existence (for structured skills)
- Azure/Ollama specific required fields
- MCP auth token presence when auth_type ≠ none
- Routing consistency (escalate_to matches known agents)

Exits `0` on success, `1` on failure.

### `agent-platform start <config>`

Starts the agent as a persistent process:
- Indexes all knowledge sources (embedding + vector store)
- Connects to all enabled MCP servers
- Starts HTTP + WebSocket server on `interface.api_port` (default 8001)
- Handles `SIGINT` / `SIGTERM` for graceful shutdown

### `agent-platform chat <config>`

Same as `start` but also opens an interactive REPL. Each message you type creates a new ticket and streams events to the terminal as they happen.

---

## API Reference

Base URL: `http://localhost:<interface.api_port>` (default 8001)

All endpoints return JSON. CORS is enabled for all origins.

### `GET /api/health`

```json
{
  "status": "ok",
  "agent_id": "trader-support",
  "agent_name": "Trader Support Agent",
  "uptime_seconds": 3421
}
```

### `GET /api/tickets`

Query params: `status` (open|kb_lookup|l1|l2|resolved), `priority` (P1–P4)

```json
{
  "tickets": [
    {
      "id": "TKT-1716998234123",
      "title": "FIX session dropped",
      "status": "l1",
      "priority": "P1",
      "raised_by": "trader-desk-1",
      "assigned_agent": "trader-support",
      "current_owner": "trader-support",
      "created_at": "2026-05-16T14:30:34.123Z",
      "updated_at": "2026-05-16T14:30:41.456Z"
    }
  ],
  "total": 1
}
```

### `GET /api/tickets/:id`

Returns the full ticket detail including the chain (for the Ticket Tracker UI) and all comments.

```json
{
  "ticket": { "...": "TicketSummary" },
  "chain": {
    "participants": [
      { "id": "raiser-TKT-...", "label": "trader-desk-1", "type": "raiser" },
      { "id": "trader-support", "label": "Trader Support Agent", "type": "agent" }
    ],
    "rows": [
      { "kind": "node", "node": { "id": "...", "type": "ticket_raised", "summary": "FIX session dropped", "..." } },
      { "kind": "handoff", "handoff": { "from_participant": "raiser-...", "to_participant": "trader-support", "label": "Assigned to", "..." } },
      { "kind": "node", "node": { "type": "kb_lookup", "..." } },
      { "kind": "node", "node": { "type": "l1_analysis", "is_current": true, "..." } }
    ]
  },
  "comments": []
}
```

### `POST /api/tickets`

Create a new ticket (triggers `on_ticket` skills automatically):

```json
// Request
{
  "title": "FIX session dropped — order queue stuck",
  "description": "FIX session on port 4001 dropped at 14:32 UTC. All pending orders are queued.",
  "priority": "P1",
  "raised_by": "trader-desk-1"
}

// Response 202
{ "received": true, "message": "Ticket queued for processing" }
```

### `POST /api/tickets/:id/message`

Send a message to an active ticket (triggers `on_message` skills):

```json
// Request
{ "content": "The issue is on the primary FIX gateway only", "author": "trader-desk-1" }

// Response 202
{ "received": true }
```

### `POST /api/skills/:id/run`

Explicitly trigger a skill (for `trigger: explicit` skills):

```json
// Request body = skill inputs
{ "ticket_id": "TKT-...", "title": "...", "description": "..." }

// Response 202
{ "received": true, "skill_id": "l1_analysis" }
```

---

## WebSocket Protocol

Connect to `ws://localhost:<port>/ws`

### Subscribe to a ticket

```json
{ "action": "subscribe", "ticket_id": "TKT-1716998234123" }
```

Subscribe to all tickets:

```json
{ "action": "subscribe", "ticket_id": "*" }
```

### Event types received

All events match this envelope:

```typescript
interface TicketWSEvent {
  type: string;           // see below
  ticket_id: string;
  agent_id?: string;
  payload: Record<string, unknown>;
  timestamp: string;      // ISO 8601
}
```

| `type` | Fired when |
|---|---|
| `ticket.created` | New ticket ingested |
| `ticket.status_changed` | Status transitions (open → l1 → l2 → resolved) |
| `ticket.escalated` | Agent decides to hand off to next agent |
| `ticket.resolved` | Ticket marked resolved |
| `agent.thinking` | Agent starts executing a skill |
| `agent.kb_lookup_complete` | RAG retrieval finished (includes sources + scores) |
| `agent.skill_complete` | Skill execution finished (includes output + timing) |
| `comment.added` | Human comment posted |
| `agent.comment_added` | Agent comment posted |

### Example session

```javascript
const ws = new WebSocket('ws://localhost:8001/ws');

ws.onopen = () => {
  ws.send(JSON.stringify({ action: 'subscribe', ticket_id: '*' }));
};

ws.onmessage = (msg) => {
  const event = JSON.parse(msg.data);
  console.log(event.type, event.ticket_id, event.payload);
};
```

---

## Knowledge Sources

### Markdown (`type: markdown`)

Reads `.md` files recursively, splits by heading hierarchy, embeds each chunk, stores in memory. Supports live re-indexing on file change (`refresh: on_change`).

| Field | Description |
|---|---|
| `path` | Root directory to scan |
| `glob` | File pattern (default `**/*.md`) |
| `refresh` | `on_change` \| `hourly` \| `daily` \| `manual` |
| `metadata` | Key-value pairs attached to every chunk (e.g. `category: runbook`) |

### Folder / Logs (`type: folder`)

Reads any text files. Ideal for log files.

| Field | Description |
|---|---|
| `path` | Root directory |
| `watch` | Enable chokidar live watching |
| `index_strategy` | `full` — whole file; `tail` — last N lines; `incremental` — new lines only |
| `tail_lines` | Number of lines to index when `index_strategy: tail` |
| `filters.include` | Glob patterns to include (e.g. `['*.log', '*.err']`) |
| `filters.exclude` | Glob patterns to exclude (e.g. `['*.gz']`) |
| `refresh` | `live` \| `on_change` \| `hourly` \| `manual` |

### Knowledge Graph (`type: knowledge_graph`)

Loads a JSON file in GraphRAG format. Entity search is text-based; graph traversal follows relationship edges up to `traversal_depth` hops.

| Field | Description |
|---|---|
| `path` | Path to the `.json` KG file |
| `format` | `graphrag` (default) |
| `traversal_depth` | Max relationship hops from matched entity (1–10) |

---

## Skills

Skills are prompt templates that the agent executes against the LLM, optionally augmented by retrieved knowledge.

```yaml
skills:
  - id: l1_analysis
    name: L1 Incident Analysis
    trigger: on_ticket        # When to auto-run
    prompt_template: ./prompts/l1_analysis.md
    inputs:
      - name: title
        type: string
        required: true
    output:
      format: structured      # Returns JSON parsed from LLM response
      schema: ./schemas/l1_report.json
```

### Triggers

| Trigger | Fires when |
|---|---|
| `on_ticket` | A new ticket is assigned to this agent |
| `on_escalation` | A ticket is escalated to this agent |
| `on_message` | A chat message arrives on an active ticket |
| `explicit` | Only via `POST /api/skills/:id/run` |

### Output Formats

| Format | Behaviour |
|---|---|
| `plain` | Raw LLM text response |
| `markdown` | Markdown-formatted response |
| `structured` | LLM must return JSON; platform extracts and validates against `schema` |

### Escalation from Skills

If a skill with `output.format: structured` returns `{ "decision": "ESCALATE" }` (or any JSON containing the string `ESCALATE`), and `routing.escalate_on_skill` matches this skill's ID, the ticket is automatically escalated.

---

## MCP Tools

Connect to any [Model Context Protocol](https://modelcontextprotocol.io) server:

```yaml
mcps:
  - id: pagerduty
    name: PagerDuty
    url: ${PAGERDUTY_MCP_URL}
    auth_type: bearer
    auth_token: ${PAGERDUTY_TOKEN}
    enabled: true
    tools:             # whitelist — leave empty to allow all tools from this server
      - list_incidents
      - get_incident
      - create_incident
```

The platform connects at startup via the MCP `/tools/list` endpoint, then exposes discovered tools to the LLM during skill execution. Tool calls are proxied to `/tools/call` on the MCP server.

**Auth types:** `bearer` (Authorization: Bearer token), `basic` (Authorization: Basic base64), `none`.

---

## Routing & Escalation

```yaml
routing:
  escalate_to: prod-support      # Target agent ID
  escalate_after_minutes: 15     # Hard deadline — escalates if still open
  escalate_on_skill: l1_analysis # Escalate when this skill outputs ESCALATE
  accepts_from:                  # Whitelist — only accept from these agents
    - ticket-ingestion
    - trader-support
  ticket_system:
    type: jira
```

Escalation triggers (any one fires):
1. **Skill output** — LLM returns `ESCALATE` in a structured output field
2. **Timeout** — ticket not resolved within `escalate_after_minutes`
3. **Manual** — `POST /api/tickets/:id/escalate` (planned)

On escalation, the platform:
- Updates ticket status to `l2`
- Emits `ticket.escalated` WebSocket event with the target agent ID
- Adds a handoff node to the chain visualisation

---

## LLM Providers

### Anthropic (Claude)

```yaml
llm:
  provider: anthropic
  model: claude-sonnet-4-6          # or claude-opus-4-7, claude-haiku-4-5-20251001
  api_key: ${ANTHROPIC_API_KEY}
  temperature: 0.1
  max_tokens: 4096
```

### OpenAI

```yaml
llm:
  provider: openai
  model: gpt-4o                     # or gpt-4o-mini, gpt-4-turbo
  api_key: ${OPENAI_API_KEY}
```

### Azure OpenAI

```yaml
llm:
  provider: azure
  model: gpt-4o
  api_key: ${AZURE_OPENAI_API_KEY}
  azure_endpoint: ${AZURE_OPENAI_ENDPOINT}
  azure_deployment: my-gpt4o-deployment
  azure_api_version: 2024-02-01
```

### Ollama (local, no API key)

```yaml
llm:
  provider: ollama
  model: llama3                     # must be pulled locally
  ollama_base_url: http://localhost:11434
```

### Free API providers (OpenAI-compatible)

Any OpenAI-compatible endpoint works via `provider: openai` + `base_url` (Groq, Gemini,
Cerebras, OpenRouter…). Since some free chat providers (e.g. Groq) have no embeddings API,
an optional top-level `embedding:` block delegates RAG embeddings to a second provider:

```yaml
llm:                                # chat → Groq (free)
  provider: openai
  model: llama-3.3-70b-versatile
  base_url: https://api.groq.com/openai/v1
  api_key: ${GROQ_API_KEY}

embedding:                          # embeddings → Gemini (free); optional
  provider: openai
  model: gemini-embedding-001
  base_url: https://generativelanguage.googleapis.com/v1beta/openai/
  api_key: ${GEMINI_API_KEY}
  embedding_model: gemini-embedding-001
```

If `embedding:` is omitted, the `llm:` provider is used for both chat and embeddings.

---

## Development

### Run all type checks

```bash
pnpm typecheck
```

### Run tests

```bash
pnpm test
# or per-package:
pnpm --filter @agent-platform/core test
```

### Start all dev servers

```bash
pnpm dev   # starts ui (3000) + agent-builder (3001) in parallel
```

### Build all packages

```bash
pnpm build
```

### Lint + format

```bash
pnpm lint
pnpm format
```

### Adding a new LLM provider

1. Create `packages/core/src/llm/MyAdapter.ts` implementing the `LLMProvider` interface
2. Add the case to `packages/core/src/llm/index.ts` `createLLMProvider()`
3. Add the provider enum value to `LLMConfigSchema` in `config/schemas.ts`
4. Add it to the Agent Builder's provider dropdown in `sections/LLMSection.tsx`

### Adding a new knowledge source type

1. Create a processor in `packages/core/src/knowledge/<type>/`
2. Add the Zod schema to `config/schemas.ts` `KnowledgeSourceSchema` discriminated union
3. Wire it up in `AgentManager.ts` start loop
4. Add it to the Knowledge section in `sections/KnowledgeSection.tsx`

---

## Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript 5.x (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`) |
| Monorepo | pnpm workspaces |
| Runtime | Node.js 20+ (ESM, Node16 module resolution) |
| LLM SDKs | `@anthropic-ai/sdk`, `openai` |
| Config validation | Zod |
| Knowledge processing | `gray-matter` (MD frontmatter), `chokidar` (file watching) |
| Vector search | In-memory cosine similarity |
| HTTP server | Node.js `http` module |
| WebSocket | `ws` |
| Agent Builder UI | React 18, Vite 5, TailwindCSS 3, Zustand 4, `js-yaml`, lucide-react |
| Ticket Tracker UI | React 18, Vite 5, TailwindCSS 3, TanStack Query 5, Zustand 4, React Router 6 |
| Testing | Vitest |

---

## Security Notes

- **API keys** are never logged, stored in plain text, or returned in API responses
- All `${ENV_VAR}` references in YAML are resolved at runtime from `process.env`
- MCP connections require explicit auth configuration — unauthenticated MCPs must set `auth_type: none`
- The HTTP API supports optional `X-API-Key` header authentication (planned)
- No external network calls are made beyond what is explicitly configured

---

## License

MIT — see [LICENSE](LICENSE)

---

*Built as part of M.Tech AIML dissertation at BITS Pilani WILP (2024AA05171)*

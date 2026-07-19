# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Commands

All commands run from the **repo root** (`agent-platform/`) unless noted.

### Dev

```bash
pnpm dev                          # Start app + core + cli in parallel (recommended)
cd packages/app && pnpm dev       # Unified UI only (User + Admin tabs, port 3000)
cd packages/core && pnpm dev      # TypeScript watch (no server)
cd packages/cli && pnpm dev       # TypeScript watch (no server)
```

### Build / Type-check / Lint

```bash
pnpm build         # Build all packages
pnpm typecheck     # Type-check all packages (no emit)
pnpm lint          # ESLint all packages
pnpm format        # Prettier all files
```

### Tests (Vitest — only in `packages/core`)

```bash
pnpm test                                  # Run all tests once across workspace
cd packages/core && pnpm test              # Run core tests once
cd packages/core && pnpm test:watch        # Watch mode
cd packages/core && pnpm test:coverage     # Coverage report
cd packages/core && pnpm vitest run tests/config.test.ts   # Single test file
```

### CLI (after building `core` and `cli`)

```bash
node packages/cli/dist/index.js validate <agent.yaml>   # Validate config
node packages/cli/dist/index.js start <agent.yaml>       # Start agent (HTTP + WS on port 8001)
node packages/cli/dist/index.js chat <agent.yaml>        # Interactive chat
node packages/cli/dist/index.js init <name>              # Scaffold new agent project
```

---

## Architecture

### Monorepo layout

```
packages/
  core/          @agent-platform/core   — Runtime engine (Node.js library)
  cli/           @agent-platform/cli    — CLI wrapping AgentManager (Commander)
  app/           @agent-platform/app    — Unified UI: User tab (Ticket Tracker) +
                                          Admin tab (Agent Builder) on one port
  ui/                                   — Legacy standalone Ticket Tracker (kept for reference)
  agent-builder/                        — Legacy standalone Agent Builder (kept for reference)
```

`cli` and `app` depend on `core` only. The active UI is `packages/app` — `ui/` and `agent-builder/` are superseded.

### `packages/app` — Unified UI structure

```
src/
  App.tsx          # Root: BrowserRouter + QueryClient + TopBar (tab switcher)
  main.tsx
  styles.css       # Merged Tailwind CSS from both legacy apps
  lib/utils.ts     # Shared: cn(), formatRelativeTime(), formatTime(), formatDate()
  admin/           # Admin tab — Agent Builder
    AdminApp.tsx
    store/agentBuilderStore.ts
    lib/yaml.ts
    components/ui/primitives.tsx
    sections/       # AgentInfoSection, LLMSection, KnowledgeSection, SkillsSection, MCPSection, RoutingSection
  user/            # User tab — Ticket Tracker
    UserApp.tsx
    api/tickets.ts
    types/ticket.ts
    lib/mockData.ts
    store/ticketStore.ts
    hooks/          # useTicketSocket, useAlertBanner
    components/     # AlertBanner, ChainVisualisation, CommentThread, EventNode, TicketHeader, ui/*
    pages/TicketBoard/  # TicketList, TicketDetail
```

**Routing:** `/` → `/user/tickets` | `/user/*` → UserApp (nested routes) | `/admin` → AdminApp

---

### `core` — Runtime engine

`AgentManager` (`core/src/agent/AgentManager.ts`) is the central orchestrator. Its `start(configPath)` method bootstraps everything in order:

1. **ConfigValidator** — Parses and Zod-validates `agent.yaml`
2. **LLM provider** — `createLLMProvider()` returns one of `AnthropicAdapter`, `OpenAIAdapter`, `AzureOpenAIAdapter`, or `OllamaAdapter`, all implementing `LLMProvider`
3. **Knowledge processors** — One per `knowledge.sources` entry: `MarkdownProcessor` (Markdown files, glob), `FolderProcessor` (log/text folders), or `GraphProcessor` (GraphRAG JSON). Each embeds chunks via the LLM adapter and builds an in-memory vector index.
4. **RAGPipeline** — Aggregates all processors; `query()` does cosine-similarity retrieval across all sources
5. **MCPClient** — Connects to each enabled MCP server (SSE transport), exposes its tools as `Tool[]` to `SkillExecutor`
6. **Store** — In-memory ticket/comment/chain store backed by a JSON file (`data/store.json`)
7. **AgentRouter** — Evaluates routing decisions (escalate / resolve / handle) from skill output
8. **SkillExecutor** — One per skill in config; renders the Mustache prompt template with RAG context + inputs, calls the LLM, and parses structured output
9. **AgentServer** — Vanilla Node.js HTTP + `ws` WebSocket server on port `interface.api_port` (default 8001)

`AgentManager` also extends `EventEmitter`; internal events (`ticket.created`, `skill.complete`, `ticket.escalated`, `ticket.resolved`) mirror what's broadcast over WebSocket.

**Ticket lifecycle in `AgentManager`:**
```
createTicket() → runTriggeredSkills('on_ticket') → executeSkill() → router.evaluate() → escalate() | resolve()
```
Escalation timer (`escalate_after_minutes`) is a plain `setTimeout`.

---

### Config schema (`core/src/config/schemas.ts`)

All config is Zod-validated. Two top-level schemas:

- **`AgentConfigSchema`** — Single-agent YAML (`agent.yaml`). Key sections: `agent`, `llm`, `knowledge`, `skills[]`, `mcps[]`, `routing`, `interface`
- **`PlatformConfigSchema`** — Multi-agent platform YAML (`platform.yaml`). References agent config paths.

`api_key` and other secret fields accept both literal strings and `${ENV_VAR}` references. `ConfigValidator` resolves env var refs and checks that the referenced env vars are set.

Skills have a `trigger` field: `on_ticket` (auto-runs when ticket is created), `on_escalation`, `on_message`, or `explicit` (REST-invoked only).

---

### `AgentServer` — HTTP + WebSocket API

Hand-rolled HTTP router (no Express). All routes are registered in `registerRoutes()`:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Agent health + uptime |
| `GET` | `/api/tickets` | List tickets (filterable by status/priority) |
| `GET` | `/api/tickets/:id` | Ticket detail + full chain + comments |
| `POST` | `/api/tickets` | Create ticket (async — returns 202, calls `onCreateTicket` callback) |
| `POST` | `/api/tickets/:id/message` | Add human message (triggers `on_message` skills) |
| `POST` | `/api/skills/:id/run` | Invoke explicit skill |
| `POST/GET` | `/api/tickets/:id/attachments` | Upload / list attachments |
| `GET` | `/api/attachments/:ticket_id/:filename` | Serve attachment file |

WebSocket: clients send `{ action: "subscribe", ticket_id: "TKT-xxx" }` (or `"*"` for all). Server pushes `AgentWSEvent` objects. Connection lives at the HTTP server's WebSocket upgrade path.

---

### `app/user` — Ticket Tracker

React + Vite + React Query + Zustand + Tailwind + Radix UI.

**Mock mode**: `import.meta.env.DEV` (or `VITE_USE_MOCK=true`) switches all API calls and the WebSocket hook to mock data (`src/lib/mockData.ts`). Set `VITE_USE_MOCK=false` to hit the real backend.

**Data flow:**
- `fetchTickets()` / `fetchTicketDetail()` in `src/api/tickets.ts` proxy to `/api/*` (Vite proxies to `localhost:8000`)
- `useTicketSocket` in `src/hooks/useTicketSocket.ts` — WebSocket at `/ws/tickets/:id` with exponential-backoff reconnect (1s → 2s → … → 30s cap)
- `useTicketDetailStore` (Zustand) — holds chain nodes, handoffs, comments, alert banners; `applyWSEvent()` merges live WS events into local state

**Chain visualisation:** `ChainVisualisation` renders a swimlane diagram (participants as lanes, `AgentChainNode` + `AgentChainHandoff` as rows sorted by timestamp).

**Proxy** (`vite.config.ts`): `/api` → `http://localhost:8000`, `/ws` → `ws://localhost:8000`.

---

### `app/admin` — Visual Config Builder

React + Vite + Zustand + Tailwind. No backend dependency — purely client-side.

**Architecture:** Split-panel layout (form left, live YAML right). State lives in a single flat Zustand store (`AgentFormState` in `src/admin/store/agentBuilderStore.ts`). `toYamlString()` and `fromYamlString()` in `src/admin/lib/yaml.ts` convert between form state and YAML. Form state auto-saved to `localStorage` (500ms debounce).

Sections: `AgentInfoSection`, `LLMSection`, `KnowledgeSection`, `SkillsSection`, `MCPSection`, `RoutingSection` — all in `src/admin/sections/`.

`validate()` in `src/lib/yaml.ts` returns inline validation issues displayed in the YAML panel before the user downloads/copies the config.

---

### TypeScript config

Root `tsconfig.json` sets `strict: true`, `exactOptionalPropertyTypes: true`, `moduleResolution: Node16`. All packages extend root. `core` and `cli` emit ESM (`"type": "module"`) with `.js` import extensions in source. Vite packages use standard bundler resolution.

---

## Key conventions

- **Env var refs in YAML**: Use `${VAR_NAME}` — `ConfigValidator.resolveEnvVar()` substitutes at runtime. Never hard-code secrets.
- **Agent names**: must match `/^[a-z0-9-]+$/` (enforced by Zod schema).
- **Skill `prompt_template`**: path relative to the agent config file's directory, resolved by `SkillExecutor` at runtime.
- **`inferNodeType(skillId)`** in `AgentManager`: maps skill IDs containing `l1`/`l2`/`resolv`/`kb` to `ChainNodeType` — keep skill IDs consistent with this convention.
- **AgentServer callbacks** (`onCreateTicket`, `onMessage`, `onRunSkill`) are set by `AgentManager` after construction — they're `undefined` until `start()` is called.

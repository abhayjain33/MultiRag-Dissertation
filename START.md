# Agentic Triage Platform — Startup Guide

> M.Tech AIML Dissertation — BITS Pilani WILP  
> Abhay Jain (2024AA05171)

---

## What Starts

Running `pnpm dev` from the repo root launches **3 packages in parallel**:

| Package | Description | Default Port |
|---|---|---|
| `packages/app` | Unified UI — User + Admin tabs (React + Vite) | **3000** (or next free) |
| `packages/core` | TypeScript watch — compiles the core engine | — |
| `packages/cli` | TypeScript watch — compiles the CLI | — |

> **Note:** If port 3000 is in use, Vite auto-assigns the next available port. Check terminal output for the actual URL.

---

## The Unified App — Two Tabs

| Tab | Who uses it | What it does |
|---|---|---|
| **User** | End users / traders | Submit tickets, watch the live agent chain, view lifecycle |
| **Admin** | Operators / engineers | Configure agents via YAML — LLM, knowledge, skills, routing |

Both tabs are served on the **same port** under the same Vite dev server.

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | ≥ 20.0.0 | [nodejs.org](https://nodejs.org) |
| pnpm | ≥ 8.0.0 | `npm install -g pnpm` |

---

## Starting Manually

### 1. Navigate to the project root

```bash
cd "/Users/abhayjain/Desktop/My Files/BITSCourseWork/4th_Sem_Dissertation/agent-platform"
```

### 2. Install dependencies (first time only)

```bash
pnpm install
```

### 3. Start all packages

```bash
pnpm dev
```

You'll see output like:

```
packages/app dev:    ➜  Local:   http://localhost:3000/
packages/core dev: Found 0 errors. Watching for file changes.
packages/cli dev:  Found 0 errors. Watching for file changes.
```

Open **http://localhost:3000** → lands on the **User** (Ticket Tracker) tab by default.  
Click **Admin** in the top bar to switch to the Agent Builder.

---

## Starting the App UI Only

```bash
cd packages/app && pnpm dev
```

---

## Stopping

Press `Ctrl + C` in the terminal where `pnpm dev` is running.

---

## Starting via Claude Code (AI-assisted)

Simply say:

> **"Start the agent-platform"**

Claude will run `pnpm dev` from the repo root and report the live URL.

---

## URL Structure

| URL | Content |
|---|---|
| `http://localhost:3000/` | Redirects to `/user/tickets` |
| `http://localhost:3000/user/tickets` | Ticket list (User tab) |
| `http://localhost:3000/user/tickets/:id` | Ticket detail with chain visualisation |
| `http://localhost:3000/admin` | Agent Builder (Admin tab) |

---

## Building for Production

```bash
pnpm build
```

---

## Other Commands

```bash
pnpm test        # Run core tests (Vitest)
pnpm typecheck   # Type-check all packages
pnpm lint        # ESLint all packages
pnpm format      # Prettier
pnpm clean       # Remove dist/ and node_modules/
```

---

## Project Root

```
/Users/abhayjain/Desktop/My Files/BITSCourseWork/4th_Sem_Dissertation/agent-platform/
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Port already in use | Vite auto-picks the next free port — check terminal for actual URL |
| `pnpm: command not found` | `npm install -g pnpm` |
| Blank page after load | Give it 2–3 seconds — Vite may still be optimising deps |
| Admin tab shows stale config | State is persisted in `localStorage` — use the Reset button to clear it |

import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import type { Store } from '../store/Store.js';
import type { AgentWSEvent, AgentChainNode, AgentChainHandoff, Ticket } from '../types.js';

// ── Tiny HTTP router ───────────────────────────────────────────────────────────

type Handler = (req: IncomingMessage, res: ServerResponse, params: Record<string, string>, body: unknown) => Promise<void>;
interface Route { method: string; regex: RegExp; keys: string[]; handler: Handler }

function buildRoute(method: string, path: string, handler: Handler): Route {
  const keys: string[] = [];
  const pattern = '^' + path.replace(/:(\w+)/g, (_, k: string) => { keys.push(k); return '([^/?]+)'; }) + '(?:\\?.*)?$';
  return { method, regex: new RegExp(pattern), keys, handler };
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((res, rej) => {
    let raw = '';
    req.on('data', d => { raw += String(d); });
    req.on('end', () => { try { res(JSON.parse(raw || '{}')); } catch { res({}); } });
    req.on('error', rej);
  });
}

function json(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  });
  res.end(body);
}

// ── Chain builder ─────────────────────────────────────────────────────────────

type ParticipantType = 'raiser' | 'agent';
interface Participant { id: string; label: string; type: ParticipantType }

function buildChain(nodes: AgentChainNode[], handoffs: AgentChainHandoff[]) {
  // Collect unique participants
  const partMap = new Map<string, Participant>();
  for (const n of nodes) {
    if (!partMap.has(n.participant_id)) {
      partMap.set(n.participant_id, { id: n.participant_id, label: n.participant_label, type: n.participant_type });
    }
  }
  for (const h of handoffs) {
    if (!partMap.has(h.from_participant)) partMap.set(h.from_participant, { id: h.from_participant, label: h.from_label, type: 'raiser' });
    if (!partMap.has(h.to_participant)) partMap.set(h.to_participant, { id: h.to_participant, label: h.to_label, type: 'agent' });
  }
  const participants = [...partMap.values()];

  // Merge and sort all rows by timestamp
  type Row = { ts: string; kind: 'node' | 'handoff'; data: AgentChainNode | AgentChainHandoff }
  const rows: Row[] = [
    ...nodes.map(n => ({ ts: n.timestamp, kind: 'node' as const, data: n })),
    ...handoffs.map(h => ({ ts: h.timestamp, kind: 'handoff' as const, data: h })),
  ].sort((a, b) => a.ts.localeCompare(b.ts));

  return {
    participants,
    rows: rows.map(r => {
      if (r.kind === 'node') {
        const n = r.data as AgentChainNode;
        return { kind: 'node', node: { id: n.id, participant_id: n.participant_id, type: n.node_type, timestamp: n.timestamp, summary: n.summary, payload: n.payload, is_current: n.is_current } };
      } else {
        const h = r.data as AgentChainHandoff;
        return { kind: 'handoff', handoff: { id: h.id, from_participant: h.from_participant, to_participant: h.to_participant, timestamp: h.timestamp, label: h.label } };
      }
    }),
  };
}

function toSummary(t: Ticket, currentOwner: string) {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority ?? 'P3',
    raised_by: t.raised_by ?? 'unknown',
    assigned_agent: t.assigned_agent ?? '',
    current_owner: currentOwner,
    created_at: t.created_at.toISOString(),
    updated_at: (t.updated_at ?? t.created_at).toISOString(),
    ...(t.resolved_at ? { resolved_at: t.resolved_at.toISOString() } : {}),
  };
}

// ── AgentServer class ──────────────────────────────────────────────────────────

export class AgentServer {
  private httpServer: Server;
  private wss: WebSocketServer;
  private routes: Route[] = [];
  // ticket_id → set of WS clients subscribed
  private subscriptions = new Map<string, Set<WebSocket>>();
  // wildcard subscribers (subscribe to all tickets)
  private wildcardSubs = new Set<WebSocket>();

  constructor(
    private store: Store,
    private agentId: string,
    private agentName: string,
    private startTime: Date,
  ) {
    this.httpServer = createServer(async (req, res) => {
      // CORS preflight
      if (req.method === 'OPTIONS') { json(res, 204, {}); return; }
      const body = ['POST', 'PUT', 'PATCH'].includes(req.method ?? '') ? await readBody(req) : undefined;
      const path = (req.url ?? '/').split('?')[0] ?? '/';
      for (const route of this.routes) {
        if (route.method !== '*' && route.method !== req.method) continue;
        const m = route.regex.exec(path);
        if (!m) continue;
        const params: Record<string, string> = {};
        route.keys.forEach((k, i) => { params[k] = m[i + 1] ?? ''; });
        try { await route.handler(req, res, params, body); }
        catch (e) { json(res, 500, { error: String(e) }); }
        return;
      }
      json(res, 404, { error: 'Not found' });
    });

    this.wss = new WebSocketServer({ server: this.httpServer });
    this.wss.on('connection', (ws) => {
      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(String(raw)) as { action?: string; ticket_id?: string };
          if (msg.action === 'subscribe') {
            if (msg.ticket_id === '*') {
              this.wildcardSubs.add(ws);
            } else if (msg.ticket_id) {
              const subs = this.subscriptions.get(msg.ticket_id) ?? new Set();
              subs.add(ws);
              this.subscriptions.set(msg.ticket_id, subs);
            }
          }
          if (msg.action === 'unsubscribe' && msg.ticket_id) {
            this.subscriptions.get(msg.ticket_id)?.delete(ws);
            this.wildcardSubs.delete(ws);
          }
        } catch { /* ignore malformed WS messages */ }
      });
      ws.on('close', () => {
        for (const subs of this.subscriptions.values()) subs.delete(ws);
        this.wildcardSubs.delete(ws);
      });
    });

    this.registerRoutes();
  }

  broadcast(event: AgentWSEvent): void {
    const payload = JSON.stringify(event);
    const ticketSubs = this.subscriptions.get(event.ticket_id) ?? new Set();
    const targets = new Set<WebSocket>([...ticketSubs, ...this.wildcardSubs]);
    for (const ws of targets) {
      if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
  }

  listen(port: number): Promise<void> {
    return new Promise(res => this.httpServer.listen(port, () => {
      console.log(`[AgentServer] Listening on http://localhost:${port}`);
      res();
    }));
  }

  async close(): Promise<void> {
    return new Promise((res, rej) => {
      this.wss.close(() => {
        this.httpServer.close(err => err ? rej(err) : res());
      });
    });
  }

  private registerRoutes(): void {
    const R = (method: string, path: string, h: Handler) => this.routes.push(buildRoute(method, path, h));

    // Health
    R('GET', '/api/health', async (_req, res) => {
      json(res, 200, { status: 'ok', agent_id: this.agentId, agent_name: this.agentName, uptime_seconds: Math.floor((Date.now() - this.startTime.getTime()) / 1000) });
    });

    // List tickets
    R('GET', '/api/tickets', async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://x');
      const status = url.searchParams.get('status');
      const priority = url.searchParams.get('priority');
      let tickets = this.store.listTickets();
      if (status) tickets = tickets.filter(t => t.status === status);
      if (priority) tickets = tickets.filter(t => t.priority === priority);
      const currentOwner = this.agentId;
      json(res, 200, { tickets: tickets.map(t => toSummary(t, currentOwner)), total: tickets.length });
    });

    // Get ticket detail
    R('GET', '/api/tickets/:id', async (_req, res, params) => {
      const t = this.store.getTicket(params['id'] ?? '');
      if (!t) { json(res, 404, { error: 'Ticket not found' }); return; }
      const nodes = this.store.getChainNodes(t.id);
      const handoffs = this.store.getChainHandoffs(t.id);
      const comments = this.store.getComments(t.id);
      json(res, 200, {
        ticket: toSummary(t, this.agentId),
        chain: buildChain(nodes, handoffs),
        comments,
      });
    });

    // Create ticket (POST /api/tickets) — body forwarded to AgentManager via callback
    R('POST', '/api/tickets', async (_req, res, _params, body) => {
      const b = (body ?? {}) as Record<string, unknown>;
      json(res, 202, { received: true, message: 'Ticket queued for processing', input: b });
      this.onCreateTicket?.(b);
    });

    // Post message to ticket
    R('POST', '/api/tickets/:id/message', async (_req, res, params, body) => {
      const b = (body ?? {}) as Record<string, unknown>;
      const ticketId = params['id'] ?? '';
      const t = this.store.getTicket(ticketId);
      if (!t) { json(res, 404, { error: 'Ticket not found' }); return; }
      json(res, 202, { received: true });
      this.onMessage?.(ticketId, String(b['content'] ?? ''), String(b['author'] ?? 'user'));
    });

    // Run skill explicitly
    R('POST', '/api/skills/:id/run', async (_req, res, params, body) => {
      const skillId = params['id'] ?? '';
      const inputs = (body ?? {}) as Record<string, unknown>;
      json(res, 202, { received: true, skill_id: skillId });
      this.onRunSkill?.(skillId, inputs);
    });
  }

  // Callbacks set by AgentManager
  onCreateTicket: ((input: Record<string, unknown>) => void) | undefined;
  onMessage: ((ticketId: string, content: string, author: string) => void) | undefined;
  onRunSkill: ((skillId: string, inputs: Record<string, unknown>) => void) | undefined;
}

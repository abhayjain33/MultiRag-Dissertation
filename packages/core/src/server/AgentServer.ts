import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, basename, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import type { Store, AttachmentMeta } from '../store/Store.js';
import type { AgentWSEvent, AgentChainNode, AgentChainHandoff, Ticket } from '../types.js';

// ── MIME helper ───────────────────────────────────────────────────────────────

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
};

function mimeFromExt(ext: string): string {
  return MIME[ext] ?? 'application/octet-stream';
}

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
    private dataDir: string,
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
      if (status && status !== 'all') tickets = tickets.filter(t => t.status === status);
      if (priority && priority !== 'all') tickets = tickets.filter(t => t.priority === priority);
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

    // Create ticket (POST /api/tickets) — respond immediately, process async
    R('POST', '/api/tickets', async (_req, res, _params, body) => {
      const b = (body ?? {}) as Record<string, unknown>;
      // Pre-assign ID so the caller can navigate/subscribe before processing starts
      const ticketId = b['id'] !== undefined ? String(b['id']) : `TKT-${Date.now()}`;
      b['id'] = ticketId;
      json(res, 202, { id: ticketId, ticket_id: ticketId, received: true, message: 'Ticket queued for processing' });
      void this.onCreateTicket?.(b);
    });

    // Relay chain events from peer agents (for multi-agent chain visualisation)
    R('POST', '/api/tickets/:id/chain-relay', async (_req, res, params, body) => {
      const ticketId = params['id'] ?? '';
      if (!this.store.getTicket(ticketId)) { json(res, 404, { error: 'Ticket not found' }); return; }
      const b = (body ?? {}) as { kind?: string; node?: AgentChainNode; handoff?: AgentChainHandoff };
      if (b.kind === 'node' && b.node) {
        const node = { ...b.node, ticket_id: ticketId };
        this.store.addChainNode(ticketId, node);
        this.broadcast({ type: 'ticket.chain_updated', ticket_id: ticketId, agent_id: node.participant_id, payload: { kind: 'node', node }, timestamp: node.timestamp });
      } else if (b.kind === 'handoff' && b.handoff) {
        const handoff = { ...b.handoff, ticket_id: ticketId };
        this.store.addChainHandoff(ticketId, handoff);
        this.broadcast({ type: 'ticket.chain_updated', ticket_id: ticketId, agent_id: handoff.from_participant, payload: { kind: 'handoff', handoff }, timestamp: handoff.timestamp });
      }
      json(res, 204, {});
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

    // Upload attachment (base64 JSON body: { filename, content_type, data })
    R('POST', '/api/tickets/:id/attachments', async (_req, res, params, body) => {
      const ticketId = params['id'] ?? '';
      if (!this.store.getTicket(ticketId)) { json(res, 404, { error: 'Ticket not found' }); return; }
      const b = (body ?? {}) as Record<string, unknown>;
      const rawName = basename(String(b['filename'] ?? 'upload'));
      const safeExt = extname(rawName).toLowerCase().replace(/[^.a-z0-9]/g, '');
      const safeBase = rawName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
      const filename = `${Date.now()}_${safeBase}`;
      const dir = join(this.dataDir, 'attachments', ticketId);
      await mkdir(dir, { recursive: true });
      const buf = Buffer.from(String(b['data'] ?? ''), 'base64');
      await writeFile(join(dir, filename), buf);
      const meta: AttachmentMeta = {
        id: randomUUID(),
        ticket_id: ticketId,
        filename,
        content_type: String(b['content_type'] ?? mimeFromExt(safeExt)),
        size: buf.length,
        uploaded_at: new Date().toISOString(),
      };
      this.store.addAttachment(meta);
      json(res, 201, {
        ...meta,
        url: `/api/attachments/${ticketId}/${filename}`,
      });
    });

    // Serve attachment file
    R('GET', '/api/attachments/:ticket_id/:filename', async (_req, res, params) => {
      const ticketId = params['ticket_id'] ?? '';
      const filename = basename(params['filename'] ?? '');
      const filePath = join(this.dataDir, 'attachments', ticketId, filename);
      let buf: Buffer;
      try { buf = await readFile(filePath); }
      catch { json(res, 404, { error: 'Attachment not found' }); return; }
      const ext = extname(filename).toLowerCase().replace(/[^.a-z0-9]/g, '');
      res.writeHead(200, {
        'Content-Type': mimeFromExt(ext),
        'Content-Length': buf.length,
        'Cache-Control': 'public, max-age=31536000',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(buf);
    });

    // List attachments for a ticket
    R('GET', '/api/tickets/:id/attachments', async (_req, res, params) => {
      const ticketId = params['id'] ?? '';
      const list = this.store.getAttachments(ticketId).map((m) => ({
        ...m,
        url: `/api/attachments/${ticketId}/${m.filename}`,
      }));
      json(res, 200, { attachments: list });
    });
  }

  // Callbacks set by AgentManager
  onCreateTicket: ((input: Record<string, unknown>) => Promise<{ id: string }>) | undefined;
  onMessage: ((ticketId: string, content: string, author: string) => void) | undefined;
  onRunSkill: ((skillId: string, inputs: Record<string, unknown>) => void) | undefined;
}

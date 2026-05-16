import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Ticket, RoutingEvent, AgentChainNode, AgentChainHandoff, TicketPriority } from '../types.js';

export interface StoreComment {
  id: string;
  ticket_id: string;
  author: string;
  author_type: 'human' | 'agent';
  role?: string | undefined;
  content: string;
  created_at: string;
}

export interface Session {
  id: string;
  ticket_id: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  created_at: Date;
  updated_at: Date;
}

interface PersistedData {
  tickets: Record<string, unknown>;
  comments: Record<string, StoreComment[]>;
  routing_events: RoutingEvent[];
  chain_nodes: Record<string, AgentChainNode[]>;
  chain_handoffs: Record<string, AgentChainHandoff[]>;
}

export class Store {
  private tickets = new Map<string, Ticket>();
  private comments = new Map<string, StoreComment[]>();
  private routingEvents: RoutingEvent[] = [];
  private chainNodes = new Map<string, AgentChainNode[]>();
  private chainHandoffs = new Map<string, AgentChainHandoff[]>();
  private sessions = new Map<string, Session>();

  constructor(private persistPath?: string | undefined) {}

  async load(): Promise<void> {
    if (!this.persistPath) return;
    let raw: string;
    try { raw = await readFile(this.persistPath, 'utf-8'); } catch { return; }
    let data: PersistedData;
    try { data = JSON.parse(raw) as PersistedData; } catch { return; }

    for (const [id, t] of Object.entries(data.tickets)) {
      const raw_t = t as Record<string, unknown>;
      const ticket: Ticket = {
        id: String(raw_t['id'] ?? id),
        title: String(raw_t['title'] ?? ''),
        status: raw_t['status'] as Ticket['status'],
        created_at: new Date(String(raw_t['created_at'] ?? '')),
      };
      if (raw_t['description']) ticket.description = String(raw_t['description']);
      if (raw_t['priority']) ticket.priority = raw_t['priority'] as TicketPriority;
      if (raw_t['raised_by']) ticket.raised_by = String(raw_t['raised_by']);
      if (raw_t['assigned_agent']) ticket.assigned_agent = String(raw_t['assigned_agent']);
      if (raw_t['updated_at']) ticket.updated_at = new Date(String(raw_t['updated_at']));
      if (raw_t['resolved_at']) ticket.resolved_at = new Date(String(raw_t['resolved_at']));
      this.tickets.set(id, ticket);
    }
    for (const [id, cs] of Object.entries(data.comments)) this.comments.set(id, cs);
    this.routingEvents = data.routing_events ?? [];
    for (const [id, ns] of Object.entries(data.chain_nodes ?? {})) this.chainNodes.set(id, ns);
    for (const [id, hs] of Object.entries(data.chain_handoffs ?? {})) this.chainHandoffs.set(id, hs);
  }

  async persist(): Promise<void> {
    if (!this.persistPath) return;
    const data: PersistedData = {
      tickets: Object.fromEntries(this.tickets),
      comments: Object.fromEntries(this.comments),
      routing_events: this.routingEvents,
      chain_nodes: Object.fromEntries(this.chainNodes),
      chain_handoffs: Object.fromEntries(this.chainHandoffs),
    };
    await mkdir(dirname(this.persistPath), { recursive: true });
    await writeFile(this.persistPath, JSON.stringify(data, null, 2));
  }

  // ── Tickets ────────────────────────────────────────────────────────────────

  createTicket(ticket: Omit<Ticket, 'created_at'>): Ticket {
    const t: Ticket = { ...ticket, created_at: new Date() };
    this.tickets.set(t.id, t);
    void this.persist();
    return t;
  }

  getTicket(id: string): Ticket | undefined { return this.tickets.get(id); }

  listTickets(): Ticket[] {
    return [...this.tickets.values()].sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  }

  updateTicket(id: string, patch: Partial<Ticket>): Ticket | undefined {
    const t = this.tickets.get(id);
    if (!t) return undefined;
    const updated: Ticket = { ...t, ...patch, updated_at: new Date() };
    this.tickets.set(id, updated);
    void this.persist();
    return updated;
  }

  // ── Comments ───────────────────────────────────────────────────────────────

  addComment(c: StoreComment): void {
    const list = this.comments.get(c.ticket_id) ?? [];
    list.push(c);
    this.comments.set(c.ticket_id, list);
    void this.persist();
  }

  getComments(ticketId: string): StoreComment[] { return this.comments.get(ticketId) ?? []; }

  // ── Chain ──────────────────────────────────────────────────────────────────

  addChainNode(ticketId: string, node: AgentChainNode): void {
    // Mark all previous nodes as not current
    const existing = this.chainNodes.get(ticketId) ?? [];
    const updated = existing.map(n => ({ ...n, is_current: false }));
    updated.push(node);
    this.chainNodes.set(ticketId, updated);
    void this.persist();
  }

  addChainHandoff(ticketId: string, handoff: AgentChainHandoff): void {
    const list = this.chainHandoffs.get(ticketId) ?? [];
    list.push(handoff);
    this.chainHandoffs.set(ticketId, list);
    void this.persist();
  }

  getChainNodes(ticketId: string): AgentChainNode[] { return this.chainNodes.get(ticketId) ?? []; }
  getChainHandoffs(ticketId: string): AgentChainHandoff[] { return this.chainHandoffs.get(ticketId) ?? []; }

  // ── Routing events ─────────────────────────────────────────────────────────

  addRoutingEvent(e: RoutingEvent): void {
    this.routingEvents.push(e);
    void this.persist();
  }

  getRoutingEvents(ticketId: string): RoutingEvent[] {
    return this.routingEvents.filter(e => e.ticket_id === ticketId);
  }

  // ── Sessions ───────────────────────────────────────────────────────────────

  createSession(s: Session): void { this.sessions.set(s.id, s); }
  getSession(id: string): Session | undefined { return this.sessions.get(id); }
  updateSession(id: string, patch: Partial<Session>): void {
    const s = this.sessions.get(id);
    if (s) this.sessions.set(id, { ...s, ...patch, updated_at: new Date() });
  }
}

import { dirname, resolve } from 'node:path';
import { EventEmitter } from 'node:events';
import { ConfigValidator } from '../config/ConfigValidator.js';
import { createLLMProvider } from '../llm/index.js';
import { MarkdownProcessor } from '../knowledge/markdown/MarkdownProcessor.js';
import { FolderProcessor } from '../knowledge/folder/FolderProcessor.js';
import { GraphProcessor } from '../knowledge/graph/GraphProcessor.js';
import { RAGPipeline } from '../rag/RAGPipeline.js';
import { SkillExecutor } from '../skills/SkillExecutor.js';
import { MCPClient } from '../mcp/MCPClient.js';
import { Store } from '../store/Store.js';
import { AgentRouter } from '../router/AgentRouter.js';
import { AgentServer } from '../server/AgentServer.js';
import type { LLMProvider } from '../llm/LLMProvider.js';
import type { AgentConfig } from '../config/schemas.js';
import type { Ticket, AgentWSEvent, AgentChainNode, AgentChainHandoff, Tool } from '../types.js';

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function now(): string { return new Date().toISOString(); }

export class AgentManager extends EventEmitter {
  private config!: AgentConfig;
  private llm!: LLMProvider;
  private embedder!: LLMProvider;
  private rag!: RAGPipeline;
  private store!: Store;
  private router!: AgentRouter;
  private server!: AgentServer;
  private mcpClients: MCPClient[] = [];
  private processors: Array<MarkdownProcessor | FolderProcessor> = [];
  private graphProcessors: GraphProcessor[] = [];
  private executors = new Map<string, SkillExecutor>();
  private startTime = new Date();
  private configDir = process.cwd();
  private running = false;

  async start(configPath: string): Promise<void> {
    // 1. Validate + load config
    const validator = new ConfigValidator();
    const result = validator.validateAgentConfig(configPath);
    if (!result.valid || !result.config) {
      throw new Error(`Invalid agent config:\n${result.errors.map((e) => `  • ${e.path}: ${e.message}`).join('\n')}`);
    }
    this.config = result.config as AgentConfig;
    this.configDir = dirname(resolve(configPath));

    console.log(`[AgentManager] Starting agent: ${this.config.agent.display_name}`);

    // 2. LLM provider (chat) + embedding provider (RAG).
    // If `embedding` is configured, use a dedicated provider for embeddings;
    // otherwise reuse the chat provider for both.
    this.llm = createLLMProvider(this.config.llm);
    this.embedder = this.config.embedding
      ? createLLMProvider(this.config.embedding)
      : this.llm;

    // 3. Knowledge sources + RAG
    // Resolve each source's `path` against the config file's directory so that
    // relative paths (e.g. ../kb/known-errors.md) work regardless of the cwd the
    // agent process was launched from.
    this.rag = new RAGPipeline(this.embedder);
    for (const rawSrc of this.config.knowledge?.sources ?? []) {
      const src =
        'path' in rawSrc && rawSrc.path
          ? { ...rawSrc, path: resolve(this.configDir, rawSrc.path) }
          : rawSrc;
      if (src.type === 'markdown') {
        const p = new MarkdownProcessor(src, this.embedder);
        await p.index();
        await p.startWatching();
        this.rag.addMarkdown(p);
        this.processors.push(p);
      } else if (src.type === 'folder') {
        const p = new FolderProcessor(src, this.embedder);
        await p.index();
        await p.startWatching();
        this.rag.addFolder(p);
        this.processors.push(p);
      } else if (src.type === 'knowledge_graph') {
        const p = new GraphProcessor(src);
        await p.load();
        this.rag.addGraph(p);
        this.graphProcessors.push(p);
      }
    }

    // 4. MCP clients
    const mcpTools: Tool[] = [];
    for (const mcpCfg of this.config.mcps) {
      if (!mcpCfg.enabled) continue;
      const client = new MCPClient(mcpCfg);
      await client.connect();
      this.mcpClients.push(client);
      mcpTools.push(...client.getTools());
    }

    // 5. Store
    const dataDir = this.config.knowledge?.vector_store_path
      ? resolve(this.configDir, this.config.knowledge.vector_store_path)
      : resolve(this.configDir, 'data');
    const storePath = resolve(dataDir, 'store.json');
    this.store = new Store(storePath);
    await this.store.load();

    // 6. Router
    this.router = new AgentRouter(this.config);

    // 7. Skill executors
    const callTool = async (name: string, args: Record<string, unknown>) => {
      const client = this.mcpClients.find(c => name.startsWith(`${c.id}__`));
      if (!client) return { tool_call_id: name, content: `No MCP client for tool: ${name}`, is_error: true };
      return client.callTool(name, args);
    };
    for (const skill of this.config.skills) {
      const executor = new SkillExecutor(skill, this.llm, this.rag, mcpTools, this.configDir, callTool);
      this.executors.set(skill.id, executor);
    }

    // 8. HTTP + WebSocket server
    const port = this.config.interface?.api_port ?? 8001;
    this.server = new AgentServer(this.store, this.config.agent.name, this.config.agent.display_name, this.startTime, dataDir);
    this.server.onCreateTicket = async (input) => { const t = await this.handleTicketInput(input); return { id: t.id }; };
    this.server.onMessage = (ticketId, content, author) => void this.handleMessage(ticketId, content, author);
    this.server.onRunSkill = (skillId, inputs) => void this.handleExplicitSkill(skillId, inputs);
    await this.server.listen(port);

    this.running = true;
    console.log(`[AgentManager] Agent ${this.config.agent.name} ready on port ${port}`);
  }

  async stop(): Promise<void> {
    this.running = false;
    for (const p of this.processors) await p.stop();
    await this.server.close();
    console.log(`[AgentManager] Stopped`);
  }

  // ── Ticket handling ──────────────────────────────────────────────────────────

  async createTicket(input: {
    id?: string | undefined;
    title: string;
    description?: string | undefined;
    priority?: Ticket['priority'] | undefined;
    raised_by?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
  }): Promise<Ticket> {
    const ticket = this.store.createTicket({
      id: input.id ?? `TKT-${Date.now()}`,
      title: input.title,
      status: 'open',
      assigned_agent: this.config.agent.name,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.raised_by !== undefined ? { raised_by: input.raised_by } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    });

    // Only add raiser node + initial handoff when this is the originating agent (no relay_to means we ARE the coordinator)
    const isOriginator = !ticket.metadata?.['relay_to'];
    if (isOriginator) {
      const raiserId = `raiser-${ticket.id}`;
      this.store.addChainNode(ticket.id, this.makeNode({
        id: uid('node'),
        ticket_id: ticket.id,
        participant_id: raiserId,
        participant_label: ticket.raised_by ?? 'User',
        participant_type: 'raiser',
        node_type: 'ticket_raised',
        summary: ticket.title,
        payload: { description: ticket.description ?? '' },
        is_current: false,
      }));
      this.store.addChainHandoff(ticket.id, {
        id: uid('ho'),
        ticket_id: ticket.id,
        from_participant: raiserId,
        from_label: ticket.raised_by ?? 'User',
        to_participant: this.config.agent.name,
        to_label: this.config.agent.display_name,
        timestamp: now(),
        label: 'Assigned to',
      });
    }

    this.emit('ticket.created', ticket);
    this.sendWS({ type: 'ticket.created', ticket_id: ticket.id, agent_id: this.config.agent.name, payload: { title: ticket.title, status: ticket.status, priority: ticket.priority ?? 'P3', raised_by: ticket.raised_by ?? 'User' }, timestamp: now() });

    // Run auto-triggered skills
    await this.runTriggeredSkills(ticket, 'on_ticket');

    // Escalation timer
    this.scheduleEscalationTimer(ticket);

    return ticket;
  }

  async handleMessage(ticketId: string, content: string, author: string): Promise<void> {
    const ticket = this.store.getTicket(ticketId);
    if (!ticket) return;

    this.store.addComment({
      id: uid('cmt'),
      ticket_id: ticketId,
      author,
      author_type: 'human',
      content,
      created_at: now(),
    });
    this.sendWS({ type: 'comment.added', ticket_id: ticketId, payload: { author, content }, timestamp: now() });

    // Run on_message skills
    await this.runTriggeredSkills(ticket, 'on_message', { message: content, author });
  }

  async runSkillById(skillId: string, inputs: Record<string, unknown>, ticketId?: string | undefined): Promise<void> {
    const executor = this.executors.get(skillId);
    if (!executor) { console.warn(`[AgentManager] Skill ${skillId} not found`); return; }
    const ticket = ticketId ? this.store.getTicket(ticketId) : undefined;
    await this.executeSkill(executor, skillId, inputs, ticket);
  }

  // ── Internal helpers ─────────────────────────────────────────────────────────

  private async handleTicketInput(input: Record<string, unknown>): Promise<Ticket> {
    const relayTo = input['relay_to'] !== undefined ? String(input['relay_to']) : undefined;
    return this.createTicket({
      id: input['id'] !== undefined ? String(input['id']) : undefined,
      title: String(input['title'] ?? 'Untitled ticket'),
      description: input['description'] !== undefined ? String(input['description']) : undefined,
      priority: input['priority'] as Ticket['priority'] | undefined,
      raised_by: input['raised_by'] !== undefined ? String(input['raised_by']) : undefined,
      metadata: {
        ...(input['metadata'] as Record<string, unknown> | undefined ?? {}),
        ...(relayTo ? { relay_to: relayTo } : {}),
      },
    });
  }

  private async handleExplicitSkill(skillId: string, inputs: Record<string, unknown>): Promise<void> {
    await this.runSkillById(skillId, inputs);
  }

  private async runTriggeredSkills(ticket: Ticket, trigger: string, extraInputs?: Record<string, unknown>): Promise<void> {
    const triggered = this.config.skills.filter(s => s.trigger === trigger);
    for (const skill of triggered) {
      const executor = this.executors.get(skill.id);
      if (!executor) continue;
      const chainContext = ticket.metadata?.['chain_context'] as string | undefined ?? '';
      const inputs: Record<string, unknown> = {
        ticket_id: ticket.id,
        title: ticket.title,
        description: ticket.description ?? '',
        'ticket.title': ticket.title,
        'ticket.description': ticket.description ?? '',
        'ticket.chain_context': chainContext,
        chain_context: chainContext,
        ...extraInputs,
      };
      await this.executeSkill(executor, skill.id, inputs, ticket);
    }
  }

  private async executeSkill(executor: SkillExecutor, skillId: string, inputs: Record<string, unknown>, ticket?: Ticket | undefined): Promise<void> {
    const ticketId = ticket?.id ?? inputs['ticket_id'] as string | undefined ?? 'unknown';

    // thinking node
    const thinkingNode = this.makeNode({
      id: uid('node'),
      ticket_id: ticketId,
      participant_id: this.config.agent.name,
      participant_label: this.config.agent.display_name,
      participant_type: 'agent',
      node_type: 'thinking',
      summary: `Running skill: ${skillId}`,
      payload: { skill_id: skillId, inputs },
      is_current: true,
    });
    this.store.addChainNode(ticketId, thinkingNode);
    await this.relayNode(ticket, thinkingNode);
    this.sendWS({ type: 'agent.thinking', ticket_id: ticketId, agent_id: this.config.agent.name, payload: { skill_id: skillId }, timestamp: now() });

    // KB lookup event (if RAG is non-empty)
    if (!this.rag.isEmpty) {
      const queryText = String(inputs['description'] ?? inputs['title'] ?? '');
      const ragPreview = await this.rag.query(queryText, { topK: 3 });
      const kbNode = this.makeNode({
        id: uid('node'),
        ticket_id: ticketId,
        participant_id: this.config.agent.name,
        participant_label: this.config.agent.display_name,
        participant_type: 'agent',
        node_type: 'kb_lookup',
        summary: `Searched ${ragPreview.sources_used.length} knowledge sources`,
        payload: {
          sources_searched: ragPreview.sources_used,
          query: queryText.slice(0, 100),
          results: ragPreview.chunks.slice(0, 3).map(c => ({ source: c.source_file.split('/').pop() ?? '', score: c.score, match: c.score > 0.7 ? 'direct' : c.score > 0.4 ? 'partial' : 'none' })),
          decision: ragPreview.chunks.length > 0 ? 'Relevant context found' : 'No direct match',
        },
        is_current: true,
      });
      this.store.addChainNode(ticketId, kbNode);
      await this.relayNode(ticket, kbNode);
      this.sendWS({ type: 'agent.kb_lookup_complete', ticket_id: ticketId, agent_id: this.config.agent.name, payload: kbNode.payload, timestamp: now() });
    }

    // Execute skill
    const result = await executor.execute(inputs);

    // Determine node type from skill ID
    const nodeType = inferNodeType(skillId);
    const skillNode = this.makeNode({
      id: uid('node'),
      ticket_id: ticketId,
      participant_id: this.config.agent.name,
      participant_label: this.config.agent.display_name,
      participant_type: 'agent',
      node_type: nodeType,
      summary: result.success ? `${skillId} completed` : `${skillId} failed: ${result.error ?? 'unknown'}`,
      payload: result.output,
      is_current: true,
    });
    this.store.addChainNode(ticketId, skillNode);
    await this.relayNode(ticket, skillNode);
    this.sendWS({ type: 'agent.skill_complete', ticket_id: ticketId, agent_id: this.config.agent.name, payload: { skill_id: skillId, success: result.success, output: result.output, execution_time_ms: result.execution_time_ms }, timestamp: now() });

    // Routing evaluation
    if (ticket && result.success) {
      const resolveOnSkill = this.config.routing?.resolve_on_skill;
      if (resolveOnSkill && resolveOnSkill === skillId) {
        await this.resolve(ticket, result.output);
      } else {
        const decision = this.router.evaluate(ticket, 'skill_output', result.output, skillId);
        if (decision.action === 'escalate') {
          await this.escalate(ticket, decision.reason, decision.target_agent);
        } else if (result.output['decision'] === 'RESOLVE' || result.output['status'] === 'resolved') {
          await this.resolve(ticket, result.output);
        }
      }
    }

    this.emit('skill.complete', { skill_id: skillId, result });
  }

  private async escalate(ticket: Ticket, reason: string, targetAgent?: string | undefined): Promise<void> {
    this.store.updateTicket(ticket.id, { status: 'l2' });

    const target = targetAgent ?? this.config.routing?.escalate_to ?? 'escalation-queue';
    const handoff: AgentChainHandoff = {
      id: uid('ho'),
      ticket_id: ticket.id,
      from_participant: this.config.agent.name,
      from_label: this.config.agent.display_name,
      to_participant: target,
      to_label: target,
      timestamp: now(),
      label: reason,
    };
    this.store.addChainHandoff(ticket.id, handoff);
    await this.relayHandoff(ticket, handoff);

    this.sendWS({ type: 'ticket.escalated', ticket_id: ticket.id, agent_id: this.config.agent.name, payload: { reason, target_agent: target }, timestamp: now() });
    this.emit('ticket.escalated', { ticket_id: ticket.id, reason, target_agent: target });

    // Forward ticket to peer agent if URL is configured
    const peerUrl = this.config.routing?.peer_agents?.[target];
    if (peerUrl) {
      // relay_to is either this ticket's coordinator or (if this is the coordinator) our own URL
      const ownUrl = `http://localhost:${this.config.interface?.api_port ?? 8001}`;
      const relayTo = (ticket.metadata?.['relay_to'] as string | undefined) ?? ownUrl;
      // Build cumulative chain context so the next agent can see all previous findings
      const prevContext = ticket.metadata?.['chain_context'] as string | undefined ?? '';
      const myNodes = this.store.getChainNodes(ticket.id)
        .filter(n => n.node_type === 'l1_analysis' && n.participant_id === this.config.agent.name);
      const myOutput = myNodes.length > 0 ? JSON.stringify(myNodes[myNodes.length - 1]?.payload ?? {}, null, 2) : '';
      const chainContext = prevContext
        ? `${prevContext}\n\n## ${this.config.agent.display_name} Findings\n${myOutput}`
        : `## ${this.config.agent.display_name} Findings\n${myOutput}`;
      try {
        await fetch(`${peerUrl}/api/tickets`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: ticket.id,
            title: ticket.title,
            description: ticket.description ?? '',
            priority: ticket.priority,
            raised_by: ticket.raised_by,
            relay_to: relayTo,
            metadata: { chain_context: chainContext },
          }),
        });
      } catch (err) {
        console.warn(`[AgentManager] Failed to forward ticket to peer ${target} at ${peerUrl}:`, err);
      }
    }
  }

  private async resolve(ticket: Ticket, output: Record<string, unknown>): Promise<void> {
    this.store.updateTicket(ticket.id, { status: 'resolved', resolved_at: new Date() });

    const resolutionNode = this.makeNode({
      id: uid('node'),
      ticket_id: ticket.id,
      participant_id: this.config.agent.name,
      participant_label: this.config.agent.display_name,
      participant_type: 'agent',
      node_type: 'resolution',
      summary: 'Ticket resolved',
      payload: {
        root_cause_summary: String(output['root_cause'] ?? output['summary'] ?? 'Resolved'),
        action_taken: String(output['action'] ?? 'Handled by agent'),
        ...(output['permanent_fix'] !== undefined ? { permanent_fix: output['permanent_fix'] } : {}),
      },
      is_current: true,
    });
    this.store.addChainNode(ticket.id, resolutionNode);
    await this.relayNode(ticket, resolutionNode);
    this.sendWS({ type: 'ticket.resolved', ticket_id: ticket.id, agent_id: this.config.agent.name, payload: resolutionNode.payload, timestamp: now() });
    this.emit('ticket.resolved', { ticket_id: ticket.id });
  }

  private async relayNode(ticket: Ticket | undefined, node: AgentChainNode): Promise<void> {
    const relayTo = ticket?.metadata?.['relay_to'] as string | undefined;
    if (!relayTo) return;
    try {
      await fetch(`${relayTo}/api/tickets/${node.ticket_id}/chain-relay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'node', node }),
      });
    } catch { /* best-effort relay */ }
  }

  private async relayHandoff(ticket: Ticket | undefined, handoff: AgentChainHandoff): Promise<void> {
    const relayTo = ticket?.metadata?.['relay_to'] as string | undefined;
    if (!relayTo) return;
    try {
      await fetch(`${relayTo}/api/tickets/${handoff.ticket_id}/chain-relay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'handoff', handoff }),
      });
    } catch { /* best-effort relay */ }
  }

  private scheduleEscalationTimer(ticket: Ticket): void {
    const mins = this.config.routing?.escalate_after_minutes;
    if (!mins) return;
    setTimeout(async () => {
      if (!this.running) return;
      const current = this.store.getTicket(ticket.id);
      if (!current || current.status !== 'open') return;
      const target = this.config.routing?.escalate_to;
      await this.escalate(current, `Auto-escalated after ${mins} minutes`, target);
    }, mins * 60 * 1000);
  }

  private sendWS(event: AgentWSEvent): void {
    this.server.broadcast(event);
    this.emit('ws', event);
  }

  private makeNode(n: Omit<AgentChainNode, 'timestamp'> & { timestamp?: string | undefined }): AgentChainNode {
    return { ...n, timestamp: n.timestamp ?? now() };
  }
}

function inferNodeType(skillId: string): AgentChainNode['node_type'] {
  const id = skillId.toLowerCase();
  if (id.includes('l1') || id.includes('l1_analysis')) return 'l1_analysis';
  if (id.includes('l2') || id.includes('l2_analysis')) return 'l2_analysis';
  if (id.includes('resolv')) return 'resolution';
  if (id.includes('kb') || id.includes('search') || id.includes('lookup')) return 'kb_lookup';
  return 'l1_analysis';
}

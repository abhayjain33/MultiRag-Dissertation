import { create } from 'zustand';
import type { TicketComment, ChainNode, ChainHandoff, ChainParticipant, AlertBannerItem, TicketWSEvent } from '@/types/ticket';

interface TicketDetailState {
  comments: TicketComment[];
  chainParticipants: ChainParticipant[];
  chainNodes: Map<string, ChainNode>;
  chainHandoffs: ChainHandoff[];
  alerts: AlertBannerItem[];
  agentThinking: boolean;
}

interface TicketDetailActions {
  initFromDetail: (detail: {
    comments: TicketComment[];
    chain: { participants: ChainParticipant[]; rows: Array<{ kind: string; node?: ChainNode; handoff?: ChainHandoff }> };
  }) => void;
  applyWSEvent: (event: TicketWSEvent) => void;
  addComment: (comment: TicketComment) => void;
  dismissAlert: (id: string) => void;
}

function pushAlert(alerts: AlertBannerItem[], message: string, anchor?: string): AlertBannerItem[] {
  return [...alerts, { id: crypto.randomUUID(), message, anchor }];
}

export const useTicketDetailStore = create<TicketDetailState & TicketDetailActions>((set) => ({
  comments: [],
  chainParticipants: [],
  chainNodes: new Map(),
  chainHandoffs: [],
  alerts: [],
  agentThinking: false,

  initFromDetail: (detail) => {
    const nodes = new Map<string, ChainNode>();
    const handoffs: ChainHandoff[] = [];
    for (const row of detail.chain.rows) {
      if (row.kind === 'node' && row.node) nodes.set(row.node.id, row.node);
      if (row.kind === 'handoff' && row.handoff) handoffs.push(row.handoff);
    }
    set({
      comments: detail.comments,
      chainParticipants: detail.chain.participants,
      chainNodes: nodes,
      chainHandoffs: handoffs,
      alerts: [],
      agentThinking: false,
    });
  },

  applyWSEvent: (event) =>
    set((state) => {
      switch (event.type) {
        case 'agent.thinking':
          return { agentThinking: true };

        case 'agent.kb_lookup_complete': {
          const node: ChainNode = {
            id: crypto.randomUUID(),
            participant_id: event.agent_id ?? 'unknown',
            type: 'kb_lookup',
            timestamp: event.timestamp,
            summary: (event.payload['summary'] as string | undefined) ?? 'KB lookup complete',
            is_current: false,
            payload: event.payload,
          };
          const nodes = new Map(state.chainNodes);
          nodes.set(node.id, node);
          return {
            agentThinking: false,
            chainNodes: nodes,
            alerts: pushAlert(state.alerts, `${event.agent_id ?? 'Agent'} completed KB lookup`, node.id),
          };
        }

        case 'agent.skill_complete': {
          const skillId = event.payload['skill_id'] as string | undefined;
          const nodeType = skillId?.includes('l2') ? 'l2_analysis' : skillId?.includes('l1') ? 'l1_analysis' : 'l1_analysis';
          const node: ChainNode = {
            id: crypto.randomUUID(),
            participant_id: event.agent_id ?? 'unknown',
            type: nodeType,
            timestamp: event.timestamp,
            summary: (event.payload['summary'] as string | undefined) ?? `${skillId ?? 'Skill'} complete`,
            is_current: false,
            payload: event.payload,
          };
          const nodes = new Map(state.chainNodes);
          // clear is_current on previous nodes
          for (const [k, v] of nodes) nodes.set(k, { ...v, is_current: false });
          nodes.set(node.id, node);
          return {
            agentThinking: false,
            chainNodes: nodes,
            alerts: pushAlert(
              state.alerts,
              `${event.agent_id ?? 'Agent'} completed ${skillId ?? 'analysis'} — View update ↓`,
              node.id,
            ),
          };
        }

        case 'ticket.escalated': {
          const handoff: ChainHandoff = {
            id: crypto.randomUUID(),
            from_participant: event.payload['from_agent'] as string ?? event.agent_id ?? 'unknown',
            to_participant: event.payload['to_agent'] as string ?? 'unknown',
            timestamp: event.timestamp,
            label: 'Escalated',
          };
          return {
            chainHandoffs: [...state.chainHandoffs, handoff],
            alerts: pushAlert(
              state.alerts,
              `Ticket escalated to ${handoff.to_participant}`,
            ),
          };
        }

        case 'ticket.resolved': {
          const node: ChainNode = {
            id: crypto.randomUUID(),
            participant_id: event.agent_id ?? 'unknown',
            type: 'resolution',
            timestamp: event.timestamp,
            summary: 'Resolved',
            is_current: true,
            payload: event.payload,
          };
          const nodes = new Map(state.chainNodes);
          for (const [k, v] of nodes) nodes.set(k, { ...v, is_current: false });
          nodes.set(node.id, node);
          return {
            agentThinking: false,
            chainNodes: nodes,
            alerts: pushAlert(state.alerts, `✓ Ticket resolved by ${event.agent_id ?? 'Agent'} — Resolution available below`, node.id),
          };
        }

        case 'comment.added':
        case 'agent.comment_added': {
          const comment = event.payload as unknown as TicketComment;
          return {
            comments: [...state.comments, comment],
            alerts: pushAlert(
              state.alerts,
              `${comment.author} added a comment — View comment ↓`,
              'comments',
            ),
          };
        }

        default:
          return {};
      }
    }),

  addComment: (comment) =>
    set((state) => ({ comments: [...state.comments, comment] })),

  dismissAlert: (id) =>
    set((state) => ({ alerts: state.alerts.filter((a) => a.id !== id) })),
}));

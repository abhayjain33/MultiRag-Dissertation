import type { Ticket, RoutingDecision, RoutingEvent } from '../types.js';
import type { AgentConfig } from '../config/schemas.js';

type EscalateTrigger = 'timeout' | 'skill_output' | 'manual';

export class AgentRouter {
  constructor(private config: AgentConfig) {}

  evaluate(ticket: Ticket, trigger: EscalateTrigger, skillOutput?: Record<string, unknown>, skillId?: string): RoutingDecision {
    const routing = this.config.routing;
    if (!routing) return { action: 'handle', reason: 'No routing configured' };

    if (trigger === 'skill_output' && skillOutput) {
      // If this is the designated escalation skill, always escalate on completion
      if (routing.escalate_on_skill && skillId === routing.escalate_on_skill && routing.escalate_to) {
        return { action: 'escalate', target_agent: routing.escalate_to, reason: `${skillId} complete — escalating to ${routing.escalate_to}` };
      }
      // Legacy: escalate if the LLM output explicitly says ESCALATE
      if (routing.escalate_on_skill) {
        const decision = String(skillOutput['decision'] ?? '').toUpperCase();
        if (decision === 'ESCALATE' || JSON.stringify(skillOutput).toUpperCase().includes('"ESCALATE"')) {
          const target = routing.escalate_to;
          if (target) return { action: 'escalate', target_agent: target, reason: 'Skill flagged escalation' };
          return { action: 'escalate', reason: 'Skill flagged escalation' };
        }
      }
    }

    if (trigger === 'timeout' && routing.escalate_to) {
      const mins = routing.escalate_after_minutes ?? '?';
      return { action: 'escalate', target_agent: routing.escalate_to, reason: `Auto-escalated after ${String(mins)} minutes` };
    }

    return { action: 'handle', reason: 'Resolved by this agent' };
  }

  shouldAcceptFrom(sourceAgentId: string): boolean {
    const accepts = this.config.routing?.accepts_from ?? [];
    return accepts.length === 0 || accepts.includes(sourceAgentId);
  }

  makeRoutingEvent(ticketId: string, fromAgent: string | undefined, toAgent: string | undefined, decision: RoutingDecision): RoutingEvent {
    return {
      id: `re-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ticket_id: ticketId,
      ...(fromAgent !== undefined ? { from_agent: fromAgent } : {}),
      ...(toAgent !== undefined ? { to_agent: toAgent } : {}),
      action: decision.action,
      reason: decision.reason,
      created_at: new Date(),
    };
  }
}

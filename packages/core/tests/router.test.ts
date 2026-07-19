import { describe, it, expect } from 'vitest';
import { AgentRouter } from '../src/router/AgentRouter.js';
import type { AgentConfig } from '../src/config/schemas.js';
import type { Ticket } from '../src/types.js';

const ticket = { id: 'T1', title: 't', status: 'open', created_at: new Date() } as Ticket;

function router(routing: Record<string, unknown> | undefined): AgentRouter {
  return new AgentRouter({ routing } as unknown as AgentConfig);
}

describe('AgentRouter.evaluate', () => {
  it('handles when no routing is configured', () => {
    const d = router(undefined).evaluate(ticket, 'skill_output', {}, 'any');
    expect(d.action).toBe('handle');
  });

  it('escalates when the designated escalate_on_skill completes', () => {
    const r = router({ escalate_on_skill: 'classify', escalate_to: 'evidence' });
    const d = r.evaluate(ticket, 'skill_output', { decision: 'RESOLVE' }, 'classify');
    expect(d.action).toBe('escalate');
    expect(d.target_agent).toBe('evidence');
  });

  it('escalates when a non-designated skill explicitly decides ESCALATE', () => {
    const r = router({ escalate_on_skill: 'classify', escalate_to: 'evidence' });
    const d = r.evaluate(ticket, 'skill_output', { decision: 'escalate' }, 'other-skill');
    expect(d.action).toBe('escalate');
  });

  it('does NOT escalate when "escalate" only appears in a non-decision field', () => {
    const r = router({ escalate_on_skill: 'classify', escalate_to: 'evidence' });
    const d = r.evaluate(
      ticket,
      'skill_output',
      { decision: 'RESOLVE', summary: 'We should escalate this to L2 later' },
      'other-skill',
    );
    expect(d.action).toBe('handle');
  });

  it('escalates on timeout when escalate_to is set', () => {
    const r = router({ escalate_to: 'evidence', escalate_after_minutes: 5 });
    const d = r.evaluate(ticket, 'timeout');
    expect(d.action).toBe('escalate');
    expect(d.target_agent).toBe('evidence');
  });
});

describe('AgentRouter.shouldAcceptFrom', () => {
  it('accepts from anyone when accepts_from is empty', () => {
    expect(router({}).shouldAcceptFrom('whoever')).toBe(true);
  });

  it('accepts only listed source agents', () => {
    const r = router({ accepts_from: ['incident-understanding'] });
    expect(r.shouldAcceptFrom('incident-understanding')).toBe(true);
    expect(r.shouldAcceptFrom('random-agent')).toBe(false);
  });
});

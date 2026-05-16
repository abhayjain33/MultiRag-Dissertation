import type {
  TicketSummary,
  TicketDetailResponse,
  TicketComment,
  TicketChain,
} from '@/types/ticket';

const now = new Date();
const t = (offsetMs: number) => new Date(now.getTime() - offsetMs).toISOString();

export const MOCK_TICKETS: TicketSummary[] = [
  {
    id: 'TKT-0047',
    title: 'PnL discrepancy EUR/USD — missing delta hedge',
    status: 'l2',
    priority: 'P1',
    raised_by: 'J.Moreau',
    assigned_agent: 'prod-support',
    current_owner: 'dev-agent',
    created_at: t(9 * 60_000),
    updated_at: t(2 * 60_000),
  },
  {
    id: 'TKT-0046',
    title: 'GBP/JPY book shows stale Greeks after 14:00 roll',
    status: 'resolved',
    priority: 'P2',
    raised_by: 'S.Chen',
    assigned_agent: 'prod-support',
    current_owner: 'prod-support',
    created_at: t(45 * 60_000),
    updated_at: t(30 * 60_000),
    resolved_at: t(30 * 60_000),
  },
  {
    id: 'TKT-0045',
    title: 'Risk Engine latency spike — P95 > 2000ms',
    status: 'resolved',
    priority: 'P2',
    raised_by: 'M.Patel',
    assigned_agent: 'trader-support',
    current_owner: 'dev-agent',
    created_at: t(2 * 3600_000),
    updated_at: t(90 * 60_000),
    resolved_at: t(90 * 60_000),
  },
  {
    id: 'TKT-0044',
    title: 'Trade blotter not refreshing — WebSocket disconnect',
    status: 'open',
    priority: 'P3',
    raised_by: 'R.Hoffman',
    assigned_agent: 'trader-support',
    current_owner: 'trader-support',
    created_at: t(5 * 60_000),
    updated_at: t(5 * 60_000),
  },
  {
    id: 'TKT-0043',
    title: 'Margin call notification not sent for account ACC-7821',
    status: 'l1',
    priority: 'P1',
    raised_by: 'K.Williams',
    assigned_agent: 'prod-support',
    current_owner: 'prod-support',
    created_at: t(12 * 60_000),
    updated_at: t(3 * 60_000),
  },
];

const MOCK_CHAIN: TicketChain = {
  participants: [
    { id: 'raiser', label: 'J.Moreau', type: 'raiser' },
    { id: 'trader-support', label: 'Trader Support', type: 'agent' },
    { id: 'prod-support', label: 'PS Agent', type: 'agent' },
    { id: 'dev-agent', label: 'Dev Agent', type: 'agent' },
  ],
  rows: [
    {
      kind: 'handoff',
      handoff: {
        id: 'h1',
        from_participant: 'raiser',
        to_participant: 'trader-support',
        timestamp: t(9 * 60_000),
        label: 'Ticket raised',
      },
    },
    {
      kind: 'node',
      node: {
        id: 'n1',
        participant_id: 'trader-support',
        type: 'kb_lookup',
        timestamp: t(8 * 60_000 + 57_000),
        summary: '3 articles searched — no direct match',
        is_current: false,
        payload: {
          sources_searched: ['trading-ops/', 'Confluence'],
          query: 'EUR/USD PnL discrepancy delta hedge missing',
          results: [
            { source: 'cache-miss-resolution.md', score: 0.82, match: 'partial' },
            { source: 'pnl-reconciliation.md', score: 0.71, match: 'partial' },
            { source: 'hedge-booking-failure.md', score: 0.68, match: 'partial' },
          ],
          decision: 'No direct resolution found → proceeding to L1 Analysis',
        },
      },
    },
    {
      kind: 'handoff',
      handoff: {
        id: 'h2',
        from_participant: 'trader-support',
        to_participant: 'prod-support',
        timestamp: t(8 * 60_000 + 30_000),
        label: 'Escalated to PS',
      },
    },
    {
      kind: 'node',
      node: {
        id: 'n2',
        participant_id: 'prod-support',
        type: 'l1_analysis',
        timestamp: t(7 * 60_000 + 57_000),
        summary: 'P1 — Cache miss on position update · ESCALATE',
        is_current: false,
        payload: {
          severity: 'P1',
          summary_plain:
            'A hedge leg booking failure was detected. The position update for your EUR/USD book did not complete due to a system timeout. The production support team is investigating.',
          failure_component: 'Risk Engine → GemFire Cache',
          matched_failure_mode: 'Cache Miss on Position Update',
          evidence: [
            {
              source: 'LOG',
              relevance: 'high',
              excerpt: 'ERR RiskEngine: trade TRD-884432 position update failed — downstream timeout 09:41:55',
            },
            {
              source: 'LOG',
              relevance: 'high',
              excerpt: "GemFire region 'positions' cache miss bookId EUR-01  09:41:55",
            },
            {
              source: 'KB',
              relevance: 'medium',
              excerpt: 'hedge-booking-failure.md — escalation recommended',
            },
          ],
          recommended_steps: [
            "Check GemFire region 'positions' TTL configuration",
            'Verify Risk Engine downstream ACK timeout setting',
            'Check if trade TRD-884432 exists in HEDGE_LEGS table',
          ],
          decision: 'ESCALATE',
          runbook_reference: 'runbooks/hedge-booking-failure.md',
        } satisfies import('@/types/ticket').L1AnalysisPayload,
      },
    },
    {
      kind: 'handoff',
      handoff: {
        id: 'h3',
        from_participant: 'prod-support',
        to_participant: 'dev-agent',
        timestamp: t(7 * 60_000 + 42_000),
        label: 'Escalated to Dev',
      },
    },
    {
      kind: 'node',
      node: {
        id: 'n3',
        participant_id: 'dev-agent',
        type: 'l2_analysis',
        timestamp: t(6 * 60_000 + 58_000),
        summary: 'L2 analysis in progress…',
        is_current: true,
        payload: {
          summary_plain: 'Root cause identified. The development team is preparing a fix. Estimated resolution: 15–20 minutes.',
          db_query: "SELECT * FROM HEDGE_LEGS WHERE trade_id = 'TRD-884432'",
          db_result: '0 rows returned. Booking incomplete.',
          code_reference: 'HedgeBookingService.java:241 — Null check missing on downstream ACK timeout path. Race condition between GemFire TTL expiry and hedge ACK.',
          kg_traversal: 'svc-risk-engine → depends_on → svc-gemfire\nsvc-risk-engine → can_cause → err-cache-miss\nTrigger condition: GemFire TTL expiry during position update ✓',
          root_cause: 'Race condition. GemFire position region TTL (300s) expired before the hedge booking ACK was received. Position update rolled back silently without error propagation to the trader UI.',
          fix_options: [
            'Option A (immediate): Increase GemFire TTL to 900s',
            'Option B (permanent): Add retry + explicit error on ACK timeout in HedgeBookingService.java:241',
          ],
          in_progress: true,
        } satisfies import('@/types/ticket').L2AnalysisPayload,
      },
    },
  ],
};

const MOCK_COMMENTS: TicketComment[] = [
  {
    id: 'c1',
    ticket_id: 'TKT-0047',
    author: 'J.Moreau',
    author_type: 'human',
    role: 'trader',
    content:
      'The issue started around 14:30 yesterday as well but resolved itself. This time it hasn\'t recovered.',
    created_at: t(7 * 60_000 + 30_000),
  },
  {
    id: 'c2',
    ticket_id: 'TKT-0047',
    author: 'PS Agent',
    author_type: 'agent',
    content: "Noted — checking yesterday's logs for 14:30 window.",
    created_at: t(7 * 60_000 + 25_000),
  },
  {
    id: 'c3',
    ticket_id: 'TKT-0047',
    author: 'Dev Agent',
    author_type: 'agent',
    content:
      'Confirmed same pattern in yesterday\'s logs at 14:28:41. Consistent with the GemFire TTL hypothesis.',
    created_at: t(6 * 60_000 + 15_000),
  },
];

export const MOCK_TICKET_DETAIL: TicketDetailResponse = {
  ticket: MOCK_TICKETS[0]!,
  chain: MOCK_CHAIN,
  comments: MOCK_COMMENTS,
};

export function getMockTicketDetail(id: string): TicketDetailResponse | null {
  if (id === 'TKT-0047') return MOCK_TICKET_DETAIL;
  const ticket = MOCK_TICKETS.find((t) => t.id === id);
  if (!ticket) return null;
  return {
    ticket,
    chain: { participants: [{ id: 'raiser', label: ticket.raised_by, type: 'raiser' }], rows: [] },
    comments: [],
  };
}

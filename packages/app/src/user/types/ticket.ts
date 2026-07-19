// ── Roles ─────────────────────────────────────────────────────────────────────

export type TicketRole = 'trader' | 'support' | 'dev' | 'full';

// ── Core ticket types ─────────────────────────────────────────────────────────

export type TicketStatus = 'open' | 'kb_lookup' | 'l1' | 'l2' | 'resolved';
export type TicketPriority = 'P1' | 'P2' | 'P3' | 'P4';

export interface TicketSummary {
  id: string;
  title: string;
  status: TicketStatus;
  priority: TicketPriority;
  raised_by: string;
  assigned_agent: string;
  current_owner: string;
  created_at: string;
  updated_at: string;
  resolved_at?: string | undefined;
}

export interface TicketComment {
  id: string;
  ticket_id: string;
  author: string;
  author_type: 'human' | 'agent';
  role?: string | undefined;
  content: string;
  created_at: string;
}

// ── WebSocket event types ─────────────────────────────────────────────────────

export type TicketEventType =
  | 'ticket.created'
  | 'ticket.status_changed'
  | 'ticket.escalated'
  | 'ticket.resolved'
  | 'ticket.chain_updated'
  | 'agent.kb_lookup_complete'
  | 'agent.skill_complete'
  | 'agent.thinking'
  | 'comment.added'
  | 'agent.comment_added';

export interface TicketWSEvent {
  type: TicketEventType;
  ticket_id: string;
  agent_id?: string | undefined;
  payload: Record<string, unknown>;
  timestamp: string;
}

// ── Chain visualisation types ─────────────────────────────────────────────────

export type ParticipantType = 'raiser' | 'agent';

export interface ChainParticipant {
  id: string;
  label: string;
  type: ParticipantType;
}

export type ChainNodeType =
  | 'ticket_raised'
  | 'kb_lookup'
  | 'l1_analysis'
  | 'l2_analysis'
  | 'resolution'
  | 'acknowledged'
  | 'thinking';

export interface KBResult {
  source: string;
  score: number;
  match: 'direct' | 'partial' | 'none';
}

export interface EvidenceItem {
  source: 'LOG' | 'KB' | 'KG';
  relevance: 'high' | 'medium' | 'low';
  excerpt: string;
}

export interface KBLookupPayload {
  sources_searched: string[];
  query: string;
  results: KBResult[];
  decision: string;
}

export interface L1AnalysisPayload {
  severity: TicketPriority;
  summary_plain: string;
  failure_component?: string | undefined;
  matched_failure_mode?: string | undefined;
  evidence: EvidenceItem[];
  recommended_steps: string[];
  decision: 'RESOLVE' | 'ESCALATE';
  runbook_reference?: string | undefined;
}

export interface L2AnalysisPayload {
  summary_plain: string;
  db_query?: string | undefined;
  db_result?: string | undefined;
  code_reference?: string | undefined;
  kg_traversal?: string | undefined;
  root_cause?: string | undefined;
  fix_options?: string[] | undefined;
  in_progress: boolean;
}

export interface ResolutionPayload {
  root_cause_summary: string;
  action_taken: string;
  permanent_fix?: string | undefined;
  l1_report_id?: string | undefined;
  l2_report_id?: string | undefined;
  runbook_reference?: string | undefined;
}

export type ChainNodePayload =
  | KBLookupPayload
  | L1AnalysisPayload
  | L2AnalysisPayload
  | ResolutionPayload
  | Record<string, unknown>;

export interface ChainNode {
  id: string;
  participant_id: string;
  type: ChainNodeType;
  timestamp: string;
  summary: string;
  payload: ChainNodePayload;
  is_current: boolean;
}

export interface ChainHandoff {
  id: string;
  from_participant: string;
  to_participant: string;
  timestamp: string;
  label: string;
}

export type ChainRow =
  | { kind: 'node'; node: ChainNode }
  | { kind: 'handoff'; handoff: ChainHandoff };

export interface TicketChain {
  participants: ChainParticipant[];
  rows: ChainRow[];
}

// ── Attachments ───────────────────────────────────────────────────────────────

export interface TicketAttachment {
  id: string;
  ticket_id: string;
  filename: string;
  content_type: string;
  size: number;
  url: string;
  uploaded_at: string;
}

// ── Alert banner ──────────────────────────────────────────────────────────────

export interface AlertBannerItem {
  id: string;
  message: string;
  anchor?: string | undefined;
}

// ── API response shapes ───────────────────────────────────────────────────────

export interface TicketsListResponse {
  tickets: TicketSummary[];
  total: number;
}

export interface TicketDetailResponse {
  ticket: TicketSummary;
  chain: TicketChain;
  comments: TicketComment[];
}

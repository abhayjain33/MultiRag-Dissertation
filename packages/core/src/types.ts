export type AgentHealth = 'starting' | 'ready' | 'degraded' | 'stopped';
export type TicketStatus = 'open' | 'kb_lookup' | 'l1' | 'l2' | 'resolved';
export type TicketPriority = 'P1' | 'P2' | 'P3' | 'P4';
export type LLMProviderName = 'anthropic' | 'openai' | 'azure' | 'ollama';
export type KnowledgeSourceType = 'markdown' | 'folder' | 'knowledge_graph';
export type SkillTrigger = 'explicit' | 'on_ticket' | 'on_escalation' | 'on_message';
export type SkillOutputFormat = 'structured' | 'markdown' | 'plain';
export type IndexStrategy = 'tail' | 'full' | 'incremental';
export type RefreshStrategy = 'on_change' | 'hourly' | 'daily' | 'manual' | 'live';
export type StoreType = 'sqlite' | 'postgres';
export type InterfaceMode = 'chat' | 'api' | 'both';
export type MCPAuthType = 'bearer' | 'basic' | 'none';
export type TicketSystemType = 'internal' | 'jira' | 'servicenow';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogFormat = 'json' | 'text';
export type VectorStore = 'local' | 'chroma' | 'qdrant';
export type KGFormat = 'graphrag' | 'custom';

// ── LLM types ─────────────────────────────────────────────────────────────────

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_results?: ToolResult[];
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  tool_call_id: string;
  content: string;
  is_error?: boolean;
}

export interface Tool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ChatOptions {
  temperature?: number;
  max_tokens?: number;
  stop_sequences?: string[];
  /**
   * Request the model return a single JSON object (OpenAI-compatible
   * `response_format: { type: "json_object" }`). Adapters that don't support it
   * ignore this flag. Cannot be combined with tool calls in the same request.
   */
  json_mode?: boolean;
}

export interface LLMChunk {
  type: 'text' | 'tool_call' | 'tool_result' | 'done';
  text?: string;
  tool_call?: ToolCall;
  tool_result?: ToolResult;
  usage?: { input_tokens: number; output_tokens: number };
}

// ── Knowledge types ────────────────────────────────────────────────────────────

export interface RetrievedChunk {
  content: string;
  source_file: string;
  heading_path: string[];
  score: number;
  metadata: Record<string, unknown>;
}

export interface Entity {
  id: string;
  type: string;
  label: string;
  properties: Record<string, unknown>;
}

export interface Relationship {
  from: string;
  to: string;
  type: string;
  properties: Record<string, unknown>;
}

export interface Subgraph {
  entities: Entity[];
  relationships: Relationship[];
}

export interface GraphRAGResult {
  matched_entity: Entity;
  related_entities: Entity[];
  relationships: Relationship[];
  context_text: string;
}

export interface RAGOptions {
  topK: number;
  minScore: number;
  includeMetadata: boolean;
  timeRangeFilter?: { from: Date; to: Date } | undefined;
}

export interface RAGContext {
  chunks: RetrievedChunk[];
  graph_result?: GraphRAGResult | undefined;
  formatted_context: string;
  sources_used: string[];
  retrieval_time_ms: number;
}

// ── Skill types ────────────────────────────────────────────────────────────────

export interface SkillResult {
  skill_id: string;
  success: boolean;
  output: Record<string, unknown>;
  raw_llm_response: string;
  execution_time_ms: number;
  rag_context_used: RAGContext;
  error?: string;
}

// ── Ticket / routing types ─────────────────────────────────────────────────────

export interface Ticket {
  id: string;
  title: string;
  description?: string | undefined;
  status: TicketStatus;
  priority?: TicketPriority | undefined;
  raised_by?: string | undefined;
  assigned_agent?: string | undefined;
  created_at: Date;
  updated_at?: Date | undefined;
  resolved_at?: Date | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface RoutingDecision {
  action: 'handle' | 'escalate' | 'reject';
  target_agent?: string | undefined;
  reason: string;
}

export interface RoutingEvent {
  id: string;
  ticket_id: string;
  from_agent?: string | undefined;
  to_agent?: string | undefined;
  action: string;
  reason: string;
  created_at: Date;
}

// ── Agent status ───────────────────────────────────────────────────────────────

export interface AgentStatus {
  id: string;
  display_name: string;
  health: AgentHealth;
  active_sessions: number;
  tickets_today: number;
}

// ── Chain tracking (runtime) ────────────────────────────────────────────────────

export type ChainNodeType =
  | 'ticket_raised'
  | 'kb_lookup'
  | 'l1_analysis'
  | 'l2_analysis'
  | 'resolution'
  | 'acknowledged'
  | 'thinking';

export interface AgentChainNode {
  id: string;
  ticket_id: string;
  participant_id: string;
  participant_label: string;
  participant_type: 'raiser' | 'agent';
  node_type: ChainNodeType;
  timestamp: string;
  summary: string;
  payload: Record<string, unknown>;
  is_current: boolean;
}

export interface AgentChainHandoff {
  id: string;
  ticket_id: string;
  from_participant: string;
  from_label: string;
  to_participant: string;
  to_label: string;
  timestamp: string;
  label: string;
}

// ── WebSocket event (mirrors TicketWSEvent in packages/ui) ─────────────────────

export interface AgentWSEvent {
  type: string;
  ticket_id: string;
  agent_id?: string | undefined;
  payload: Record<string, unknown>;
  timestamp: string;
}

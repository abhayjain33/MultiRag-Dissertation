import { create } from 'zustand';

export type LLMProvider = 'anthropic' | 'openai' | 'azure' | 'ollama';
export type VectorStore = 'local' | 'chroma' | 'qdrant';
export type KnowledgeSourceType = 'markdown' | 'folder' | 'knowledge_graph';
export type SkillTrigger = 'explicit' | 'on_ticket' | 'on_escalation' | 'on_message';
export type SkillOutputFormat = 'structured' | 'markdown' | 'plain';
export type InterfaceMode = 'chat' | 'api' | 'both';
export type MCPAuthType = 'bearer' | 'basic' | 'none';

export interface KnowledgeSourceForm {
  _key: string;
  id: string;
  type: KnowledgeSourceType;
  path: string;
  glob: string;
  refresh: string;
  watch: boolean;
  filters_include: string;
  filters_exclude: string;
  index_strategy: string;
  tail_lines: string;
  format: string;
  traversal_depth: string;
  metadata_category: string;
  metadata_priority: string;
}

export interface SkillInputForm {
  name: string;
  type: string;
  required: boolean;
}

export interface SkillForm {
  _key: string;
  id: string;
  name: string;
  description: string;
  trigger: SkillTrigger;
  prompt_template: string;
  inputs: SkillInputForm[];
  output_format: SkillOutputFormat;
  output_schema: string;
}

export interface MCPForm {
  _key: string;
  id: string;
  name: string;
  url: string;
  auth_type: MCPAuthType;
  auth_token: string;
  enabled: boolean;
  tools: string;
}

export interface AgentFormState {
  name: string;
  display_name: string;
  description: string;
  version: string;
  icon: string;
  llm_provider: LLMProvider;
  llm_model: string;
  llm_api_key: string;
  llm_temperature: number;
  llm_max_tokens: number;
  llm_system_prompt: string;
  llm_azure_endpoint: string;
  llm_azure_deployment: string;
  llm_azure_api_version: string;
  llm_ollama_base_url: string;
  knowledge_embedding_model: string;
  knowledge_vector_store: VectorStore;
  knowledge_vector_store_path: string;
  knowledge_sources: KnowledgeSourceForm[];
  skills: SkillForm[];
  mcps: MCPForm[];
  routing_escalate_to: string;
  routing_escalate_after_minutes: string;
  routing_escalate_on_skill: string;
  routing_accepts_from: string;
  routing_ticket_system_type: string;
  interface_mode: InterfaceMode;
  interface_api_port: string;
  interface_session_timeout: string;
}

export const DEFAULT_FORM: AgentFormState = {
  name: '', display_name: '', description: '', version: '1.0.0', icon: '🤖',
  llm_provider: 'anthropic', llm_model: 'claude-sonnet-4-6',
  llm_api_key: '${ANTHROPIC_API_KEY}', llm_temperature: 0.2, llm_max_tokens: 4096,
  llm_system_prompt: '', llm_azure_endpoint: '', llm_azure_deployment: '',
  llm_azure_api_version: '2024-02-01', llm_ollama_base_url: 'http://localhost:11434',
  knowledge_embedding_model: 'text-embedding-3-small', knowledge_vector_store: 'local',
  knowledge_vector_store_path: '', knowledge_sources: [], skills: [], mcps: [],
  routing_escalate_to: '', routing_escalate_after_minutes: '', routing_escalate_on_skill: '',
  routing_accepts_from: '', routing_ticket_system_type: 'internal',
  interface_mode: 'chat', interface_api_port: '', interface_session_timeout: '60',
};

function key() { return `k-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`; }

export function blankSource(): KnowledgeSourceForm {
  return { _key: key(), id: '', type: 'markdown', path: './', glob: '**/*.md', refresh: 'on_change', watch: false, filters_include: '', filters_exclude: '', index_strategy: 'full', tail_lines: '5000', format: 'graphrag', traversal_depth: '3', metadata_category: '', metadata_priority: '' };
}
export function blankSkill(): SkillForm {
  return { _key: key(), id: '', name: '', description: '', trigger: 'explicit', prompt_template: '', inputs: [], output_format: 'plain', output_schema: '' };
}
export function blankMCP(): MCPForm {
  return { _key: key(), id: '', name: '', url: '', auth_type: 'bearer', auth_token: '', enabled: true, tools: '' };
}

interface Actions {
  set: <K extends keyof AgentFormState>(k: K, v: AgentFormState[K]) => void;
  merge: (patch: Partial<AgentFormState>) => void;
  reset: () => void;
  addSource: () => void; removeSource: (i: number) => void; patchSource: (i: number, p: Partial<KnowledgeSourceForm>) => void;
  addSkill: () => void; removeSkill: (i: number) => void; patchSkill: (i: number, p: Partial<SkillForm>) => void;
  addSkillInput: (si: number) => void; removeSkillInput: (si: number, ii: number) => void; patchSkillInput: (si: number, ii: number, p: Partial<SkillInputForm>) => void;
  addMCP: () => void; removeMCP: (i: number) => void; patchMCP: (i: number, p: Partial<MCPForm>) => void;
}

export const useStore = create<AgentFormState & Actions>((set) => ({
  ...DEFAULT_FORM,
  set: (k, v) => set((s) => ({ ...s, [k]: v })),
  merge: (patch) => set((s) => ({ ...s, ...patch })),
  reset: () => set(() => ({ ...DEFAULT_FORM })),
  addSource: () => set((s) => ({ knowledge_sources: [...s.knowledge_sources, blankSource()] })),
  removeSource: (i) => set((s) => ({ knowledge_sources: s.knowledge_sources.filter((_, j) => j !== i) })),
  patchSource: (i, p) => set((s) => ({ knowledge_sources: s.knowledge_sources.map((x, j) => j === i ? { ...x, ...p } : x) })),
  addSkill: () => set((s) => ({ skills: [...s.skills, blankSkill()] })),
  removeSkill: (i) => set((s) => ({ skills: s.skills.filter((_, j) => j !== i) })),
  patchSkill: (i, p) => set((s) => ({ skills: s.skills.map((x, j) => j === i ? { ...x, ...p } : x) })),
  addSkillInput: (si) => set((s) => ({ skills: s.skills.map((sk, i) => i === si ? { ...sk, inputs: [...sk.inputs, { name: '', type: 'string', required: true }] } : sk) })),
  removeSkillInput: (si, ii) => set((s) => ({ skills: s.skills.map((sk, i) => i === si ? { ...sk, inputs: sk.inputs.filter((_, j) => j !== ii) } : sk) })),
  patchSkillInput: (si, ii, p) => set((s) => ({ skills: s.skills.map((sk, i) => i === si ? { ...sk, inputs: sk.inputs.map((inp, j) => j === ii ? { ...inp, ...p } : inp) } : sk) })),
  addMCP: () => set((s) => ({ mcps: [...s.mcps, blankMCP()] })),
  removeMCP: (i) => set((s) => ({ mcps: s.mcps.filter((_, j) => j !== i) })),
  patchMCP: (i, p) => set((s) => ({ mcps: s.mcps.map((x, j) => j === i ? { ...x, ...p } : x) })),
}));

import yaml from 'js-yaml';
import type { AgentFormState, KnowledgeSourceForm, SkillForm, MCPForm } from '@/store/agentBuilderStore';
import { blankSource, blankSkill, blankMCP } from '@/store/agentBuilderStore';

// ── Form → YAML ───────────────────────────────────────────────────────────────

export function toYamlString(s: AgentFormState): string {
  const obj: Record<string, unknown> = {};

  obj['agent'] = omitEmpty({ name: s.name || 'my-agent', display_name: s.display_name || 'My Agent', description: s.description, version: s.version, icon: s.icon });

  const llm: Record<string, unknown> = omitEmpty({ provider: s.llm_provider, model: s.llm_model, api_key: s.llm_api_key, temperature: s.llm_temperature, max_tokens: s.llm_max_tokens, system_prompt: s.llm_system_prompt || undefined });
  if (s.llm_provider === 'azure') { if (s.llm_azure_endpoint) llm['azure_endpoint'] = s.llm_azure_endpoint; if (s.llm_azure_deployment) llm['azure_deployment'] = s.llm_azure_deployment; if (s.llm_azure_api_version) llm['azure_api_version'] = s.llm_azure_api_version; }
  if (s.llm_provider === 'ollama' && s.llm_ollama_base_url) llm['ollama_base_url'] = s.llm_ollama_base_url;
  obj['llm'] = llm;

  if (s.knowledge_sources.length > 0) {
    obj['knowledge'] = { embedding_model: s.knowledge_embedding_model, vector_store: s.knowledge_vector_store, ...(s.knowledge_vector_store_path ? { vector_store_path: s.knowledge_vector_store_path } : {}), sources: s.knowledge_sources.map(sourceToYaml) };
  }
  if (s.skills.length > 0) obj['skills'] = s.skills.map(skillToYaml);
  if (s.mcps.length > 0) obj['mcps'] = s.mcps.map(mcpToYaml);

  if (s.routing_escalate_to || s.routing_accepts_from || s.routing_escalate_on_skill) {
    const r: Record<string, unknown> = {};
    if (s.routing_escalate_to) r['escalate_to'] = s.routing_escalate_to;
    if (s.routing_escalate_after_minutes) r['escalate_after_minutes'] = Number(s.routing_escalate_after_minutes);
    if (s.routing_escalate_on_skill) r['escalate_on_skill'] = s.routing_escalate_on_skill;
    if (s.routing_accepts_from) r['accepts_from'] = s.routing_accepts_from.split(',').map((v) => v.trim()).filter(Boolean);
    if (s.routing_ticket_system_type) r['ticket_system'] = { type: s.routing_ticket_system_type };
    obj['routing'] = r;
  }

  if (s.interface_mode !== 'chat' || s.interface_api_port || s.interface_session_timeout !== '60') {
    const iface: Record<string, unknown> = { mode: s.interface_mode };
    if (s.interface_api_port) iface['api_port'] = Number(s.interface_api_port);
    if (s.interface_session_timeout) iface['session_timeout_minutes'] = Number(s.interface_session_timeout);
    obj['interface'] = iface;
  }

  try { return yaml.dump(obj, { lineWidth: 100, forceQuotes: false }); } catch { return ''; }
}

function sourceToYaml(src: KnowledgeSourceForm): Record<string, unknown> {
  const base: Record<string, unknown> = { id: src.id || src._key, type: src.type, path: src.path };
  if (src.type === 'markdown') {
    if (src.glob) base['glob'] = src.glob;
    base['refresh'] = src.refresh;
    const meta: Record<string, string> = {};
    if (src.metadata_category) meta['category'] = src.metadata_category;
    if (src.metadata_priority) meta['priority'] = src.metadata_priority;
    if (Object.keys(meta).length) base['metadata'] = meta;
  } else if (src.type === 'folder') {
    base['watch'] = src.watch;
    const inc = src.filters_include.split(',').map((v) => v.trim()).filter(Boolean);
    const exc = src.filters_exclude.split(',').map((v) => v.trim()).filter(Boolean);
    if (inc.length || exc.length) base['filters'] = { include: inc, exclude: exc };
    base['index_strategy'] = src.index_strategy;
    if (src.index_strategy === 'tail' && src.tail_lines) base['tail_lines'] = Number(src.tail_lines);
    base['refresh'] = src.refresh;
  } else {
    base['format'] = src.format;
    if (src.traversal_depth) base['traversal_depth'] = Number(src.traversal_depth);
    base['refresh'] = src.refresh;
  }
  return base;
}

function skillToYaml(sk: SkillForm): Record<string, unknown> {
  const obj: Record<string, unknown> = { id: sk.id || sk._key, name: sk.name, trigger: sk.trigger, prompt_template: sk.prompt_template };
  if (sk.description) obj['description'] = sk.description;
  if (sk.inputs.length) obj['inputs'] = sk.inputs.map((i) => ({ name: i.name, type: i.type, required: i.required }));
  const out: Record<string, unknown> = { format: sk.output_format };
  if (sk.output_schema) out['schema'] = sk.output_schema;
  obj['output'] = out;
  return obj;
}

function mcpToYaml(mcp: MCPForm): Record<string, unknown> {
  const obj: Record<string, unknown> = { id: mcp.id || mcp._key, name: mcp.name, url: mcp.url, auth_type: mcp.auth_type, enabled: mcp.enabled };
  if (mcp.auth_token) obj['auth_token'] = mcp.auth_token;
  const tools = mcp.tools.split(',').map((v) => v.trim()).filter(Boolean);
  if (tools.length) obj['tools'] = tools;
  return obj;
}

function omitEmpty(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== '' && v !== undefined));
}

// ── YAML → Form ───────────────────────────────────────────────────────────────

export function fromYamlString(raw: string): { patch: Partial<AgentFormState>; error: string | null } {
  let parsed: unknown;
  try { parsed = yaml.load(raw); } catch (e) { return { patch: {}, error: `YAML error: ${e instanceof Error ? e.message : String(e)}` }; }
  if (typeof parsed !== 'object' || !parsed) return { patch: {}, error: 'Expected a YAML object (mapping) at the top level' };
  const p = parsed as Record<string, unknown>;
  const patch: Partial<AgentFormState> = {};
  const ag = p['agent'] as Record<string, unknown> | undefined;
  if (ag) { s(ag, 'name', (v) => { patch.name = v; }); s(ag, 'display_name', (v) => { patch.display_name = v; }); s(ag, 'description', (v) => { patch.description = v; }); s(ag, 'version', (v) => { patch.version = v; }); s(ag, 'icon', (v) => { patch.icon = v; }); }
  const llm = p['llm'] as Record<string, unknown> | undefined;
  if (llm) {
    s(llm, 'provider', (v) => { patch.llm_provider = v as AgentFormState['llm_provider']; });
    s(llm, 'model', (v) => { patch.llm_model = v; });
    s(llm, 'api_key', (v) => { patch.llm_api_key = v; });
    n(llm, 'temperature', (v) => { patch.llm_temperature = v; });
    n(llm, 'max_tokens', (v) => { patch.llm_max_tokens = v; });
    s(llm, 'system_prompt', (v) => { patch.llm_system_prompt = v; });
    s(llm, 'azure_endpoint', (v) => { patch.llm_azure_endpoint = v; });
    s(llm, 'azure_deployment', (v) => { patch.llm_azure_deployment = v; });
    s(llm, 'azure_api_version', (v) => { patch.llm_azure_api_version = v; });
    s(llm, 'ollama_base_url', (v) => { patch.llm_ollama_base_url = v; });
  }
  const kn = p['knowledge'] as Record<string, unknown> | undefined;
  if (kn) {
    s(kn, 'embedding_model', (v) => { patch.knowledge_embedding_model = v; });
    s(kn, 'vector_store', (v) => { patch.knowledge_vector_store = v as AgentFormState['knowledge_vector_store']; });
    s(kn, 'vector_store_path', (v) => { patch.knowledge_vector_store_path = v; });
    if (Array.isArray(kn['sources'])) patch.knowledge_sources = (kn['sources'] as unknown[]).map(parseSource);
  }
  if (Array.isArray(p['skills'])) patch.skills = (p['skills'] as unknown[]).map(parseSkill);
  if (Array.isArray(p['mcps'])) patch.mcps = (p['mcps'] as unknown[]).map(parseMCP);
  const rt = p['routing'] as Record<string, unknown> | undefined;
  if (rt) {
    s(rt, 'escalate_to', (v) => { patch.routing_escalate_to = v; });
    n(rt, 'escalate_after_minutes', (v) => { patch.routing_escalate_after_minutes = String(v); });
    s(rt, 'escalate_on_skill', (v) => { patch.routing_escalate_on_skill = v; });
    if (Array.isArray(rt['accepts_from'])) patch.routing_accepts_from = (rt['accepts_from'] as string[]).join(', ');
    const ts = rt['ticket_system'] as Record<string, unknown> | undefined;
    if (ts) s(ts, 'type', (v) => { patch.routing_ticket_system_type = v; });
  }
  const iface = p['interface'] as Record<string, unknown> | undefined;
  if (iface) {
    s(iface, 'mode', (v) => { patch.interface_mode = v as AgentFormState['interface_mode']; });
    n(iface, 'api_port', (v) => { patch.interface_api_port = String(v); });
    n(iface, 'session_timeout_minutes', (v) => { patch.interface_session_timeout = String(v); });
  }
  return { patch, error: null };
}

function s(obj: Record<string, unknown>, k: string, fn: (v: string) => void) { if (typeof obj[k] === 'string') fn(obj[k] as string); }
function n(obj: Record<string, unknown>, k: string, fn: (v: number) => void) { if (typeof obj[k] === 'number') fn(obj[k] as number); }
function str(v: unknown, fb = '') { return typeof v === 'string' ? v : fb; }

function parseSource(raw: unknown): KnowledgeSourceForm {
  const x = (raw ?? {}) as Record<string, unknown>;
  const f = x['filters'] as Record<string, unknown> | undefined;
  return {
    ...blankSource(),
    id: str(x['id']), type: str(x['type'], 'markdown') as KnowledgeSourceForm['type'],
    path: str(x['path'], './'), glob: str(x['glob'], '**/*.md'), refresh: str(x['refresh'], 'on_change'),
    watch: x['watch'] === true, index_strategy: str(x['index_strategy'], 'full'),
    tail_lines: x['tail_lines'] != null ? String(x['tail_lines']) : '5000',
    format: str(x['format'], 'graphrag'), traversal_depth: x['traversal_depth'] != null ? String(x['traversal_depth']) : '3',
    filters_include: Array.isArray(f?.['include']) ? (f!['include'] as string[]).join(', ') : '',
    filters_exclude: Array.isArray(f?.['exclude']) ? (f!['exclude'] as string[]).join(', ') : '',
    metadata_category: str((x['metadata'] as Record<string, unknown> | undefined)?.['category']),
    metadata_priority: str((x['metadata'] as Record<string, unknown> | undefined)?.['priority']),
  };
}

function parseSkill(raw: unknown): SkillForm {
  const x = (raw ?? {}) as Record<string, unknown>;
  const out = (x['output'] ?? {}) as Record<string, unknown>;
  return {
    ...blankSkill(), id: str(x['id']), name: str(x['name']), description: str(x['description']),
    trigger: str(x['trigger'], 'explicit') as SkillForm['trigger'], prompt_template: str(x['prompt_template']),
    inputs: Array.isArray(x['inputs']) ? (x['inputs'] as Record<string, unknown>[]).map((i) => ({ name: str(i['name']), type: str(i['type'], 'string'), required: i['required'] !== false })) : [],
    output_format: str(out['format'], 'plain') as SkillForm['output_format'], output_schema: str(out['schema']),
  };
}

function parseMCP(raw: unknown): MCPForm {
  const x = (raw ?? {}) as Record<string, unknown>;
  return { ...blankMCP(), id: str(x['id']), name: str(x['name']), url: str(x['url']), auth_type: str(x['auth_type'], 'bearer') as MCPForm['auth_type'], auth_token: str(x['auth_token']), enabled: x['enabled'] !== false, tools: Array.isArray(x['tools']) ? (x['tools'] as string[]).join(', ') : '' };
}

// ── Validation ────────────────────────────────────────────────────────────────

export interface Issue { section: string; message: string; }

export function validate(s: AgentFormState): Issue[] {
  const issues: Issue[] = [];
  if (!s.name) issues.push({ section: 'Agent Info', message: 'Agent name is required' });
  if (s.name && !/^[a-z0-9-]+$/.test(s.name)) issues.push({ section: 'Agent Info', message: 'Name must be lowercase letters, numbers and hyphens only' });
  if (!s.display_name) issues.push({ section: 'Agent Info', message: 'Display name is required' });
  if (!s.llm_model) issues.push({ section: 'LLM', message: 'Model name is required' });
  if (['anthropic', 'openai', 'azure'].includes(s.llm_provider) && !s.llm_api_key) issues.push({ section: 'LLM', message: `API key required for ${s.llm_provider}` });
  if (s.llm_provider === 'azure' && !s.llm_azure_endpoint) issues.push({ section: 'LLM', message: 'Azure endpoint is required' });
  if (s.llm_provider === 'ollama' && !s.llm_ollama_base_url) issues.push({ section: 'LLM', message: 'Ollama base URL is required' });
  s.knowledge_sources.forEach((src, i) => { if (!src.path) issues.push({ section: 'Knowledge', message: `Source ${i + 1}: path is required` }); });
  s.skills.forEach((sk, i) => {
    if (!sk.name) issues.push({ section: 'Skills', message: `Skill ${i + 1}: name is required` });
    if (!sk.prompt_template) issues.push({ section: 'Skills', message: `Skill ${i + 1}: prompt template path is required` });
  });
  s.mcps.forEach((mcp, i) => {
    if (!mcp.name) issues.push({ section: 'MCP Tools', message: `MCP ${i + 1}: name is required` });
    if (!mcp.url) issues.push({ section: 'MCP Tools', message: `MCP ${i + 1}: URL is required` });
  });
  if (s.routing_escalate_to && !s.routing_escalate_after_minutes && !s.routing_escalate_on_skill) issues.push({ section: 'Routing', message: 'Set escalate_after_minutes or escalate_on_skill' });
  return issues;
}

// ── YAML syntax highlight ─────────────────────────────────────────────────────

export function highlightYaml(raw: string): string {
  return raw.split('\n').map((line) => {
    if (/^\s*#/.test(line)) return `<span class="c">${esc(line)}</span>`;
    const kv = /^(\s*)([\w_-]+)(\s*:\s*)(.*)$/.exec(line);
    if (kv) { const [, ind, key, col, val] = kv; return `${esc(ind ?? '')}<span class="k">${esc(key ?? '')}</span><span class="p">${esc(col ?? '')}</span>${cv(val ?? '')}`; }
    const arr = /^(\s*-\s+)(.*)$/.exec(line);
    if (arr) return `<span class="dash">${esc(arr[1] ?? '')}</span>${cv(arr[2] ?? '')}`;
    return esc(line);
  }).join('\n');
}
function cv(v: string): string {
  const t = v.trim();
  if (!t) return '';
  if (/^\d+(\.\d+)?$/.test(t)) return `<span class="num">${esc(v)}</span>`;
  if (t === 'true' || t === 'false' || t === 'null') return `<span class="bool">${esc(v)}</span>`;
  if (t.startsWith('${')) return `<span class="env">${esc(v)}</span>`;
  if (t === '|' || t === '>-' || t === '>') return `<span class="p">${esc(v)}</span>`;
  return `<span class="str">${esc(v)}</span>`;
}
function esc(s: string) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// ── Presets ───────────────────────────────────────────────────────────────────

export interface Preset { name: string; description: string; yaml: string; }

export const PRESETS: Preset[] = [
  {
    name: 'Trader Support Agent',
    description: 'L1 trading-desk support with escalation to L2',
    yaml: `agent:
  name: trader-support
  display_name: Trader Support Agent
  description: L1 trading-desk support — handles order, position and market queries
  version: 1.0.0
  icon: 📈
llm:
  provider: anthropic
  model: claude-sonnet-4-6
  api_key: \${ANTHROPIC_API_KEY}
  temperature: 0.1
  max_tokens: 4096
  system_prompt: |
    You are a Production Support AI agent specialised in trading-desk incident triage.
    Always verify facts from KB before answering. Escalate if unsure.
knowledge:
  embedding_model: text-embedding-3-small
  vector_store: local
  vector_store_path: ./data/vectors/trader-support/
  sources:
    - id: runbooks
      type: markdown
      path: ./kb/runbooks/
      glob: '**/*.md'
      refresh: on_change
      metadata:
        category: runbook
        priority: high
skills:
  - id: l1_analysis
    name: L1 Incident Analysis
    trigger: on_ticket
    prompt_template: ./prompts/l1_analysis.md
    output:
      format: structured
      schema: ./schemas/l1_report.json
    inputs:
      - name: ticket_id
        type: string
        required: true
      - name: description
        type: string
        required: true
routing:
  escalate_to: prod-support
  escalate_after_minutes: 15
  escalate_on_skill: l1_analysis
  ticket_system:
    type: internal
interface:
  mode: chat
  session_timeout_minutes: 60
`,
  },
  {
    name: 'Production Support Agent',
    description: 'L2 infra / platform support with KG traversal',
    yaml: `agent:
  name: prod-support
  display_name: Production Support Agent
  description: L2 infrastructure and platform incident analysis
  version: 1.0.0
  icon: 🔧
llm:
  provider: anthropic
  model: claude-opus-4-7
  api_key: \${ANTHROPIC_API_KEY}
  temperature: 0.05
  max_tokens: 8192
knowledge:
  embedding_model: text-embedding-3-large
  vector_store: qdrant
  vector_store_path: ./data/vectors/prod-support/
  sources:
    - id: runbooks
      type: markdown
      path: ./kb/runbooks/
      glob: '**/*.md'
      refresh: hourly
    - id: platform_logs
      type: folder
      path: /var/log/platform/
      watch: true
      index_strategy: tail
      tail_lines: 10000
      refresh: live
      filters:
        include: ['*.log', '*.err']
        exclude: ['*.gz']
    - id: platform_kg
      type: knowledge_graph
      path: ./kg/platform_kg.json
      format: graphrag
      traversal_depth: 3
      refresh: daily
mcps:
  - id: pagerduty
    name: PagerDuty
    url: \${PAGERDUTY_MCP_URL}
    auth_type: bearer
    auth_token: \${PAGERDUTY_TOKEN}
    enabled: true
routing:
  escalate_to: dev-agent
  escalate_after_minutes: 30
  accepts_from: ['trader-support']
  ticket_system:
    type: jira
interface:
  mode: both
  api_port: 8002
  session_timeout_minutes: 120
`,
  },
  {
    name: 'Dev Agent (OpenAI)',
    description: 'Developer-facing agent powered by GPT-4o',
    yaml: `agent:
  name: dev-agent
  display_name: Developer Agent
  description: Root-cause analysis, code investigation and fix recommendations
  version: 1.0.0
  icon: 💻
llm:
  provider: openai
  model: gpt-4o
  api_key: \${OPENAI_API_KEY}
  temperature: 0.2
  max_tokens: 8192
knowledge:
  embedding_model: text-embedding-3-large
  vector_store: qdrant
  vector_store_path: ./data/vectors/dev-agent/
  sources:
    - id: source_code
      type: folder
      path: ./src/
      watch: false
      index_strategy: incremental
      refresh: on_change
      filters:
        include: ['*.py', '*.ts', '*.go']
        exclude: ['node_modules', '__pycache__']
mcps:
  - id: gitlab
    name: GitLab
    url: \${GITLAB_MCP_URL}
    auth_type: bearer
    auth_token: \${GITLAB_TOKEN}
    enabled: true
    tools: search_code, get_file, list_merge_requests
routing:
  accepts_from: ['prod-support']
  ticket_system:
    type: jira
interface:
  mode: api
  api_port: 8003
`,
  },
  {
    name: 'Local Ollama Agent',
    description: 'Fully local agent — no external API keys',
    yaml: `agent:
  name: local-agent
  display_name: Local AI Agent
  description: A fully local agent powered by Ollama — no cloud dependencies
  version: 1.0.0
  icon: 🏠
llm:
  provider: ollama
  model: llama3
  ollama_base_url: http://localhost:11434
  temperature: 0.3
  max_tokens: 4096
knowledge:
  embedding_model: nomic-embed-text
  vector_store: local
  vector_store_path: ./data/vectors/local-agent/
  sources:
    - id: docs
      type: markdown
      path: ./docs/
      glob: '**/*.md'
      refresh: manual
interface:
  mode: chat
  session_timeout_minutes: 30
`,
  },
];

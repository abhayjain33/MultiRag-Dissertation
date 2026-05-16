import { z } from 'zod';

// ── Helpers ────────────────────────────────────────────────────────────────────

const envVarRef = z.string().regex(/^\$\{[A-Z_][A-Z0-9_]*\}$/, 'Must be an env var ref like ${VAR_NAME}');
const envOrLiteral = z.string(); // accepts both literal values and ${VAR} refs

// ── Knowledge source sub-schemas ───────────────────────────────────────────────

const MarkdownSourceSchema = z.object({
  id: z.string().min(1),
  type: z.literal('markdown'),
  path: z.string().min(1),
  glob: z.string().default('**/*.md'),
  refresh: z.enum(['on_change', 'hourly', 'daily', 'manual']).default('on_change'),
  metadata: z.record(z.unknown()).optional(),
});

const FolderSourceSchema = z.object({
  id: z.string().min(1),
  type: z.literal('folder'),
  path: z.string().min(1),
  watch: z.boolean().default(false),
  filters: z
    .object({
      include: z.array(z.string()).default([]),
      exclude: z.array(z.string()).default([]),
    })
    .optional(),
  index_strategy: z.enum(['tail', 'full', 'incremental']).default('full'),
  tail_lines: z.number().int().positive().optional(),
  refresh: z.enum(['on_change', 'hourly', 'daily', 'manual', 'live']).default('on_change'),
});

const KnowledgeGraphSourceSchema = z.object({
  id: z.string().min(1),
  type: z.literal('knowledge_graph'),
  path: z.string().min(1),
  format: z.enum(['graphrag', 'custom']).default('graphrag'),
  traversal_depth: z.number().int().min(1).max(10).default(3),
  refresh: z.enum(['on_change', 'hourly', 'daily', 'manual']).default('on_change'),
});

export const KnowledgeSourceSchema = z.discriminatedUnion('type', [
  MarkdownSourceSchema,
  FolderSourceSchema,
  KnowledgeGraphSourceSchema,
]);

// ── Skill sub-schemas ──────────────────────────────────────────────────────────

const SkillInputSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['string', 'number', 'boolean', 'object', 'array']),
  required: z.boolean().default(true),
  description: z.string().optional(),
});

const SkillOutputSchema = z.object({
  format: z.enum(['structured', 'markdown', 'plain']),
  schema: z.string().optional(),
});

export const SkillSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  trigger: z.enum(['explicit', 'on_ticket', 'on_escalation', 'on_message']),
  prompt_template: z.string().min(1),
  inputs: z.array(SkillInputSchema).default([]),
  output: SkillOutputSchema,
});

// ── MCP sub-schema ─────────────────────────────────────────────────────────────

export const MCPConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  url: envOrLiteral,
  auth_type: z.enum(['bearer', 'basic', 'none']).default('none'),
  auth_token: envOrLiteral.optional(),
  enabled: z.boolean().default(true),
  tools: z.array(z.string()).optional(),
});

// ── LLM sub-schema ─────────────────────────────────────────────────────────────

export const LLMConfigSchema = z.object({
  provider: z.enum(['anthropic', 'openai', 'azure', 'ollama']),
  model: z.string().min(1),
  api_key: envOrLiteral.optional(),
  temperature: z.number().min(0).max(2).default(0.2),
  max_tokens: z.number().int().positive().default(4096),
  system_prompt: z.string().optional(),
  // Azure-specific
  azure_endpoint: envOrLiteral.optional(),
  azure_deployment: z.string().optional(),
  azure_api_version: z.string().optional(),
  // Ollama-specific
  ollama_base_url: z.string().url().optional(),
});

// ── Routing sub-schema ─────────────────────────────────────────────────────────

const TicketSystemSchema = z.object({
  type: z.enum(['internal', 'jira', 'servicenow']).default('internal'),
  jira_url: envOrLiteral.optional(),
  jira_project: z.string().optional(),
  jira_token: envOrLiteral.optional(),
});

const RoutingConfigSchema = z.object({
  escalate_to: z.string().optional(),
  escalate_after_minutes: z.number().int().positive().optional(),
  escalate_on_skill: z.string().optional(),
  accepts_from: z.array(z.string()).default([]),
  ticket_system: TicketSystemSchema.optional(),
});

// ── Agent config schema ────────────────────────────────────────────────────────

export const AgentConfigSchema = z.object({
  agent: z.object({
    name: z
      .string()
      .min(1)
      .regex(/^[a-z0-9-]+$/, 'Agent name must be lowercase alphanumeric with hyphens'),
    display_name: z.string().min(1),
    description: z.string().optional(),
    version: z.string().default('1.0.0'),
    icon: z.string().optional(),
  }),
  llm: LLMConfigSchema,
  knowledge: z
    .object({
      embedding_model: z.string().default('text-embedding-3-small'),
      vector_store: z.enum(['local', 'chroma', 'qdrant']).default('local'),
      vector_store_path: z.string().optional(),
      sources: z.array(KnowledgeSourceSchema).default([]),
    })
    .optional(),
  skills: z.array(SkillSchema).default([]),
  mcps: z.array(MCPConfigSchema).default([]),
  routing: RoutingConfigSchema.optional(),
  interface: z
    .object({
      mode: z.enum(['chat', 'api', 'both']).default('chat'),
      api_port: z.number().int().min(1024).max(65535).optional(),
      session_timeout_minutes: z.number().int().positive().default(60),
    })
    .optional(),
});

// ── Platform config schema ─────────────────────────────────────────────────────

export const PlatformConfigSchema = z.object({
  platform: z.object({
    name: z.string().min(1),
    version: z.string().default('1.0.0'),
    description: z.string().optional(),
  }),
  agents: z
    .array(
      z.object({
        config: z.string().min(1),
        enabled: z.boolean().default(true),
      }),
    )
    .default([]),
  store: z
    .object({
      type: z.enum(['sqlite', 'postgres']).default('sqlite'),
      path: z.string().optional(),
      url: envOrLiteral.optional(),
    })
    .default({ type: 'sqlite' }),
  ui: z
    .object({
      enabled: z.boolean().default(true),
      port: z.number().int().min(1024).max(65535).default(3000),
      host: z.string().default('localhost'),
    })
    .optional(),
  logging: z
    .object({
      level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
      output: z.string().optional(),
      format: z.enum(['json', 'text']).default('json'),
    })
    .optional(),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type PlatformConfig = z.infer<typeof PlatformConfigSchema>;
export type LLMConfig = z.infer<typeof LLMConfigSchema>;
export type SkillConfig = z.infer<typeof SkillSchema>;
export type MCPConfig = z.infer<typeof MCPConfigSchema>;
export type KnowledgeSource = z.infer<typeof KnowledgeSourceSchema>;

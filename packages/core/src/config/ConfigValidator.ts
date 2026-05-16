import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { ZodError, ZodIssue } from 'zod';
import { AgentConfigSchema, PlatformConfigSchema, type AgentConfig, type PlatformConfig } from './schemas.js';

export interface ValidationError {
  path: string;
  message: string;
  suggestion?: string | undefined;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  config?: AgentConfig | PlatformConfig | undefined;
}

const ENV_VAR_RE = /\$\{([A-Z_][A-Z0-9_]*)\}/g;

export class ConfigValidator {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? process.cwd();
  }

  validateAgentConfig(configPath: string): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    const raw = this.readYaml(configPath, errors);
    if (!raw) return { valid: false, errors, warnings };

    const parsed = AgentConfigSchema.safeParse(raw);
    if (!parsed.success) {
      errors.push(...this.zodErrorsToValidation(parsed.error));
      return { valid: false, errors, warnings };
    }

    const cfg = parsed.data;
    const dir = path.dirname(path.resolve(configPath));

    this.checkEnvVars(raw, errors);
    this.checkLLMProviderConstraints(cfg, errors);
    this.checkKnowledgePaths(cfg, dir, errors, warnings);
    this.checkSkillFiles(cfg, dir, errors);
    this.checkSkillSchemas(cfg, dir, errors);
    this.checkMCPConstraints(cfg, errors);
    this.checkRoutingConsistency(cfg, warnings);
    this.checkPortConflicts(cfg, warnings);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      config: errors.length === 0 ? cfg : undefined,
    };
  }

  validatePlatformConfig(configPath: string): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    const raw = this.readYaml(configPath, errors);
    if (!raw) return { valid: false, errors, warnings };

    const parsed = PlatformConfigSchema.safeParse(raw);
    if (!parsed.success) {
      errors.push(...this.zodErrorsToValidation(parsed.error));
      return { valid: false, errors, warnings };
    }

    const cfg = parsed.data;
    const dir = path.dirname(path.resolve(configPath));

    this.checkEnvVars(raw, errors);
    this.checkAgentConfigPaths(cfg, dir, errors);
    this.checkStoreConfig(cfg, errors);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      config: errors.length === 0 ? cfg : undefined,
    };
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private readYaml(configPath: string, errors: ValidationError[]): unknown {
    const resolved = path.resolve(configPath);
    if (!fs.existsSync(resolved)) {
      errors.push({ path: 'file', message: `Config file not found: ${resolved}` });
      return null;
    }
    try {
      return yaml.load(fs.readFileSync(resolved, 'utf8'));
    } catch (e) {
      errors.push({
        path: 'file',
        message: `Failed to parse YAML: ${e instanceof Error ? e.message : String(e)}`,
        suggestion: 'Check YAML indentation and syntax',
      });
      return null;
    }
  }

  private zodErrorsToValidation(error: ZodError): ValidationError[] {
    return error.issues.map((issue: ZodIssue) => {
      const suggestion = this.suggestionForZodCode(issue.code);
      const e: ValidationError = { path: issue.path.join('.'), message: issue.message };
      if (suggestion !== undefined) e.suggestion = suggestion;
      return e;
    });
  }

  private suggestionForZodCode(code: string): string | undefined {
    const map: Record<string, string> = {
      invalid_type: 'Check the field type in the config reference',
      invalid_enum_value: 'Use one of the allowed enum values listed in the config reference',
      too_small: 'Value is below the minimum allowed',
      too_big: 'Value exceeds the maximum allowed',
      invalid_string: 'Check the string format requirement',
    };
    return map[code];
  }

  private checkEnvVars(raw: unknown, errors: ValidationError[]): void {
    const serialised = JSON.stringify(raw);
    const missing: string[] = [];
    let match: RegExpExecArray | null;

    ENV_VAR_RE.lastIndex = 0;
    while ((match = ENV_VAR_RE.exec(serialised)) !== null) {
      const varName = match[1];
      if (varName && !process.env[varName]) {
        missing.push(varName);
      }
    }

    for (const v of [...new Set(missing)]) {
      errors.push({
        path: `env.${v}`,
        message: `Environment variable ${v} is not set`,
        suggestion: `Add ${v}=<value> to your .env file or shell environment`,
      });
    }
  }

  private checkLLMProviderConstraints(cfg: AgentConfig, errors: ValidationError[]): void {
    const { provider } = cfg.llm;

    if (provider === 'azure') {
      if (!cfg.llm.azure_endpoint) {
        errors.push({
          path: 'llm.azure_endpoint',
          message: 'azure_endpoint is required when provider is azure',
          suggestion: 'Add azure_endpoint: "${AZURE_OPENAI_ENDPOINT}" to llm config',
        });
      }
      if (!cfg.llm.azure_deployment) {
        errors.push({
          path: 'llm.azure_deployment',
          message: 'azure_deployment is required when provider is azure',
        });
      }
    }

    if (provider === 'ollama' && !cfg.llm.ollama_base_url) {
      errors.push({
        path: 'llm.ollama_base_url',
        message: 'ollama_base_url is required when provider is ollama',
        suggestion: 'Add ollama_base_url: "http://localhost:11434" to llm config',
      });
    }

    if (['anthropic', 'openai', 'azure'].includes(provider) && !cfg.llm.api_key) {
      errors.push({
        path: 'llm.api_key',
        message: `api_key is required for provider ${provider}`,
        suggestion: `Add api_key: "\${${provider.toUpperCase()}_API_KEY}" to llm config`,
      });
    }
  }

  private checkKnowledgePaths(
    cfg: AgentConfig,
    dir: string,
    errors: ValidationError[],
    warnings: ValidationError[],
  ): void {
    if (!cfg.knowledge) return;

    for (const source of cfg.knowledge.sources) {
      const sourcePath = path.resolve(dir, source.path);

      if (!fs.existsSync(sourcePath)) {
        (source.type === 'knowledge_graph' ? errors : warnings).push({
          path: `knowledge.sources[${source.id}].path`,
          message: `Knowledge source path does not exist: ${sourcePath}`,
          suggestion:
            source.type === 'folder'
              ? 'Create the directory or adjust the path'
              : 'Ensure the knowledge base files are in place',
        });
      }

      if (source.type === 'folder' && source.index_strategy === 'tail' && !source.tail_lines) {
        errors.push({
          path: `knowledge.sources[${source.id}].tail_lines`,
          message: 'tail_lines is required when index_strategy is tail',
          suggestion: 'Add tail_lines: 5000 to the source config',
        });
      }
    }
  }

  private checkSkillFiles(cfg: AgentConfig, dir: string, errors: ValidationError[]): void {
    for (const skill of cfg.skills) {
      const templatePath = path.resolve(dir, skill.prompt_template);
      if (!fs.existsSync(templatePath)) {
        errors.push({
          path: `skills[${skill.id}].prompt_template`,
          message: `Prompt template not found: ${templatePath}`,
        });
        continue;
      }

      const templateContent = fs.readFileSync(templatePath, 'utf8');
      for (const input of skill.inputs) {
        if (input.required && !templateContent.includes(`{{${input.name}}}`)) {
          errors.push({
            path: `skills[${skill.id}].prompt_template`,
            message: `Required input {{${input.name}}} not found in prompt template`,
            suggestion: `Add {{${input.name}}} placeholder to ${skill.prompt_template}`,
          });
        }
      }
    }
  }

  private checkSkillSchemas(cfg: AgentConfig, dir: string, errors: ValidationError[]): void {
    for (const skill of cfg.skills) {
      if (!skill.output.schema) continue;

      const schemaPath = path.resolve(dir, skill.output.schema);
      if (!fs.existsSync(schemaPath)) {
        errors.push({
          path: `skills[${skill.id}].output.schema`,
          message: `Output schema file not found: ${schemaPath}`,
        });
        continue;
      }

      try {
        const schemaContent = JSON.parse(fs.readFileSync(schemaPath, 'utf8')) as unknown;
        if (typeof schemaContent !== 'object' || schemaContent === null) {
          throw new Error('Schema must be a JSON object');
        }
      } catch (e) {
        errors.push({
          path: `skills[${skill.id}].output.schema`,
          message: `Invalid JSON Schema at ${schemaPath}: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    }
  }

  private checkMCPConstraints(cfg: AgentConfig, errors: ValidationError[]): void {
    for (const mcp of cfg.mcps) {
      if (!mcp.enabled) continue;

      if (mcp.auth_type !== 'none' && !mcp.auth_token) {
        errors.push({
          path: `mcps[${mcp.id}].auth_token`,
          message: `auth_token is required when auth_type is ${mcp.auth_type}`,
        });
      }
    }
  }

  private checkRoutingConsistency(cfg: AgentConfig, warnings: ValidationError[]): void {
    if (!cfg.routing) return;

    const { escalate_to, escalate_on_skill, escalate_after_minutes } = cfg.routing;
    if (escalate_to && !escalate_after_minutes && !escalate_on_skill) {
      warnings.push({
        path: 'routing',
        message: 'escalate_to is set but neither escalate_after_minutes nor escalate_on_skill is configured',
        suggestion: 'Add escalate_after_minutes or escalate_on_skill to define escalation trigger',
      });
    }

    if (escalate_on_skill) {
      const skillIds = cfg.skills.map((s) => s.id);
      if (!skillIds.includes(escalate_on_skill)) {
        warnings.push({
          path: 'routing.escalate_on_skill',
          message: `Skill '${escalate_on_skill}' referenced in routing is not defined in skills list`,
        });
      }
    }
  }

  private checkPortConflicts(cfg: AgentConfig, warnings: ValidationError[]): void {
    const iface = cfg.interface;
    if (iface?.mode !== 'chat' && !iface?.api_port) {
      warnings.push({
        path: 'interface.api_port',
        message: `interface.mode is '${iface?.mode}' but api_port is not set`,
        suggestion: 'Add api_port: 8001 (or any free port) to interface config',
      });
    }
  }

  private checkAgentConfigPaths(cfg: PlatformConfig, dir: string, errors: ValidationError[]): void {
    for (const entry of cfg.agents) {
      if (!entry.enabled) continue;
      const cfgPath = path.resolve(dir, entry.config);
      if (!fs.existsSync(cfgPath)) {
        errors.push({
          path: `agents[].config`,
          message: `Agent config file not found: ${cfgPath}`,
        });
      }
    }
  }

  private checkStoreConfig(cfg: PlatformConfig, errors: ValidationError[]): void {
    if (cfg.store.type === 'sqlite' && !cfg.store.path) {
      errors.push({
        path: 'store.path',
        message: 'store.path is required when store.type is sqlite',
        suggestion: 'Add path: "./data/platform.db" to store config',
      });
    }
    if (cfg.store.type === 'postgres' && !cfg.store.url) {
      errors.push({
        path: 'store.url',
        message: 'store.url is required when store.type is postgres',
        suggestion: 'Add url: "${DATABASE_URL}" to store config',
      });
    }
  }
}

export function formatValidationResult(result: ValidationResult, configPath: string): string {
  const lines: string[] = [];
  const status = result.valid ? '✓ Valid' : '✗ Invalid';
  lines.push(`${status}: ${configPath}`);

  if (result.errors.length > 0) {
    lines.push(`\nErrors (${result.errors.length}):`);
    for (const e of result.errors) {
      lines.push(`  [ERROR] ${e.path}: ${e.message}`);
      if (e.suggestion) lines.push(`         → ${e.suggestion}`);
    }
  }

  if (result.warnings.length > 0) {
    lines.push(`\nWarnings (${result.warnings.length}):`);
    for (const w of result.warnings) {
      lines.push(`  [WARN]  ${w.path}: ${w.message}`);
      if (w.suggestion) lines.push(`         → ${w.suggestion}`);
    }
  }

  if (result.valid && result.warnings.length === 0) {
    lines.push('  All checks passed.');
  }

  return lines.join('\n');
}

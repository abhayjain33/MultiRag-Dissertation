import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ConfigValidator } from '../src/config/ConfigValidator.js';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-test-'));

function writeFile(name: string, content: string): string {
  const p = path.join(TMP, name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
  return p;
}

afterAll(() => fs.rmSync(TMP, { recursive: true }));

describe('ConfigValidator — agent config', () => {
  beforeAll(() => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-test';
  });

  it('validates a minimal valid agent config', () => {
    const promptPath = writeFile('prompts/greet.md', '# Greet\n{{name}}');
    const cfgPath = writeFile(
      'minimal-agent.yaml',
      `
agent:
  name: test-agent
  display_name: Test Agent
llm:
  provider: anthropic
  model: claude-sonnet-4-5
  api_key: "\${ANTHROPIC_API_KEY}"
skills:
  - id: greet
    name: Greet
    trigger: explicit
    prompt_template: ./prompts/greet.md
    inputs:
      - name: name
        type: string
        required: true
    output:
      format: plain
`,
    );

    const validator = new ConfigValidator(TMP);
    const result = validator.validateAgentConfig(cfgPath);
    expect(result.errors).toHaveLength(0);
    expect(result.valid).toBe(true);
  });

  it('reports error for missing env var', () => {
    delete process.env['MISSING_VAR'];
    const cfgPath = writeFile(
      'missing-env.yaml',
      `
agent:
  name: test-agent2
  display_name: Test Agent 2
llm:
  provider: openai
  model: gpt-4o
  api_key: "\${MISSING_VAR}"
`,
    );

    const validator = new ConfigValidator(TMP);
    const result = validator.validateAgentConfig(cfgPath);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.includes('MISSING_VAR'))).toBe(true);
  });

  it('reports error for missing prompt template file', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-test';
    const cfgPath = writeFile(
      'missing-template.yaml',
      `
agent:
  name: test-agent3
  display_name: Test Agent 3
llm:
  provider: anthropic
  model: claude-sonnet-4-5
  api_key: "\${ANTHROPIC_API_KEY}"
skills:
  - id: missing
    name: Missing
    trigger: explicit
    prompt_template: ./prompts/does_not_exist.md
    inputs: []
    output:
      format: plain
`,
    );

    const validator = new ConfigValidator(TMP);
    const result = validator.validateAgentConfig(cfgPath);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.includes('prompt_template'))).toBe(true);
  });

  it('rejects invalid provider enum', () => {
    const cfgPath = writeFile(
      'bad-provider.yaml',
      `
agent:
  name: test-agent4
  display_name: Test Agent 4
llm:
  provider: gemini
  model: gemini-pro
`,
    );

    const validator = new ConfigValidator(TMP);
    const result = validator.validateAgentConfig(cfgPath);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.includes('provider'))).toBe(true);
  });

  it('reports error for missing azure_endpoint when provider is azure', () => {
    process.env['AZURE_KEY'] = 'test-key';
    const cfgPath = writeFile(
      'azure-missing-endpoint.yaml',
      `
agent:
  name: azure-agent
  display_name: Azure Agent
llm:
  provider: azure
  model: gpt-4
  api_key: "\${AZURE_KEY}"
`,
    );

    const validator = new ConfigValidator(TMP);
    const result = validator.validateAgentConfig(cfgPath);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.includes('azure_endpoint'))).toBe(true);
  });
});

describe('ConfigValidator — platform config', () => {
  it('validates a minimal platform config', () => {
    const agentCfgPath = writeFile(
      'agents/my-agent.yaml',
      `
agent:
  name: my-agent
  display_name: My Agent
llm:
  provider: ollama
  model: llama3
  ollama_base_url: "http://localhost:11434"
`,
    );

    const platformPath = writeFile(
      'platform.yaml',
      `
platform:
  name: Test Platform
  version: "1.0.0"
agents:
  - config: ./agents/my-agent.yaml
    enabled: true
store:
  type: sqlite
  path: ./data/platform.db
`,
    );

    const validator = new ConfigValidator(TMP);
    const result = validator.validatePlatformConfig(platformPath);
    expect(result.errors).toHaveLength(0);
    expect(result.valid).toBe(true);
  });

  it('reports error when agent config path does not exist', () => {
    const platformPath = writeFile(
      'platform-missing-agent.yaml',
      `
platform:
  name: Test Platform
agents:
  - config: ./agents/nonexistent.yaml
    enabled: true
store:
  type: sqlite
  path: ./data/platform.db
`,
    );

    const validator = new ConfigValidator(TMP);
    const result = validator.validatePlatformConfig(platformPath);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.includes('config'))).toBe(true);
  });
});

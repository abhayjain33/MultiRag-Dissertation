import { useStore } from '@/admin/store/agentBuilderStore';
import { Field, Input, Textarea, Select, Row, SectionCard } from '@/admin/components/ui/primitives';

const MODEL_OPTIONS: Record<string, { value: string; label: string }[]> = {
  anthropic: [
    { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (recommended)' },
    { value: 'claude-opus-4-7', label: 'Claude Opus 4.7 (most capable)' },
    { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (fastest)' },
  ],
  openai: [
    { value: 'gpt-4o', label: 'GPT-4o (recommended)' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini (fast)' },
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
  ],
  azure: [{ value: 'gpt-4o', label: 'gpt-4o (or your deployment name)' }],
  ollama: [
    { value: 'llama3', label: 'Llama 3 (recommended local)' },
    { value: 'mistral', label: 'Mistral' },
    { value: 'phi3', label: 'Phi-3 (lightweight)' },
    { value: 'codellama', label: 'Code Llama' },
  ],
};

export function LLMSection() {
  const s = useStore();
  const models = MODEL_OPTIONS[s.llm_provider] ?? [];

  return (
    <SectionCard title="② LLM Configuration" subtitle="Which AI model powers this agent">
      <Row>
        <Field label="Provider" required>
          <Select
            value={s.llm_provider}
            onChange={(e) => {
              const p = e.target.value as typeof s.llm_provider;
              s.set('llm_provider', p);
              // auto-fill default model and api_key env var when provider changes
              const defaults: Record<string, { model: string; api_key: string }> = {
                anthropic: { model: 'claude-sonnet-4-6', api_key: '${ANTHROPIC_API_KEY}' },
                openai: { model: 'gpt-4o', api_key: '${OPENAI_API_KEY}' },
                azure: { model: 'gpt-4o', api_key: '${AZURE_OPENAI_API_KEY}' },
                ollama: { model: 'llama3', api_key: '' },
              };
              if (defaults[p]) { s.set('llm_model', defaults[p]!.model); s.set('llm_api_key', defaults[p]!.api_key); }
            }}
            options={[
              { value: 'anthropic', label: '🟣 Anthropic (Claude)' },
              { value: 'openai', label: '🟢 OpenAI (GPT)' },
              { value: 'azure', label: '🔵 Azure OpenAI' },
              { value: 'ollama', label: '⚫ Ollama (local)' },
            ]}
          />
        </Field>
        <Field label="Model" required hint={s.llm_provider === 'ollama' ? 'Must be installed locally' : undefined}>
          {models.length > 0 ? (
            <Select value={s.llm_model} onChange={(e) => s.set('llm_model', e.target.value)} options={[...models, { value: '__custom__', label: '— Custom model name' }]} />
          ) : (
            <Input value={s.llm_model} onChange={(e) => s.set('llm_model', e.target.value)} placeholder="model-name" mono />
          )}
        </Field>
      </Row>

      {/* API key — hidden for Ollama */}
      {s.llm_provider !== 'ollama' && (
        <Field label="API Key" required hint='Always use an env var reference like ${ANTHROPIC_API_KEY} — never paste raw keys'>
          <Input value={s.llm_api_key} onChange={(e) => s.set('llm_api_key', e.target.value)} placeholder="${ANTHROPIC_API_KEY}" mono />
        </Field>
      )}

      {/* Azure-specific fields */}
      {s.llm_provider === 'azure' && (
        <Row cols={3}>
          <Field label="Azure Endpoint" required hint="Your Azure OpenAI resource URL">
            <Input value={s.llm_azure_endpoint} onChange={(e) => s.set('llm_azure_endpoint', e.target.value)} placeholder="${AZURE_OPENAI_ENDPOINT}" mono />
          </Field>
          <Field label="Deployment Name" required>
            <Input value={s.llm_azure_deployment} onChange={(e) => s.set('llm_azure_deployment', e.target.value)} placeholder="my-gpt4o-deployment" mono />
          </Field>
          <Field label="API Version">
            <Input value={s.llm_azure_api_version} onChange={(e) => s.set('llm_azure_api_version', e.target.value)} placeholder="2024-02-01" mono />
          </Field>
        </Row>
      )}

      {/* Ollama base URL */}
      {s.llm_provider === 'ollama' && (
        <Field label="Ollama Base URL" required hint="Where Ollama is running locally">
          <Input value={s.llm_ollama_base_url} onChange={(e) => s.set('llm_ollama_base_url', e.target.value)} placeholder="http://localhost:11434" mono />
        </Field>
      )}

      <Row>
        <Field label={`Temperature: ${s.llm_temperature}`} hint="0 = deterministic, 2 = very creative">
          <input
            type="range" min={0} max={2} step={0.05}
            value={s.llm_temperature}
            onChange={(e) => s.set('llm_temperature', Number(e.target.value))}
            className="w-full accent-indigo-600"
          />
        </Field>
        <Field label="Max Tokens" hint="Maximum tokens in each response">
          <Input type="number" value={s.llm_max_tokens} onChange={(e) => s.set('llm_max_tokens', Number(e.target.value))} min={256} max={32000} step={256} />
        </Field>
      </Row>

      <Field label="System Prompt" hint="Defines the agent's persona and behaviour — leave blank to use platform default">
        <Textarea value={s.llm_system_prompt} onChange={(e) => s.set('llm_system_prompt', e.target.value)} rows={5} placeholder="You are a Production Support AI agent specialised in incident triage and root-cause analysis…" />
      </Field>
    </SectionCard>
  );
}

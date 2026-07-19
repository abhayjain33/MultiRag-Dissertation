import type { LLMProvider } from './LLMProvider.js';
import { resolveEnvVar, withRetry } from './LLMProvider.js';
import type { Message, Tool, ChatOptions, LLMChunk, ToolCall } from '../types.js';
import type { LLMConfig } from '../config/schemas.js';

interface OllamaChatMessage {
  role: string;
  content: string;
  tool_calls?: Array<{ function: { name: string; arguments: Record<string, unknown> } }>;
}

interface OllamaChatChunk {
  message?: { role: string; content: string; tool_calls?: OllamaChatMessage['tool_calls'] };
  done: boolean;
}

interface OllamaEmbedResponse {
  embeddings: number[][];
}

export class OllamaAdapter implements LLMProvider {
  private baseUrl: string;
  private model: string;
  private defaultTemperature: number;
  private defaultMaxTokens: number;
  private systemPrompt: string | undefined;

  constructor(config: LLMConfig) {
    if (config.provider !== 'ollama') {
      throw new Error('OllamaAdapter requires provider: ollama');
    }
    if (!config.ollama_base_url) {
      throw new Error('ollama_base_url is required for Ollama provider');
    }
    this.baseUrl = (config.ollama_base_url as string).replace(/\/$/, '');
    this.model = config.model;
    this.defaultTemperature = config.temperature;
    this.defaultMaxTokens = config.max_tokens;
    this.systemPrompt = config.system_prompt;
  }

  async *chat(
    messages: Message[],
    tools?: Tool[],
    options?: ChatOptions,
  ): AsyncGenerator<LLMChunk> {
    const ollamaMessages = this.toOllamaMessages(messages);

    const body: Record<string, unknown> = {
      model: this.model,
      messages: ollamaMessages,
      stream: true,
      think: false,
      options: {
        temperature: options?.temperature ?? this.defaultTemperature,
        num_predict: options?.max_tokens ?? this.defaultMaxTokens,
      },
    };

    if (tools?.length) {
      body['tools'] = tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.input_schema },
      }));
    }

    const response = await withRetry(() =>
      fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );

    if (!response.ok || !response.body) {
      throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.trim()) continue;
        const chunk = JSON.parse(line) as OllamaChatChunk;

        if (chunk.message?.content) {
          yield { type: 'text', text: chunk.message.content };
        }

        if (chunk.message?.tool_calls) {
          for (const tc of chunk.message.tool_calls) {
            const toolCall: ToolCall = {
              id: crypto.randomUUID(),
              name: tc.function.name,
              arguments: tc.function.arguments,
            };
            yield { type: 'tool_call', tool_call: toolCall };
          }
        }

        if (chunk.done) {
          yield { type: 'done' };
        }
      }
    }
  }

  async embed(texts: string[]): Promise<number[][]> {
    const response = await withRetry(() =>
      fetch(`${this.baseUrl}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'nomic-embed-text', input: texts }),
      }).then((r) => r.json()),
    );

    return (response as OllamaEmbedResponse).embeddings;
  }

  private toOllamaMessages(messages: Message[]): OllamaChatMessage[] {
    const result: OllamaChatMessage[] = [];

    if (this.systemPrompt) {
      result.push({ role: 'system', content: this.systemPrompt });
    }

    for (const m of messages) {
      if (m.role === 'system') {
        result.push({ role: 'system', content: m.content });
      } else if (m.role === 'assistant' && m.tool_calls?.length) {
        result.push({
          role: 'assistant',
          content: m.content ?? '',
          tool_calls: m.tool_calls.map(tc => ({ function: { name: tc.name, arguments: tc.arguments } })),
        });
      } else if (m.role === 'tool' && m.tool_results) {
        result.push({ role: 'tool', content: m.tool_results[0]?.content ?? '' });
      } else {
        result.push({ role: m.role, content: m.content });
      }
    }

    return result;
  }
}

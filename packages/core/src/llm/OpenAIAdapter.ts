import OpenAI from 'openai';
import type { LLMProvider } from './LLMProvider.js';
import { resolveEnvVar, withRetry } from './LLMProvider.js';
import type { Message, Tool, ChatOptions, LLMChunk, ToolCall } from '../types.js';
import type { LLMConfig } from '../config/schemas.js';

export class OpenAIAdapter implements LLMProvider {
  protected client: OpenAI;
  private model: string;
  private defaultTemperature: number;
  private defaultMaxTokens: number;
  private systemPrompt: string | undefined;

  constructor(config: LLMConfig, clientOverride?: OpenAI) {
    if (!['openai', 'azure'].includes(config.provider)) {
      throw new Error('OpenAIAdapter requires provider: openai or azure');
    }
    const apiKey = config.api_key ? resolveEnvVar(config.api_key) : undefined;
    this.client = clientOverride ?? new OpenAI({ ...(apiKey !== undefined ? { apiKey } : {}) });
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
    const openaiMessages = this.toOpenAIMessages(messages);
    const openaiTools = tools?.map(this.toOpenAITool);

    const stream = await withRetry(() =>
      this.client.chat.completions.create({
        model: this.model,
        max_tokens: options?.max_tokens ?? this.defaultMaxTokens,
        temperature: options?.temperature ?? this.defaultTemperature,
        messages: openaiMessages,
        stream: true,
        ...(openaiTools?.length ? { tools: openaiTools } : {}),
        ...(options?.stop_sequences ? { stop: options.stop_sequences } : {}),
      }),
    );

    // Accumulate tool call deltas by index
    const toolCallBuffers = new Map<number, { id: string; name: string; argsBuf: string }>();

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      if (delta.content) {
        yield { type: 'text', text: delta.content };
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index;
          if (tc.id) {
            toolCallBuffers.set(idx, {
              id: tc.id,
              name: tc.function?.name ?? '',
              argsBuf: tc.function?.arguments ?? '',
            });
          } else {
            const buf = toolCallBuffers.get(idx);
            if (buf && tc.function?.arguments) {
              buf.argsBuf += tc.function.arguments;
            }
          }
        }
      }

      if (chunk.choices[0]?.finish_reason === 'tool_calls') {
        for (const [, buf] of toolCallBuffers) {
          const toolCall: ToolCall = {
            id: buf.id,
            name: buf.name,
            arguments: JSON.parse(buf.argsBuf || '{}') as Record<string, unknown>,
          };
          yield { type: 'tool_call', tool_call: toolCall };
        }
        toolCallBuffers.clear();
      }

      if (chunk.choices[0]?.finish_reason === 'stop') {
        const usage = chunk.usage;
        if (usage) {
          yield {
            type: 'done',
            usage: { input_tokens: usage.prompt_tokens, output_tokens: usage.completion_tokens },
          };
        }
      }
    }
  }

  async embed(texts: string[]): Promise<number[][]> {
    const response = await withRetry(() =>
      this.client.embeddings.create({
        model: 'text-embedding-3-small',
        input: texts,
      }),
    );
    return response.data.map((d) => d.embedding);
  }

  protected toOpenAIMessages(
    messages: Message[],
  ): OpenAI.Chat.ChatCompletionMessageParam[] {
    return messages.map((m): OpenAI.Chat.ChatCompletionMessageParam => {
      if (m.role === 'system') {
        return { role: 'system', content: m.content };
      }
      if (m.role === 'tool' && m.tool_results) {
        return {
          role: 'tool',
          tool_call_id: m.tool_results[0]?.tool_call_id ?? '',
          content: m.tool_results[0]?.content ?? '',
        };
      }
      if (m.role === 'assistant' && m.tool_calls) {
        return {
          role: 'assistant',
          content: m.content.length > 0 ? m.content : null,
          tool_calls: m.tool_calls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
          })),
        };
      }
      return { role: m.role as 'user' | 'assistant', content: m.content };
    });
  }

  private toOpenAITool(tool: Tool): OpenAI.Chat.ChatCompletionTool {
    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema as Record<string, unknown>,
      },
    };
  }
}

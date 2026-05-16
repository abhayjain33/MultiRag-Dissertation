import Anthropic from '@anthropic-ai/sdk';
import type { LLMProvider } from './LLMProvider.js';
import { resolveEnvVar, withRetry } from './LLMProvider.js';
import type { Message, Tool, ChatOptions, LLMChunk, ToolCall } from '../types.js';
import type { LLMConfig } from '../config/schemas.js';

export class AnthropicAdapter implements LLMProvider {
  private client: Anthropic;
  private model: string;
  private defaultTemperature: number;
  private defaultMaxTokens: number;
  private systemPrompt: string | undefined;

  constructor(config: LLMConfig) {
    if (config.provider !== 'anthropic') {
      throw new Error('AnthropicAdapter requires provider: anthropic');
    }
    const apiKey = config.api_key ? resolveEnvVar(config.api_key) : undefined;
    this.client = new Anthropic({ apiKey });
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
    const anthropicMessages = this.toAnthropicMessages(messages);
    const anthropicTools = tools?.map((t) => this.toAnthropicTool(t));

    const params: Anthropic.Messages.MessageCreateParamsStreaming = {
      model: this.model,
      max_tokens: options?.max_tokens ?? this.defaultMaxTokens,
      temperature: options?.temperature ?? this.defaultTemperature,
      messages: anthropicMessages,
      stream: true,
      ...(this.systemPrompt !== undefined ? { system: this.systemPrompt } : {}),
      ...(anthropicTools?.length ? { tools: anthropicTools } : {}),
      ...(options?.stop_sequences ? { stop_sequences: options.stop_sequences } : {}),
    };

    const stream = await withRetry(() => this.client.messages.create(params));

    // Accumulate partial tool-call JSON across input_json_delta events
    const toolCallBuffers = new Map<number, { id: string; name: string; jsonBuf: string }>();

    for await (const event of stream) {
      if (event.type === 'content_block_start') {
        if (event.content_block.type === 'tool_use') {
          toolCallBuffers.set(event.index, {
            id: event.content_block.id,
            name: event.content_block.name,
            jsonBuf: '',
          });
        }
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          yield { type: 'text', text: event.delta.text };
        } else if (event.delta.type === 'input_json_delta') {
          const buf = toolCallBuffers.get(event.index);
          if (buf) buf.jsonBuf += event.delta.partial_json;
        }
      } else if (event.type === 'content_block_stop') {
        const buf = toolCallBuffers.get(event.index);
        if (buf) {
          const toolCall: ToolCall = {
            id: buf.id,
            name: buf.name,
            arguments: JSON.parse(buf.jsonBuf || '{}') as Record<string, unknown>,
          };
          yield { type: 'tool_call', tool_call: toolCall };
          toolCallBuffers.delete(event.index);
        }
      } else if (event.type === 'message_delta' && event.usage) {
        yield {
          type: 'done',
          usage: { input_tokens: 0, output_tokens: event.usage.output_tokens },
        };
      }
    }
  }

  async embed(texts: string[]): Promise<number[][]> {
    // Anthropic does not provide an embedding API.
    // Delegate to Voyage AI (voyage-3) via their REST API if VOYAGE_API_KEY is set.
    const voyageKey = process.env['VOYAGE_API_KEY'];
    if (!voyageKey) {
      throw new Error(
        'Anthropic does not provide an embedding API. ' +
          'Set VOYAGE_API_KEY to use Voyage AI (voyage-3) embeddings, ' +
          'or configure a different embedding provider.',
      );
    }

    const response = await withRetry(async () => {
      const res = await fetch('https://api.voyageai.com/v1/embeddings', {
        method: 'POST',
        headers: { Authorization: `Bearer ${voyageKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: texts, model: 'voyage-3' }),
      });
      return res.json() as Promise<{ data: Array<{ embedding: number[] }> }>;
    });

    return response.data.map((d) => d.embedding);
  }

  private toAnthropicMessages(messages: Message[]): Anthropic.Messages.MessageParam[] {
    return messages
      .filter((m) => m.role !== 'system')
      .map((m): Anthropic.Messages.MessageParam => {
        if (m.role === 'tool' && m.tool_results) {
          return {
            role: 'user',
            content: m.tool_results.map(
              (tr): Anthropic.Messages.ToolResultBlockParam => ({
                type: 'tool_result',
                tool_use_id: tr.tool_call_id,
                content: tr.content,
                ...(tr.is_error !== undefined ? { is_error: tr.is_error } : {}),
              }),
            ),
          };
        }
        if (m.role === 'assistant' && m.tool_calls) {
          return {
            role: 'assistant',
            content: m.tool_calls.map(
              (tc): Anthropic.Messages.ToolUseBlockParam => ({
                type: 'tool_use',
                id: tc.id,
                name: tc.name,
                input: tc.arguments,
              }),
            ),
          };
        }
        return {
          role: m.role as 'user' | 'assistant',
          content: m.content,
        };
      });
  }

  private toAnthropicTool(tool: Tool): Anthropic.Messages.Tool {
    return {
      name: tool.name,
      description: tool.description,
      input_schema: tool.input_schema as Anthropic.Messages.Tool['input_schema'],
    };
  }
}

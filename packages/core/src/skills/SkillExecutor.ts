import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { LLMProvider } from '../llm/LLMProvider.js';
import type { RAGPipeline } from '../rag/RAGPipeline.js';
import type { Tool, ToolCall, ToolResult, SkillResult, RAGContext, Message } from '../types.js';
import type { SkillConfig } from '../config/schemas.js';

const MAX_TOOL_ROUNDS = 6;
// Cap each tool result fed back to the LLM. Raw MCP results (Kafka dumps, DB
// records, log searches) can be huge, and the full message history is re-sent
// on every tool round — the dominant driver of token usage. Truncating keeps
// investigations within free-tier token/minute and token/day limits.
const MAX_TOOL_RESULT_CHARS = 1500;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…[truncated ${text.length - max} chars]`;
}

export class SkillExecutor {
  constructor(
    private skill: SkillConfig,
    private llm: LLMProvider,
    private rag: RAGPipeline,
    private tools: Tool[] = [],
    private configDir: string = process.cwd(),
    private callTool?: (name: string, args: Record<string, unknown>) => Promise<ToolResult>,
  ) {}

  async execute(inputs: Record<string, unknown>): Promise<SkillResult> {
    const t0 = Date.now();

    // Load template
    const templatePath = resolve(this.configDir, this.skill.prompt_template);
    let template: string;
    try { template = await readFile(templatePath, 'utf-8'); }
    catch (e) { return this.failure(`Cannot read template ${templatePath}: ${String(e)}`, t0); }

    // Render {{variable}} placeholders
    const userPrompt = renderTemplate(template, inputs);

    // RAG retrieval
    const queryText = [inputs['description'], inputs['title'], inputs['query']]
      .filter(Boolean).join(' ') || userPrompt.slice(0, 400);
    let ragCtx: RAGContext;
    try { ragCtx = await this.rag.query(queryText, { topK: 4 }); }
    catch { ragCtx = emptyRAG(); }

    // Build messages — system carries RAG context, user carries rendered prompt
    const messages: Message[] = [];
    if (ragCtx.formatted_context) {
      messages.push({
        role: 'system',
        content: `You are a skill executor. Use the following retrieved knowledge when answering:\n\n${ragCtx.formatted_context}`,
      });
    }
    messages.push({ role: 'user', content: userPrompt });

    // Agentic tool-call loop
    const llmOpts = { temperature: 0.1, max_tokens: this.skill.output.format === 'structured' ? 4096 : 2048 };
    const activeTools = this.tools.length > 0 ? this.tools : undefined;
    let fullText = '';
    let totalToolCallsMade = 0;
    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const roundCalls: ToolCall[] = [];
        let roundText = '';
        for await (const chunk of this.llm.chat(messages, activeTools, llmOpts)) {
          if (chunk.type === 'text' && chunk.text) roundText += chunk.text;
          if (chunk.type === 'tool_call' && chunk.tool_call) roundCalls.push(chunk.tool_call);
        }
        if (roundCalls.length === 0) {
          // If tools were available but none called on first round, nudge the LLM to use them
          if (this.callTool && activeTools && round === 0 && totalToolCallsMade === 0) {
            messages.push({ role: 'assistant', content: roundText });
            messages.push({ role: 'user', content: 'You must call the available tools to gather real data before providing your answer. Call each tool now with the correct arguments from the incident.' });
            continue;
          }
          fullText = roundText;
          break;
        }
        // Add assistant turn with tool calls
        messages.push({ role: 'assistant', content: roundText, tool_calls: roundCalls });
        // Execute each tool and feed results back
        for (const tc of roundCalls) {
          console.log(`[SkillExecutor] Calling tool: ${tc.name}`, JSON.stringify(tc.arguments));
          const result = await this.callTool!(tc.name, tc.arguments);
          console.log(`[SkillExecutor] Tool result (${tc.name}): ${result.content.slice(0, 300)}`);
          const trimmed = truncate(result.content, MAX_TOOL_RESULT_CHARS);
          messages.push({ role: 'tool', content: trimmed, tool_results: [{ ...result, content: trimmed }] });
          totalToolCallsMade++;
        }
      }
    } catch (e) { return this.failure(`LLM error: ${String(e)}`, t0, ragCtx); }

    // Parse output for structured format
    let output: Record<string, unknown> = { text: fullText };
    if (this.skill.output.format === 'structured') {
      const m = /```json\s*([\s\S]+?)\s*```/i.exec(fullText) ?? /(\{[\s\S]+\})/s.exec(fullText);
      if (m?.[1]) {
        try { output = JSON.parse(m[1]) as Record<string, unknown>; }
        catch { output = { text: fullText }; }
      }
    }

    return {
      skill_id: this.skill.id,
      success: true,
      output,
      raw_llm_response: fullText,
      execution_time_ms: Date.now() - t0,
      rag_context_used: ragCtx,
    };
  }

  private failure(msg: string, t0: number, ragCtx?: RAGContext): SkillResult {
    return {
      skill_id: this.skill.id,
      success: false,
      output: {},
      raw_llm_response: '',
      execution_time_ms: Date.now() - t0,
      rag_context_used: ragCtx ?? emptyRAG(),
      error: msg,
    };
  }
}

function renderTemplate(template: string, inputs: Record<string, unknown>): string {
  // Flatten dot-notation keys so {{ticket.chain_context}} resolves from inputs['ticket.chain_context']
  return template.replace(/\{\{([\w.]+)\}\}/g, (_, key: string) =>
    key in inputs ? String(inputs[key]) : `{{${key}}}`,
  );
}

function emptyRAG(): RAGContext {
  return { chunks: [], formatted_context: '', sources_used: [], retrieval_time_ms: 0 };
}

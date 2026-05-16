import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { LLMProvider } from '../llm/LLMProvider.js';
import type { RAGPipeline } from '../rag/RAGPipeline.js';
import type { Tool, SkillResult, RAGContext, Message } from '../types.js';
import type { SkillConfig } from '../config/schemas.js';

export class SkillExecutor {
  constructor(
    private skill: SkillConfig,
    private llm: LLMProvider,
    private rag: RAGPipeline,
    private tools: Tool[] = [],
    private configDir: string = process.cwd(),
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
    try { ragCtx = await this.rag.query(queryText); }
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

    // Stream LLM response
    let fullText = '';
    try {
      for await (const chunk of this.llm.chat(
        messages,
        this.tools.length > 0 ? this.tools : undefined,
        { temperature: 0.1, max_tokens: this.skill.output.format === 'structured' ? 4096 : 2048 },
      )) {
        if (chunk.type === 'text' && chunk.text) fullText += chunk.text;
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
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    key in inputs ? String(inputs[key]) : `{{${key}}}`,
  );
}

function emptyRAG(): RAGContext {
  return { chunks: [], formatted_context: '', sources_used: [], retrieval_time_ms: 0 };
}

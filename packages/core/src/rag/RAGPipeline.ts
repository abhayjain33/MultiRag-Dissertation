import type { LLMProvider } from '../llm/LLMProvider.js';
import type { RAGContext, RAGOptions, RetrievedChunk } from '../types.js';
import type { MarkdownProcessor } from '../knowledge/markdown/MarkdownProcessor.js';
import type { FolderProcessor } from '../knowledge/folder/FolderProcessor.js';
import type { GraphProcessor } from '../knowledge/graph/GraphProcessor.js';

export class RAGPipeline {
  private mdSources: MarkdownProcessor[] = [];
  private folderSources: FolderProcessor[] = [];
  private graphSources: GraphProcessor[] = [];

  constructor(private embedder: LLMProvider) {}

  addMarkdown(p: MarkdownProcessor): void { this.mdSources.push(p); }
  addFolder(p: FolderProcessor): void { this.folderSources.push(p); }
  addGraph(p: GraphProcessor): void { this.graphSources.push(p); }

  async query(queryText: string, options?: Partial<RAGOptions>): Promise<RAGContext> {
    const t0 = Date.now();
    const topK = options?.topK ?? 5;
    const minScore = options?.minScore ?? 0.25;

    let queryEmbedding: number[] = [];
    try {
      const embs = await this.embedder.embed([queryText]);
      queryEmbedding = embs[0] ?? [];
    } catch { /* leave empty — graph search still works */ }

    const all: RetrievedChunk[] = [];
    for (const src of this.mdSources) all.push(...await src.search(queryEmbedding, topK, minScore));
    for (const src of this.folderSources) all.push(...await src.search(queryEmbedding, topK, minScore));
    all.sort((a, b) => b.score - a.score);
    const top = all.slice(0, topK);

    let graphResult = undefined;
    for (const src of this.graphSources) {
      const res = src.search(queryText, 1);
      if (res.length > 0) { graphResult = res[0]; break; }
    }

    const sources_used = [...new Set(top.map(c => c.source_file))];
    const formatted_context = buildContext(top, graphResult?.context_text);

    return {
      chunks: top,
      ...(graphResult !== undefined ? { graph_result: graphResult } : {}),
      formatted_context,
      sources_used,
      retrieval_time_ms: Date.now() - t0,
    };
  }

  get isEmpty(): boolean {
    return this.mdSources.length === 0 && this.folderSources.length === 0 && this.graphSources.length === 0;
  }
}

function buildContext(chunks: RetrievedChunk[], graphText?: string): string {
  const parts: string[] = [];
  if (chunks.length > 0) {
    parts.push('=== Retrieved Knowledge ===');
    for (const c of chunks) {
      const label = c.heading_path.length > 0 ? ` :: ${c.heading_path.join(' > ')}` : '';
      const src = c.source_file.split('/').slice(-2).join('/');
      parts.push(`[${src}${label}] (score ${c.score.toFixed(2)})\n${c.content}`);
    }
  }
  if (graphText) { parts.push('=== Knowledge Graph ==='); parts.push(graphText); }
  return parts.join('\n\n');
}

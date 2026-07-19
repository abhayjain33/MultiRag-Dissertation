import { readdir, readFile, stat } from 'node:fs/promises';
import { join, extname, relative } from 'node:path';
import matter from 'gray-matter';
import chokidar from 'chokidar';
import type { FSWatcher } from 'chokidar';
import type { LLMProvider } from '../../llm/LLMProvider.js';
import type { RetrievedChunk } from '../../types.js';
import type { KnowledgeSource } from '../../config/schemas.js';
import { cosineSimilarity } from '../../utils/similarity.js';

type MarkdownSource = Extract<KnowledgeSource, { type: 'markdown' }>;

interface Chunk {
  content: string;
  source_file: string;
  heading_path: string[];
  embedding: number[];
  metadata: Record<string, unknown>;
}

export class MarkdownProcessor {
  private chunks: Chunk[] = [];
  private watcher: FSWatcher | undefined;

  constructor(
    private source: MarkdownSource,
    private embedder: LLMProvider,
  ) {}

  async index(): Promise<void> {
    const files = await this.findFiles();
    const next: Chunk[] = [];
    for (const file of files) {
      const fc = await this.processFile(file);
      next.push(...fc);
    }
    this.chunks = next;
    console.log(`[MD:${this.source.id}] Indexed ${this.chunks.length} chunks from ${files.length} files`);
  }

  async startWatching(): Promise<void> {
    if (this.source.refresh !== 'on_change') return;
    this.watcher = chokidar.watch(this.source.path, { ignoreInitial: true });
    this.watcher.on('change', async (file) => {
      const fc = await this.processFile(file);
      this.chunks = [...this.chunks.filter(c => c.source_file !== file), ...fc];
    });
    this.watcher.on('add', async (file) => {
      if (extname(file) === '.md') {
        const fc = await this.processFile(file);
        this.chunks.push(...fc);
      }
    });
    this.watcher.on('unlink', (file) => {
      this.chunks = this.chunks.filter(c => c.source_file !== file);
    });
  }

  async stop(): Promise<void> { await this.watcher?.close(); }

  async search(queryEmbedding: number[], topK: number, minScore: number): Promise<RetrievedChunk[]> {
    if (this.chunks.length === 0 || queryEmbedding.length === 0) return [];
    return this.chunks
      .map(c => ({
        content: c.content,
        source_file: c.source_file,
        heading_path: c.heading_path,
        score: cosineSimilarity(queryEmbedding, c.embedding),
        metadata: c.metadata,
      }))
      .filter(c => c.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  private async findFiles(): Promise<string[]> {
    // The configured path may be either a single .md file or a directory.
    const root = this.source.path;
    const rootStat = await stat(root).catch(() => null);
    if (rootStat?.isFile()) {
      return extname(root) === '.md' ? [root] : [];
    }

    const files: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      let entries: string[];
      try { entries = await readdir(dir); } catch { return; }
      for (const entry of entries) {
        const full = join(dir, entry);
        const s = await stat(full).catch(() => null);
        if (!s) continue;
        if (s.isDirectory()) await walk(full);
        else if (extname(entry) === '.md') files.push(full);
      }
    };
    await walk(root);
    return files;
  }

  private async processFile(filePath: string): Promise<Chunk[]> {
    let raw: string;
    try { raw = await readFile(filePath, 'utf-8'); } catch { return []; }
    const { content, data: frontmatter } = matter(raw);
    const segments = splitByHeadings(content);
    if (segments.length === 0) return [];
    let embeddings: number[][];
    try { embeddings = await this.embedder.embed(segments.map(s => s.text)); } catch { return []; }
    return segments.map((seg, i) => ({
      content: seg.text,
      source_file: filePath,
      heading_path: seg.headingPath,
      embedding: embeddings[i] ?? [],
      metadata: {
        ...frontmatter,
        ...(this.source.metadata ?? {}),
        file: relative(this.source.path, filePath),
      },
    }));
  }
}

function splitByHeadings(content: string): { text: string; headingPath: string[] }[] {
  const lines = content.split('\n');
  const result: { text: string; headingPath: string[] }[] = [];
  const stack: string[] = [];
  let buffer: string[] = [];

  const flush = () => {
    const text = buffer.join('\n').trim();
    if (text.length > 40) result.push({ text, headingPath: [...stack] });
    buffer = [];
  };

  for (const line of lines) {
    const m = /^(#{1,6})\s+(.+)$/.exec(line);
    if (m) {
      flush();
      const level = m[1]!.length - 1;
      stack.splice(level);
      stack[level] = m[2]!;
    } else {
      buffer.push(line);
    }
  }
  flush();

  if (result.length === 0) {
    for (const para of content.split(/\n\n+/)) {
      const t = para.trim();
      if (t.length > 40) result.push({ text: t, headingPath: [] });
    }
  }
  return result;
}

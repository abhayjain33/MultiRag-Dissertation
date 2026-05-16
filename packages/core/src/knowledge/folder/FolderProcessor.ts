import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import chokidar from 'chokidar';
import type { FSWatcher } from 'chokidar';
import type { LLMProvider } from '../../llm/LLMProvider.js';
import type { RetrievedChunk } from '../../types.js';
import type { KnowledgeSource } from '../../config/schemas.js';
import { cosineSimilarity } from '../../utils/similarity.js';

type FolderSource = Extract<KnowledgeSource, { type: 'folder' }>;

interface Chunk {
  content: string;
  source_file: string;
  embedding: number[];
}

export class FolderProcessor {
  private chunks: Chunk[] = [];
  private watcher: FSWatcher | undefined;

  constructor(
    private source: FolderSource,
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
    console.log(`[Folder:${this.source.id}] Indexed ${this.chunks.length} chunks from ${files.length} files`);
  }

  async startWatching(): Promise<void> {
    if (!this.source.watch && this.source.refresh !== 'live') return;
    this.watcher = chokidar.watch(this.source.path, { ignoreInitial: true, persistent: true });
    this.watcher.on('change', async (file) => {
      if (!this.matchesFilters(file)) return;
      const fc = await this.processFile(file);
      this.chunks = [...this.chunks.filter(c => c.source_file !== file), ...fc];
    });
    this.watcher.on('add', async (file) => {
      if (this.matchesFilters(file)) {
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
        heading_path: [] as string[],
        score: cosineSimilarity(queryEmbedding, c.embedding),
        metadata: { file: relative(this.source.path, c.source_file) } as Record<string, unknown>,
      }))
      .filter(c => c.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  private matchesFilters(file: string): boolean {
    const name = file.split('/').pop() ?? '';
    const include: string[] = this.source.filters?.include ?? [];
    const exclude: string[] = this.source.filters?.exclude ?? [];
    if (include.length > 0 && !include.some(p => matchGlob(name, p))) return false;
    if (exclude.some(p => matchGlob(name, p))) return false;
    return true;
  }

  private async findFiles(): Promise<string[]> {
    const files: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      let entries: string[];
      try { entries = await readdir(dir); } catch { return; }
      for (const entry of entries) {
        const full = join(dir, entry);
        const s = await stat(full).catch(() => null);
        if (!s) continue;
        if (s.isDirectory()) await walk(full);
        else if (this.matchesFilters(full)) files.push(full);
      }
    };
    await walk(this.source.path);
    return files;
  }

  private async processFile(filePath: string): Promise<Chunk[]> {
    let text: string;
    try {
      if (this.source.index_strategy === 'tail' && this.source.tail_lines) {
        text = await tailFile(filePath, this.source.tail_lines);
      } else {
        text = await readFile(filePath, 'utf-8');
      }
    } catch { return []; }

    const segments = chunkText(text, 1200);
    if (segments.length === 0) return [];
    let embeddings: number[][];
    try { embeddings = await this.embedder.embed(segments); } catch { return []; }
    return segments.map((s, i) => ({ content: s, source_file: filePath, embedding: embeddings[i] ?? [] }));
  }
}

async function tailFile(path: string, lines: number): Promise<string> {
  const all: string[] = [];
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of rl) all.push(line);
  return all.slice(-lines).join('\n');
}

function chunkText(text: string, maxChars: number): string[] {
  const paras = text.split(/\n\n+/);
  const chunks: string[] = [];
  let cur = '';
  for (const p of paras) {
    if (cur.length + p.length > maxChars && cur.length > 0) { chunks.push(cur.trim()); cur = ''; }
    cur += (cur ? '\n\n' : '') + p;
  }
  if (cur.trim().length > 20) chunks.push(cur.trim());
  return chunks.filter(c => c.length > 20);
}

function matchGlob(name: string, pattern: string): boolean {
  const regex = new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*') + '$');
  return regex.test(name);
}

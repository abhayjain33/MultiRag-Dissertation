import { readFile } from 'node:fs/promises';
import type { Entity, Relationship, GraphRAGResult } from '../../types.js';
import type { KnowledgeSource } from '../../config/schemas.js';

type GraphSource = Extract<KnowledgeSource, { type: 'knowledge_graph' }>;

interface GraphData { entities: Entity[]; relationships: Relationship[]; }

export class GraphProcessor {
  private entities: Map<string, Entity> = new Map();
  private adjacency: Map<string, Relationship[]> = new Map();
  private loaded = false;

  constructor(private source: GraphSource) {}

  async load(): Promise<void> {
    let raw: string;
    try { raw = await readFile(this.source.path, 'utf-8'); }
    catch (e) { throw new Error(`[Graph:${this.source.id}] Cannot read KG file: ${String(e)}`); }

    let data: GraphData;
    try { data = JSON.parse(raw) as GraphData; }
    catch (e) { throw new Error(`[Graph:${this.source.id}] Invalid JSON: ${String(e)}`); }

    this.entities.clear();
    this.adjacency.clear();
    for (const e of data.entities) this.entities.set(e.id, e);
    for (const r of data.relationships) {
      const list = this.adjacency.get(r.from) ?? [];
      list.push(r);
      this.adjacency.set(r.from, list);
    }
    this.loaded = true;
    console.log(`[Graph:${this.source.id}] Loaded ${this.entities.size} entities`);
  }

  search(query: string, topK = 3): GraphRAGResult[] {
    if (!this.loaded) return [];
    const q = query.toLowerCase();
    const matched = [...this.entities.values()]
      .map(e => ({ e, score: scoreEntity(e, q) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return matched.map(({ e }) => {
      const { related, rels } = this.traverse(e.id, this.source.traversal_depth);
      return {
        matched_entity: e,
        related_entities: related,
        relationships: rels,
        context_text: formatContext(e, related, rels),
      };
    });
  }

  private traverse(startId: string, depth: number): { related: Entity[]; rels: Relationship[] } {
    const visited = new Set<string>([startId]);
    const relSeen = new Set<string>();
    const related: Entity[] = [];
    const rels: Relationship[] = [];
    let frontier = [startId];

    for (let d = 0; d < depth; d++) {
      const next: string[] = [];
      for (const nodeId of frontier) {
        for (const rel of this.adjacency.get(nodeId) ?? []) {
          const key = `${rel.from}:${rel.type}:${rel.to}`;
          if (!relSeen.has(key)) { relSeen.add(key); rels.push(rel); }
          if (!visited.has(rel.to)) {
            visited.add(rel.to);
            const entity = this.entities.get(rel.to);
            if (entity) { related.push(entity); next.push(rel.to); }
          }
        }
      }
      frontier = next;
      if (frontier.length === 0) break;
    }
    return { related, rels };
  }
}

function scoreEntity(e: Entity, q: string): number {
  let s = 0;
  if (e.label.toLowerCase().includes(q)) s += 2;
  if (e.type.toLowerCase().includes(q)) s += 1;
  for (const v of Object.values(e.properties)) {
    if (String(v).toLowerCase().includes(q)) s += 0.5;
  }
  return s;
}

function formatContext(root: Entity, related: Entity[], rels: Relationship[]): string {
  const lines = [`Entity: ${root.label} (${root.type})`];
  for (const [k, v] of Object.entries(root.properties)) lines.push(`  ${k}: ${String(v)}`);
  if (rels.length > 0) {
    lines.push('Relationships:');
    for (const r of rels.slice(0, 8)) {
      const to = related.find(e => e.id === r.to);
      lines.push(`  ${root.label} --[${r.type}]--> ${to?.label ?? r.to}`);
    }
  }
  if (related.length > 0) lines.push('Related: ' + related.slice(0, 5).map(e => `${e.label}(${e.type})`).join(', '));
  return lines.join('\n');
}

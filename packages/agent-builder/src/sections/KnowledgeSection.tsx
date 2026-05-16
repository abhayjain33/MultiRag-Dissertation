import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useStore } from '@/store/agentBuilderStore';
import type { KnowledgeSourceForm } from '@/store/agentBuilderStore';
import { Field, Input, Select, Row, SectionCard, Button } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

const TYPE_LABELS: Record<KnowledgeSourceForm['type'], { label: string; icon: string; description: string }> = {
  markdown: { label: 'Markdown Docs', icon: '📄', description: 'MD files chunked, embedded, and vector-searched' },
  folder: { label: 'Folder / Logs', icon: '📁', description: 'Live log files or any folder; supports tail & watch' },
  knowledge_graph: { label: 'Knowledge Graph', icon: '🕸️', description: 'GraphRAG JSON — entity search + graph traversal' },
};

export function KnowledgeSection() {
  const { knowledge_sources, knowledge_embedding_model, knowledge_vector_store, knowledge_vector_store_path, set, addSource, removeSource, patchSource } = useStore();
  const [open, setOpen] = useState<number | null>(null);

  return (
    <SectionCard
      title="③ Knowledge Sources"
      subtitle="What the agent retrieves context from"
      badge={
        <Button variant="primary" size="xs" onClick={addSource}>
          <Plus size={12} /> Add source
        </Button>
      }
    >
      {/* Global knowledge settings */}
      <Row cols={3}>
        <Field label="Embedding Model" hint="Used for all vector indexing">
          <Select
            value={knowledge_embedding_model}
            onChange={(e) => set('knowledge_embedding_model', e.target.value)}
            options={[
              { value: 'text-embedding-3-small', label: 'text-embedding-3-small (OpenAI)' },
              { value: 'text-embedding-3-large', label: 'text-embedding-3-large (OpenAI)' },
              { value: 'nomic-embed-text', label: 'nomic-embed-text (Ollama)' },
              { value: 'voyage-3', label: 'voyage-3 (Anthropic)' },
            ]}
          />
        </Field>
        <Field label="Vector Store">
          <Select value={knowledge_vector_store} onChange={(e) => set('knowledge_vector_store', e.target.value as typeof knowledge_vector_store)} options={[{ value: 'local', label: 'Local (sqlite-vec)' }, { value: 'chroma', label: 'Chroma (remote)' }, { value: 'qdrant', label: 'Qdrant (remote)' }]} />
        </Field>
        <Field label="Vector Store Path" hint="Where to persist index data">
          <Input value={knowledge_vector_store_path} onChange={(e) => set('knowledge_vector_store_path', e.target.value)} placeholder="./data/vectors/agent-name/" mono />
        </Field>
      </Row>

      {/* Source cards */}
      {knowledge_sources.length === 0 && (
        <div className="text-center py-8 text-gray-400 border-2 border-dashed border-gray-200 rounded-lg text-sm">
          No knowledge sources yet.<br />
          <button onClick={addSource} className="mt-1 text-indigo-500 hover:underline">+ Add your first source</button>
        </div>
      )}

      {knowledge_sources.map((src, i) => {
        const cfg = TYPE_LABELS[src.type];
        const isOpen = open === i;
        return (
          <div key={src._key} className="border border-gray-200 rounded-lg overflow-hidden">
            {/* Header row */}
            <button
              className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
              onClick={() => setOpen(isOpen ? null : i)}
            >
              <span className="text-lg">{cfg.icon}</span>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-gray-800">{cfg.label}</span>
                <span className="ml-2 text-xs text-gray-400 truncate">{src.path || 'path not set'}</span>
              </div>
              <button onClick={(e) => { e.stopPropagation(); removeSource(i); }} className="text-gray-300 hover:text-red-500 p-1"><Trash2 size={13} /></button>
              {isOpen ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
            </button>

            {/* Expanded fields */}
            {isOpen && (
              <div className="px-4 py-4 space-y-4 bg-white">
                <Row cols={3}>
                  <Field label="Source ID" required hint="Unique identifier for this source">
                    <Input value={src.id} onChange={(e) => patchSource(i, { id: e.target.value })} placeholder="runbooks" mono />
                  </Field>
                  <Field label="Type">
                    <Select value={src.type} onChange={(e) => patchSource(i, { type: e.target.value as KnowledgeSourceForm['type'] })} options={Object.entries(TYPE_LABELS).map(([v, c]) => ({ value: v, label: `${c.icon} ${c.label}` }))} />
                  </Field>
                  <Field label="Refresh strategy">
                    <Select value={src.refresh} onChange={(e) => patchSource(i, { refresh: e.target.value })} options={src.type === 'folder' ? [{ value: 'live', label: 'Live (real-time)' }, { value: 'on_change', label: 'On change' }, { value: 'hourly', label: 'Hourly' }, { value: 'manual', label: 'Manual' }] : [{ value: 'on_change', label: 'On change' }, { value: 'hourly', label: 'Hourly' }, { value: 'daily', label: 'Daily' }, { value: 'manual', label: 'Manual' }]} />
                  </Field>
                </Row>

                <Field label="Path" required hint={src.type === 'knowledge_graph' ? 'Path to the .json KG file' : 'Directory path relative to the agent config file'}>
                  <Input value={src.path} onChange={(e) => patchSource(i, { path: e.target.value })} placeholder={src.type === 'knowledge_graph' ? './kg/platform_kg.json' : './kb/runbooks/'} mono />
                </Field>

                {src.type === 'markdown' && (
                  <>
                    <Field label="Glob pattern" hint="File pattern to match within the directory">
                      <Input value={src.glob} onChange={(e) => patchSource(i, { glob: e.target.value })} placeholder="**/*.md" mono />
                    </Field>
                    <Row>
                      <Field label="Metadata category">
                        <Input value={src.metadata_category} onChange={(e) => patchSource(i, { metadata_category: e.target.value })} placeholder="runbook" />
                      </Field>
                      <Field label="Metadata priority">
                        <Select value={src.metadata_priority} onChange={(e) => patchSource(i, { metadata_priority: e.target.value })} options={[{ value: '', label: '— none' }, { value: 'high', label: 'High' }, { value: 'medium', label: 'Medium' }, { value: 'low', label: 'Low' }]} />
                      </Field>
                    </Row>
                  </>
                )}

                {src.type === 'folder' && (
                  <>
                    <Row cols={3}>
                      <Field label="Index strategy">
                        <Select value={src.index_strategy} onChange={(e) => patchSource(i, { index_strategy: e.target.value })} options={[{ value: 'full', label: 'Full' }, { value: 'tail', label: 'Tail (last N lines)' }, { value: 'incremental', label: 'Incremental' }]} />
                      </Field>
                      {src.index_strategy === 'tail' && (
                        <Field label="Tail lines" hint="Only index last N lines">
                          <Input type="number" value={src.tail_lines} onChange={(e) => patchSource(i, { tail_lines: e.target.value })} placeholder="5000" />
                        </Field>
                      )}
                      <Field label="Watch folder">
                        <label className="flex items-center gap-2 mt-2 cursor-pointer">
                          <input type="checkbox" checked={src.watch} onChange={(e) => patchSource(i, { watch: e.target.checked })} className="rounded accent-indigo-600" />
                          <span className="text-sm text-gray-600">Enable live watching</span>
                        </label>
                      </Field>
                    </Row>
                    <Row>
                      <Field label="Include patterns" hint="Comma-separated, e.g. *.log, *.err">
                        <Input value={src.filters_include} onChange={(e) => patchSource(i, { filters_include: e.target.value })} placeholder="*.log, *.err" mono />
                      </Field>
                      <Field label="Exclude patterns" hint="Comma-separated, e.g. *.gz, *.zip">
                        <Input value={src.filters_exclude} onChange={(e) => patchSource(i, { filters_exclude: e.target.value })} placeholder="*.gz, *.zip" mono />
                      </Field>
                    </Row>
                  </>
                )}

                {src.type === 'knowledge_graph' && (
                  <Row>
                    <Field label="Format">
                      <Select value={src.format} onChange={(e) => patchSource(i, { format: e.target.value })} options={[{ value: 'graphrag', label: 'GraphRAG (platform default)' }, { value: 'custom', label: 'Custom' }]} />
                    </Field>
                    <Field label="Traversal depth" hint="How many hops to follow from a matched entity">
                      <Input type="number" value={src.traversal_depth} onChange={(e) => patchSource(i, { traversal_depth: e.target.value })} min={1} max={10} />
                    </Field>
                  </Row>
                )}
              </div>
            )}
          </div>
        );
      })}
    </SectionCard>
  );
}

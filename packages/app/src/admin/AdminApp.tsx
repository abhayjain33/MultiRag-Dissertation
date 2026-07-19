import { useState, useEffect, useCallback } from 'react';
import { Copy, Download, CheckCircle, AlertCircle, ChevronDown, FileCode2, UploadCloud, Eye, RefreshCw } from 'lucide-react';
import { useStore } from '@/admin/store/agentBuilderStore';
import { toYamlString, fromYamlString, validate, highlightYaml, PRESETS } from '@/admin/lib/yaml';
import { AgentInfoSection } from '@/admin/sections/AgentInfoSection';
import { LLMSection } from '@/admin/sections/LLMSection';
import { KnowledgeSection } from '@/admin/sections/KnowledgeSection';
import { SkillsSection } from '@/admin/sections/SkillsSection';
import { MCPSection } from '@/admin/sections/MCPSection';
import { RoutingSection } from '@/admin/sections/RoutingSection';

// ─── Yaml preview panel ────────────────────────────────────────────────────────

function YamlPanel() {
  const store = useStore();
  const [mode, setMode] = useState<'preview' | 'paste'>('preview');
  const [pasteValue, setPasteValue] = useState('');
  const [copied, setCopied] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);

  const yaml = toYamlString(store);
  const issues = validate(store);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(yaml).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [yaml]);

  const handleDownload = useCallback(() => {
    const filename = `${store.name || 'agent'}.yaml`;
    const blob = new Blob([yaml], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, [yaml, store.name]);

  const handleImport = useCallback(() => {
    setImportError(null);
    setImportSuccess(false);
    const { patch, error } = fromYamlString(pasteValue);
    if (error) {
      setImportError(error);
      return;
    }
    store.merge(patch);
    setImportSuccess(true);
    setPasteValue('');
    setTimeout(() => { setImportSuccess(false); setMode('preview'); }, 1200);
  }, [pasteValue, store]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 bg-white flex-shrink-0">
        <FileCode2 size={15} className="text-indigo-500" />
        <span className="text-sm font-semibold text-gray-700 flex-1">Live YAML Preview</span>
        <button
          onClick={() => { setMode(mode === 'preview' ? 'paste' : 'preview'); setImportError(null); }}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-indigo-600 px-2 py-1 rounded border border-gray-200 hover:border-indigo-300 transition-colors"
        >
          {mode === 'preview' ? <><UploadCloud size={12} /> Import YAML</> : <><Eye size={12} /> Show preview</>}
        </button>
        <button onClick={handleCopy} className="flex items-center gap-1 text-xs text-gray-500 hover:text-indigo-600 px-2 py-1 rounded border border-gray-200 hover:border-indigo-300 transition-colors">
          {copied ? <><CheckCircle size={12} className="text-green-500" /> Copied!</> : <><Copy size={12} /> Copy</>}
        </button>
        <button onClick={handleDownload} className="flex items-center gap-1 text-xs text-gray-500 hover:text-indigo-600 px-2 py-1 rounded border border-gray-200 hover:border-indigo-300 transition-colors">
          <Download size={12} /> Download
        </button>
      </div>

      {issues.length > 0 && (
        <div className="px-4 py-2 border-b border-gray-200 bg-white flex-shrink-0 space-y-1">
          {issues.map((issue, i) => (
            <div key={i} className="flex items-start gap-1.5 text-xs text-red-600">
              <AlertCircle size={11} className="mt-0.5 flex-shrink-0" />
              <span><span className="font-medium">{issue.section}:</span> {issue.message}</span>
            </div>
          ))}
        </div>
      )}
      {issues.length === 0 && (
        <div className="px-4 py-2 border-b border-gray-200 bg-green-50 flex-shrink-0">
          <div className="flex items-center gap-1.5 text-xs text-green-600">
            <CheckCircle size={11} /> Config is valid — ready to use
          </div>
        </div>
      )}

      <div className="flex-1 overflow-hidden">
        {mode === 'preview' ? (
          <pre
            className="h-full overflow-auto p-4 text-xs leading-relaxed font-mono scrollbar-thin bg-gray-900 text-gray-100"
            dangerouslySetInnerHTML={{ __html: highlightYaml(yaml) }}
          />
        ) : (
          <div className="h-full flex flex-col p-4 gap-3 bg-white">
            <p className="text-xs text-gray-500">Paste an existing <code className="bg-gray-100 px-1 rounded">agent.yaml</code> to import it into the form.</p>
            <textarea
              className="flex-1 resize-none font-mono text-xs border border-gray-200 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-indigo-300 scrollbar-thin bg-gray-50"
              placeholder="# Paste your agent.yaml here…"
              value={pasteValue}
              onChange={(e) => { setPasteValue(e.target.value); setImportError(null); }}
              spellCheck={false}
            />
            {importError && (
              <div className="flex items-start gap-1.5 text-xs text-red-600 bg-red-50 rounded-lg p-2">
                <AlertCircle size={11} className="mt-0.5 flex-shrink-0" />
                <span>{importError}</span>
              </div>
            )}
            {importSuccess && (
              <div className="flex items-center gap-1.5 text-xs text-green-600 bg-green-50 rounded-lg p-2">
                <CheckCircle size={11} /> Imported successfully!
              </div>
            )}
            <button
              onClick={handleImport}
              disabled={!pasteValue.trim()}
              className="flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <UploadCloud size={14} /> Import into form
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Preset selector ───────────────────────────────────────────────────────────

function PresetSelector() {
  const store = useStore();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-indigo-600 border border-gray-200 hover:border-indigo-300 rounded-lg px-3 py-1.5 transition-colors bg-white"
      >
        <RefreshCw size={13} /> Load preset <ChevronDown size={12} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 w-72 bg-white rounded-xl shadow-xl border border-gray-200 z-20 overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">Example agents</div>
            {PRESETS.map((preset) => (
              <button
                key={preset.name}
                onClick={() => {
                  const { patch, error } = fromYamlString(preset.yaml);
                  if (!error) store.merge(patch);
                  setOpen(false);
                }}
                className="w-full text-left px-4 py-3 hover:bg-indigo-50 transition-colors border-b border-gray-50 last:border-0"
              >
                <div className="text-sm font-medium text-gray-800">{preset.name}</div>
                <div className="text-xs text-gray-400 mt-0.5">{preset.description}</div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Section nav ───────────────────────────────────────────────────────────────

const SECTIONS = [
  { id: 'info', label: 'Agent Info', num: '①' },
  { id: 'llm', label: 'LLM Config', num: '②' },
  { id: 'knowledge', label: 'Knowledge', num: '③' },
  { id: 'skills', label: 'Skills', num: '④' },
  { id: 'mcp', label: 'MCP Tools', num: '⑤' },
  { id: 'routing', label: 'Routing', num: '⑥' },
];

function SectionNav() {
  const scrollTo = (id: string) => {
    document.getElementById(`section-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  return (
    <nav className="hidden xl:flex items-center gap-1 flex-wrap">
      {SECTIONS.map(s => (
        <button
          key={s.id}
          onClick={() => scrollTo(s.id)}
          className="text-xs text-gray-500 hover:text-indigo-600 px-2 py-1 rounded hover:bg-indigo-50 transition-colors"
        >
          {s.num} {s.label}
        </button>
      ))}
    </nav>
  );
}

// ─── Reset button ──────────────────────────────────────────────────────────────

function ResetButton() {
  const [confirm, setConfirm] = useState(false);
  const store = useStore();
  if (confirm) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500">Reset all fields?</span>
        <button onClick={() => { store.reset(); setConfirm(false); }} className="text-xs text-red-600 font-medium hover:underline">Yes, reset</button>
        <button onClick={() => setConfirm(false)} className="text-xs text-gray-400 hover:underline">Cancel</button>
      </div>
    );
  }
  return (
    <button onClick={() => setConfirm(true)} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
      Reset
    </button>
  );
}

// ─── AdminApp ──────────────────────────────────────────────────────────────────

export function AdminApp() {
  const store = useStore();

  useEffect(() => {
    const saved = localStorage.getItem('agent-builder-state');
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Record<string, unknown>;
        store.merge(parsed);
      } catch {
        // ignore corrupt state
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = setTimeout(() => {
      localStorage.setItem('agent-builder-state', JSON.stringify(store));
    }, 500);
    return () => clearTimeout(id);
  });

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Sub-header */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-4">
        <div>
          <div className="text-sm font-bold text-gray-900 leading-none">Agent Builder</div>
          <div className="text-[10px] text-gray-400 leading-none mt-0.5">Configure agents via YAML — no code required</div>
        </div>
        <div className="h-5 w-px bg-gray-200" />
        <SectionNav />
        <div className="flex-1" />
        <ResetButton />
        <div className="h-5 w-px bg-gray-200" />
        <PresetSelector />
      </div>

      {/* Main split panel */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left — form */}
        <div className="flex-1 overflow-y-auto scrollbar-thin p-6 space-y-6 min-w-0">
          <div id="section-info"><AgentInfoSection /></div>
          <div id="section-llm"><LLMSection /></div>
          <div id="section-knowledge"><KnowledgeSection /></div>
          <div id="section-skills"><SkillsSection /></div>
          <div id="section-mcp"><MCPSection /></div>
          <div id="section-routing"><RoutingSection /></div>
          <div className="h-16" />
        </div>

        {/* Right — YAML panel */}
        <div className="w-[420px] flex-shrink-0 border-l border-gray-200 flex flex-col overflow-hidden">
          <YamlPanel />
        </div>
      </div>
    </div>
  );
}

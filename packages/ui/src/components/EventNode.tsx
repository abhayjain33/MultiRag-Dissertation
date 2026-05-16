import { useState } from 'react';
import {
  Search, Brain, ArrowUpRight, CheckCircle, ChevronDown, Loader2,
  FileText, AlertTriangle, Database, Code2, GitBranch, Download,
} from 'lucide-react';
import type { ChainNode, TicketRole, KBLookupPayload, L1AnalysisPayload, L2AnalysisPayload, ResolutionPayload } from '@/types/ticket';
import { formatTime } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { PriorityBadge } from './ui/badge';

interface Props {
  node: ChainNode;
  role: TicketRole;
}

const nodeConfig: Record<ChainNode['type'], { icon: React.ReactNode; label: string; color: string; bg: string; ring: string }> = {
  ticket_raised: {
    icon: <FileText size={14} />,
    label: 'Ticket Raised',
    color: 'text-indigo-600',
    bg: 'bg-indigo-600',
    ring: 'ring-indigo-200',
  },
  kb_lookup: {
    icon: <Search size={14} />,
    label: 'KB Lookup',
    color: 'text-blue-600',
    bg: 'bg-blue-500',
    ring: 'ring-blue-200',
  },
  l1_analysis: {
    icon: <Brain size={14} />,
    label: 'L1 Analysis',
    color: 'text-amber-600',
    bg: 'bg-amber-500',
    ring: 'ring-amber-200',
  },
  l2_analysis: {
    icon: <Brain size={14} />,
    label: 'L2 Analysis',
    color: 'text-orange-600',
    bg: 'bg-orange-500',
    ring: 'ring-orange-200',
  },
  resolution: {
    icon: <CheckCircle size={14} />,
    label: 'Resolution',
    color: 'text-green-600',
    bg: 'bg-green-500',
    ring: 'ring-green-200',
  },
  acknowledged: {
    icon: <CheckCircle size={14} />,
    label: 'Acknowledged',
    color: 'text-green-600',
    bg: 'bg-green-400',
    ring: 'ring-green-200',
  },
  thinking: {
    icon: <Loader2 size={14} className="animate-spin" />,
    label: 'Processing…',
    color: 'text-gray-500',
    bg: 'bg-gray-400',
    ring: 'ring-gray-200',
  },
};

export function EventNode({ node, role }: Props) {
  const [expanded, setExpanded] = useState(node.is_current);
  const cfg = nodeConfig[node.type];

  return (
    <div id={node.id} className="relative z-10 w-full max-w-xs mx-auto">
      {/* Trigger button */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className={cn(
          'w-full flex items-start gap-2 text-left rounded-lg px-2.5 py-2',
          'hover:bg-gray-50 transition-colors group',
        )}
      >
        {/* Node circle */}
        <div className="relative mt-0.5 shrink-0">
          <div
            className={cn(
              'w-6 h-6 rounded-full flex items-center justify-center text-white',
              cfg.bg,
              node.is_current && `ring-4 ${cfg.ring}`,
            )}
          >
            {cfg.icon}
          </div>
          {node.is_current && (
            <span className={cn('absolute inset-0 rounded-full animate-ping opacity-30', cfg.bg)} />
          )}
        </div>

        {/* Label + summary */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <span className={cn('text-xs font-semibold', cfg.color)}>{cfg.label}</span>
            <span className="text-[10px] text-gray-400 font-mono shrink-0">
              {formatTime(node.timestamp)}
            </span>
          </div>
          <p className="text-xs text-gray-500 truncate mt-0.5">{node.summary}</p>
        </div>

        <ChevronDown
          size={13}
          className={cn('mt-1 shrink-0 text-gray-400 transition-transform', expanded && 'rotate-180')}
        />
      </button>

      {/* Expanded panel */}
      {expanded && (
        <div className="ml-8 mt-1 mb-3 rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden text-xs">
          {node.type === 'kb_lookup' && (
            <KBLookupDetail payload={node.payload as KBLookupPayload} role={role} />
          )}
          {node.type === 'l1_analysis' && (
            <L1AnalysisDetail payload={node.payload as L1AnalysisPayload} role={role} />
          )}
          {node.type === 'l2_analysis' && (
            <L2AnalysisDetail payload={node.payload as L2AnalysisPayload} role={role} />
          )}
          {node.type === 'resolution' && (
            <ResolutionDetail payload={node.payload as ResolutionPayload} role={role} nodeId={node.id} />
          )}
          {node.type === 'ticket_raised' && (
            <div className="p-3 text-gray-600">Ticket submitted by user.</div>
          )}
          {node.type === 'acknowledged' && (
            <div className="p-3 text-green-700 font-medium">User confirmed resolution.</div>
          )}
          {node.type === 'thinking' && (
            <div className="p-3 flex items-center gap-2 text-gray-500">
              <Loader2 size={14} className="animate-spin" /> Agent is processing…
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── KB Lookup Detail ──────────────────────────────────────────────────────────

function KBLookupDetail({ payload, role }: { payload: KBLookupPayload; role: TicketRole }) {
  const showFull = role !== 'trader';
  return (
    <div className="divide-y divide-gray-100">
      <div className="px-3 py-2 bg-gray-50">
        <span className="font-medium text-gray-700">KB Lookup</span>
        <span className="ml-2 text-gray-400">{payload.sources_searched.length} sources searched</span>
      </div>
      {showFull && (
        <div className="px-3 py-2 space-y-1">
          <div className="text-gray-500">Sources: {payload.sources_searched.join(' · ')}</div>
          <div className="text-gray-700 font-mono bg-gray-50 rounded px-2 py-1 text-[10px] leading-relaxed break-words">
            Query: &ldquo;{payload.query}&rdquo;
          </div>
          <div className="mt-2 space-y-1">
            {payload.results.map((r, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="shrink-0 text-gray-300">{i === 0 ? '├──' : i === payload.results.length - 1 ? '└──' : '├──'}</span>
                <span
                  className={cn(
                    'font-mono font-bold',
                    r.score >= 0.8 ? 'text-green-600' : r.score >= 0.7 ? 'text-amber-600' : 'text-gray-500',
                  )}
                >
                  [{r.score.toFixed(2)}]
                </span>
                <span className="text-gray-700">{r.source}</span>
                <span
                  className={cn(
                    'ml-auto shrink-0 text-[10px] rounded-full px-1.5',
                    r.match === 'direct' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700',
                  )}
                >
                  {r.match}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="px-3 py-2 bg-amber-50 text-amber-800">
        <AlertTriangle size={11} className="inline mr-1" />
        {payload.decision}
      </div>
    </div>
  );
}

// ── L1 Analysis Detail ────────────────────────────────────────────────────────

function L1AnalysisDetail({ payload, role }: { payload: L1AnalysisPayload; role: TicketRole }) {
  const showFull = role === 'support' || role === 'dev' || role === 'full';

  return (
    <div className="divide-y divide-gray-100">
      <div className="px-3 py-2 bg-gray-50 flex items-center gap-2">
        <span className="font-medium text-gray-700">L1 Analysis</span>
        <PriorityBadge priority={payload.severity} />
        <span
          className={cn(
            'ml-auto text-[10px] font-bold rounded-full px-2 py-0.5',
            payload.decision === 'ESCALATE' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700',
          )}
        >
          {payload.decision}
        </span>
      </div>

      {/* Trader view — plain language summary */}
      <div className="px-3 py-2">
        <div className="text-gray-500 text-[10px] font-semibold uppercase tracking-wide mb-1">
          {showFull ? 'Trader summary' : 'Summary'}
        </div>
        <p className="text-gray-700 leading-relaxed">{payload.summary_plain}</p>
      </div>

      {/* Support/Dev view — full detail */}
      {showFull && (
        <>
          <div className="px-3 py-2 space-y-1">
            <Detail label="Failure component" value={payload.failure_component} />
            <Detail label="Matched failure mode" value={payload.matched_failure_mode} />
          </div>

          <div className="px-3 py-2">
            <div className="text-gray-500 text-[10px] font-semibold uppercase tracking-wide mb-2">Evidence</div>
            <div className="space-y-1.5">
              {payload.evidence.map((e, i) => (
                <EvidenceRow key={i} item={e} />
              ))}
            </div>
          </div>

          <div className="px-3 py-2">
            <div className="text-gray-500 text-[10px] font-semibold uppercase tracking-wide mb-1">Recommended steps</div>
            <ol className="list-decimal list-inside space-y-0.5 text-gray-700">
              {payload.recommended_steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </div>

          {payload.runbook_reference && (
            <div className="px-3 py-2 text-indigo-600">
              <FileText size={11} className="inline mr-1" />
              Runbook: {payload.runbook_reference}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── L2 Analysis Detail ────────────────────────────────────────────────────────

function L2AnalysisDetail({ payload, role }: { payload: L2AnalysisPayload; role: TicketRole }) {
  const showDev = role === 'dev' || role === 'full';
  const showSupport = role === 'support' || showDev;

  return (
    <div className="divide-y divide-gray-100">
      <div className="px-3 py-2 bg-gray-50 flex items-center gap-2">
        <span className="font-medium text-gray-700">L2 Analysis</span>
        {payload.in_progress && (
          <span className="flex items-center gap-1 text-orange-600">
            <Loader2 size={11} className="animate-spin" /> in progress…
          </span>
        )}
      </div>

      {/* Trader view */}
      <div className="px-3 py-2">
        <div className="text-gray-500 text-[10px] font-semibold uppercase tracking-wide mb-1">
          {showSupport ? 'Trader summary' : 'Summary'}
        </div>
        <p className="text-gray-700 leading-relaxed">{payload.summary_plain}</p>
      </div>

      {/* Dev-only detail */}
      {showDev && (
        <>
          {payload.db_query && (
            <div className="px-3 py-2">
              <div className="flex items-center gap-1 text-gray-500 text-[10px] font-semibold uppercase tracking-wide mb-1">
                <Database size={10} /> DB Query
              </div>
              <pre className="bg-gray-900 text-green-400 rounded p-2 text-[10px] overflow-x-auto leading-relaxed">{payload.db_query}</pre>
              {payload.db_result && (
                <div className="mt-1 text-amber-700 bg-amber-50 rounded px-2 py-1">{payload.db_result}</div>
              )}
            </div>
          )}

          {payload.code_reference && (
            <div className="px-3 py-2">
              <div className="flex items-center gap-1 text-gray-500 text-[10px] font-semibold uppercase tracking-wide mb-1">
                <Code2 size={10} /> Code Reference
              </div>
              <pre className="text-[10px] text-gray-700 bg-gray-50 rounded p-2 leading-relaxed whitespace-pre-wrap">{payload.code_reference}</pre>
            </div>
          )}

          {payload.kg_traversal && (
            <div className="px-3 py-2">
              <div className="flex items-center gap-1 text-gray-500 text-[10px] font-semibold uppercase tracking-wide mb-1">
                <GitBranch size={10} /> KG Traversal
              </div>
              <pre className="text-[10px] text-gray-700 bg-gray-50 rounded p-2 leading-relaxed">{payload.kg_traversal}</pre>
            </div>
          )}
        </>
      )}

      {showSupport && payload.root_cause && (
        <div className="px-3 py-2 bg-red-50">
          <div className="text-red-600 text-[10px] font-semibold uppercase tracking-wide mb-1">Root Cause</div>
          <p className="text-red-800 leading-relaxed">{payload.root_cause}</p>
        </div>
      )}

      {showDev && payload.fix_options && (
        <div className="px-3 py-2">
          <div className="text-gray-500 text-[10px] font-semibold uppercase tracking-wide mb-1">Fix Options</div>
          <ul className="space-y-1 text-gray-700">
            {payload.fix_options.map((opt, i) => (
              <li key={i} className="flex gap-1">
                <span className="text-gray-400 shrink-0">•</span> {opt}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Resolution Detail ─────────────────────────────────────────────────────────

function ResolutionDetail({ payload, role: _role, nodeId }: { payload: ResolutionPayload; role: TicketRole; nodeId: string }) {
  return (
    <div className="divide-y divide-gray-100">
      <div className="px-3 py-2 bg-green-50 flex items-center gap-2">
        <CheckCircle size={13} className="text-green-600" />
        <span className="font-medium text-green-800">Resolution</span>
      </div>

      <div className="px-3 py-2 space-y-2">
        <div>
          <div className="text-gray-500 text-[10px] font-semibold uppercase tracking-wide mb-1">Root cause</div>
          <p className="text-gray-700 leading-relaxed">{payload.root_cause_summary}</p>
        </div>
        <div>
          <div className="text-gray-500 text-[10px] font-semibold uppercase tracking-wide mb-1">Action taken</div>
          <p className="text-gray-700 leading-relaxed">{payload.action_taken}</p>
        </div>
        {payload.permanent_fix && (
          <div>
            <div className="text-gray-500 text-[10px] font-semibold uppercase tracking-wide mb-1">Permanent fix</div>
            <p className="text-gray-700 leading-relaxed">{payload.permanent_fix}</p>
          </div>
        )}
      </div>

      <div className="px-3 py-2 flex flex-wrap gap-3 text-indigo-600">
        {payload.l1_report_id && (
          <a href={`#${payload.l1_report_id}`} className="flex items-center gap-1 hover:underline">
            <ArrowUpRight size={11} /> L1 Report
          </a>
        )}
        {payload.l2_report_id && (
          <a href={`#${payload.l2_report_id}`} className="flex items-center gap-1 hover:underline">
            <ArrowUpRight size={11} /> L2 Report
          </a>
        )}
        {payload.runbook_reference && (
          <span className="flex items-center gap-1 text-gray-600">
            <FileText size={11} /> {payload.runbook_reference}
          </span>
        )}
        <button
          className="flex items-center gap-1 hover:underline ml-auto text-gray-500"
          onClick={() => {
            const el = document.getElementById(nodeId);
            const data = JSON.stringify(payload, null, 2);
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `resolution-${nodeId}.json`;
            a.click();
            URL.revokeObjectURL(url);
            el?.focus();
          }}
        >
          <Download size={11} /> Raw JSON
        </button>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Detail({ label, value }: { label: string; value: string | undefined }) {
  if (!value) return null;
  return (
    <div className="flex gap-2">
      <span className="text-gray-400 shrink-0">{label}:</span>
      <span className="text-gray-700 font-medium">{value}</span>
    </div>
  );
}

function EvidenceRow({ item }: { item: { source: string; relevance: string; excerpt: string } }) {
  const sourceColors: Record<string, string> = {
    LOG: 'bg-purple-100 text-purple-700',
    KB: 'bg-blue-100 text-blue-700',
    KG: 'bg-teal-100 text-teal-700',
  };
  const relColors: Record<string, string> = {
    high: 'text-red-600',
    medium: 'text-amber-600',
    low: 'text-gray-500',
  };
  return (
    <div className="flex items-start gap-1.5 text-gray-700">
      <span className={cn('shrink-0 rounded px-1 text-[9px] font-bold mt-0.5', sourceColors[item.source] ?? 'bg-gray-100 text-gray-600')}>
        {item.source}
      </span>
      <span className={cn('shrink-0 text-[10px] font-medium', relColors[item.relevance] ?? 'text-gray-500')}>
        [{item.relevance}]
      </span>
      <span className="leading-relaxed">{item.excerpt}</span>
    </div>
  );
}

import { useState, useEffect } from 'react';
import {
  Search, Brain, ArrowUpRight, CheckCircle, ChevronDown, Loader2,
  FileText, AlertTriangle, Database, Code2, GitBranch, Download, ShieldAlert,
} from 'lucide-react';
import type { ChainNode, TicketRole, KBLookupPayload, L1AnalysisPayload, L2AnalysisPayload, ResolutionPayload } from '@/user/types/ticket';
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
    color: 'text-amber-500',
    bg: 'bg-amber-400',
    ring: 'ring-amber-200',
  },
};

const fallbackCfg = { icon: <Brain size={14} />, label: 'Analysis', color: 'text-gray-500', bg: 'bg-gray-400', ring: 'ring-gray-200' };

export function EventNode({ node, role }: Props) {
  const [expanded, setExpanded] = useState(node.is_current);
  const cfg = nodeConfig[node.type] ?? fallbackCfg;

  return (
    <div id={node.id} className="relative z-10 w-full max-w-xs mx-auto">
      <button
        onClick={() => setExpanded((e) => !e)}
        className={cn(
          'w-full flex items-start gap-2 text-left rounded-lg px-2.5 py-2',
          'hover:bg-gray-50 transition-colors group',
        )}
      >
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

      {expanded && (
        <div className="ml-8 mt-1 mb-3 rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden text-xs">
          {node.type === 'kb_lookup' && (
            <KBLookupDetail payload={node.payload as KBLookupPayload} role={role} />
          )}
          {node.type === 'l1_analysis' && (
            <L1AnalysisDetail
              payload={node.payload as L1AnalysisPayload}
              role={role}
              summary={node.summary}
            />
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
            <ThinkingDetail
              startTime={node.timestamp}
              {...((node.payload as { skill_id?: string }).skill_id
                ? { skillId: (node.payload as { skill_id: string }).skill_id }
                : {})}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── Thinking Detail ───────────────────────────────────────────────────────────

function ThinkingDetail({ startTime, skillId }: { startTime: string; skillId?: string }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = new Date(startTime).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startTime]);
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const label = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  return (
    <div className="p-3 space-y-1.5">
      <div className="flex items-center gap-2 text-amber-600">
        <Loader2 size={13} className="animate-spin shrink-0" />
        <span className="font-semibold">
          {skillId ? `Running: ${skillId}` : 'Agent processing…'}
        </span>
        <span className="ml-auto font-mono text-[10px] text-gray-400 bg-gray-100 rounded px-1.5 py-0.5">{label}</span>
      </div>
      <p className="text-[11px] text-gray-400 ml-5">LLM is generating a response — this may take a moment.</p>
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
        <span className="ml-2 text-gray-400">{(payload.sources_searched ?? []).length} sources searched</span>
      </div>
      {showFull && (
        <div className="px-3 py-2 space-y-1">
          <div className="text-gray-500">Sources: {(payload.sources_searched ?? []).join(' · ')}</div>
          <div className="text-gray-700 font-mono bg-gray-50 rounded px-2 py-1 text-[10px] leading-relaxed break-words">
            Query: &ldquo;{payload.query}&rdquo;
          </div>
          <div className="mt-2 space-y-1">
            {(payload.results ?? []).map((r, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="shrink-0 text-gray-300">{i === 0 ? '├──' : i === payload.results.length - 1 ? '└──' : '├──'}</span>
                <span className={cn('font-mono font-bold', r.score >= 0.8 ? 'text-green-600' : r.score >= 0.7 ? 'text-amber-600' : 'text-gray-500')}>
                  [{r.score.toFixed(2)}]
                </span>
                <span className="text-gray-700">{r.source}</span>
                <span className={cn('ml-auto shrink-0 text-[10px] rounded-full px-1.5', r.match === 'direct' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700')}>
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

// ── L1 Analysis Detail — smart router based on payload shape ──────────────────

function L1AnalysisDetail({
  payload,
  role,
  summary,
}: {
  payload: L1AnalysisPayload;
  role: TicketRole;
  summary?: string;
}) {
  const p = payload as unknown as Record<string, unknown>;

  // Error: empty payload + summary mentions failure
  if (summary?.includes('failed') && Object.keys(p).length === 0) {
    return (
      <div className="p-3 flex items-start gap-2 text-red-600">
        <AlertTriangle size={13} className="shrink-0 mt-0.5" />
        <p className="leading-relaxed">{summary}</p>
      </div>
    );
  }

  if ('executive_summary' in p || 'resolution_status' in p) return <GenerateReportDetail p={p} />;
  if ('rca_summary' in p || 'root_cause_identified' in p) return <RcaDetail p={p} />;
  if ('lifecycle_summary' in p || 'breakpoint_stage' in p) return <LifecycleDetail p={p} />;
  if ('evidence_summary' in p || 'evidence_collected' in p) return <EvidenceDetail p={p} role={role} />;
  if ('incident_type' in p || 'impacted_services' in p) return <ClassifyDetail p={p} />;

  // Fallback: show string fields
  return <GenericDetail p={p} />;
}

// ── Sub-renderers ─────────────────────────────────────────────────────────────

function GenerateReportDetail({ p }: { p: Record<string, unknown> }) {
  const status = p.resolution_status as string | undefined;
  const confidence = p.confidence_score as number | undefined;
  const execSummary = p.executive_summary as string | undefined;
  const rootCause = p.root_cause as string | undefined;
  const stages = (p.lifecycle_stages as Array<{ stage: string; status: string; evidence: string }>) ?? [];
  const components = (p.affected_components as Array<{ service: string; impact: string }>) ?? [];
  const actions = (p.recommended_actions as Array<{ step: number; action: string; command?: string; expected_result?: string }>) ?? [];
  const investigatedBy = (p.investigated_by as string[]) ?? [];

  return (
    <div className="divide-y divide-gray-100">
      {/* Header */}
      <div className="px-3 py-2.5 bg-green-50 flex items-center gap-2 flex-wrap">
        <CheckCircle size={13} className="text-green-600 shrink-0" />
        <span className="font-semibold text-green-800">Investigation Report</span>
        {status && (
          <span className={cn('text-[10px] font-bold rounded-full px-2 py-0.5',
            status === 'RESOLVED' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700',
          )}>
            {status}
          </span>
        )}
        {confidence !== undefined && (
          <span className="ml-auto text-[10px] font-mono text-gray-500 bg-white border border-gray-200 rounded px-1.5 py-0.5">
            {confidence}% confidence
          </span>
        )}
      </div>

      {/* Summary */}
      {execSummary && (
        <div className="px-3 py-2.5">
          <FieldLabel>Summary</FieldLabel>
          <p className="text-gray-700 leading-relaxed mt-1">{execSummary}</p>
        </div>
      )}

      {/* Root Cause */}
      {rootCause && (
        <div className="px-3 py-2.5 bg-red-50 border-l-2 border-red-400">
          <FieldLabel className="text-red-500">Root Cause</FieldLabel>
          <p className="text-red-800 leading-relaxed mt-1 font-medium">{rootCause}</p>
        </div>
      )}

      {/* Lifecycle stages */}
      {stages.length > 0 && (
        <div className="px-3 py-2.5">
          <FieldLabel>Lifecycle Stages</FieldLabel>
          <div className="mt-1.5 space-y-1.5">
            {stages.map((s, i) => (
              <div key={i} className="flex items-start gap-2">
                <StageStatusDot status={s.status} />
                <span className="font-medium text-gray-700 min-w-[130px] shrink-0">{s.stage}</span>
                <span className="text-gray-500 leading-relaxed">{s.evidence}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Affected components */}
      {components.length > 0 && (
        <div className="px-3 py-2.5">
          <FieldLabel>Affected Components</FieldLabel>
          <div className="mt-1.5 space-y-1">
            {components.map((c, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="shrink-0 font-mono bg-gray-100 rounded px-1.5 py-0.5 text-gray-600 text-[10px]">{c.service}</span>
                <span className="text-gray-600 leading-relaxed">{c.impact}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommended Actions */}
      {actions.length > 0 && (
        <div className="px-3 py-2.5">
          <FieldLabel>Recommended Actions</FieldLabel>
          <ol className="mt-1.5 space-y-3">
            {actions.map((a) => (
              <li key={a.step} className="flex gap-2.5">
                <span className="shrink-0 w-4 h-4 rounded-full bg-indigo-100 text-indigo-700 text-[9px] font-bold flex items-center justify-center mt-0.5">
                  {a.step}
                </span>
                <div className="min-w-0">
                  <p className="font-medium text-gray-800">{a.action}</p>
                  {a.command && (
                    <code className="mt-1 block text-[10px] font-mono bg-gray-900 text-green-400 rounded px-2 py-1 break-all">
                      {a.command}
                    </code>
                  )}
                  {a.expected_result && (
                    <p className="text-[10px] text-gray-500 mt-0.5">Expected: {a.expected_result}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Investigated by */}
      {investigatedBy.length > 0 && (
        <div className="px-3 py-2 flex items-center gap-1.5 flex-wrap bg-gray-50">
          <span className="text-[10px] text-gray-400">Investigated by:</span>
          {investigatedBy.map((a, i) => (
            <span key={i} className="text-[10px] bg-white border border-gray-200 text-gray-600 rounded-full px-2 py-0.5 font-mono">{a}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function ClassifyDetail({ p }: { p: Record<string, unknown> }) {
  const incidentType = p.incident_type as string | undefined;
  const severity = p.severity as string | undefined;
  const summary = p.summary as string | undefined;
  const services = (p.impacted_services as string[]) ?? [];

  const severityColors: Record<string, string> = {
    HIGH: 'bg-red-100 text-red-700',
    MEDIUM: 'bg-amber-100 text-amber-700',
    LOW: 'bg-gray-100 text-gray-600',
    CRITICAL: 'bg-red-200 text-red-800',
  };

  return (
    <div className="divide-y divide-gray-100">
      <div className="px-3 py-2.5 bg-amber-50 flex items-center gap-2 flex-wrap">
        <ShieldAlert size={13} className="text-amber-600 shrink-0" />
        <span className="font-semibold text-amber-800">Incident Classification</span>
        {incidentType && (
          <span className="text-[10px] bg-amber-100 text-amber-800 rounded-full px-2 py-0.5 font-medium">{incidentType}</span>
        )}
        {severity && (
          <span className={cn('ml-auto text-[10px] font-bold rounded-full px-2 py-0.5', severityColors[severity] ?? 'bg-gray-100 text-gray-600')}>
            {severity}
          </span>
        )}
      </div>
      {summary && (
        <div className="px-3 py-2.5">
          <p className="text-gray-700 leading-relaxed">{summary}</p>
        </div>
      )}
      {services.length > 0 && (
        <div className="px-3 py-2.5">
          <FieldLabel>Impacted Services</FieldLabel>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {services.map((s, i) => (
              <span key={i} className="text-[10px] bg-blue-50 text-blue-700 border border-blue-100 rounded px-1.5 py-0.5 font-mono">{s}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EvidenceDetail({ p, role }: { p: Record<string, unknown>; role: TicketRole }) {
  const summary = p.evidence_summary as string | undefined;
  const trade = p.trade_record as { found?: boolean } | undefined;
  const risk = p.risk_record as { found?: boolean } | undefined;
  const consumer = p.consumer_health as { status?: string; lag?: number } | undefined;
  const showFull = role !== 'trader';

  return (
    <div className="divide-y divide-gray-100">
      <div className="px-3 py-2.5 bg-blue-50">
        <span className="font-semibold text-blue-800">Evidence Collected</span>
      </div>

      <div className="px-3 py-2.5 grid grid-cols-3 gap-3 text-center">
        <EvidenceStat label="Trade Record" {...(trade?.found !== undefined ? { found: trade.found } : {})} />
        <EvidenceStat label="Risk Record" {...(risk?.found !== undefined ? { found: risk.found } : {})} />
        {consumer && (
          <div>
            <FieldLabel>Consumer</FieldLabel>
            <span className={cn('font-bold mt-1 block', consumer.status === 'RUNNING' ? 'text-green-600' : 'text-red-600')}>
              {consumer.status}
            </span>
            <span className="text-[10px] text-gray-400">lag: {consumer.lag ?? 0}</span>
          </div>
        )}
      </div>

      {summary && showFull && (
        <div className="px-3 py-2.5">
          <p className="text-gray-600 leading-relaxed">{summary}</p>
        </div>
      )}
    </div>
  );
}

function EvidenceStat({ label, found }: { label: string; found?: boolean }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <span className={cn('font-bold mt-1 block', found === undefined ? 'text-gray-400' : found ? 'text-green-600' : 'text-red-500')}>
        {found === undefined ? '—' : found ? 'Found' : 'Missing'}
      </span>
    </div>
  );
}

function LifecycleDetail({ p }: { p: Record<string, unknown> }) {
  const summary = p.lifecycle_summary as string | undefined;
  const breakpoint = p.breakpoint_stage as string | undefined;
  const stages = (p.stages as Array<{ stage: string; status: string; evidence: string }>) ?? [];

  return (
    <div className="divide-y divide-gray-100">
      <div className="px-3 py-2.5 bg-purple-50 flex items-center gap-2 flex-wrap">
        <span className="font-semibold text-purple-800">Lifecycle Reconstruction</span>
        {breakpoint && (
          <span className="ml-auto text-[10px] bg-red-100 text-red-700 rounded-full px-2 py-0.5 font-medium">
            Breakpoint: {breakpoint}
          </span>
        )}
      </div>
      {stages.length > 0 && (
        <div className="px-3 py-2.5">
          <div className="space-y-1.5">
            {stages.map((s, i) => (
              <div key={i} className="flex items-start gap-2">
                <StageStatusDot status={s.status} />
                <span className="font-medium text-gray-700 min-w-[150px] shrink-0">{s.stage}</span>
                <span className="text-gray-500 leading-relaxed">{s.evidence}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {summary && (
        <div className="px-3 py-2.5">
          <p className="text-gray-700 leading-relaxed">{summary}</p>
        </div>
      )}
    </div>
  );
}

function RcaDetail({ p }: { p: Record<string, unknown> }) {
  const summary = p.rca_summary as string | undefined;
  const primary = p.primary_root_cause as {
    description?: string;
    error_code?: string;
    confidence_score?: number;
  } | undefined;

  return (
    <div className="divide-y divide-gray-100">
      <div className="px-3 py-2.5 bg-red-50 flex items-center gap-2">
        <AlertTriangle size={13} className="text-red-600 shrink-0" />
        <span className="font-semibold text-red-800">Root Cause Analysis</span>
        {primary?.confidence_score !== undefined && (
          <span className="ml-auto text-[10px] font-mono text-gray-500 bg-white border border-gray-200 rounded px-1.5 py-0.5">
            {primary.confidence_score}% confidence
          </span>
        )}
      </div>
      {primary && (
        <div className="px-3 py-2.5 bg-red-50/40 border-l-2 border-red-300">
          <div className="flex items-start gap-2">
            {primary.error_code && (
              <span className="shrink-0 text-[10px] font-bold font-mono bg-red-100 text-red-700 rounded px-1.5 py-0.5">{primary.error_code}</span>
            )}
            <p className="font-medium text-red-800 leading-relaxed">{primary.description}</p>
          </div>
        </div>
      )}
      {summary && (
        <div className="px-3 py-2.5">
          <p className="text-gray-700 leading-relaxed">{summary}</p>
        </div>
      )}
    </div>
  );
}

function GenericDetail({ p }: { p: Record<string, unknown> }) {
  const entries = Object.entries(p).filter(([, v]) => typeof v === 'string' && v.length > 0);
  return (
    <div className="px-3 py-2.5 space-y-2">
      {entries.slice(0, 6).map(([k, v]) => (
        <div key={k}>
          <FieldLabel>{k.replace(/_/g, ' ')}</FieldLabel>
          <p className="text-gray-700 mt-0.5 leading-relaxed">{String(v)}</p>
        </div>
      ))}
      {entries.length === 0 && (
        <p className="text-gray-400 italic">No details available.</p>
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
      <div className="px-3 py-2">
        <FieldLabel>{showSupport ? 'Trader summary' : 'Summary'}</FieldLabel>
        <p className="text-gray-700 leading-relaxed mt-1">{payload.summary_plain}</p>
      </div>
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
          <FieldLabel className="text-red-500">Root Cause</FieldLabel>
          <p className="text-red-800 leading-relaxed mt-1">{payload.root_cause}</p>
        </div>
      )}
      {showDev && payload.fix_options && (
        <div className="px-3 py-2">
          <FieldLabel>Fix Options</FieldLabel>
          <ul className="space-y-1 text-gray-700 mt-1">
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
          <FieldLabel>Root cause</FieldLabel>
          <p className="text-gray-700 leading-relaxed mt-0.5">{payload.root_cause_summary}</p>
        </div>
        <div>
          <FieldLabel>Action taken</FieldLabel>
          <p className="text-gray-700 leading-relaxed mt-0.5">{payload.action_taken}</p>
        </div>
        {payload.permanent_fix && (
          <div>
            <FieldLabel>Permanent fix</FieldLabel>
            <p className="text-gray-700 leading-relaxed mt-0.5">{payload.permanent_fix}</p>
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
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
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

// ── Shared helpers ────────────────────────────────────────────────────────────

function FieldLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('text-[10px] font-semibold uppercase tracking-wide text-gray-400', className)}>
      {children}
    </div>
  );
}

function StageStatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    COMPLETE: 'bg-green-500',
    MISSING: 'bg-red-500',
    NOT_REACHED: 'bg-gray-300',
    IN_PROGRESS: 'bg-amber-400',
    FAILED: 'bg-red-500',
  };
  return (
    <span className={cn('shrink-0 w-2 h-2 rounded-full mt-1.5', colors[status] ?? 'bg-gray-300')} />
  );
}

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

// Suppress unused-variable warnings for helpers kept for legacy callers
void Detail;
void EvidenceRow;

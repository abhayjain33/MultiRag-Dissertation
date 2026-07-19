import { useMemo, useRef, useEffect, useState, Fragment } from 'react';
import {
  User, Bot, Loader2, Brain, Search, FileText, CheckCircle,
  Activity, X, AlertTriangle, MousePointerClick,
} from 'lucide-react';
import type {
  TicketChain, ChainParticipant, ChainRow, TicketRole,
  ChainNode, ChainHandoff,
} from '@/user/types/ticket';
import { useTicketDetailStore } from '@/user/store/ticketStore';
import { EventNode } from './EventNode';
import { cn } from '@/lib/utils';
import { formatTime } from '@/lib/utils';

interface Props {
  chain: TicketChain;
  role: TicketRole;
}

// ── Compact node config for horizontal display ────────────────────────────────

const compactCfg: Record<ChainNode['type'], { icon: React.ReactNode; bg: string; ring: string; label: string }> = {
  ticket_raised: { icon: <FileText size={11} />, bg: 'bg-indigo-500', ring: 'ring-indigo-200', label: 'Ticket' },
  kb_lookup:     { icon: <Search size={11} />,   bg: 'bg-blue-500',   ring: 'ring-blue-200',   label: 'KB' },
  l1_analysis:   { icon: <Brain size={11} />,    bg: 'bg-amber-500',  ring: 'ring-amber-200',  label: 'Analysis' },
  l2_analysis:   { icon: <Brain size={11} />,    bg: 'bg-orange-500', ring: 'ring-orange-200', label: 'Analysis' },
  resolution:    { icon: <CheckCircle size={11} />, bg: 'bg-green-500', ring: 'ring-green-200', label: 'Resolution' },
  acknowledged:  { icon: <CheckCircle size={11} />, bg: 'bg-green-400', ring: 'ring-green-200', label: 'Done' },
  thinking:      { icon: <Loader2 size={11} className="animate-spin" />, bg: 'bg-amber-400', ring: 'ring-amber-200', label: 'Running…' },
};

const fallbackCompact = { icon: <Brain size={11} />, bg: 'bg-gray-400', ring: 'ring-gray-200', label: 'Step' };

// Derive a short label from summary for l1_analysis nodes
function shortLabel(node: ChainNode): string {
  if (node.type !== 'l1_analysis') return (compactCfg[node.type] ?? fallbackCompact).label;
  const s = node.summary ?? '';
  if (s.includes('classify'))   return 'Classify';
  if (s.includes('collect'))    return 'Evidence';
  if (s.includes('lifecycle') || s.includes('reconstruct')) return 'Lifecycle';
  if (s.includes('root_cause') || s.includes('rca'))        return 'RCA';
  if (s.includes('report'))     return 'Report';
  if (s.includes('failed'))     return 'Error';
  return 'Analysis';
}

// ── Main component ────────────────────────────────────────────────────────────

export function ChainVisualisation({ chain, role }: Props) {
  const liveNodes      = useTicketDetailStore((s) => s.chainNodes);
  const liveHandoffs   = useTicketDetailStore((s) => s.chainHandoffs);
  const liveParts      = useTicketDetailStore((s) => s.chainParticipants);
  const agentThinking  = useTicketDetailStore((s) => s.agentThinking);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [rightPanel, setRightPanel] = useState<'log' | 'detail'>('log');

  const { participants, rows } = useMemo<TicketChain>(() => {
    const partMap = new Map<string, ChainParticipant>(chain.participants.map((p) => [p.id, p]));
    for (const p of liveParts) partMap.set(p.id, p);
    const parts = [...partMap.values()];

    const initialNodeIds    = new Set(chain.rows.filter((r): r is { kind: 'node'; node: ChainNode } => r.kind === 'node').map((r) => r.node.id));
    const initialHandoffIds = new Set(chain.rows.filter((r): r is { kind: 'handoff'; handoff: ChainHandoff } => r.kind === 'handoff').map((r) => r.handoff.id));

    const liveNodeRows:    ChainRow[] = [...liveNodes.values()].filter((n) => !initialNodeIds.has(n.id)).map((n) => ({ kind: 'node', node: n }));
    const liveHandoffRows: ChainRow[] = liveHandoffs.filter((h) => !initialHandoffIds.has(h.id)).map((h) => ({ kind: 'handoff', handoff: h }));

    const allRows: ChainRow[] = [...chain.rows, ...liveNodeRows, ...liveHandoffRows].sort((a, b) => {
      const ta = a.kind === 'node' ? a.node.timestamp : a.handoff.timestamp;
      const tb = b.kind === 'node' ? b.node.timestamp : b.handoff.timestamp;
      return ta < tb ? -1 : ta > tb ? 1 : 0;
    });

    if (agentThinking) {
      allRows.push({
        kind: 'node',
        node: {
          id: '__thinking__',
          participant_id: parts[parts.length - 1]?.id ?? 'unknown',
          type: 'thinking',
          timestamp: new Date().toISOString(),
          summary: 'Processing…',
          is_current: true,
          payload: {},
        },
      });
    }

    return { participants: parts, rows: allRows };
  }, [chain, liveNodes, liveHandoffs, liveParts, agentThinking]);

  const visibleRows = role === 'trader'
    ? rows.filter((r) => r.kind === 'handoff' || r.node.type === 'ticket_raised' || r.node.type === 'resolution' || r.node.type === 'acknowledged')
    : rows;

  // Group nodes by participant
  const nodesByParticipant = useMemo(() => {
    const map = new Map<string, ChainNode[]>();
    for (const p of participants) map.set(p.id, []);
    for (const row of visibleRows) {
      if (row.kind === 'node') map.get(row.node.participant_id)?.push(row.node);
    }
    return map;
  }, [participants, visibleRows]);

  // Flat handoff list
  const handoffs = useMemo(
    () => visibleRows.filter((r): r is { kind: 'handoff'; handoff: ChainHandoff } => r.kind === 'handoff').map((r) => r.handoff),
    [visibleRows],
  );

  // Selected node lookup
  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    for (const row of rows) {
      if (row.kind === 'node' && row.node.id === selectedNodeId) return row.node;
    }
    return null;
  }, [selectedNodeId, rows]);

  if (participants.length === 0) return null;

  function selectNode(nodeId: string) {
    setSelectedNodeId((cur) => {
      const next = cur === nodeId ? null : nodeId;
      setRightPanel(next ? 'detail' : 'log');
      return next;
    });
  }

  function closeDetail() {
    setSelectedNodeId(null);
    setRightPanel('log');
  }

  return (
    <div className="flex gap-3 items-start">
      {/* ── Horizontal chain ─────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 border border-gray-200 rounded-xl bg-white overflow-hidden shadow-sm">
        {participants.map((p, idx) => {
          const prevPart = participants[idx - 1];
          const handoff = prevPart
            ? handoffs.find((h) => h.to_participant === p.id)
            : undefined;

          return (
            <Fragment key={p.id}>
              {/* Handoff divider between participants */}
              {idx > 0 && (
                <div className="flex items-center gap-2 px-4 py-1.5 bg-indigo-50 border-y border-indigo-100">
                  <div className="w-3 h-3 rounded-full bg-indigo-300 shrink-0" />
                  <span className="text-[10px] text-indigo-600 font-medium truncate">
                    {handoff?.label ?? 'Escalated'}
                  </span>
                </div>
              )}

              {/* Participant row */}
              <div className="flex items-stretch min-h-16">
                {/* Left label */}
                <div className="w-36 shrink-0 flex items-center gap-2 px-3 py-3 border-r border-gray-100 bg-gray-50/60">
                  <div className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center shrink-0',
                    p.type === 'raiser' ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-200 text-gray-500',
                  )}>
                    {p.type === 'raiser' ? <User size={13} /> : <Bot size={13} />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-gray-700 leading-tight">{p.label}</p>
                    <p className="text-[9px] text-gray-400 mt-0.5">{p.type}</p>
                  </div>
                </div>

                {/* Events track */}
                <div className="flex items-center gap-1 px-4 py-3 overflow-x-auto flex-1">
                  {(nodesByParticipant.get(p.id) ?? []).map((node, ni) => (
                    <Fragment key={node.id}>
                      {ni > 0 && (
                        <div className={cn('w-5 h-px shrink-0', node.type === 'thinking' ? 'bg-amber-200' : 'bg-gray-200')} />
                      )}
                      <CompactNode
                        node={node}
                        selected={selectedNodeId === node.id}
                        onSelect={() => selectNode(node.id)}
                      />
                    </Fragment>
                  ))}
                </div>
              </div>
            </Fragment>
          );
        })}
      </div>

      {/* ── Right panel: Activity Log or Node Detail ─────────────────────── */}
      <div className="shrink-0 w-96 border border-gray-200 rounded-xl bg-white overflow-hidden shadow-sm flex flex-col">
        {/* Panel header with tab switcher */}
        <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-100 bg-gray-50/60">
          <button
            onClick={() => setRightPanel('log')}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
              rightPanel === 'log'
                ? 'bg-white text-gray-700 shadow-sm'
                : 'text-gray-400 hover:text-gray-600',
            )}
          >
            <Activity size={11} />
            Activity
            {agentThinking && rightPanel !== 'log' && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            )}
          </button>
          <button
            onClick={() => setRightPanel('detail')}
            disabled={!selectedNode}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
              rightPanel === 'detail' && selectedNode
                ? 'bg-white text-gray-700 shadow-sm'
                : selectedNode
                  ? 'text-gray-400 hover:text-gray-600'
                  : 'text-gray-300 cursor-not-allowed',
            )}
          >
            <MousePointerClick size={11} />
            Detail
          </button>
          {selectedNode && (
            <button
              onClick={closeDetail}
              className="ml-auto text-gray-300 hover:text-gray-500 transition-colors p-0.5 rounded"
              title="Clear selection"
            >
              <X size={11} />
            </button>
          )}
        </div>

        {/* Panel body */}
        <div className="flex-1 overflow-y-auto">
          {rightPanel === 'log' || !selectedNode ? (
            <ActivityLog rows={rows} participants={participants} agentThinking={agentThinking} />
          ) : (
            <div className="p-3">
              <p className="text-[10px] text-gray-400 font-mono mb-2 truncate">{selectedNode.summary}</p>
              <EventNode node={{ ...selectedNode, is_current: true }} role={role} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Compact node (horizontal track) ──────────────────────────────────────────

function CompactNode({
  node,
  selected,
  onSelect,
}: {
  node: ChainNode;
  selected: boolean;
  onSelect: () => void;
}) {
  const cfg = compactCfg[node.type] ?? fallbackCompact;
  const label = shortLabel(node);
  const isError = node.type === 'l1_analysis' && node.summary?.includes('failed');

  return (
    <button
      onClick={onSelect}
      className="flex flex-col items-center gap-1 group focus:outline-none"
      title={node.summary}
    >
      <div className={cn(
        'w-8 h-8 rounded-full flex items-center justify-center text-white transition-all',
        isError ? 'bg-red-500' : cfg.bg,
        node.is_current && `ring-4 ${cfg.ring}`,
        selected && 'ring-4 ring-offset-1 scale-110',
        !selected && 'group-hover:scale-105',
      )}>
        {isError ? <AlertTriangle size={11} /> : cfg.icon}
      </div>
      <span className={cn(
        'text-[9px] leading-tight text-center w-10',
        selected ? 'text-gray-800 font-semibold' : 'text-gray-400',
        isError && 'text-red-500',
      )}>
        {label}
      </span>
    </button>
  );
}

// ── Activity Log ──────────────────────────────────────────────────────────────

interface LogEntry {
  timestamp: string;
  level: 'info' | 'success' | 'error' | 'handoff' | 'processing';
  message: string;
  detail?: string | undefined;
}

function deriveLogEntries(rows: ChainRow[], participants: ChainParticipant[]): LogEntry[] {
  const partLabel = (id: string) => participants.find((p) => p.id === id)?.label ?? id;
  const entries: LogEntry[] = [];

  for (const row of rows) {
    if (row.kind === 'handoff') {
      const h = row.handoff;
      entries.push({
        timestamp: h.timestamp,
        level: 'handoff',
        message: h.from_participant.startsWith('raiser-')
          ? `Assigned to ${partLabel(h.to_participant)}`
          : `Escalated to ${partLabel(h.to_participant)}`,
      });
      continue;
    }

    const node = row.node;
    if (node.id === '__thinking__') continue;

    switch (node.type) {
      case 'ticket_raised':
        entries.push({ timestamp: node.timestamp, level: 'info', message: `Ticket submitted` });
        break;

      case 'thinking': {
        const skillId = (node.payload as { skill_id?: string }).skill_id;
        entries.push({
          timestamp: node.timestamp,
          level: 'processing',
          message: `${partLabel(node.participant_id)}: running ${skillId ?? 'skill'}`,
        });
        break;
      }

      case 'kb_lookup': {
        const n = ((node.payload as { sources_searched?: string[] }).sources_searched ?? []).length;
        entries.push({
          timestamp: node.timestamp,
          level: 'info',
          message: `KB lookup — ${n > 0 ? `${n} sources` : 'no sources configured'}`,
        });
        break;
      }

      case 'l1_analysis': {
        if (node.summary?.includes('failed')) {
          entries.push({ timestamp: node.timestamp, level: 'error', message: node.summary });
          break;
        }
        const p = node.payload as Record<string, unknown>;
        const agent = partLabel(node.participant_id);
        let message = `${agent}: done`;
        let detail: string | undefined;

        if ('executive_summary' in p) {
          message = `${agent}: report generated`;
          detail = p.confidence_score !== undefined ? `${String(p.confidence_score)}% confidence` : undefined;
        } else if ('rca_summary' in p) {
          const rc = p.primary_root_cause as { confidence_score?: number } | undefined;
          message = `${agent}: root cause identified`;
          detail = rc?.confidence_score !== undefined ? `${rc.confidence_score}%` : undefined;
        } else if ('lifecycle_summary' in p) {
          message = `${agent}: lifecycle reconstructed`;
          detail = `break: ${String(p.breakpoint_stage ?? '?')}`;
        } else if ('evidence_summary' in p) {
          const tr = p.trade_record as { found?: boolean } | undefined;
          const rr = p.risk_record as { found?: boolean } | undefined;
          message = `${agent}: evidence collected`;
          detail = `trade ${tr?.found ? 'found' : 'missing'}, risk ${rr?.found ? 'found' : 'missing'}`;
        } else if ('incident_type' in p) {
          message = `${agent}: classified`;
          detail = `${String(p.incident_type ?? '')} · ${String(p.severity ?? '')}`;
        }

        entries.push({ timestamp: node.timestamp, level: 'success', message, ...(detail !== undefined ? { detail } : {}) });
        break;
      }

      default:
        break;
    }
  }

  return entries;
}

const levelDot: Record<LogEntry['level'], string> = {
  success:    'bg-green-400',
  error:      'bg-red-400',
  handoff:    'bg-indigo-400',
  processing: 'bg-amber-400',
  info:       'bg-gray-400',
};

const levelMsg: Record<LogEntry['level'], string> = {
  success:    'text-green-700',
  error:      'text-red-600',
  handoff:    'text-indigo-600',
  processing: 'text-amber-600',
  info:       'text-gray-600',
};

function ActivityLog({
  rows,
  participants,
  agentThinking,
}: {
  rows: ChainRow[];
  participants: ChainParticipant[];
  agentThinking: boolean;
}) {
  const logRef = useRef<HTMLDivElement>(null);
  const entries = useMemo(() => deriveLogEntries(rows, participants), [rows, participants]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [entries, agentThinking]);

  return (
    <div ref={logRef} className="p-2.5 space-y-1.5 text-[11px]">
      {entries.length === 0 && !agentThinking && (
        <p className="text-gray-400 text-center py-4">No activity yet</p>
      )}

      {entries.map((entry, i) => (
        <div key={i} className="flex gap-2 items-start">
          <span className="shrink-0 text-gray-400 font-mono text-[10px] pt-0.5 tabular-nums">
            {formatTime(entry.timestamp)}
          </span>
          <span className={cn('shrink-0 w-1.5 h-1.5 rounded-full mt-1.5', levelDot[entry.level])} />
          <div className="min-w-0">
            <span className={cn('font-medium', levelMsg[entry.level])}>{entry.message}</span>
            {entry.detail && (
              <span className="block text-gray-400 text-[10px] mt-0.5">{entry.detail}</span>
            )}
          </div>
        </div>
      ))}

      {agentThinking && (
        <div className="flex gap-2 items-start">
          <span className="shrink-0 text-gray-400 font-mono text-[10px] pt-0.5 tabular-nums">
            {formatTime(new Date().toISOString())}
          </span>
          <span className="shrink-0 w-1.5 h-1.5 rounded-full mt-1.5 bg-amber-400 animate-pulse" />
          <span className="text-amber-600 font-medium flex items-center gap-1">
            <Loader2 size={9} className="animate-spin" />
            LLM generating<BlinkingDots />
          </span>
        </div>
      )}
    </div>
  );
}

function BlinkingDots() {
  const [dots, setDots] = useState('');
  useEffect(() => {
    const id = setInterval(() => setDots((d) => (d.length >= 3 ? '' : d + '.')), 400);
    return () => clearInterval(id);
  }, []);
  return <span>{dots}</span>;
}

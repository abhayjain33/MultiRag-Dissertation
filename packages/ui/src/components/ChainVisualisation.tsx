import { useMemo } from 'react';
import { User, Bot } from 'lucide-react';
import type { TicketChain, ChainParticipant, ChainRow, TicketRole, ChainNode, ChainHandoff } from '@/types/ticket';
import { useTicketDetailStore } from '@/store/ticketStore';
import { EventNode } from './EventNode';
import { cn } from '@/lib/utils';
import { formatTime } from '@/lib/utils';

interface Props {
  chain: TicketChain;
  role: TicketRole;
}

export function ChainVisualisation({ chain, role }: Props) {
  const liveNodes = useTicketDetailStore((s) => s.chainNodes);
  const liveHandoffs = useTicketDetailStore((s) => s.chainHandoffs);
  const liveParts = useTicketDetailStore((s) => s.chainParticipants);
  const agentThinking = useTicketDetailStore((s) => s.agentThinking);

  // Merge initial chain data with live updates from WebSocket
  const { participants, rows } = useMemo<TicketChain>(() => {
    // Start with initial data; add any live participants not already present
    const partMap = new Map<string, ChainParticipant>(chain.participants.map((p) => [p.id, p]));
    for (const p of liveParts) partMap.set(p.id, p);

    const parts = [...partMap.values()];

    // Merge initial rows with live nodes/handoffs
    const initialNodeIds = new Set(
      chain.rows
        .filter((r): r is { kind: 'node'; node: ChainNode } => r.kind === 'node')
        .map((r) => r.node.id),
    );
    const initialHandoffIds = new Set(
      chain.rows
        .filter((r): r is { kind: 'handoff'; handoff: ChainHandoff } => r.kind === 'handoff')
        .map((r) => r.handoff.id),
    );

    const liveNodeRows: ChainRow[] = [...liveNodes.values()]
      .filter((n) => !initialNodeIds.has(n.id))
      .map((n) => ({ kind: 'node' as const, node: n }));

    const liveHandoffRows: ChainRow[] = liveHandoffs
      .filter((h) => !initialHandoffIds.has(h.id))
      .map((h) => ({ kind: 'handoff' as const, handoff: h }));

    const allRows: ChainRow[] = [...chain.rows, ...liveNodeRows, ...liveHandoffRows].sort(
      (a, b) => {
        const ta = a.kind === 'node' ? a.node.timestamp : a.handoff.timestamp;
        const tb = b.kind === 'node' ? b.node.timestamp : b.handoff.timestamp;
        return ta < tb ? -1 : ta > tb ? 1 : 0;
      },
    );

    // Add thinking node if agent is processing
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

  const N = participants.length;
  if (N === 0) return null;

  // For trader role, we simplify by collapsing agent-internal rows
  const visibleRows =
    role === 'trader'
      ? rows.filter(
          (r) =>
            r.kind === 'handoff' ||
            r.node.type === 'ticket_raised' ||
            r.node.type === 'resolution' ||
            r.node.type === 'acknowledged',
        )
      : rows;

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-x-auto">
      {/* Column headers — sticky top */}
      <div
        className="grid border-b border-gray-100 bg-gray-50 rounded-t-xl"
        style={{ gridTemplateColumns: `repeat(${N}, minmax(200px, 1fr))` }}
      >
        {participants.map((p) => (
          <div key={p.id} className="flex flex-col items-center py-3 px-2 border-r border-gray-100 last:border-r-0">
            <div
              className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center mb-1',
                p.type === 'raiser' ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-200 text-gray-600',
              )}
            >
              {p.type === 'raiser' ? <User size={15} /> : <Bot size={15} />}
            </div>
            <span className="text-xs font-semibold text-gray-700 text-center leading-tight">{p.label}</span>
            <span className="text-[10px] text-gray-400">{p.type}</span>
          </div>
        ))}
      </div>

      {/* Timeline rows */}
      {visibleRows.map((row, idx) => (
        <TimelineRow
          key={idx}
          row={row}
          participants={participants}
          role={role}
        />
      ))}

      {/* End-of-chain padding */}
      <div
        className="grid"
        style={{ gridTemplateColumns: `repeat(${N}, minmax(200px, 1fr))` }}
      >
        {participants.map((p) => (
          <div key={p.id} className="relative h-6 border-r border-gray-50 last:border-r-0">
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Timeline row dispatcher ───────────────────────────────────────────────────

function TimelineRow({
  row,
  participants,
  role,
}: {
  row: ChainRow;
  participants: ChainParticipant[];
  role: TicketRole;
}) {
  if (row.kind === 'node') {
    return <NodeRow node={row.node} participants={participants} role={role} />;
  }
  return <HandoffRow handoff={row.handoff} participants={participants} />;
}

// ── Node row: one event circle in its participant's column ────────────────────

function NodeRow({
  node,
  participants,
  role,
}: {
  node: ChainNode;
  participants: ChainParticipant[];
  role: TicketRole;
}) {
  const N = participants.length;
  const colIdx = participants.findIndex((p) => p.id === node.participant_id);

  return (
    <div
      className="grid items-start"
      style={{ gridTemplateColumns: `repeat(${N}, minmax(200px, 1fr))` }}
    >
      {Array.from({ length: N }, (_, i) => (
        <div key={i} className="relative min-h-16 border-r border-gray-50 last:border-r-0 py-2 px-1">
          {/* Vertical track line */}
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-100 -translate-x-1/2" />

          {i === colIdx && <EventNode node={node} role={role} />}
        </div>
      ))}
    </div>
  );
}

// ── Handoff row: horizontal arrow spanning two participant columns ─────────────

function HandoffRow({
  handoff,
  participants,
}: {
  handoff: ChainHandoff;
  participants: ChainParticipant[];
}) {
  const N = participants.length;
  const fromIdx = participants.findIndex((p) => p.id === handoff.from_participant);
  const toIdx = participants.findIndex((p) => p.id === handoff.to_participant);

  if (fromIdx === -1 || toIdx === -1) return null;

  const goRight = fromIdx < toIdx;
  const lo = Math.min(fromIdx, toIdx);
  const hi = Math.max(fromIdx, toIdx);
  const midIdx = Math.round((lo + hi) / 2);

  return (
    <div
      className="grid items-center"
      style={{ gridTemplateColumns: `repeat(${N}, minmax(200px, 1fr))` }}
    >
      {Array.from({ length: N }, (_, i) => {
        const inSpan = i >= lo && i <= hi;
        const isFrom = i === fromIdx;
        const isTo = i === toIdx;
        const isMid = i === midIdx;

        return (
          <div key={i} className="relative h-12 border-r border-gray-50 last:border-r-0 flex items-center">
            {/* Vertical track outside the arrow span */}
            {!inSpan && (
              <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-100 -translate-x-1/2" />
            )}

            {/* Horizontal arrow line within the span */}
            {inSpan && (
              <div
                className="absolute top-1/2 h-0.5 bg-indigo-300 -translate-y-1/2"
                style={{
                  left: isFrom ? (goRight ? '50%' : '0') : isTo ? (goRight ? '0' : '50%') : '0',
                  right: isFrom ? (goRight ? '0' : '50%') : isTo ? (goRight ? '50%' : '0') : '0',
                }}
              />
            )}

            {/* Source dot */}
            {isFrom && (
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-indigo-400 border-2 border-white z-10" />
            )}

            {/* Arrowhead */}
            {isTo && (
              <div
                className="absolute top-1/2 -translate-y-1/2 z-10"
                style={{ left: 'calc(50% - 5px)' }}
              >
                <Arrowhead direction={goRight ? 'right' : 'left'} />
              </div>
            )}

            {/* Handoff label in the middle column */}
            {isMid && !isFrom && !isTo && (
              <span className="relative z-10 text-[10px] text-indigo-600 font-medium bg-white px-1 mx-auto border border-indigo-100 rounded whitespace-nowrap shadow-sm">
                {handoff.label}
              </span>
            )}

            {/* When span is 2 cols (from + to adjacent), show label on the line */}
            {isFrom && fromIdx === lo && hi - lo === 1 && (
              <span className="absolute left-3/4 z-10 -translate-x-1/2 text-[10px] text-indigo-600 bg-white px-1 border border-indigo-100 rounded whitespace-nowrap shadow-sm">
                {handoff.label}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Arrowhead({ direction }: { direction: 'right' | 'left' }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" className="text-indigo-400">
      {direction === 'right' ? (
        <polyline points="0,2 8,5 0,8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      ) : (
        <polyline points="10,2 2,5 10,8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      )}
    </svg>
  );
}

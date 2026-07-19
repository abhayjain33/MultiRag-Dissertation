import { useCallback, useEffect } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Link2, User, Bot, ShieldCheck } from 'lucide-react';
import type { TicketRole } from '@/user/types/ticket';
import { fetchTicketDetail } from '@/user/api/tickets';
import { useTicketDetailStore } from '@/user/store/ticketStore';
import { useTicketSocket } from '@/user/hooks/useTicketSocket';
import { AlertBanner } from '@/user/components/AlertBanner';
import { TicketHeader } from '@/user/components/TicketHeader';
import { ChainVisualisation } from '@/user/components/ChainVisualisation';
import { CommentThread } from '@/user/components/CommentThread';
import { Button } from '@/user/components/ui/button';
import { cn } from '@/lib/utils';

const ROLES: { value: TicketRole; label: string; icon: React.ReactNode; description: string }[] = [
  { value: 'trader', label: 'Trader', icon: <User size={13} />, description: 'Plain-language view' },
  { value: 'support', label: 'Support', icon: <ShieldCheck size={13} />, description: 'L1 detail + logs' },
  { value: 'dev', label: 'Dev', icon: <Bot size={13} />, description: 'Full technical view' },
  { value: 'full', label: 'Full', icon: <Bot size={13} />, description: 'Everything' },
];

export function TicketDetail() {
  const { ticketId } = useParams<{ ticketId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const roleParam = searchParams.get('role') as TicketRole | null;
  const role: TicketRole = ROLES.some((r) => r.value === roleParam) ? roleParam! : 'full';

  const { data, isLoading, error } = useQuery({
    queryKey: ['ticket', ticketId],
    queryFn: () => fetchTicketDetail(ticketId!),
    enabled: !!ticketId,
    staleTime: 30_000,
  });

  const initFromDetail = useTicketDetailStore((s) => s.initFromDetail);
  const applyWSEvent = useTicketDetailStore((s) => s.applyWSEvent);

  // Sync store when fresh ticket data arrives (initial load only)
  useEffect(() => {
    if (data) initFromDetail(data);
  }, [data, initFromDetail]);

  const handleWSEvent = useCallback(
    (event: import('@/user/types/ticket').TicketWSEvent) => {
      applyWSEvent(event);
    },
    [applyWSEvent],
  );

  useTicketSocket({ ticketId: ticketId ?? '', onEvent: handleWSEvent, enabled: !!ticketId });

  function setRole(r: TicketRole) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('role', r);
      return next;
    });
  }

  function copyShareLink() {
    void navigator.clipboard.writeText(window.location.href);
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">
        Loading ticket…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-3">
        <p className="text-gray-500">Ticket not found or failed to load.</p>
        <Link to="/user/tickets" className="text-indigo-600 hover:underline text-sm">
          ← Back to ticket list
        </Link>
      </div>
    );
  }

  const { ticket, chain } = data;

  return (
    <div className="min-h-screen bg-gray-50">
      <AlertBanner />

      {/* Top nav bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-4 sticky top-0 z-30">
        <Link to="/user/tickets" className="text-gray-400 hover:text-gray-600 flex items-center gap-1 text-sm">
          <ArrowLeft size={15} /> Tickets
        </Link>

        <span className="text-gray-300">|</span>
        <span className="font-mono text-sm font-bold text-gray-600">{ticket.id}</span>

        {/* Role switcher */}
        <div className="ml-auto flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {ROLES.map((r) => (
            <button
              key={r.value}
              onClick={() => setRole(r.value)}
              title={r.description}
              className={cn(
                'flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                role === r.value
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700',
              )}
            >
              {r.icon}
              {r.label}
            </button>
          ))}
        </div>

        {/* Share */}
        <Button variant="ghost" size="sm" onClick={copyShareLink} title="Copy shareable link">
          <Link2 size={13} />
          Share
        </Button>
      </div>

      {/* Page content */}
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Ticket header — 14.2 */}
        <TicketHeader ticket={ticket} role={role} />

        {/* Role context banner */}
        <RoleBanner role={role} />

        {/* Chain visualisation — 14.3 / 14.4 */}
        <section>
          <SectionLabel>Lifecycle Chain</SectionLabel>
          <ChainVisualisation chain={chain} role={role} />
        </section>

        {/* Comment thread — 14.5 */}
        <section id="comments">
          <SectionLabel>Comments</SectionLabel>
          <CommentThread ticketId={ticket.id} />
        </section>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
      {children}
    </h2>
  );
}

function RoleBanner({ role }: { role: TicketRole }) {
  const config = {
    trader: {
      text: 'Trader view — plain-language summaries. Technical logs and code references are hidden.',
      color: 'bg-blue-50 text-blue-700 border-blue-200',
    },
    support: {
      text: 'Support view — L1 reports, log snippets, and KB references are visible.',
      color: 'bg-amber-50 text-amber-700 border-amber-200',
    },
    dev: {
      text: 'Dev view — full technical detail including DB queries, code references, and KG traversal.',
      color: 'bg-orange-50 text-orange-700 border-orange-200',
    },
    full: {
      text: 'Full view — all information visible across all roles.',
      color: 'bg-gray-50 text-gray-600 border-gray-200',
    },
  } as const;

  const c = config[role];

  return (
    <div className={cn('rounded-lg border px-4 py-2.5 text-xs', c.color)}>
      <span className="font-semibold capitalize">{role} role: </span>
      {c.text}
    </div>
  );
}

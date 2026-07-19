import { Clock, User, Bot } from 'lucide-react';
import type { TicketSummary, TicketRole } from '@/user/types/ticket';
import { StatusBadge, PriorityBadge } from './ui/badge';
import { formatRelativeTime, formatDate } from '@/lib/utils';

interface Props {
  ticket: TicketSummary;
  role: TicketRole;
}

export function TicketHeader({ ticket, role: _role }: Props) {
  const isResolved = ticket.status === 'resolved';

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
      {/* Top row: ID + status + priority */}
      <div className="flex items-center gap-3 mb-2">
        <span className="font-mono text-sm font-bold text-gray-500">#{ticket.id}</span>
        <StatusBadge status={ticket.status} />
        <PriorityBadge priority={ticket.priority} />
        {isResolved && (
          <span className="ml-auto text-xs font-medium text-green-600 flex items-center gap-1">
            ✓ Resolved {ticket.resolved_at ? formatRelativeTime(ticket.resolved_at) : ''}
          </span>
        )}
      </div>

      {/* Title */}
      <h1 className="text-lg font-semibold text-gray-900 mb-4 leading-snug">{ticket.title}</h1>

      {/* Meta row */}
      <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-4">
        <MetaItem label="Raised by" icon={<User size={13} />} value={ticket.raised_by} />
        <MetaItem label="Opened" icon={<Clock size={13} />} value={formatRelativeTime(ticket.created_at)} title={formatDate(ticket.created_at)} />
        <MetaItem
          label="Current owner"
          icon={<Bot size={13} />}
          value={ticket.current_owner}
          highlight={!isResolved}
        />
        <MetaItem
          label="Last update"
          icon={<Clock size={13} />}
          value={formatRelativeTime(ticket.updated_at)}
          title={formatDate(ticket.updated_at)}
        />
      </dl>
    </div>
  );
}

function MetaItem({
  label,
  icon,
  value,
  title,
  highlight,
}: {
  label: string;
  icon: React.ReactNode;
  value: string;
  title?: string | undefined;
  highlight?: boolean | undefined;
}) {
  return (
    <div>
      <dt className="text-gray-500 text-xs mb-0.5">{label}</dt>
      <dd
        className={`flex items-center gap-1 font-medium truncate ${highlight ? 'text-indigo-700' : 'text-gray-800'}`}
        title={title}
      >
        <span className="text-gray-400">{icon}</span>
        {value}
      </dd>
    </div>
  );
}

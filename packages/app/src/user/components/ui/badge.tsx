import { cn } from '@/lib/utils';
import type { TicketPriority, TicketStatus } from '@/user/types/ticket';

const priorityStyles: Record<TicketPriority, string> = {
  P1: 'bg-red-100 text-red-700 border-red-200',
  P2: 'bg-amber-100 text-amber-700 border-amber-200',
  P3: 'bg-blue-100 text-blue-700 border-blue-200',
  P4: 'bg-gray-100 text-gray-600 border-gray-200',
};

const statusStyles: Record<TicketStatus, string> = {
  open: 'bg-gray-100 text-gray-700',
  kb_lookup: 'bg-blue-100 text-blue-700',
  l1: 'bg-amber-100 text-amber-700',
  l2: 'bg-orange-100 text-orange-700',
  resolved: 'bg-green-100 text-green-700',
};

const statusLabels: Record<TicketStatus, string> = {
  open: 'Open',
  kb_lookup: 'KB Lookup',
  l1: 'L1 Analysis',
  l2: 'L2 Analysis',
  resolved: 'Resolved',
};

interface BadgeProps {
  className?: string | undefined;
  children: React.ReactNode;
}

export function Badge({ className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: TicketPriority }) {
  return (
    <Badge className={cn('border font-bold', priorityStyles[priority])}>{priority}</Badge>
  );
}

export function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
        statusStyles[status],
      )}
    >
      {status !== 'resolved' && (
        <span className={cn('w-1.5 h-1.5 rounded-full', status === 'open' ? 'bg-gray-500' : 'bg-current animate-pulse')} />
      )}
      {statusLabels[status]}
    </span>
  );
}

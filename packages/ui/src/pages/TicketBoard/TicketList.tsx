import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Search, Download, ExternalLink, ArrowUpDown, RefreshCw,
} from 'lucide-react';
import type { TicketFilters } from '@/api/tickets';
import { fetchTickets, exportTicketsCSV } from '@/api/tickets';
import type { TicketSummary } from '@/types/ticket';
import { StatusBadge, PriorityBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { formatRelativeTime, cn } from '@/lib/utils';

export function TicketList() {
  const [filters, setFilters] = useState<TicketFilters>({
    status: 'all',
    priority: 'all',
    search: '',
    sortBy: 'updated_at',
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['tickets', filters],
    queryFn: () => fetchTickets(filters),
    refetchInterval: 30_000,
  });

  const tickets = data?.tickets ?? [];

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds((prev) =>
      prev.size === tickets.length ? new Set() : new Set(tickets.map((t) => t.id)),
    );
  }

  async function handleExport() {
    await exportTicketsCSV(filters);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Page header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Tickets</h1>
            {data && (
              <p className="text-sm text-gray-500 mt-0.5">{data.total} tickets</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
              Refresh
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void handleExport()}>
              <Download size={13} />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mt-4">
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              className="pl-8"
              placeholder="Search tickets…"
              value={filters.search ?? ''}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            />
          </div>

          <Select
            options={[
              { value: 'all', label: 'All statuses' },
              { value: 'open', label: 'Open' },
              { value: 'in_progress', label: 'In Progress' },
              { value: 'resolved', label: 'Resolved' },
            ]}
            value={filters.status ?? 'all'}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
          />

          <Select
            options={[
              { value: 'all', label: 'All priorities' },
              { value: 'P1', label: 'P1 — Critical' },
              { value: 'P2', label: 'P2 — High' },
              { value: 'P3', label: 'P3 — Medium' },
              { value: 'P4', label: 'P4 — Low' },
            ]}
            value={filters.priority ?? 'all'}
            onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value }))}
          />

          <Select
            options={[
              { value: 'updated_at', label: 'Sort: Last updated' },
              { value: 'created_at', label: 'Sort: Oldest first' },
              { value: 'priority', label: 'Sort: Priority' },
            ]}
            value={filters.sortBy ?? 'updated_at'}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                sortBy: e.target.value as TicketFilters['sortBy'],
              }))
            }
          />
        </div>
      </div>

      {/* Table */}
      <div className="px-6 py-4">
        {isLoading ? (
          <div className="text-center py-16 text-gray-400">Loading tickets…</div>
        ) : tickets.length === 0 ? (
          <div className="text-center py-16 text-gray-400">No tickets match the current filters.</div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            {/* Bulk action bar */}
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-3 px-4 py-2 bg-indigo-50 border-b border-indigo-100 text-sm">
                <span className="text-indigo-700 font-medium">{selectedIds.size} selected</span>
                <Button variant="secondary" size="sm">Mark resolved</Button>
                <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                  Clear
                </Button>
              </div>
            )}

            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-gray-100 bg-gray-50">
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === tickets.length && tickets.length > 0}
                      onChange={toggleAll}
                      className="rounded"
                    />
                  </th>
                  <th className="px-3 py-3 font-medium text-gray-500">
                    <span className="flex items-center gap-1">ID <ArrowUpDown size={11} /></span>
                  </th>
                  <th className="px-3 py-3 font-medium text-gray-500">Title</th>
                  <th className="px-3 py-3 font-medium text-gray-500">Status</th>
                  <th className="px-3 py-3 font-medium text-gray-500">Priority</th>
                  <th className="px-3 py-3 font-medium text-gray-500">Raised by</th>
                  <th className="px-3 py-3 font-medium text-gray-500">Agent</th>
                  <th className="px-3 py-3 font-medium text-gray-500">Age</th>
                  <th className="px-3 py-3 font-medium text-gray-500">Updated</th>
                  <th className="w-10 px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {tickets.map((ticket) => (
                  <TicketRow
                    key={ticket.id}
                    ticket={ticket}
                    selected={selectedIds.has(ticket.id)}
                    onToggle={() => toggleSelect(ticket.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function TicketRow({
  ticket,
  selected,
  onToggle,
}: {
  ticket: TicketSummary;
  selected: boolean;
  onToggle: () => void;
}) {
  const isResolved = ticket.status === 'resolved';

  return (
    <tr
      className={cn(
        'hover:bg-gray-50 transition-colors group',
        selected && 'bg-indigo-50',
        isResolved && 'opacity-60',
      )}
    >
      <td className="px-4 py-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          onClick={(e) => e.stopPropagation()}
          className="rounded"
        />
      </td>
      <td className="px-3 py-3">
        <span className="font-mono text-xs font-bold text-gray-500">{ticket.id}</span>
      </td>
      <td className="px-3 py-3 max-w-xs">
        <Link
          to={`/tickets/${ticket.id}`}
          className="font-medium text-gray-900 hover:text-indigo-600 line-clamp-1"
        >
          {ticket.title}
        </Link>
      </td>
      <td className="px-3 py-3">
        <StatusBadge status={ticket.status} />
      </td>
      <td className="px-3 py-3">
        <PriorityBadge priority={ticket.priority} />
      </td>
      <td className="px-3 py-3 text-gray-600">{ticket.raised_by}</td>
      <td className="px-3 py-3 text-gray-600 text-xs">{ticket.assigned_agent}</td>
      <td className="px-3 py-3 text-gray-400 text-xs whitespace-nowrap">
        {formatRelativeTime(ticket.created_at)}
      </td>
      <td className="px-3 py-3 text-gray-400 text-xs whitespace-nowrap">
        {formatRelativeTime(ticket.updated_at)}
      </td>
      <td className="px-3 py-3">
        <Link
          to={`/tickets/${ticket.id}`}
          className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-indigo-600 transition-opacity"
          title="Open ticket"
        >
          <ExternalLink size={14} />
        </Link>
      </td>
    </tr>
  );
}

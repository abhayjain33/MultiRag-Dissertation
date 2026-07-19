import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  Search, Download, ExternalLink, ArrowUpDown, RefreshCw, Plus, X, Paperclip,
} from 'lucide-react';
import type { TicketFilters, CreateTicketInput } from '@/user/api/tickets';
import { fetchTickets, exportTicketsCSV, createTicket, uploadAttachments } from '@/user/api/tickets';
import type { TicketSummary, TicketPriority } from '@/user/types/ticket';
import { StatusBadge, PriorityBadge } from '@/user/components/ui/badge';
import { Button } from '@/user/components/ui/button';
import { Input, Select } from '@/user/components/ui/input';
import { formatRelativeTime, cn } from '@/lib/utils';

export function TicketList() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<TicketFilters>({
    status: 'all',
    priority: 'all',
    search: '',
    sortBy: 'updated_at',
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showCreate, setShowCreate] = useState(false);

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
            <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
              <Plus size={13} />
              New Ticket
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

      {showCreate && (
        <CreateTicketModal
          onClose={() => setShowCreate(false)}
          onCreated={(ticket) => {
            setShowCreate(false);
            void refetch();
            void navigate(`/user/tickets/${ticket.id}`);
          }}
        />
      )}
    </div>
  );
}

function CreateTicketModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (ticket: TicketSummary) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TicketPriority>('P3');
  const [raisedBy, setRaisedBy] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  function addFiles(incoming: FileList | null) {
    if (!incoming) return;
    const imgs = Array.from(incoming).filter((f) => f.type.startsWith('image/'));
    const newPreviews = imgs.map((f) => URL.createObjectURL(f));
    setFiles((prev) => [...prev, ...imgs]);
    setPreviews((prev) => [...prev, ...newPreviews]);
  }

  function removeFile(index: number) {
    URL.revokeObjectURL(previews[index] ?? '');
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const input: CreateTicketInput = {
        title: title.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        priority,
        ...(raisedBy.trim() ? { raised_by: raisedBy.trim() } : {}),
      };
      const ticket = await createTicket(input);
      if (files.length > 0) {
        await uploadAttachments(ticket.id, files);
      }
      onCreated(ticket);
    } catch {
      setError('Failed to create ticket. Please try again.');
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">New Ticket</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Briefly describe the issue…"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Additional context, steps to reproduce…"
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TicketPriority)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
              >
                <option value="P1">P1 — Critical</option>
                <option value="P2">P2 — High</option>
                <option value="P3">P3 — Medium</option>
                <option value="P4">P4 — Low</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Raised by</label>
              <input
                type="text"
                value={raisedBy}
                onChange={(e) => setRaisedBy(e.target.value)}
                placeholder="Your name"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Screenshot dropzone */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Paperclip size={13} className="inline mr-1" />
              Screenshots
            </label>
            <div
              className={cn(
                'border-2 border-dashed rounded-lg p-3 text-center cursor-pointer transition-colors',
                isDragOver ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 hover:border-gray-300',
              )}
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setIsDragOver(false); addFiles(e.dataTransfer.files); }}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => addFiles(e.target.files)}
              />
              {previews.length === 0 ? (
                <p className="text-xs text-gray-400 py-2">Drop images here or click to browse</p>
              ) : (
                <div className="flex flex-wrap gap-2 justify-start" onClick={(e) => e.stopPropagation()}>
                  {previews.map((src, i) => (
                    <div key={i} className="relative group">
                      <img
                        src={src}
                        alt={files[i]?.name ?? ''}
                        className="h-14 w-14 object-cover rounded border border-gray-200"
                      />
                      <button
                        type="button"
                        onClick={() => removeFile(i)}
                        className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X size={9} />
                      </button>
                    </div>
                  ))}
                  <div
                    className="h-14 w-14 border-2 border-dashed border-gray-300 rounded flex items-center justify-center text-gray-400 text-xl cursor-pointer hover:border-gray-400 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    +
                  </div>
                </div>
              )}
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Creating…' : 'Create Ticket'}
            </button>
          </div>
        </form>
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
          to={`/user/tickets/${ticket.id}`}
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
          to={`/user/tickets/${ticket.id}`}
          className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-indigo-600 transition-opacity"
          title="Open ticket"
        >
          <ExternalLink size={14} />
        </Link>
      </td>
    </tr>
  );
}

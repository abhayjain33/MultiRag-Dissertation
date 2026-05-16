import type {
  TicketsListResponse,
  TicketDetailResponse,
  TicketComment,
} from '@/types/ticket';
import { MOCK_TICKETS, getMockTicketDetail } from '@/lib/mockData';

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true' || import.meta.env.DEV;

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`);
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export interface TicketFilters {
  status?: string | undefined;
  priority?: string | undefined;
  agent?: string | undefined;
  search?: string | undefined;
  sortBy?: 'updated_at' | 'priority' | 'created_at' | undefined;
}

export async function fetchTickets(filters: TicketFilters = {}): Promise<TicketsListResponse> {
  if (USE_MOCK) {
    let tickets = [...MOCK_TICKETS];
    if (filters.status && filters.status !== 'all') {
      tickets = tickets.filter((t) => {
        if (filters.status === 'open') return t.status === 'open';
        if (filters.status === 'in_progress') return ['kb_lookup', 'l1', 'l2'].includes(t.status);
        if (filters.status === 'resolved') return t.status === 'resolved';
        return true;
      });
    }
    if (filters.priority && filters.priority !== 'all') {
      tickets = tickets.filter((t) => t.priority === filters.priority);
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      tickets = tickets.filter(
        (t) => t.title.toLowerCase().includes(q) || t.id.toLowerCase().includes(q),
      );
    }
    return { tickets, total: tickets.length };
  }
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.priority) params.set('priority', filters.priority);
  if (filters.search) params.set('search', filters.search);
  return apiFetch<TicketsListResponse>(`/tickets?${params.toString()}`);
}

export async function fetchTicketDetail(id: string): Promise<TicketDetailResponse> {
  if (USE_MOCK) {
    const detail = getMockTicketDetail(id);
    if (!detail) throw new Error(`Ticket ${id} not found`);
    return detail;
  }
  return apiFetch<TicketDetailResponse>(`/tickets/${id}`);
}

export async function postComment(ticketId: string, content: string): Promise<TicketComment> {
  if (USE_MOCK) {
    return {
      id: crypto.randomUUID(),
      ticket_id: ticketId,
      author: 'You',
      author_type: 'human',
      content,
      created_at: new Date().toISOString(),
    };
  }
  const res = await fetch(`/api/tickets/${ticketId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error('Failed to post comment');
  return res.json() as Promise<TicketComment>;
}

export async function exportTicketsCSV(filters: TicketFilters = {}): Promise<void> {
  const { tickets } = await fetchTickets(filters);
  const headers = ['ID', 'Title', 'Status', 'Priority', 'Raised By', 'Agent', 'Created', 'Updated'];
  const rows = tickets.map((t) => [
    t.id,
    `"${t.title.replace(/"/g, '""')}"`,
    t.status,
    t.priority,
    t.raised_by,
    t.assigned_agent,
    t.created_at,
    t.updated_at,
  ]);
  const csv = [headers, ...rows].map((r) => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'tickets.csv';
  a.click();
  URL.revokeObjectURL(url);
}

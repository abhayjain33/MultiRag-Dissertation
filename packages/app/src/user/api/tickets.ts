import type {
  TicketsListResponse,
  TicketDetailResponse,
  TicketComment,
  TicketSummary,
  TicketPriority,
  TicketAttachment,
} from '@/user/types/ticket';

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
  const params = new URLSearchParams();
  if (filters.status && filters.status !== 'all') params.set('status', filters.status);
  if (filters.priority && filters.priority !== 'all') params.set('priority', filters.priority);
  if (filters.search) params.set('search', filters.search);
  return apiFetch<TicketsListResponse>(`/tickets?${params.toString()}`);
}

export async function fetchTicketDetail(id: string): Promise<TicketDetailResponse> {
  return apiFetch<TicketDetailResponse>(`/tickets/${id}`);
}

export async function postComment(ticketId: string, content: string): Promise<TicketComment> {
  const res = await fetch(`/api/tickets/${ticketId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error('Failed to post comment');
  return res.json() as Promise<TicketComment>;
}

export interface CreateTicketInput {
  title: string;
  description?: string | undefined;
  priority?: TicketPriority | undefined;
  raised_by?: string | undefined;
}

export async function createTicket(input: CreateTicketInput): Promise<TicketSummary> {
  const res = await fetch('/api/tickets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error('Failed to create ticket');
  return res.json() as Promise<TicketSummary>;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1] ?? '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function uploadAttachments(ticketId: string, files: File[]): Promise<TicketAttachment[]> {
  const results: TicketAttachment[] = [];
  for (const file of files) {
    const data = await readFileAsBase64(file);
    const res = await fetch(`/api/tickets/${ticketId}/attachments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: file.name, content_type: file.type, data }),
    });
    if (!res.ok) throw new Error(`Failed to upload ${file.name}`);
    results.push((await res.json()) as TicketAttachment);
  }
  return results;
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

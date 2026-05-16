import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TicketList } from '@/pages/TicketBoard/TicketList';
import { TicketDetail } from '@/pages/TicketBoard/TicketDetail';
import { cn } from '@/lib/utils';
import { LayoutDashboard, Ticket, MessageSquare, BookOpen, Settings } from 'lucide-react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

function Sidebar() {
  const { pathname } = useLocation();

  const links = [
    { to: '/', icon: <LayoutDashboard size={18} />, label: 'Dashboard' },
    { to: '/tickets', icon: <Ticket size={18} />, label: 'Tickets' },
    { to: '/chat', icon: <MessageSquare size={18} />, label: 'Chat' },
    { to: '/knowledge', icon: <BookOpen size={18} />, label: 'Knowledge' },
    { to: '/config', icon: <Settings size={18} />, label: 'Config' },
  ];

  return (
    <nav className="w-14 lg:w-52 shrink-0 bg-gray-900 flex flex-col py-4">
      <div className="px-3 mb-6 hidden lg:block">
        <span className="font-bold text-white text-sm">Agent Platform</span>
      </div>
      {links.map((l) => (
        <Link
          key={l.to}
          to={l.to}
          className={cn(
            'flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors',
            pathname.startsWith(l.to) && l.to !== '/'
              ? 'bg-gray-800 text-white'
              : pathname === l.to && l.to === '/'
                ? 'bg-gray-800 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-800',
          )}
        >
          {l.icon}
          <span className="hidden lg:block">{l.label}</span>
        </Link>
      ))}
    </nav>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}

function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-center min-h-screen text-gray-400">
      <div className="text-center">
        <h2 className="text-xl font-semibold mb-2">{title}</h2>
        <p className="text-sm">This page is planned but not yet implemented.</p>
        <Link to="/tickets" className="mt-4 inline-block text-indigo-500 hover:underline text-sm">
          → Go to Tickets
        </Link>
      </div>
    </div>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Navigate to="/tickets" replace />} />
            <Route path="/tickets" element={<TicketList />} />
            <Route path="/tickets/:ticketId" element={<TicketDetail />} />
            <Route path="/chat" element={<PlaceholderPage title="Chat Console" />} />
            <Route path="/knowledge" element={<PlaceholderPage title="Knowledge Explorer" />} />
            <Route path="/config" element={<PlaceholderPage title="Agent Config" />} />
            <Route path="*" element={<Navigate to="/tickets" replace />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

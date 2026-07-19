import { BrowserRouter, Routes, Route, Navigate, NavLink } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Ticket, Settings, Cpu } from 'lucide-react';
import { UserApp } from '@/user/UserApp';
import { AdminApp } from '@/admin/AdminApp';
import { ErrorBoundary } from '@/ErrorBoundary';
import { cn } from '@/lib/utils';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

function TopBar() {
  return (
    <header className="flex-shrink-0 h-12 bg-gray-900 border-b border-gray-800 flex items-center px-4 gap-4 z-40">
      {/* Brand */}
      <div className="flex items-center gap-2 mr-2">
        <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
          <Cpu size={15} className="text-white" />
        </div>
        <span className="text-white text-sm font-bold tracking-tight hidden sm:block">
          Agentic Triage Platform
        </span>
      </div>

      <div className="w-px h-5 bg-gray-700" />

      {/* Tab switcher */}
      <nav className="flex items-center gap-1">
        <TabLink to="/user/tickets" icon={<Ticket size={14} />} label="User" />
        <TabLink to="/admin" icon={<Settings size={14} />} label="Admin" />
      </nav>
    </header>
  );
}

function TabLink({
  to,
  icon,
  label,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
}) {
  // Match the tab prefix so /user/tickets/:id still highlights "User"
  const prefix = to.split('/')[1];
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors',
          isActive || (typeof window !== 'undefined' && window.location.pathname.startsWith(`/${prefix}`))
            ? 'bg-indigo-600 text-white'
            : 'text-gray-400 hover:text-white hover:bg-gray-800',
        )
      }
      end={false}
    >
      {icon}
      {label}
    </NavLink>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="flex flex-col h-screen overflow-hidden">
          <TopBar />
          <div className="flex-1 overflow-hidden">
            <ErrorBoundary>
              <Routes>
                <Route path="/" element={<Navigate to="/user/tickets" replace />} />
                <Route path="/user/*" element={<UserApp />} />
                <Route path="/admin" element={<AdminApp />} />
                <Route path="*" element={<Navigate to="/user/tickets" replace />} />
              </Routes>
            </ErrorBoundary>
          </div>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

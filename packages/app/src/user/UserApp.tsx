import { Routes, Route, Navigate } from 'react-router-dom';
import { TicketList } from '@/user/pages/TicketBoard/TicketList';
import { TicketDetail } from '@/user/pages/TicketBoard/TicketDetail';

// The QueryClient is provided by the root App — no duplicate provider needed here.
// BrowserRouter is also provided by the root App.

export function UserApp() {
  return (
    <div className="h-full overflow-auto">
      <Routes>
        <Route index element={<Navigate to="tickets" replace />} />
        <Route path="tickets" element={<TicketList />} />
        <Route path="tickets/:ticketId" element={<TicketDetail />} />
        <Route path="*" element={<Navigate to="tickets" replace />} />
      </Routes>
    </div>
  );
}

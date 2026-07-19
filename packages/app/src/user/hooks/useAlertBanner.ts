import { useEffect } from 'react';
import { useTicketDetailStore } from '@/user/store/ticketStore';

// Auto-dismiss alerts after 5 seconds
export function useAlertAutoDismiss() {
  const alerts = useTicketDetailStore((s) => s.alerts);
  const dismiss = useTicketDetailStore((s) => s.dismissAlert);

  useEffect(() => {
    if (alerts.length === 0) return;
    const newest = alerts[alerts.length - 1];
    if (!newest) return;
    const timer = setTimeout(() => dismiss(newest.id), 5000);
    return () => clearTimeout(timer);
  }, [alerts, dismiss]);
}

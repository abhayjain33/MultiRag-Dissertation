import { X } from 'lucide-react';
import { useTicketDetailStore } from '@/store/ticketStore';
import { useAlertAutoDismiss } from '@/hooks/useAlertBanner';
import { cn } from '@/lib/utils';

export function AlertBanner() {
  useAlertAutoDismiss();
  const alerts = useTicketDetailStore((s) => s.alerts);
  const dismiss = useTicketDetailStore((s) => s.dismissAlert);

  if (alerts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className={cn(
            'flex items-start justify-between gap-3 rounded-lg border border-indigo-200',
            'bg-indigo-50 px-4 py-3 shadow-md text-sm text-indigo-800',
            'animate-slide-in',
          )}
        >
          <span className="flex-1 leading-snug">
            {alert.anchor ? (
              <a
                href={alert.anchor.startsWith('#') ? alert.anchor : `#${alert.anchor}`}
                className="underline decoration-dotted"
                onClick={() => dismiss(alert.id)}
              >
                {alert.message}
              </a>
            ) : (
              alert.message
            )}
          </span>
          <button
            onClick={() => dismiss(alert.id)}
            className="mt-0.5 shrink-0 text-indigo-500 hover:text-indigo-700"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

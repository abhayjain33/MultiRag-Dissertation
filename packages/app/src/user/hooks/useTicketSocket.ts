import { useEffect, useRef } from 'react';
import type { TicketWSEvent } from '@/user/types/ticket';

interface Options {
  ticketId: string;
  onEvent: (event: TicketWSEvent) => void;
  enabled?: boolean;
}

export function useTicketSocket({ ticketId, onEvent, enabled = true }: Options) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    function connect() {
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const url = `${proto}://${window.location.host}/ws/tickets/${ticketId}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        attemptRef.current = 0;
        ws.send(JSON.stringify({ action: 'subscribe', ticket_id: ticketId }));
      };

      ws.onmessage = (ev) => {
        try {
          const event = JSON.parse(ev.data as string) as TicketWSEvent;
          onEvent(event);
        } catch {
          // ignore malformed frames
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        // exponential backoff: 1s, 2s, 4s … cap at 30s
        const delay = Math.min(1000 * Math.pow(2, attemptRef.current), 30_000);
        attemptRef.current += 1;
        reconnectTimer.current = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [ticketId, enabled, onEvent]);
}

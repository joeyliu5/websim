import type { EventPayload } from '../types/experiment';

export async function sendEvents(events: EventPayload[]): Promise<void> {
  if (!events.length) return;

  await fetch('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events }),
    keepalive: true,
  });
}

export type InteractionEventType = 'view' | 'click' | 'stay';

interface InteractionInput {
  postId: string;
  eventType: InteractionEventType;
  detail: Record<string, unknown>;
  timestamp?: string;
}

export async function logInteraction(input: InteractionInput): Promise<void> {
  const response = await fetch('/api/interactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    keepalive: true,
  });

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    console.error('Failed to write interaction log:', message || response.statusText);
  }
}

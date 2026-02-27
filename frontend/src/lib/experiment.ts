import type { Condition, NewsMaterial } from '../types/experiment';

const GROUPS: Condition[] = [
  { aigsPosition: 'top', source: 'mainstream', groupKey: 'top_mainstream' },
  { aigsPosition: 'top', source: 'we-media', groupKey: 'top_we-media' },
  { aigsPosition: 'middle', source: 'mainstream', groupKey: 'middle_mainstream' },
  { aigsPosition: 'middle', source: 'we-media', groupKey: 'middle_we-media' },
  { aigsPosition: 'none', source: 'mainstream', groupKey: 'none_mainstream' },
  { aigsPosition: 'none', source: 'we-media', groupKey: 'none_we-media' },
];

export function resolveCondition(search: string): Condition {
  const params = new URLSearchParams(search);
  const explicit = params.get('cond');

  if (explicit) {
    const found = GROUPS.find((g) => g.groupKey === explicit);
    if (found) return found;
  }
  // Preview mode: keep AIGS visible by default unless cond is explicitly set.
  return GROUPS[0];
}

export function latinSquareOrder<T>(items: T[], participantId: string): T[] {
  if (items.length <= 1) return items;
  const n = items.length;
  const seed = Number(participantId.replace(/\D/g, '') || '0');
  const row = seed % n;

  const order: T[] = [];
  for (let i = 0; i < n; i += 1) {
    order.push(items[(row + i) % n]);
  }
  return order;
}

export function assignNewsSequence(materials: NewsMaterial[], participantId: string): NewsMaterial[] {
  const hard = materials.filter((m) => m.type === 'hard').slice(0, 2);
  const soft = materials.filter((m) => m.type === 'soft').slice(0, 2);
  const merged = [...hard, ...soft];

  return latinSquareOrder(merged, participantId);
}

export type EventTaskDueState = 'overdue' | 'due-soon' | null;

const dueSoonWindowMs = 24 * 60 * 60 * 1000;

export function eventTaskDueState(dueDate: string | null | undefined, status: string, now = Date.now()): EventTaskDueState {
  if (!dueDate || status === 'DONE') return null;
  const dueAt = new Date(dueDate).getTime();
  if (Number.isNaN(dueAt)) return null;
  if (dueAt < now) return 'overdue';
  if (dueAt <= now + dueSoonWindowMs) return 'due-soon';
  return null;
}

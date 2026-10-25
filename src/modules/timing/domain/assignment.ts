import type { Hundredths } from '../../../core/time';

// An arrival as it is saved on the phone. `time` is null when it was saved without one, never 0.
export type AssignmentRow = { id: string; position: number; time: Hundredths | null; athleteId: string | null };

export type AssignResult =
  | { ok: true; row: AssignmentRow }
  | { ok: false; reason: 'no_open_position' }
  | { ok: false; reason: 'athlete_already_assigned'; position: number };

// The position that takes the next athlete: the one just reopened, otherwise the first one without an athlete.
export function targetRow(rows: readonly AssignmentRow[], reopened: number | null): AssignmentRow | null {
  if (reopened !== null) return rows.find((r) => r.position === reopened) ?? null;
  return rows.find((r) => r.athleteId === null) ?? null;
}

// What the screen shows: a reopened position reads as open, though the saved athlete stays until another one takes it
// (the server never lets an athlete go back to nobody).
export function shownRows(rows: readonly AssignmentRow[], reopened: number | null): AssignmentRow[] {
  return rows.map((r) => (r.position === reopened ? { ...r, athleteId: null } : r));
}

// Only a position with an athlete can be reopened; anything else leaves the current choice as it is.
export function reopen(rows: readonly AssignmentRow[], reopened: number | null, position: number): number | null {
  return rows.find((r) => r.position === position)?.athleteId != null ? position : reopened;
}

// An athlete has one position per series: it is refused while another position holds them and says where.
// Choosing again the athlete a reopened position already has is accepted (the caller writes nothing).
export function assign(rows: readonly AssignmentRow[], reopened: number | null, athleteId: string): AssignResult {
  const row = targetRow(rows, reopened);
  if (!row) return { ok: false, reason: 'no_open_position' };
  const holder = rows.find((r) => r.athleteId === athleteId);
  if (holder && holder.position !== row.position) return { ok: false, reason: 'athlete_already_assigned', position: holder.position };
  return { ok: true, row };
}

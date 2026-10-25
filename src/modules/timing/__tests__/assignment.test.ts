import { assign, reopen, shownRows, targetRow, type AssignmentRow } from '../domain/assignment';

// Synthetic athlete ids.
const ANA = 'athlete-a';
const BEA = 'athlete-b';
const CAM = 'athlete-c';

const row = (position: number, athleteId: string | null, time: number | null = 3000 + position): AssignmentRow => ({
  id: `m${position}`,
  position,
  time: time as AssignmentRow['time'],
  athleteId,
});

describe('which position takes the next athlete', () => {
  it('is the first position without an athlete', () => {
    expect(targetRow([row(1, ANA), row(2, null), row(3, null)], null)?.position).toBe(2);
  });

  it('is none when every position has an athlete', () => {
    expect(targetRow([row(1, ANA), row(2, BEA)], null)).toBeNull();
  });

  it('is the reopened position, even when an earlier one is still open', () => {
    expect(targetRow([row(1, null), row(2, ANA), row(3, BEA)], 3)?.position).toBe(3);
  });

  it('is none for a reopened position that does not exist', () => {
    expect(targetRow([row(1, ANA)], 5)).toBeNull();
  });
});

describe('reopening a position', () => {
  it('reads as open on screen while the saved athlete stays', () => {
    const rows = [row(1, ANA), row(2, BEA)];
    expect(shownRows(rows, 1).map((r) => r.athleteId)).toEqual([null, BEA]);
    expect(rows.map((r) => r.athleteId)).toEqual([ANA, BEA]);
    expect(shownRows(rows, null)).toEqual(rows);
  });

  it('only opens a position that has an athlete', () => {
    const rows = [row(1, ANA), row(2, null)];
    expect(reopen(rows, null, 1)).toBe(1);
    expect(reopen(rows, null, 2)).toBeNull();
    expect(reopen(rows, null, 9)).toBeNull();
  });

  it('keeps the current choice when the tapped position cannot be reopened', () => {
    expect(reopen([row(1, ANA), row(2, null)], 1, 2)).toBe(1);
  });
});

describe('assigning an athlete', () => {
  it('gives the athlete to the first open position', () => {
    expect(assign([row(1, ANA), row(2, null)], null, BEA)).toEqual({ ok: true, row: row(2, null) });
  });

  it('gives the athlete to the reopened position', () => {
    expect(assign([row(1, ANA), row(2, BEA)], 1, CAM)).toEqual({ ok: true, row: row(1, ANA) });
  });

  it('accepts the athlete the reopened position already has', () => {
    expect(assign([row(1, ANA), row(2, BEA)], 1, ANA)).toEqual({ ok: true, row: row(1, ANA) });
  });

  it('rejects an athlete another position holds and says where', () => {
    expect(assign([row(1, ANA), row(2, null)], null, ANA)).toEqual({ ok: false, reason: 'athlete_already_assigned', position: 1 });
  });

  it('keeps rejecting the athlete of a reopened position for another one, until it is filled by someone else', () => {
    expect(assign([row(1, ANA), row(2, BEA), row(3, null)], 2, ANA)).toEqual({ ok: false, reason: 'athlete_already_assigned', position: 1 });
  });

  it('rejects when no position is open', () => {
    expect(assign([], null, ANA)).toEqual({ ok: false, reason: 'no_open_position' });
    expect(assign([row(1, ANA)], null, BEA)).toEqual({ ok: false, reason: 'no_open_position' });
  });

  it('keeps a position saved without a time as null', () => {
    const result = assign([row(1, null, null)], null, ANA);
    expect(result.ok && result.row.time).toBeNull();
  });
});

import { act, render, waitFor } from '@testing-library/react-native';

import { createInMemoryAthleteSchoolRepository } from '../../athletes';
import { createInMemoryAssignmentRepository, createInMemoryFulfillmentRepository, createInMemoryNoticeRepository, createInMemoryTrainingPlanRepository, TodayContainer } from '..';
import { athletes, plan } from '../__fixtures__/assignments';
import type { TodayScreenProps } from '../screens/TodayScreen';

// The barrels pull in the native PowerSync database; these tests use the in-memory repositories only.
jest.mock('../../../core/sync', () => ({ db: {} }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));

// The screen is replaced by a probe, so the container's callbacks can be called while a save is still running.
let shown: TodayScreenProps;
jest.mock('../screens/TodayScreen', () => ({
  TodayScreen: (props: TodayScreenProps) => {
    shown = props;
    return null;
  },
}));

const DAY = '2026-11-02';
const NEXT_DAY = '2026-11-03';
// A day with no assignment yet.
const LATE_DAY = '2026-11-04';

const showsPlan = (planName: string) => waitFor(() => expect(shown.view).toMatchObject({ kind: 'data', content: { planName } }));

async function setup({ failFirstRead = false, ids = ['a1', 'a3'] } = {}) {
  const plans = createInMemoryTrainingPlanRepository();
  await plans.save(plan('p1'));
  await plans.save({ ...plan('p2'), name: 'Plan del otro' });
  await plans.save({ ...plan('p3'), name: 'Plan de mañana' });
  const stored = createInMemoryAssignmentRepository(plans);
  // Athlete a1 has the plan of the day (g1); a3 has another one (g2); a1 has a different assignment tomorrow.
  const one = await stored.create({ planId: 'p1', schoolId: 's1', sessionDate: DAY, target: { kind: 'group', groupId: 'g1' } });
  const other = await stored.create({ planId: 'p2', schoolId: 's1', sessionDate: DAY, target: { kind: 'group', groupId: 'g2' } });
  await stored.create({ planId: 'p3', schoolId: 's1', sessionDate: NEXT_DAY, target: { kind: 'group', groupId: 'g1' } });
  // `gate` stops a read before it starts; `listed` stops it after its notes were listed, so it can still miss a note saved meanwhile.
  const reads: { count: number; failNext: boolean; gate?: Promise<void>; listed?: Promise<void> } = { count: 0, failNext: failFirstRead };
  const readPlans = { ...plans, get: async (...args: Parameters<typeof plans.get>) => (await reads.listed, plans.get(...args)) };
  const assignments = {
    ...stored,
    list: async (...args: Parameters<typeof stored.list>) => {
      reads.count += 1;
      await reads.gate;
      if (reads.failNext) {
        reads.failNext = false;
        throw new Error('read failed');
      }
      return stored.list(...args);
    },
  };
  const storedNotices = createInMemoryNoticeRepository();
  // Saving a note waits for `hold.promise` while it is set.
  const hold: { promise?: Promise<void> } = {};
  const notices = { ...storedNotices, add: async (...args: Parameters<typeof storedNotices.add>) => (await hold.promise, storedNotices.add(...args)) };
  const fulfillment = createInMemoryFulfillmentRepository({}, plans);
  const container = async (shown: string[], day = DAY, synced = true) => (
    <TodayContainer
      plans={readPlans}
      assignments={assignments}
      schoolLinks={createInMemoryAthleteSchoolRepository([
        { athleteId: 'a1', schoolId: 's1', categoryId: 'c1' },
        { athleteId: 'a3', schoolId: 's1', categoryId: 'c2' },
      ])}
      fulfillment={fulfillment}
      notices={notices}
      series={{ listArrivals: async () => [] } as never}
      userId="guardian-1"
      athletes={await athletes.listByIds(shown)}
      day={day}
      synced={synced}
    />
  );
  const view = await render(await container(ids));
  const update = async (shown: string[], day = DAY, synced = true) => view.rerender(await container(shown, day, synced));
  // Starts a save that stays open until the returned function is called.
  const sendHeld = async (body: string) => {
    let release!: () => void;
    hold.promise = new Promise<void>((resolve) => (release = resolve));
    let sending!: void | Promise<void>;
    await act(async () => {
      sending = shown.onSendNotice({ blockId: null, body });
    });
    return async () => {
      await act(async () => {
        release();
        await sending;
      });
    };
  };
  return { one, other, stored, fulfillment, notices: storedNotices, reads, update, sendHeld };
}

describe('TodayContainer races', () => {
  it('keeps the plan of the athlete picked while a note of another one is being saved, and the note stays with the first athlete', async () => {
    const { one, other, notices, sendHeld } = await setup();
    await showsPlan('Plan p1');
    const finish = await sendHeld('Test note 1');

    await act(async () => shown.onSelectAthlete?.('a3'));
    await showsPlan('Plan del otro');
    await finish();

    expect(shown.view).toMatchObject({ kind: 'data', content: { planName: 'Plan del otro', notes: [] } });
    expect(await notices.list('a1', one)).toMatchObject([{ athleteId: 'a1', assignmentId: one, body: 'Test note 1' }]);
    expect(await notices.list('a3', other)).toEqual([]);
  });

  it('keeps the new assignment of the same athlete when a note of the old one finishes saving', async () => {
    const { one, notices, update, sendHeld } = await setup();
    await showsPlan('Plan p1');
    const finish = await sendHeld('Test note 1');

    await update(['a1', 'a3'], NEXT_DAY);
    await showsPlan('Plan de mañana');
    await finish();

    expect(shown.view).toMatchObject({ kind: 'data', content: { planName: 'Plan de mañana', notes: [] } });
    expect(await notices.list('a1', one)).toMatchObject([{ body: 'Test note 1' }]);
  });

  it('does not read again or go through loading when the athlete already shown is picked', async () => {
    const { reads } = await setup();
    await showsPlan('Plan p1');
    const before = reads.count;
    // A read started now would stay in loading until the gate opens.
    let openGate!: () => void;
    reads.gate = new Promise<void>((resolve) => (openGate = resolve));

    await act(async () => shown.onSelectAthlete?.('a1'));

    expect(shown.view).toMatchObject({ kind: 'data', content: { planName: 'Plan p1' } });
    expect(reads.count).toBe(before);
    openGate();
  });

  it('reads again when the first sync completes, so a plan that arrived with it is not "no plan"', async () => {
    const { stored, update } = await setup();
    await showsPlan('Plan p1');
    // Before the first sync nothing was found for the day: still connecting, so loading.
    await update(['a1', 'a3'], LATE_DAY, false);
    await waitFor(() => expect(shown.view.kind).toBe('loading'));

    await stored.create({ planId: 'p3', schoolId: 's1', sessionDate: LATE_DAY, target: { kind: 'group', groupId: 'g1' } });
    await update(['a1', 'a3'], LATE_DAY, true);

    await showsPlan('Plan de mañana');
  });

  it('keeps the newer marks of a read that finishes while a note is being saved, and adds the note', async () => {
    const { one, fulfillment, update, sendHeld } = await setup();
    await showsPlan('Plan p1');
    const finish = await sendHeld('Test note 1');

    await fulfillment.mark({ assignmentId: one, versionId: 'p1-v1', blockId: 'b1', athleteId: 'a1', status: 'done', authorId: 'k1', deviceId: 'tablet-1' });
    // The first sync completing reads again; the data shown stays until the new read arrives.
    await update(['a1', 'a3'], DAY, false);
    await update(['a1', 'a3'], DAY, true);
    await waitFor(() => expect(shown.view).toMatchObject({ kind: 'data', content: { blocks: [{ status: 'done' }] } }));
    await finish();

    expect(shown.view).toMatchObject({ kind: 'data', content: { blocks: [{ status: 'done' }], notes: [{ body: 'Test note 1' }] } });
  });

  it('shows a note whose save finishes while the athlete is being read again, in the read that arrives', async () => {
    const { reads, sendHeld } = await setup();
    await showsPlan('Plan p1');
    const finish = await sendHeld('Test note 1');

    // Coming back to a1 reads it again; that read listed its notes before the note was saved and is still open.
    let openRead!: () => void;
    reads.listed = new Promise<void>((resolve) => (openRead = resolve));
    await act(async () => shown.onSelectAthlete?.('a3'));
    await act(async () => shown.onSelectAthlete?.('a1'));
    await finish();
    openRead();

    await showsPlan('Plan p1');
    expect(shown.view).toMatchObject({ kind: 'data', content: { notes: [{ body: 'Test note 1' }] } });
  });

  it('does not read again or go through loading when the athlete already shown is picked', async () => {
    const { reads } = await setup();
    await showsPlan('Plan p1');
    const before = reads.count;
    // A read started now would stay in loading until the gate opens.
    let openGate!: () => void;
    reads.gate = new Promise<void>((resolve) => (openGate = resolve));

    await act(async () => shown.onSelectAthlete?.('a1'));

    expect(shown.view).toMatchObject({ kind: 'data', content: { planName: 'Plan p1' } });
    expect(reads.count).toBe(before);
    openGate();
  });

  it('reads again when the first sync completes, so a plan that arrived with it is not "no plan"', async () => {
    const { stored, update } = await setup();
    await showsPlan('Plan p1');
    // Before the first sync nothing was found for the day: still connecting, so loading.
    await update(['a1', 'a3'], LATE_DAY, false);
    await waitFor(() => expect(shown.view.kind).toBe('loading'));

    await stored.create({ planId: 'p3', schoolId: 's1', sessionDate: LATE_DAY, target: { kind: 'group', groupId: 'g1' } });
    await update(['a1', 'a3'], LATE_DAY, true);

    await showsPlan('Plan de mañana');
  });

  it('keeps the newer marks of a read that finishes while a note is being saved, and adds the note', async () => {
    const { one, fulfillment, update, sendHeld } = await setup();
    await showsPlan('Plan p1');
    const finish = await sendHeld('Test note 1');

    await fulfillment.mark({ assignmentId: one, versionId: 'p1-v1', blockId: 'b1', athleteId: 'a1', status: 'done', authorId: 'k1', deviceId: 'tablet-1' });
    // The first sync completing reads again; the data shown stays until the new read arrives.
    await update(['a1', 'a3'], DAY, false);
    await update(['a1', 'a3'], DAY, true);
    await waitFor(() => expect(shown.view).toMatchObject({ kind: 'data', content: { blocks: [{ status: 'done' }] } }));
    await finish();

    expect(shown.view).toMatchObject({ kind: 'data', content: { blocks: [{ status: 'done' }], notes: [{ body: 'Test note 1' }] } });
  });

  it('shows a note whose save finishes while the athlete is being read again, in the read that arrives', async () => {
    const { reads, update, sendHeld } = await setup();
    await showsPlan('Plan p1');
    const finish = await sendHeld('Test note 1');

    // The athlete changes day and comes back: the read of the day stays open and nothing is shown meanwhile.
    let openGate!: () => void;
    reads.gate = new Promise<void>((resolve) => (openGate = resolve));
    await update(['a1', 'a3'], NEXT_DAY);
    await finish();
    openGate();
    await update(['a1', 'a3'], DAY);

    await showsPlan('Plan p1');
    expect(shown.view).toMatchObject({ kind: 'data', content: { notes: [{ body: 'Test note 1' }] } });
  });

  it('does not turn the first athlete into an explicit choice when the read is retried', async () => {
    const { update } = await setup({ failFirstRead: true, ids: ['a3'] });
    await waitFor(() => expect(shown.view.kind).toBe('error'));

    await act(async () => {
      if (shown.view.kind === 'error') shown.view.onRetry();
    });
    await showsPlan('Plan del otro');
    await update(['a1', 'a3']);

    // Nobody chose a3: the first of the new list takes over.
    await showsPlan('Plan p1');
    expect(shown.selectedAthleteId).toBe('a1');
  });
});

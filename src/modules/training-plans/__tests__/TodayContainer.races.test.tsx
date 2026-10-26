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

// Lets the pending reads and saves, which only wait on promises, finish.
const settle = () =>
  act(async () => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  });

const showsPlan = (planName: string) => waitFor(() => expect(shown.view).toMatchObject({ kind: 'data', content: { planName } }));

// `synced` is the state of the first render; the first sync is the change from false to true.
async function setup({ failFirstRead = false, ids = ['a1', 'a3'], synced: firstSynced = true } = {}) {
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
  // Saving a note waits for `hold.promise` while it is set; the next `hold.listing.remaining` listings wait for `hold.listing.promise`.
  // The next `hold.failListings` listings are rejected.
  const hold: { promise?: Promise<void>; listing?: { promise: Promise<void>; remaining: number }; failListings?: number } = {};
  const notices = {
    ...storedNotices,
    add: async (...args: Parameters<typeof storedNotices.add>) => (await hold.promise, storedNotices.add(...args)),
    list: async (...args: Parameters<typeof storedNotices.list>) => {
      if (hold.listing && hold.listing.remaining > 0) {
        hold.listing.remaining -= 1;
        await hold.listing.promise;
      }
      if (hold.failListings) {
        hold.failListings -= 1;
        throw new Error('list failed');
      }
      return storedNotices.list(...args);
    },
  };
  const fulfillment = createInMemoryFulfillmentRepository({}, plans);
  const container = async (shown: string[], day = DAY, synced = firstSynced) => (
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
  // Starts a save whose note is not added until `release` is called; `sending` is the save itself. Only this save waits: the next ones are not held.
  const startHeld = async (body: string) => {
    let release!: () => void;
    hold.promise = new Promise<void>((resolve) => (release = resolve));
    let sending!: void | Promise<void>;
    await act(async () => {
      sending = shown.onSendNotice({ blockId: null, body });
    });
    hold.promise = undefined;
    return { release: () => act(async () => release()), sending };
  };
  // Starts a save that stays open until the returned function is called.
  const sendHeld = async (body: string) => {
    const { release, sending } = await startHeld(body);
    return async () => {
      await release();
      await act(async () => {
        await sending;
      });
    };
  };
  // Starts a save that adds its note at once; its listing waits if `holdListings` was called.
  const startOpen = async (body: string) => {
    let sending!: void | Promise<void>;
    await act(async () => {
      sending = shown.onSendNotice({ blockId: null, body });
    });
    // Wrapped, so awaiting this does not wait for the save.
    return { sending };
  };
  const failListings = (count: number) => {
    hold.failListings = count;
  };
  // The listing a save does after adding its note waits (for `count` saves) until the returned function is called.
  const holdListings = (count: number) => {
    let release!: () => void;
    hold.listing = { promise: new Promise<void>((resolve) => (release = resolve)), remaining: count };
    return release;
  };
  return { one, other, stored, fulfillment, notices: storedNotices, reads, update, sendHeld, startHeld, startOpen, holdListings, failListings };
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
    const { stored, update } = await setup({ synced: false });
    await showsPlan('Plan p1');
    // Before the first sync nothing was found for the day: still connecting, so loading.
    await update(['a1', 'a3'], LATE_DAY, false);
    await waitFor(() => expect(shown.view.kind).toBe('loading'));

    await stored.create({ planId: 'p3', schoolId: 's1', sessionDate: LATE_DAY, target: { kind: 'group', groupId: 'g1' } });
    await update(['a1', 'a3'], LATE_DAY, true);

    await showsPlan('Plan de mañana');
  });

  it('keeps the newer marks of a read that finishes while a note is being saved, and adds the note', async () => {
    const { one, fulfillment, update, sendHeld } = await setup({ synced: false });
    await showsPlan('Plan p1');
    const finish = await sendHeld('Test note 1');

    await fulfillment.mark({ assignmentId: one, versionId: 'p1-v1', blockId: 'b1', athleteId: 'a1', status: 'done', authorId: 'k1', deviceId: 'tablet-1' });
    // The first sync completing reads again; the data shown stays until the new read arrives.
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

  it('shows a note saved while the read of the first sync is open, once that read arrives', async () => {
    const { reads, update, sendHeld } = await setup({ synced: false });
    await showsPlan('Plan p1');

    // The first sync completing reads again; that read listed the notes before the note was saved and is still open.
    let openRead!: () => void;
    reads.listed = new Promise<void>((resolve) => (openRead = resolve));
    await update(['a1', 'a3'], DAY, true);
    const finish = await sendHeld('Test note 1');
    await finish();
    openRead();
    await settle();

    await waitFor(() => expect(shown.view).toMatchObject({ kind: 'data', content: { planName: 'Plan p1', notes: [{ body: 'Test note 1' }] } }));
  });

  it('reads again when the first sync completes, not each time the connection comes back', async () => {
    const { reads, update } = await setup({ synced: false });
    await showsPlan('Plan p1');
    const beforeSync = reads.count;

    await update(['a1', 'a3'], DAY, true);
    await settle();
    expect(reads.count).toBeGreaterThan(beforeSync);

    const afterSync = reads.count;
    await update(['a1', 'a3'], DAY, false);
    await update(['a1', 'a3'], DAY, true);
    await settle();
    expect(reads.count).toBe(afterSync);
  });

  it.each([1, 2])('does not read again the read that started after %i saves finished, and shows their notes', async (saves) => {
    const { reads, holdListings } = await setup();
    await showsPlan('Plan p1');

    // The notes are added, but the listing each save does next is still open.
    const release = holdListings(saves);
    const sending: (void | Promise<void>)[] = [];
    for (let n = 1; n <= saves; n += 1) {
      await act(async () => {
        sending.push(shown.onSendNotice({ blockId: null, body: `Test note ${n}` }));
      });
    }
    // The athlete is read again after all of them were added, and that read stays open.
    let openRead!: () => void;
    reads.gate = new Promise<void>((resolve) => (openRead = resolve));
    await act(async () => shown.onSelectAthlete?.('a3'));
    await act(async () => shown.onSelectAthlete?.('a1'));
    const readsOpen = reads.count;

    await act(async () => {
      release();
      await Promise.all(sending);
    });
    expect(reads.count).toBe(readsOpen);

    openRead();
    await showsPlan('Plan p1');
    await waitFor(() => expect(shown.view.kind === 'data' && (shown.view.content.notes ?? []).map((note) => note.body).sort()).toEqual(Array.from({ length: saves }, (_, n) => `Test note ${n + 1}`)));
  });

  it('does not read again the read that started after a note was saved because a note of another athlete finished saving', async () => {
    const { reads, startHeld, startOpen, holdListings } = await setup();
    await showsPlan('Plan p1');
    // The note of a3 is still not added.
    await act(async () => shown.onSelectAthlete?.('a3'));
    await showsPlan('Plan del otro');
    const other = await startHeld('Test note of a3');
    await act(async () => shown.onSelectAthlete?.('a1'));
    await showsPlan('Plan p1');
    // The note of a1 is added, but its listing is still open.
    const release = holdListings(1);
    const { sending } = await startOpen('Test note of a1');
    // a1 is read again after its note was added, and that read stays open.
    let openRead!: () => void;
    reads.gate = new Promise<void>((resolve) => (openRead = resolve));
    await act(async () => shown.onSelectAthlete?.('a3'));
    await act(async () => shown.onSelectAthlete?.('a1'));
    await other.release();
    await settle();
    const readsOpen = reads.count;

    await act(async () => {
      release();
      await sending;
    });
    expect(reads.count).toBe(readsOpen);

    openRead();
    await showsPlan('Plan p1');
    await waitFor(() => expect(shown.view).toMatchObject({ kind: 'data', content: { notes: [{ body: 'Test note of a1' }] } }));
  });

  it('reads once more for two saves that overlap an open read, and shows both notes', async () => {
    const { reads, startHeld } = await setup();
    await showsPlan('Plan p1');
    const first = await startHeld('Test note 1');
    const second = await startHeld('Test note 2');
    // The athlete is read again before either note was added, and that read stays open.
    let openRead!: () => void;
    reads.gate = new Promise<void>((resolve) => (openRead = resolve));
    await act(async () => shown.onSelectAthlete?.('a3'));
    await act(async () => shown.onSelectAthlete?.('a1'));
    const readsOpen = reads.count;

    await first.release();
    await second.release();
    await settle();
    await act(async () => {
      await Promise.all([first.sending, second.sending]);
    });
    expect(reads.count).toBe(readsOpen + 1);

    openRead();
    await showsPlan('Plan p1');
    await waitFor(() => expect(shown.view.kind === 'data' && (shown.view.content.notes ?? []).map((note) => note.body).sort()).toEqual(['Test note 1', 'Test note 2']));
  });

  it('reads again when the listing after a save is rejected, and shows the note that was saved', async () => {
    const { reads, startOpen, failListings } = await setup();
    await showsPlan('Plan p1');
    const before = reads.count;

    failListings(1);
    const { sending } = await startOpen('Test note 1');

    await expect(sending).resolves.toBeUndefined();
    expect(reads.count).toBe(before + 1);
    await showsPlan('Plan p1');
    await waitFor(() => expect(shown.view).toMatchObject({ kind: 'data', content: { notes: [{ body: 'Test note 1' }] } }));
  });

  it('shows the error view with a retry when the read after a rejected listing fails too', async () => {
    const { startOpen, failListings } = await setup();
    await showsPlan('Plan p1');

    // The listing of the save and the one of the read that follows are both rejected.
    failListings(2);
    await startOpen('Test note 1');
    await waitFor(() => expect(shown.view.kind).toBe('error'));

    await act(async () => {
      if (shown.view.kind === 'error') shown.view.onRetry();
    });
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

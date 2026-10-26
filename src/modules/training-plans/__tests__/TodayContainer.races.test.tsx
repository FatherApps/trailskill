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
  const reads: { count: number; failNext: boolean; gate?: Promise<void> } = { count: 0, failNext: failFirstRead };
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
  const container = async (ids: string[], day = DAY) => (
    <TodayContainer
      plans={plans}
      assignments={assignments}
      schoolLinks={createInMemoryAthleteSchoolRepository([
        { athleteId: 'a1', schoolId: 's1', categoryId: 'c1' },
        { athleteId: 'a3', schoolId: 's1', categoryId: 'c2' },
      ])}
      fulfillment={createInMemoryFulfillmentRepository({}, plans)}
      notices={notices}
      series={{ listArrivals: async () => [] } as never}
      userId="guardian-1"
      athletes={await athletes.listByIds(ids)}
      day={day}
    />
  );
  const view = await render(await container(ids));
  const update = async (ids: string[], day = DAY) => view.rerender(await container(ids, day));
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
  return { one, other, notices: storedNotices, reads, update, sendHeld };
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
    // A read started now would stay in loading until the end of the test.
    reads.gate = new Promise(() => {});

    await act(async () => shown.onSelectAthlete?.('a1'));

    expect(shown.view).toMatchObject({ kind: 'data', content: { planName: 'Plan p1' } });
    expect(reads.count).toBe(before);
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

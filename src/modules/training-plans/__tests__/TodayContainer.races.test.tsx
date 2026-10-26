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

describe('TodayContainer races', () => {
  it('keeps the plan of the athlete picked while a note of another one is being saved', async () => {
    const plans = createInMemoryTrainingPlanRepository();
    await plans.save(plan('p1'));
    await plans.save({ ...plan('p2'), name: 'Plan del otro' });
    const assignments = createInMemoryAssignmentRepository(plans);
    await assignments.create({ planId: 'p1', schoolId: 's1', sessionDate: DAY, target: { kind: 'group', groupId: 'g1' } });
    await assignments.create({ planId: 'p2', schoolId: 's1', sessionDate: DAY, target: { kind: 'group', groupId: 'g2' } });
    const stored = createInMemoryNoticeRepository();
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const notices = { ...stored, add: async (...args: Parameters<typeof stored.add>) => (await held, stored.add(...args)) };
    await render(
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
        athletes={await athletes.listByIds(['a1', 'a3'])}
        day={DAY}
      />,
    );
    await waitFor(() => expect(shown.view).toMatchObject({ kind: 'data', content: { planName: 'Plan p1' } }));
    expect(shown.view).toMatchObject({ kind: 'data', content: { planName: 'Plan p1' } });

    let sending!: void | Promise<void>;
    await act(async () => {
      sending = shown.onSendNotice({ blockId: null, body: 'Test note 1' });
    });
    await act(async () => shown.onSelectAthlete?.('a3'));
    await waitFor(() => expect(shown.view).toMatchObject({ kind: 'data', content: { planName: 'Plan del otro' } }));
    await act(async () => {
      release();
      await sending;
    });

    expect(shown.view).toMatchObject({ kind: 'data', content: { planName: 'Plan del otro' } });
  });
});

import { fireEvent, render, screen } from '@testing-library/react-native';

import { createInMemoryAuthorizationStatusRepository } from '../../accounts';
import {
  createInMemoryAssignmentRepository,
  createInMemoryFulfillmentRepository,
  createInMemoryTrainingPlanRepository,
  FulfillmentContainer,
  type FulfillmentRepository,
  type PlanBlock,
} from '..';
import { athletes, plan, sources } from '../__fixtures__/assignments';

// The barrels pull in the native PowerSync database; these tests use the in-memory repositories only.
jest.mock('../../../core/sync', () => ({ db: {} }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));

const DAY = '2026-11-02';
const timedBlock: PlanBlock = { id: 'b2', phase: 'main', repetitions: 8, distance: 50, activity: 'FR', equipment: [], sendOffSeconds: null, recording: 'per_repetition' };
const granted = createInMemoryAuthorizationStatusRepository([{ athleteId: 'a1', purpose: 'record_times', isGranted: true }]);
const noArrivals = { listArrivals: async () => [] };

async function setup(options: { userId?: string; blocks?: PlanBlock[]; fulfillment?: FulfillmentRepository; arrivals?: { athleteId: string }[]; seed?: (fulfillment: FulfillmentRepository, assignmentId: string) => Promise<void> } = {}) {
  const { userId = 'k1', blocks, arrivals } = options;
  const plans = createInMemoryTrainingPlanRepository();
  const base = plan('p1');
  await plans.save({ ...base, blocks: blocks ?? base.blocks });
  const assignments = createInMemoryAssignmentRepository(plans);
  // Coach k1 has group g1 (a1, a2) and the athlete a4 directly; the plan goes to the group.
  const id = await assignments.create({ planId: 'p1', schoolId: 's1', sessionDate: DAY, target: { kind: 'group', groupId: 'g1' } });
  const fulfillment = options.fulfillment ?? createInMemoryFulfillmentRepository();
  await options.seed?.(fulfillment, id);
  const onOpenTiming = jest.fn();
  await render(
    <FulfillmentContainer
      plans={plans}
      assignments={assignments}
      athletes={athletes}
      structure={sources.structure}
      schools={sources.schools}
      fulfillment={fulfillment}
      authorizations={granted}
      series={arrivals ? ({ listArrivals: async () => arrivals } as never) : noArrivals}
      userId={userId}
      deviceId="tablet-1"
      assignmentId={id}
      day={DAY}
      onOpenTiming={onOpenTiming}
    />,
  );
  return { id, fulfillment, onOpenTiming };
}

describe('FulfillmentContainer', () => {
  it('lists only the athletes of the assignment that the coach has, and omits the one without an authorization', async () => {
    await setup();

    expect(await screen.findByRole('button', { name: /^A1 S\. · Bloque 1,/ })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /^A2 S\. · Bloque 1,/ }).props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getAllByText('Se omitirá')).toHaveLength(1);
    expect(screen.queryByText(/A3 S\./)).toBeNull();
    expect(screen.queryByText(/A4 S\./)).toBeNull();
  });

  it('saves a mark with its author and device and shows it, and asks a count for a partial', async () => {
    const { id, fulfillment } = await setup();

    await fireEvent.press(await screen.findByRole('button', { name: /^A1 S\. · Bloque 1,/ }));
    expect(await screen.findByRole('button', { name: /^A1 S\. · Bloque 1, .*: Hecho/ })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: /^A1 S\. · Bloque 1,/ }));
    await fireEvent.press(await screen.findByRole('button', { name: '2' }));

    expect(await screen.findByRole('button', { name: /^A1 S\. · Bloque 1, .*: Parcial · 2 de 4/ })).toBeOnTheScreen();
    expect(await fulfillment.list(id)).toMatchObject([{ athleteId: 'a1', blockId: 'b1', status: 'partial', completedRepetitions: 2, authorId: 'k1', deviceId: 'tablet-1' }]);
  });

  it('shows the times recorded of a timed block and opens the timing from it', async () => {
    const assignmentSchools: Record<string, string> = {};
    const fulfillment = createInMemoryFulfillmentRepository({ recordings: { b2: 'per_repetition' }, assignmentSchools, seriesSchools: { 'series-1': 's1' } });
    const arrivals = Array.from({ length: 8 }, () => ({ athleteId: 'a1' }));
    const seed = (repository: FulfillmentRepository, assignmentId: string) => {
      assignmentSchools[assignmentId] = 's1';
      return repository
        .mark({ assignmentId, versionId: 'v', blockId: 'b2', athleteId: 'a1', status: 'done', seriesId: 'series-1', authorId: 'k1', deviceId: 'tablet-1' })
        .then(() => undefined);
    };
    const { onOpenTiming } = await setup({ blocks: [timedBlock], fulfillment, arrivals, seed });

    expect(await screen.findByRole('button', { name: /^A1 S\. · Bloque 1, .*, 8\/8 tiempos/ })).toBeOnTheScreen();
    await fireEvent.press(await screen.findByRole('button', { name: /^Cronometrar/ }));
    expect(onOpenTiming).toHaveBeenCalledWith('b2');
  });

  it('does not show the grid to an administrator, who cannot mark', async () => {
    await setup({ userId: 'admin' });

    expect(await screen.findByText('Esta información es privada')).toBeOnTheScreen();
  });
});

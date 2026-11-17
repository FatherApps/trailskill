import { render, screen } from '@testing-library/react-native';

import { createInMemoryAuthorizationStatusRepository } from '../../accounts';
import {
  createInMemoryAssignmentRepository,
  createInMemoryFulfillmentRepository,
  createInMemoryTrainingPlanRepository,
  FulfillmentFlow,
  type FulfillmentRepositories,
} from '..';
import { athletes, plan, sources } from '../__fixtures__/assignments';

let mockUserId: string | undefined;
let mockClientId: () => Promise<string>;
jest.mock('../../../core/session', () => ({
  useSession: () => ({ session: mockUserId ? { user: { id: mockUserId } } : null }),
}));
jest.mock('../../../core/sync', () => ({ db: { getClientId: () => mockClientId() } }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));

const DAY = '2026-11-02';

async function setup(over: { assignmentId?: string | null; day?: string } = {}) {
  const plans = createInMemoryTrainingPlanRepository();
  await plans.save(plan('p1'));
  const assignments = createInMemoryAssignmentRepository(plans);
  const id = await assignments.create({ planId: 'p1', schoolId: 's1', sessionDate: DAY, target: { kind: 'group', groupId: 'g1' } });
  const repositories: FulfillmentRepositories = {
    plans,
    assignments,
    athletes,
    structure: sources.structure,
    schools: sources.schools,
    fulfillment: createInMemoryFulfillmentRepository({}, plans),
    authorizations: createInMemoryAuthorizationStatusRepository([{ athleteId: 'a1', purpose: 'record_times', isGranted: true }]),
    series: { listArrivals: async () => [] } as never,
  };
  const onOpenTiming = jest.fn();
  await render(
    <FulfillmentFlow
      assignmentId={over.assignmentId === null ? undefined : (over.assignmentId ?? id)}
      day={over.day ?? DAY}
      onOpenTiming={onOpenTiming}
      repositories={repositories}
    />,
  );
}

beforeEach(() => {
  mockUserId = 'k1';
  mockClientId = () => Promise.resolve('tablet-1');
});

describe('FulfillmentFlow', () => {
  it('shows the grid of the assignment for the signed-in coach on this device', async () => {
    await setup();

    expect(await screen.findByRole('button', { name: /^A1 S\. · Bloque 1,/ })).toBeOnTheScreen();
  });

  it.each([
    ['without a session', () => { mockUserId = undefined; }, {}],
    ['when the device lookup fails', () => { mockClientId = () => Promise.reject(new Error('db')); }, {}],
    ['without an assignment', () => {}, { assignmentId: null }],
  ])('shows nothing %s', async (_name, arrange, over) => {
    arrange();
    await setup(over);

    expect(screen.queryByRole('button', { name: /Bloque 1,/ })).toBeNull();
  });
});

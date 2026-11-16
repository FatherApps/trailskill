import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ComponentType } from 'react';

import PlansLayout from '../app/(app)/plans/_layout';
import PlanEditorRoute from '../app/(app)/plans/[id]';
import AssignPlanRoute from '../app/(app)/plans/assign';
import FulfillmentRoute from '../app/(app)/plans/fulfillment';
import PlansRoute from '../app/(app)/plans/index';
import { ThemeProvider } from '../core/theme';

let mockUserId: string | undefined;
jest.mock('../core/session', () => ({
  useSession: () => ({ session: mockUserId ? { user: { id: mockUserId } } : null }),
}));
jest.mock('../core/sync', () => ({ db: { getClientId: () => Promise.resolve('device-1') } }));

// Only the school lookup is real: the frame decides from it who gets the console navigation.
const mockListStaffSchools = jest.fn();
jest.mock('../modules/school-console', () => ({
  ...jest.requireActual('../modules/school-console'),
  createPowerSyncStaffSchoolRepository: () => ({
    listAdminSchools: (...args: unknown[]) => mockListStaffSchools(...args),
  }),
  createPowerSyncSchoolStructureRepository: () => ({}),
}));
// The plan screens have their own suites: here each one is a marker, so the test sees only what surrounds it.
jest.mock('../modules/training-plans', () => {
  const { Text: Marker } = jest.requireActual('react-native');
  return {
    createPowerSyncTrainingPlanRepository: () => ({}),
    createPowerSyncAssignmentRepository: () => ({}),
    createPowerSyncFulfillmentRepository: () => ({}),
    planVocabulary: () => ({}),
    PlansScreen: () => <Marker>Pantalla de planes</Marker>,
    PlanEditorScreen: () => <Marker>Pantalla del plan</Marker>,
    AssignPlanContainer: () => <Marker>Pantalla de asignar</Marker>,
    FulfillmentContainer: () => <Marker>Pantalla de cumplimiento</Marker>,
  };
});
jest.mock('../modules/athletes', () => ({ createPowerSyncSchoolAthleteRepository: () => ({}) }));
jest.mock('../modules/accounts', () => ({ createPowerSyncAuthorizationStatusRepository: () => ({}) }));
jest.mock('../modules/timing', () => ({ createPowerSyncSeriesRepository: () => ({}) }));

// The nested navigator renders the route under test where the real one renders the screen of the URL.
let mockRoute: ComponentType;
const mockDismissTo = jest.fn();
const mockNavigate = jest.fn();
jest.mock('expo-router', () => ({
  Stack: () => {
    const Route = mockRoute;
    return <Route />;
  },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), navigate: mockNavigate, dismissTo: mockDismissTo }),
  useLocalSearchParams: () => ({ id: 'plan-1', plan: 'plan-1', assignment: 'assignment-1', day: '2026-11-16' }),
  // Runs once on mount, as a focus does; calling it on every render would loop through the state it sets.
  useFocusEffect: (effect: () => void) => jest.requireActual('react').useEffect(effect, []),
}));

let mockWidth = 700;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  default: () => ({ width: mockWidth, height: 900, scale: 1, fontScale: 1 }),
}));

const routes: [string, ComponentType, string][] = [
  ['plans/index', PlansRoute, 'Pantalla de planes'],
  ['plans/[id]', PlanEditorRoute, 'Pantalla del plan'],
  ['plans/assign', AssignPlanRoute, 'Pantalla de asignar'],
  ['plans/fulfillment', FulfillmentRoute, 'Pantalla de cumplimiento'],
];

const show = async (Route: ComponentType) => {
  mockRoute = Route;
  return await render(
    <ThemeProvider>
      <PlansLayout />
    </ThemeProvider>,
  );
};

beforeEach(() => {
  mockUserId = 'admin-1';
  mockWidth = 700;
  mockDismissTo.mockReset();
  mockNavigate.mockReset();
  mockListStaffSchools.mockReset().mockResolvedValue([{ id: 's1', name: 'Escuela Delfines' }]);
});

describe('plan routes inside the school console', () => {
  it.each(routes)('%s shows the console navigation with Planes active', async (_name, Route, marker) => {
    await show(Route);

    expect(await screen.findByText(marker)).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Planes', selected: true })).toBeOnTheScreen();
    // The other sections are one press away.
    expect(screen.getByRole('tab', { name: 'Deportistas', selected: false })).toBeOnTheScreen();
    expect(screen.getByText('Escuela Delfines')).toBeOnTheScreen();
  });

  it('goes back to the console section the admin picks', async () => {
    await show(PlansRoute);

    await fireEvent.press(await screen.findByRole('tab', { name: 'Récords' }));

    expect(mockDismissTo).toHaveBeenCalledWith({
      pathname: '/console',
      params: { section: 'records', at: expect.any(String) },
    });
  });

  it('opens the plan list from Planes when the admin is on another plan screen', async () => {
    await show(PlanEditorRoute);

    await fireEvent.press(await screen.findByRole('tab', { name: 'Planes' }));

    expect(mockNavigate).toHaveBeenCalledWith('/plans');
    expect(mockDismissTo).not.toHaveBeenCalled();
  });

  it('leaves the plan screen alone, with no console navigation, for someone who is not a school admin', async () => {
    mockListStaffSchools.mockResolvedValue([]);
    await show(PlansRoute);

    expect(await screen.findByText('Pantalla de planes')).toBeOnTheScreen();
    expect(screen.queryByRole('tab')).toBeNull();
  });

  it('leaves the plan screen alone on a phone, where an admin has no console navigation', async () => {
    mockWidth = 390;
    await show(PlansRoute);

    expect(await screen.findByText('Pantalla de planes')).toBeOnTheScreen();
    expect(screen.queryByRole('tab')).toBeNull();
  });
});

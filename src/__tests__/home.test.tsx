import { render, screen } from '@testing-library/react-native';

import Home from '../app/(app)/index';
import { t } from '../core/i18n';

let mockSummary: { pending: number; failed: number; uploading: boolean; lastSyncedAt: Date | null };
// The real recordSyncState: only the hook, which needs the native database, is replaced.
jest.mock('../core/sync', () => ({
  ...jest.requireActual('../core/sync/syncState'),
  useGlobalSyncSummary: () => mockSummary,
}));
jest.mock('@powersync/react', () => ({}));
jest.mock('../core/sync/db', () => ({ db: {} }));

beforeEach(() => {
  mockSummary = { pending: 0, failed: 0, uploading: false, lastSyncedAt: null };
});

// Lives outside src/app: Expo Router would treat a test file there as a route.
describe('home screen', () => {
  it('shows the app title', async () => {
    await render(<Home />);

    expect(screen.getByText('TrailSkill')).toBeTruthy();
  });

  it('shows records waiting on the phone', async () => {
    mockSummary = { ...mockSummary, pending: 2 };
    await render(<Home />);

    expect(screen.getByLabelText('En el teléfono')).toBeOnTheScreen();
  });

  it('shows records the server rejected', async () => {
    mockSummary = { ...mockSummary, failed: 1 };
    await render(<Home />);

    expect(screen.getByLabelText('No enviado')).toBeOnTheScreen();
  });

  it('shows everything sent when nothing is pending', async () => {
    await render(<Home />);

    expect(screen.getByLabelText('Enviado')).toBeOnTheScreen();
  });
});

describe('t', () => {
  it('returns the es-CO text of a known key', () => {
    expect(t('home.title')).toBe('TrailSkill');
  });

  it('returns the key itself when the translation is missing', () => {
    expect(t('home.missing')).toBe('home.missing');
  });
});

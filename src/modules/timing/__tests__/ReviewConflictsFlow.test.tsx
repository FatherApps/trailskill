import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ThemeProvider } from '../../../core/theme';

import { createInMemoryConflictReviewRepository, type OpenConflict } from '../data/conflictReview';
import { ReviewConflictsFlow } from '../screens/ReviewConflictsFlow';
// The Supabase adapter imports the sync module, which loads native code.
jest.mock('../../../core/sync', () => ({ supabase: {} }));

// Synthetic data only.
const conflict: OpenConflict = {
  id: 'conflict-1',
  expectedVersion: 3,
  athleteName: 'Mateo C.',
  event: { stroke: 'FR', distance: '50m', pool: 'SCM' },
  current: { hundredths: 3520, author: 'Coach Uno', device: 'Teléfono A', at: new Date(2026, 9, 25, 14, 0).toISOString() },
  incoming: { hundredths: 3480, author: 'Coach Dos', device: 'Teléfono B', at: new Date(2026, 9, 25, 14, 5).toISOString() },
};

function renderFlow(repository = createInMemoryConflictReviewRepository({ conflicts: [conflict], admins: ['admin-1'] }), userId: string | null = 'admin-1') {
  const callbacks = { onDenied: jest.fn(), onBack: jest.fn() };
  const view = render(
    <ThemeProvider>
      <ReviewConflictsFlow repository={repository} userId={userId ?? undefined} offline={false} {...callbacks} />
    </ThemeProvider>,
  );
  return view.then(() => ({ repository, ...callbacks }));
}

const resolveWith = async (reason: string) => {
  await fireEvent.press(await screen.findByRole('button', { name: /Mateo C\./ }));
  await fireEvent.changeText(screen.getByLabelText('Motivo'), reason);
  await fireEvent.press(screen.getByRole('button', { name: 'Resolver conflicto' }));
};

describe('ReviewConflictsFlow', () => {
  it('lists the open conflicts to a platform admin', async () => {
    const { onDenied } = await renderFlow();

    expect(await screen.findByText('Mateo C.')).toBeOnTheScreen();
    expect(onDenied).not.toHaveBeenCalled();
  });

  it.each([
    ['someone who is not a platform admin', 'user-1'],
    ['no session', null],
  ])('sends %s away without showing any conflict', async (_name, userId) => {
    const { onDenied } = await renderFlow(undefined, userId);

    await waitFor(() => expect(onDenied).toHaveBeenCalled());
    expect(screen.queryByText('Mateo C.')).not.toBeOnTheScreen();
  });

  it('resolves through the repository with the expected version and goes back to an empty list', async () => {
    const { repository } = await renderFlow();
    await resolveWith('Cronómetro más fiable');

    await waitFor(() => expect(screen.getByText('No hay conflictos abiertos')).toBeOnTheScreen());
    expect(repository.resolved).toEqual([
      { conflictId: 'conflict-1', expectedVersion: 3, decision: 'current', hundredths: null, reason: 'Cronómetro más fiable' },
    ]);
  });

  it('says the measurement changed and keeps what was typed when the version is stale', async () => {
    const repository = createInMemoryConflictReviewRepository({ conflicts: [conflict], admins: ['admin-1'] });
    repository.rejectWith = 'stale';
    await renderFlow(repository);
    await resolveWith('Motivo escrito');

    expect(await screen.findByText('La medición cambió mientras la revisabas. Recarga y vuelve a revisarla.')).toBeOnTheScreen();
    expect(screen.getByLabelText('Motivo').props.value).toBe('Motivo escrito');
  });

  it('says resolving needs a signal and keeps what was typed when the request never arrived', async () => {
    const repository = createInMemoryConflictReviewRepository({ conflicts: [conflict], admins: ['admin-1'] });
    await renderFlow(repository);
    repository.offline = true;
    await resolveWith('Motivo escrito');

    expect(await screen.findByText(/Resolver un conflicto requiere señal/)).toBeOnTheScreen();
    expect(screen.getByLabelText('Motivo').props.value).toBe('Motivo escrito');
    expect(repository.resolved).toEqual([]);
  });

  it('offers to retry when the list cannot be loaded', async () => {
    const repository = createInMemoryConflictReviewRepository({ conflicts: [conflict], admins: ['admin-1'], offline: true });
    await renderFlow(repository);

    expect(await screen.findByText('No pudimos cargar los conflictos')).toBeOnTheScreen();
    repository.offline = false;
    await fireEvent.press(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Mateo C.')).toBeOnTheScreen();
  });
});

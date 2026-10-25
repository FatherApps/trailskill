import { fireEvent, render, screen } from '@testing-library/react-native';

import { colors, contrastRatio, type ThemeName } from '../../theme';
import type { RecordSyncState } from '../../sync';
import { SyncStatus, syncStatusColors } from '..';
import { buttonColors } from '../Button';

const themes: ThemeName[] = ['light', 'dark'];

const labels: [RecordSyncState, string][] = [
  ['on_device', 'En el teléfono'],
  ['sending', 'Enviando'],
  ['synced', 'Enviado'],
  ['not_sent', 'No enviado'],
];

describe('SyncStatus', () => {
  it.each(labels)('%s shows "%s" and offers a retry only when not sent', async (state, label) => {
    await render(<SyncStatus state={state} onRetry={jest.fn()} />);

    expect(screen.getByRole('text', { name: label })).toBeOnTheScreen();
    const retry = screen.queryByRole('button', { name: 'Intentar de nuevo' });
    if (state === 'not_sent') expect(retry).toBeOnTheScreen();
    else expect(retry).toBeNull();
  });

  it('emits the retry event and leaves the upload to the caller', async () => {
    const onRetry = jest.fn();
    await render(<SyncStatus state="not_sent" onRetry={onRetry} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Intentar de nuevo' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('shows an optional message under the pill and no message without it', async () => {
    await render(<SyncStatus state="not_sent" message="Mensaje de prueba" />);
    expect(screen.getByText('Mensaje de prueba')).toBeOnTheScreen();

    await screen.rerender(<SyncStatus state="not_sent" />);
    expect(screen.queryByText('Mensaje de prueba')).toBeNull();
  });

  it('renders an empty message without raw text outside a Text element', async () => {
    await render(<SyncStatus state="not_sent" message="" />);
    expect(screen.getByRole('text', { name: 'No enviado' })).toBeOnTheScreen();
  });

  it('appends the pending count to the visible and the accessible label', async () => {
    await render(<SyncStatus state="on_device" count={3} />);

    expect(screen.getByRole('text', { name: 'En el teléfono · 3' })).toBeOnTheScreen();
    expect(screen.getByText('En el teléfono · 3', { includeHiddenElements: true })).toBeOnTheScreen();
  });

  it('keeps the plain label without a count', async () => {
    await render(<SyncStatus state="on_device" />);

    expect(screen.getByRole('text', { name: 'En el teléfono' })).toBeOnTheScreen();
    expect(screen.getByText('En el teléfono', { includeHiddenElements: true })).toBeOnTheScreen();
  });

  it('announces state changes politely', async () => {
    await render(<SyncStatus state="on_device" />);
    expect(screen.getByTestId('sync-status').props.accessibilityLiveRegion).toBe('polite');

    await screen.rerender(<SyncStatus state="synced" />);
    expect(screen.getByTestId('sync-status').props.accessibilityLiveRegion).toBe('polite');
    expect(screen.getByRole('text', { name: 'Enviado' })).toBeOnTheScreen();
  });

  describe.each(themes)('%s theme contrast', (theme) => {
    const c = colors[theme];

    it.each(labels.map(([state]) => state))('%s text is at least 4.5:1 on its pill', (state) => {
      const { background, text } = syncStatusColors[state];
      expect(contrastRatio(c[text], c[background])).toBeGreaterThanOrEqual(4.5);
    });

    it('the retry link is at least 4.5:1 on the canvas and on a card', () => {
      for (const surface of [c['surface-0'], c['surface-1']]) {
        expect(contrastRatio(c[buttonColors.ghost.text], surface)).toBeGreaterThanOrEqual(4.5);
      }
    });
  });
});

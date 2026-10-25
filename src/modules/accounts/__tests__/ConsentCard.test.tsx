import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { colors, contrastRatio, type ThemeName } from '../../../core/theme';
import { consentCardColors, ConsentCard } from '../components/ConsentCard';
import type { AuthorizationRecord, AuthorizationText } from '../data/authorizations';

// RecordSyncStatus reads the real sync state; here the state of the record is fixed.
jest.mock('../../../core/sync', () => ({ db: {}, RecordSyncStatus: jest.requireActual('../../../core/sync/RecordSyncStatus').RecordSyncStatus }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));
jest.mock('../../../core/sync/syncState', () => ({ useRecordSyncState: () => 'on_device' }));
jest.mock('../../../core/sync/writes', () => ({ retryFailedRecord: jest.fn() }));

// Synthetic data only.
const text: AuthorizationText = { id: 't1', purpose: 'record_times', version: 2, body: 'Synthetic text' };
const accepted: AuthorizationRecord = {
  id: 'auth-1',
  userId: 'guardian-1',
  athleteId: 'a1',
  purpose: 'record_times',
  textId: 't1',
  textVersion: 2,
  textBody: 'Synthetic text',
  acceptedAt: '2026-10-25T12:00:00.000Z',
  withdrawnAt: null,
};

describe('ConsentCard', () => {
  it('is a checkbox with the purpose as label, unchecked, with a target of at least 48', async () => {
    const onToggle = jest.fn();
    await render(<ConsentCard text={text} checked={false} onToggle={onToggle} onWithdraw={jest.fn()} />);

    const box = screen.getByRole('checkbox', { name: 'Registrar tiempos y resultados' });
    expect(box).not.toBeChecked();
    expect(StyleSheet.flatten(box.props.style).minHeight).toBeGreaterThanOrEqual(48);
    expect(screen.getByText('Synthetic text')).toBeOnTheScreen();
    expect(screen.getByText('Versión 2')).toBeOnTheScreen();

    await fireEvent.press(box);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('reflects the checked state', async () => {
    await render(<ConsentCard text={text} checked onToggle={jest.fn()} onWithdraw={jest.fn()} />);
    expect(screen.getByRole('checkbox', { name: 'Registrar tiempos y resultados' })).toBeChecked();
  });

  it('accepted: shows the date, "En el teléfono" and a withdraw button instead of the checkbox', async () => {
    const onWithdraw = jest.fn();
    await render(<ConsentCard text={text} accepted={accepted} checked={false} onToggle={jest.fn()} onWithdraw={onWithdraw} />);

    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.getByText(/^Autorizado el /)).toBeOnTheScreen();
    expect(screen.getByRole('text', { name: 'En el teléfono' })).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Retirar' }));
    expect(onWithdraw).toHaveBeenCalledWith('auth-1');
  });

  describe.each<ThemeName>(['light', 'dark'])('%s theme contrast', (theme) => {
    it.each(['title', 'text'] as const)('%s is at least 4.5:1 on the card', (part) => {
      const c = colors[theme];
      expect(contrastRatio(c[consentCardColors[part]], c[consentCardColors.background])).toBeGreaterThanOrEqual(4.5);
    });
  });
});

import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';

import { colors, contrastRatio, type ThemeName } from '../../../core/theme';
import { consentCardColors, ConsentCard } from '../components/ConsentCard';
import type { AuthorizationRecord, AuthorizationText } from '../data/authorizations';

// RecordSyncStatus reads the real sync state; here the state of the record is fixed.
let mockSyncState = 'on_device';
jest.mock('../../../core/sync', () => ({
  db: {},
  RecordSyncStatus: jest.requireActual('../../../core/sync/RecordSyncStatus').RecordSyncStatus,
  useRecordSyncState: () => mockSyncState,
}));
jest.mock('../../../core/sync/db', () => ({ db: {} }));
jest.mock('../../../core/sync/syncState', () => ({ useRecordSyncState: () => mockSyncState }));
jest.mock('../../../core/sync/writes', () => ({ retryFailedRecord: jest.fn() }));

// Synthetic data only.
const texts: AuthorizationText[] = [
  { id: 't-record', purpose: 'record_times', version: 2, body: 'Synthetic record text' },
  { id: 't-import', purpose: 'import_official_results', version: 1, body: 'Synthetic import text' },
  { id: 't-photo', purpose: 'show_photo', version: 1, body: 'Synthetic photo text' },
];
const accepted: AuthorizationRecord = {
  id: 'auth-1',
  userId: 'guardian-1',
  athleteId: 'a1',
  purpose: 'record_times',
  textId: 't-record',
  textVersion: 2,
  textBody: 'Synthetic record text',
  acceptedAt: '2026-10-25T12:00:00.000Z',
  withdrawnAt: null,
};
const RECORD = 'Registrar tiempos y resultados';
const IMPORT = 'Importar resultados oficiales';
const PHOTO = 'Mostrar la foto del deportista';

function card(props: Partial<React.ComponentProps<typeof ConsentCard>> = {}) {
  return (
    <ConsentCard
      athleteName="Ana M."
      avatar={<Text>avatar</Text>}
      texts={texts}
      inForce={{}}
      selected={{}}
      onToggle={jest.fn()}
      onWithdraw={jest.fn()}
      {...props}
    />
  );
}

beforeEach(() => {
  mockSyncState = 'on_device';
});

describe('ConsentCard', () => {
  it('shows the athlete name with the avatar and one unchecked checkbox per purpose, in order, with a target of at least 48', async () => {
    await render(card());

    expect(screen.getByRole('header', { name: 'Ana M.' })).toBeOnTheScreen();
    expect(screen.getByText('avatar')).toBeOnTheScreen();
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes.map((box) => box.props.accessibilityLabel)).toEqual([RECORD, IMPORT, PHOTO]);
    boxes.forEach((box) => {
      expect(box).not.toBeChecked();
      expect(StyleSheet.flatten(box.props.style).minHeight).toBeGreaterThanOrEqual(48);
    });
  });

  it('hides the legal text until "Leer el texto completo" is pressed, then shows every text and its version', async () => {
    await render(card());
    expect(screen.queryByText('Synthetic record text')).toBeNull();
    expect(screen.queryByText('Versión 2')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Leer el texto completo' }));

    expect(screen.getByText('Synthetic record text')).toBeOnTheScreen();
    expect(screen.getByText('Synthetic import text')).toBeOnTheScreen();
    expect(screen.getByText('Synthetic photo text')).toBeOnTheScreen();
    expect(screen.getByText('Versión 2')).toBeOnTheScreen();
    expect(screen.queryByText(/^Autorizado el /)).toBeNull();
  });

  it('after expanding, an authorization in force shows the date and the text it accepted', async () => {
    await render(card({ inForce: { record_times: accepted } }));
    await fireEvent.press(screen.getByRole('button', { name: 'Leer el texto completo' }));

    expect(screen.getByText(/^Autorizado el /)).toBeOnTheScreen();
    expect(screen.getByText('Synthetic record text')).toBeOnTheScreen();
  });

  it('pressing an unchecked box toggles only that purpose', async () => {
    const onToggle = jest.fn();
    await render(card({ onToggle }));

    await fireEvent.press(screen.getByRole('checkbox', { name: IMPORT }));

    expect(onToggle).toHaveBeenCalledWith('import_official_results');
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('a selected box and a box in force are checked; in force never toggles but asks to withdraw', async () => {
    const onToggle = jest.fn();
    const onWithdraw = jest.fn();
    await render(card({ inForce: { record_times: accepted }, selected: { show_photo: true }, onToggle, onWithdraw }));

    expect(screen.getByRole('checkbox', { name: RECORD })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: PHOTO })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: IMPORT })).not.toBeChecked();

    await fireEvent.press(screen.getByRole('checkbox', { name: RECORD }));
    expect(onWithdraw).toHaveBeenCalledWith('auth-1');
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('has no Retirar button', async () => {
    await render(card({ inForce: { record_times: accepted } }));
    expect(screen.queryByRole('button', { name: 'Retirar' })).toBeNull();
  });

  it('shows the skipped tag only while record_times is not in force', async () => {
    const view = await render(card());
    expect(screen.getByRole('text', { name: 'Se omitirá' })).toBeOnTheScreen();

    await view.rerender(card({ inForce: { record_times: accepted } }));
    expect(screen.queryByRole('text', { name: 'Se omitirá' })).toBeNull();
  });

  it('shows "En el teléfono" for a pending record and nothing for a synced one or one not accepted', async () => {
    const view = await render(card({ inForce: { record_times: accepted } }));
    expect(screen.getByRole('text', { name: 'En el teléfono' })).toBeOnTheScreen();

    mockSyncState = 'synced';
    await view.rerender(card({ inForce: { record_times: accepted } }));
    expect(screen.queryByRole('text', { name: 'Enviado' })).toBeNull();
    expect(screen.queryByRole('text', { name: 'En el teléfono' })).toBeNull();
  });

  describe.each<ThemeName>(['light', 'dark'])('%s theme contrast', (theme) => {
    it.each(['title', 'text'] as const)('%s is at least 4.5:1 on the card', (part) => {
      const c = colors[theme];
      expect(contrastRatio(c[consentCardColors[part]], c[consentCardColors.background])).toBeGreaterThanOrEqual(4.5);
    });
  });
});

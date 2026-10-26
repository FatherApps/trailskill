import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { Dimensions, PixelRatio, StyleSheet } from 'react-native';

import { colors } from '../../../core/theme';
import { SeriesAssignmentScreen } from '../screens/SeriesAssignmentScreen';
import { seriesFixture } from '../__fixtures__/series';

const hidden = { includeHiddenElements: true };
const { snapshots, athletes } = seriesFixture;
// Position 1 left open while 3 is reopened: the first open position keeps the highlight.
const firstAndThirdOpen = snapshots.all.map((a) => (a.position === 1 || a.position === 3 ? { ...a, athleteId: null } : a));

async function renderScreen(props: Partial<Parameters<typeof SeriesAssignmentScreen>[0]> = {}) {
  const callbacks = { onAssign: jest.fn(), onReopen: jest.fn(), onSave: jest.fn(), onBack: jest.fn(), onToggleCompleted: jest.fn() };
  await render(
    <SeriesAssignmentScreen
      positions={snapshots.partial}
      athletes={athletes}
      heading="Serie 2 · Libre 50 m"
      {...callbacks}
      {...props}
    />,
  );
  return callbacks;
}

const isSelected = (position: number) => screen.getByTestId(`position-row-${position}`).props.accessibilityState?.selected === true;

// The jest window is a tablet; the phone shows the same content in one column.
const setWidth = (width: number) => Dimensions.set({ window: { width, height: 844, scale: 1, fontScale: 1 }, screen: { width, height: 844, scale: 1, fontScale: 1 } });
afterEach(() => setWidth(750));

const withBest = athletes.map((a, index) => ({ ...a, bestTime: [3105, 3391, null, 3647][index] ?? null }));

describe('SeriesAssignmentScreen', () => {
  it('asks who arrived in each position, naming the series and how many have a name', async () => {
    await renderScreen();

    expect(screen.getByRole('header', { name: '¿Quién llegó en cada puesto?' })).toBeOnTheScreen();
    expect(screen.getByText('Serie 2 · Libre 50 m · toca un nombre para asignarlo al puesto marcado')).toBeOnTheScreen();
    expect(screen.getByLabelText('2 de 4 asignados')).toBeOnTheScreen();
  });

  it('lists every position in arrival order', async () => {
    await renderScreen({ positions: snapshots.none });

    const times = screen.getAllByText(/^\d\d,\d\d$/, hidden).map((n) => n.props.children);
    expect(times).toEqual(['31,05', '33,91', '35,22', '36,47']);
  });

  it('highlights exactly one position, the first without an athlete, and invites to pick a name', async () => {
    await renderScreen();

    expect([1, 2, 3, 4].map(isSelected)).toEqual([false, false, true, false]);
    expect(screen.getByText('Elige un nombre →', hidden)).toBeOnTheScreen();
    expect(screen.getByText('Sin asignar', hidden)).toBeOnTheScreen();
  });

  it('highlights the first position without an athlete, in every state', async () => {
    await renderScreen({ positions: snapshots.none });

    expect([1, 2, 3, 4].map(isSelected)).toEqual([true, false, false, false]);
  });

  it('with position 1 open, reopening position 3 keeps 1 highlighted and 3 shows sin asignar', async () => {
    await renderScreen({ positions: firstAndThirdOpen });

    expect(isSelected(1)).toBe(true);
    expect(isSelected(3)).toBe(false);
    expect(within(screen.getByTestId('position-row-3')).getByText('Sin asignar', hidden)).toBeOnTheScreen();
  });

  it('reopening position 3 with everything assigned highlights it', async () => {
    await renderScreen({ positions: snapshots.pending });

    expect(isSelected(3)).toBe(true);
    expect(within(screen.getByTestId('position-row-3')).getByText('Elige un nombre →', hidden)).toBeOnTheScreen();
  });

  it('draws an unassigned position without an athlete colour and an assigned one with its own', async () => {
    await renderScreen({ positions: snapshots.pending });

    const chip = (position: number, initials: string) =>
      StyleSheet.flatten(within(screen.getByTestId(`position-row-${position}`)).getByText(initials, hidden).parent?.parent?.props.style)?.backgroundColor;

    expect(chip(2, 'LR')).toBe(colors.light['athlete-2']);
    expect(within(screen.getByTestId('position-row-3')).queryByText('LR', hidden)).toBeNull();
  });

  it('reads each position out as one element: who, where, the time and its sync state', async () => {
    await renderScreen({
      positions: [
        { position: 1, time: 3100, athleteId: athletes[0]!.id, syncState: 'synced' },
        { position: 2, time: 3300, athleteId: null, syncState: 'on_device' },
        { position: 3, time: null, athleteId: null },
      ],
    });

    expect(screen.getByTestId('position-row-1').props.accessibilityLabel).toBe('Mateo C., Posición 1, 31,00, Enviado');
    expect(screen.getByTestId('position-row-2').props.accessibilityLabel).toBe('Posición 2, Sin asignar, 33,00, En el teléfono');
    expect(screen.getByTestId('position-row-3').props.accessibilityLabel).toBe('Posición 3, Sin asignar');
  });

  describe('at a large text scale', () => {
    beforeEach(() => jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(2));
    afterEach(() => jest.restoreAllMocks());

    it('keeps the position, the time and the missing name of an unassigned position', async () => {
      await renderScreen({ positions: snapshots.pending });

      const row = within(screen.getByTestId('position-row-3'));
      expect(row.getByText('3', hidden)).toBeOnTheScreen();
      expect(row.getByText('35,22', hidden)).toBeOnTheScreen();
      expect(isSelected(3)).toBe(true);
    });

    it('stacks the name cards one per row', async () => {
      await renderScreen();

      expect(StyleSheet.flatten(screen.getByRole('button', { name: 'Asignar a Sara P.' }).parent?.props.style)?.width).toBe('100%');
    });
  });

  it('never drops a position without an athlete', async () => {
    await renderScreen({ positions: snapshots.none });

    expect(screen.getAllByText(/^Sin asignar$|^Elige un nombre →$/, hidden)).toHaveLength(4);
  });

  it('highlights the position it is told to, even with an earlier one still open', async () => {
    await renderScreen({ positions: firstAndThirdOpen, highlightedPosition: 3 });

    expect(isSelected(3)).toBe(true);
    expect(isSelected(1)).toBe(false);
  });

  it('shows why a tap did not go through, only when there is something to say', async () => {
    await renderScreen({ error: 'No pudimos guardar ese nombre. Toca la tarjeta de nuevo.' });
    expect(screen.getByText('No pudimos guardar ese nombre. Toca la tarjeta de nuevo.')).toBeOnTheScreen();
  });

  it('shows no error notice by default', async () => {
    await renderScreen();
    expect(screen.queryByText(/No pudimos guardar/)).toBeNull();
  });

  it('highlights nothing when the highlight is none', async () => {
    await renderScreen({ positions: snapshots.pending, highlightedPosition: null });

    expect([1, 2, 3, 4].some(isSelected)).toBe(false);
    expect(screen.queryByText('Elige un nombre →', hidden)).toBeNull();
  });

  it('counts the arrivals that did not go through in the header and not the ones still on the phone', async () => {
    await renderScreen({
      positions: [
        { position: 1, time: 3100, athleteId: athletes[0]!.id, syncState: 'synced' },
        { position: 2, time: 3300, athleteId: null, syncState: 'on_device' },
        { position: 3, time: 3500, athleteId: null, syncState: 'not_sent' },
      ],
    });

    expect(screen.getByLabelText('No enviado · 1')).toBeOnTheScreen();
    // The pill list holds only the failure; the row still reads its own state out.
    expect(screen.queryAllByTestId('sync-status')).toHaveLength(1);
  });

  it('draws no sync pill when everything is on the phone or sent', async () => {
    await renderScreen();

    expect(screen.queryAllByTestId('sync-status')).toHaveLength(0);
  });

  it('shows a missing time as a dash, never 0,00', async () => {
    await renderScreen({ positions: [{ position: 1, time: null, athleteId: null }] });

    expect(screen.queryByText(/0,00/, hidden)).toBeNull();
    expect(within(screen.getByTestId('position-row-1')).getByText('—', hidden)).toBeOnTheScreen();
  });

  it('shows the personal best on the card, and the MP tag on a time that matches it', async () => {
    await renderScreen({
      athletes: withBest,
      positions: [
        { position: 1, time: 3105, athleteId: athletes[0]!.id },
        { position: 2, time: 3500, athleteId: athletes[1]!.id },
        { position: 3, time: 3600, athleteId: null },
      ],
    });

    // Sara P. has a best of 36,47 on card and no tag yet; Mateo C. matched his best, Lucía R. did not.
    expect(screen.getByText('MP 36,47')).toBeOnTheScreen();
    expect(within(screen.getByTestId('position-row-1')).getByText('MP', hidden)).toBeOnTheScreen();
    expect(within(screen.getByTestId('position-row-2')).queryByText('MP', hidden)).toBeNull();
  });

  it('shows nothing about a personal best the athlete does not have', async () => {
    await renderScreen({ athletes: withBest, positions: snapshots.none });

    expect(screen.queryByText(/^MP 0/)).toBeNull();
    expect(screen.queryAllByText(/^MP \d/)).toHaveLength(3);
  });

  it('puts the swimmers still without a position first and the placed ones after, quiet', async () => {
    await renderScreen();

    const names = screen.getAllByRole('button').map((b) => b.props.accessibilityLabel).filter((l: string) => /Asignar a|en la posición/.test(l));
    expect(names).toEqual(['Asignar a Sara P.', 'Asignar a Tomás V.', 'Mateo C., en la posición 1', 'Lucía R., en la posición 2']);
  });

  it('assigns the tapped name card through onAssign', async () => {
    const { onAssign } = await renderScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Asignar a Sara P.' }));

    expect(onAssign).toHaveBeenCalledWith('a3');
  });

  it('shows the position on already assigned cards', async () => {
    await renderScreen();

    expect(screen.getByRole('button', { name: 'Lucía R., en la posición 2' })).toBeOnTheScreen();
  });

  it('reopens an assigned position when tapped', async () => {
    const { onReopen } = await renderScreen();

    await fireEvent.press(screen.getByTestId('position-row-2'));

    expect(onReopen).toHaveBeenCalledWith(2);
  });

  it('saves the series with the only lime action', async () => {
    const { onSave } = await renderScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Guardar serie' }));

    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('keeps Guardar serie outside the scrolling cards so the last name card is never covered', async () => {
    await renderScreen();

    // Walk up from a name card to the ScrollView that holds the cards (the jest mock wraps it, so match its props, not its type).
    let node = screen.getByRole('button', { name: 'Asignar a Sara P.' }).parent;
    while (node && node.props.nestedScrollEnabled === undefined) node = node.parent;
    if (!node) throw new Error('No ScrollView above the name cards');
    const list = within(node);

    expect(list.queryByRole('button', { name: 'Guardar serie' })).toBeNull();
    for (const label of ['Mateo C., en la posición 1', 'Lucía R., en la posición 2', 'Asignar a Sara P.', 'Asignar a Tomás V.']) {
      expect(list.getByRole('button', { name: label })).toBeOnTheScreen();
    }
    expect(node.props.nestedScrollEnabled).toBe(true);
  });

  it('shows the offline notice', async () => {
    await renderScreen({ offline: true });
    expect(screen.getByText('Sin conexión.', { exact: false })).toBeOnTheScreen();
  });

  describe('on a phone', () => {
    beforeEach(() => setWidth(390));

    it('shows the same content in one scrolling column with Guardar serie under it', async () => {
      const { onSave } = await renderScreen();

      expect(screen.getByRole('header', { name: '¿Quién llegó en cada puesto?' })).toBeOnTheScreen();
      expect(screen.getByLabelText('2 de 4 asignados')).toBeOnTheScreen();
      expect(screen.getByText('En el agua en esta serie')).toBeOnTheScreen();
      expect(isSelected(3)).toBe(true);
      expect(StyleSheet.flatten(screen.getByRole('button', { name: 'Asignar a Sara P.' }).parent?.props.style)?.width).toBe('47.5%');
      await fireEvent.press(screen.getByRole('button', { name: 'Guardar serie' }));
      expect(onSave).toHaveBeenCalledTimes(1);
    });
  });

  describe('completion only', () => {
    const completionProps = { completionOnly: true, positions: [] as typeof snapshots.none };

    it('shows one Completado switch per athlete and never a time', async () => {
      await renderScreen({ ...completionProps, completedIds: [] });

      expect(screen.getAllByRole('switch')).toHaveLength(4);
      expect(screen.queryByText('0,00', { exact: false, ...hidden })).toBeNull();
      expect(screen.queryByText(/\d,\d\d/, hidden)).toBeNull();
      expect(screen.queryByText('Posición 1 de 4')).toBeNull();
    });

    it('unchecked: switch off, no completed tag, no 0,00', async () => {
      await renderScreen({ ...completionProps, completedIds: [] });

      for (const toggle of screen.getAllByRole('switch')) expect(toggle).not.toBeChecked();
      expect(screen.getAllByLabelText('Sin registro', hidden)).toHaveLength(4);
      expect(screen.queryByText('0,00', { exact: false, ...hidden })).toBeNull();
    });

    it('checked: shows the Completado tag with no time and no 0,00', async () => {
      await renderScreen({ ...completionProps, completedIds: ['a1', 'a2', 'a3', 'a4'] });

      for (const toggle of screen.getAllByRole('switch')) expect(toggle).toBeChecked();
      expect(screen.getAllByLabelText('Completado, sin tiempo', hidden)).toHaveLength(4);
      expect(screen.queryByText('0,00', { exact: false, ...hidden })).toBeNull();
    });

    it('toggles an athlete through onToggleCompleted', async () => {
      const { onToggleCompleted } = await renderScreen({ ...completionProps, completedIds: ['a1'] });

      await fireEvent.press(screen.getAllByRole('switch')[1]);

      expect(onToggleCompleted).toHaveBeenCalledWith('a2');
    });
  });
});

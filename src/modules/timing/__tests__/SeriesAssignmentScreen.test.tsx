import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { PixelRatio, StyleSheet } from 'react-native';

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
      eventSubtitle={seriesFixture.eventSubtitle}
      {...callbacks}
      {...props}
    />,
  );
  return callbacks;
}

const isSelected = (position: number) =>
  within(screen.getByTestId(`position-row-${position}`)).getAllByLabelText(/./, hidden).some((n) => n.props.accessibilityState?.selected === true);

describe('SeriesAssignmentScreen', () => {
  it('shows the title, the event and the highlighted position with its time', async () => {
    await renderScreen();

    expect(screen.getByRole('header', { name: 'Asignar nombres' })).toBeOnTheScreen();
    expect(screen.getByText('Posición 3 de 4')).toBeOnTheScreen();
    const time = within(screen.getByTestId('highlighted-stat')).getByText('35,22', hidden);
    expect(StyleSheet.flatten(time.props.style)?.fontSize).toBe(40);
  });

  it('lists every position in arrival order', async () => {
    await renderScreen({ positions: snapshots.none });

    const times = screen.getAllByText(/^\d\d,\d\d$/, hidden).map((n) => n.props.children);
    expect(times.slice(-4)).toEqual(['31,05', '33,91', '35,22', '36,47']);
  });

  it('with position 1 open, reopening position 3 keeps 1 highlighted and 3 shows por asignar', async () => {
    await renderScreen({ positions: firstAndThirdOpen });

    expect(screen.getByText('Posición 1 de 4')).toBeOnTheScreen();
    expect(isSelected(1)).toBe(true);
    expect(isSelected(3)).toBe(false);
    expect(within(screen.getByTestId('position-row-3')).getByText('por asignar', hidden)).toBeOnTheScreen();
    expect(screen.getAllByText('por asignar', hidden)).toHaveLength(2);
  });

  it('highlights exactly one position, the first without an athlete', async () => {
    await renderScreen();

    expect([1, 2, 3, 4].map(isSelected)).toEqual([false, false, true, false]);
  });

  it('highlights the first position without an athlete, in every state', async () => {
    await renderScreen({ positions: snapshots.none });
    expect(screen.getByText('Posición 1 de 4')).toBeOnTheScreen();
  });

  it('reopening position 3 with everything assigned highlights it and shows por asignar', async () => {
    await renderScreen({ positions: snapshots.pending });

    expect(screen.getByText('Posición 3 de 4')).toBeOnTheScreen();
    expect(screen.getAllByText('por asignar', hidden)).toHaveLength(1);
    expect(isSelected(3)).toBe(true);
    expect(within(screen.getByTestId('position-row-3')).getByText('por asignar', hidden)).toBeOnTheScreen();
  });

  it('draws an unassigned position without an athlete colour and an assigned one with its own', async () => {
    await renderScreen({ positions: snapshots.pending });

    const avatarBackground = (position: number, initials: string) =>
      StyleSheet.flatten(
        within(screen.getByTestId(`position-row-${position}`)).getByText(initials, hidden).parent?.props.style,
      )?.backgroundColor;
    const athleteValues = [colors.light['athlete-1'], colors.light['athlete-2'], colors.light['athlete-3'], colors.light['athlete-4']];

    expect(avatarBackground(3, '3')).toBe(colors.light['surface-2']);
    expect(athleteValues).not.toContain(avatarBackground(3, '3'));
    expect(avatarBackground(2, 'LR')).toBe(colors.light['athlete-2']);
  });

  it('names an unassigned position with the short ordinal and keeps its time and por asignar tag', async () => {
    // Jest reports a system font scale of 2: pin 1 so the default layout is the one under test.
    jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(1);
    await renderScreen({ positions: snapshots.pending });

    const row = within(screen.getByTestId('position-row-3'));
    expect(row.getByText('3.º', hidden)).toBeOnTheScreen();
    expect(row.queryByText('Posición 3', hidden)).toBeNull();
    expect(row.getByText('35,22', hidden)).toBeOnTheScreen();
    expect(row.getByText('por asignar', hidden)).toBeOnTheScreen();
    expect(row.getAllByLabelText(/./, hidden)[0].props.accessibilityLabel).toBe('3.º, 35,22, por asignar');
    jest.restoreAllMocks();
  });

  describe('at a large text scale', () => {
    beforeEach(() => jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(2));
    afterEach(() => jest.restoreAllMocks());

    // The row stacks its time and tag below the name (core SwimmerRow), so the same props work at every scale.
    it('still shows the ordinal, the time and the por asignar tag of an unassigned position', async () => {
      await renderScreen({ positions: snapshots.pending });

      const row = within(screen.getByTestId('position-row-3'));
      expect(row.getByText('3.º', hidden)).toBeOnTheScreen();
      expect(row.getByText('35,22', hidden)).toBeOnTheScreen();
      expect(row.getByText('por asignar', hidden)).toBeOnTheScreen();
      expect(row.getAllByLabelText(/./, hidden)[0].props.accessibilityLabel).toBe('3.º, 35,22, por asignar');
      expect(isSelected(3)).toBe(true);
    });

    it('never drops an unassigned position', async () => {
      await renderScreen({ positions: snapshots.none });

      expect(screen.getAllByText('por asignar', hidden)).toHaveLength(4);
    });
  });

  it('never drops a position without an athlete', async () => {
    await renderScreen({ positions: snapshots.none });
    expect(screen.getAllByText('por asignar', hidden)).toHaveLength(4);
  });

  it('shows the all-assigned message instead of a highlighted position', async () => {
    await renderScreen({ positions: snapshots.all });

    expect(screen.getByText('Todas las posiciones tienen nombre.')).toBeOnTheScreen();
    expect(screen.queryByText(/de 4$/)).toBeNull();
    expect(screen.queryByText('por asignar', hidden)).toBeNull();
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

    await fireEvent.press(within(screen.getByTestId('position-row-2')).getByRole('button'));

    expect(onReopen).toHaveBeenCalledWith(2);
  });

  it('saves the series with the only lime action', async () => {
    const { onSave } = await renderScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Guardar serie' }));

    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('keeps Guardar serie outside the scrolling list so the last name card is never covered', async () => {
    await renderScreen();

    // Walk up from a name card to the ScrollView that holds the list (the jest mock wraps it, so match its props, not its type).
    let node = screen.getByRole('button', { name: 'Asignar a Sara P.' }).parent;
    while (node && node.props.contentContainerStyle === undefined) node = node.parent;
    if (!node) throw new Error('No ScrollView above the name cards');
    const scroll = node;
    const list = within(scroll);

    expect(list.queryByRole('button', { name: 'Guardar serie' })).toBeNull();
    for (const label of ['Mateo C., en la posición 1', 'Lucía R., en la posición 2', 'Asignar a Sara P.', 'Asignar a Tomás V.']) {
      expect(list.getByRole('button', { name: label })).toBeOnTheScreen();
    }
    const contentStyle = StyleSheet.flatten(scroll.props.contentContainerStyle);
    expect(contentStyle?.paddingBottom ?? contentStyle?.padding).toBeGreaterThan(0);
    expect(scroll.props.nestedScrollEnabled).toBe(true);
  });

  it('shows the offline notice', async () => {
    await renderScreen({ offline: true });
    expect(screen.getByText('Sin conexión.', { exact: false })).toBeOnTheScreen();
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

import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { FulfillmentGrid } from '../components/FulfillmentGrid';
import { cellKey, type FulfillmentContent } from '../components/fulfillment';
import { fulfillmentFixture } from '../__fixtures__/fulfillment';

const content = fulfillmentFixture.grid;
const hidden = { includeHiddenElements: true };

function setup(value: FulfillmentContent = content) {
  const onCycle = jest.fn();
  return { onCycle, ui: <FulfillmentGrid {...value} onCycle={onCycle} /> };
}

const cell = (athlete: string, position: number) =>
  screen.getByRole('button', { name: new RegExp(`^${athlete} · Bloque ${position},`) });

describe('FulfillmentGrid', () => {
  it('cycles each status to the next one through onCycle', async () => {
    const { onCycle, ui } = setup();
    await render(ui);

    // Lucía R.: block 1 done, block 2 partial, block 3 absent, block 4 not marked.
    await fireEvent.press(cell('Lucía R.', 1));
    await fireEvent.press(cell('Lucía R.', 2));
    await fireEvent.press(cell('Lucía R.', 3));
    await fireEvent.press(cell('Lucía R.', 4));

    expect(onCycle.mock.calls).toEqual([
      ['a1', 'b1', 'partial'],
      ['a1', 'b2', 'absent'],
      ['a1', 'b3', 'not_marked'],
      ['a1', 'b4', 'done'],
    ]);
  });

  it('treats a missing cell as not marked, never as a zero', async () => {
    const { onCycle, ui } = setup();
    await render(ui);

    // Tomás V. has only block 1 marked.
    expect(cell('Tomás V.', 2).props.accessibilityLabel).toContain('Sin marcar');
    await fireEvent.press(cell('Tomás V.', 2));
    expect(onCycle).toHaveBeenCalledWith('a4', 'b2', 'done');

    expect(screen.queryByText(/^0$/, hidden)).toBeNull();
    expect(screen.queryByText(/0,00/, hidden)).toBeNull();
    expect(screen.queryByText(/0\//, hidden)).toBeNull();
  });

  it('shows the recorded times of timed done and partial cells, singular for one', async () => {
    await render(setup().ui);

    expect(screen.getByText('8/8 tiempos', hidden)).toBeOnTheScreen();
    expect(screen.getByText('3/8 tiempos', hidden)).toBeOnTheScreen();
    expect(screen.getByText('1/1 tiempo', hidden)).toBeOnTheScreen();
  });

  it('shows no times for absent or not marked timed cells, even with times recorded', async () => {
    const [, timed] = content.blocks;
    const value: FulfillmentContent = {
      ...content,
      blocks: [timed],
      athletes: content.athletes.slice(0, 2),
      cells: {
        [cellKey('a1', timed.id)]: { status: 'absent', timesRecorded: 5 },
        [cellKey('a2', timed.id)]: { status: 'not_marked', timesRecorded: 5 },
      },
    };
    await render(setup(value).ui);

    expect(screen.queryByText(/tiempo/, hidden)).toBeNull();
    expect(screen.getAllByText('Sin marcar', hidden)).toHaveLength(1);
  });

  it('shows no times for a completion-only block or a timed cell without a count', async () => {
    const value: FulfillmentContent = {
      ...content,
      athletes: [content.athletes[1]],
      cells: {
        [cellKey('a2', 'b1')]: { status: 'done', timesRecorded: 1 },
        [cellKey('a2', 'b2')]: { status: 'done' },
      },
    };
    await render(setup(value).ui);

    expect(screen.queryByText(/tiempo/, hidden)).toBeNull();
  });

  it('names who marked or corrected a cell and when', async () => {
    await render(setup().ui);

    expect(screen.getAllByText('Marcado por Paula G. · 24\u00A0oct', hidden).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Corregido por Paula G. · 24\u00A0oct', hidden).length).toBeGreaterThan(0);
  });

  it('never splits the date of the author caption', async () => {
    const value: FulfillmentContent = {
      ...content,
      athletes: [content.athletes[0]],
      cells: { [cellKey('a1', 'b1')]: { status: 'done', change: { kind: 'corrected', author: 'Paula G.', dateLabel: '24 oct' } } },
    };
    await render(setup(value).ui);

    const caption = screen.getByText(/^Corregido por Paula G\./, hidden);
    expect(caption.props.children).toContain('24 oct');
    expect(caption.props.children).not.toContain('24 oct');
  });

  it('labels each cell with athlete, block, status, times and author for screen readers', async () => {
    await render(setup().ui);

    expect(cell('Lucía R.', 2).props.accessibilityLabel).toBe(
      'Lucía R. · Bloque 2, 8 × 50 m Libre: Parcial · 3 de 8, 3/8 tiempos, Corregido por Paula G. · 24\u00A0oct',
    );
    expect(cell('Lucía R.', 1).props.accessibilityLabel).toBe(
      'Lucía R. · Bloque 1, 1 × 200 m Libre: Hecho, Marcado por Paula G. · 24\u00A0oct',
    );
    expect(cell('Lucía R.', 3).props.accessibilityLabel).toBe('Lucía R. · Bloque 3, 4 × 25 m Patada: No asistió');
    expect(cell('Mateo C.', 5).props.accessibilityLabel).toBe('Mateo C. · Bloque 5, 1 × 100 m Espalda: Sin marcar');
  });

  it('hints at the next status in the cycle', async () => {
    await render(setup().ui);

    expect(cell('Lucía R.', 1).props.accessibilityHint).toBe('Toca para cambiar a Parcial');
    expect(cell('Lucía R.', 2).props.accessibilityHint).toBe('Toca para cambiar a No asistió');
    expect(cell('Lucía R.', 3).props.accessibilityHint).toBe('Toca para cambiar a Sin marcar');
    expect(cell('Lucía R.', 4).props.accessibilityHint).toBe('Toca para cambiar a Hecho');
  });

  it('hides the cell contents from screen readers because the label says it all', async () => {
    await render(setup().ui);

    const text = screen.getAllByText('Hecho', hidden)[0];
    let node = text.parent;
    while (node && node.props.importantForAccessibility !== 'no-hide-descendants') node = node.parent;
    expect(node?.props.accessibilityElementsHidden).toBe(true);
  });

  it('shows the phase as plain text with the summary and the short recording in each header', async () => {
    await render(setup().ui);

    expect(screen.getByText('Calentamiento')).toBeOnTheScreen();
    expect(screen.getByText('Principal')).toBeOnTheScreen();
    expect(screen.getAllByText('Técnica')).toHaveLength(2);
    expect(screen.getByText('Enfriamiento')).toBeOnTheScreen();
    expect(screen.getByText('8 × 50 m Libre')).toBeOnTheScreen();
    expect(screen.getByText('Tiempo por repetición')).toBeOnTheScreen();
    expect(screen.getByText('Total de la serie')).toBeOnTheScreen();
  });

  it('lists the athletes by short name and scrolls the blocks sideways', async () => {
    await render(setup().ui);

    for (const name of ['Lucía R.', 'Mateo C.', 'Sara P.', 'Tomás V.']) expect(screen.getByText(name)).toBeOnTheScreen();
    const sideways = screen.container.queryAll((node) => node.props.horizontal === true && node.props.nestedScrollEnabled === true);
    expect(sideways.length).toBeGreaterThan(0);
  });

  it('keeps both sides of a row as tall as the taller one, and shrinks again when the content does', async () => {
    await render(setup().ui);

    const layout = (height: number) => ({ nativeEvent: { layout: { height, width: 100, x: 0, y: 0 } } });
    const minHeights = () =>
      ['left', 'right'].map((side) => StyleSheet.flatten(screen.getByTestId(`fulfillment-${side}-row-1`).props.style).minHeight);

    await fireEvent(screen.getByTestId('fulfillment-left-content-1'), 'layout', layout(60));
    await fireEvent(screen.getByTestId('fulfillment-right-content-1'), 'layout', layout(140));
    expect(minHeights()).toEqual([140, 140]);

    // The measured nodes never receive the synced minHeight, so a shorter content brings the row down.
    await fireEvent(screen.getByTestId('fulfillment-right-content-1'), 'layout', layout(90));
    expect(minHeights()).toEqual([90, 90]);
  });

  it('keeps every cell a control of at least 48 without a fixed size', async () => {
    await render(setup().ui);

    const cells = screen.getAllByRole('button');
    expect(cells).toHaveLength(content.athletes.length * content.blocks.length);
    for (const control of cells) {
      const style = StyleSheet.flatten(control.props.style);
      expect(style.minHeight).toBeGreaterThanOrEqual(48);
      expect(style.width).toBeUndefined();
      expect(style.height).toBeUndefined();
    }
  });
});

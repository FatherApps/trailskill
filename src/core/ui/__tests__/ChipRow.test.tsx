import { fireEvent, render, screen } from '@testing-library/react-native';
import { ScrollView } from 'react-native';

import { ThemeProvider } from '../../theme';
import { ChipRow } from '../ChipRow';

const options = [
  { value: 'lucia', label: 'Lucía', dot: { initials: 'LR', color: 'athlete-1' as const } },
  { value: 'tomas', label: 'Tomás', dot: { initials: 'TR', color: 'athlete-2' as const } },
  { value: 'sara', label: 'Sara' },
];

async function renderRow(value = 'lucia') {
  const onChange = jest.fn();
  await render(
    <ThemeProvider>
      <ChipRow accessibilityLabel="Deportista" options={options} value={value} onChange={onChange} />
    </ThemeProvider>,
  );
  return onChange;
}

describe('ChipRow', () => {
  it('is a labelled radio group with one radio per option', async () => {
    await renderRow();

    const groups = screen.container.queryAll((node) => node.props.accessibilityRole === 'radiogroup');
    expect(groups).toHaveLength(1);
    expect(groups[0].props.accessibilityLabel).toBe('Deportista');
    expect(groups[0].props.accessible).not.toBe(true);
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });

  it('marks only the chosen option as selected', async () => {
    await renderRow('tomas');

    expect(screen.getAllByRole('radio', { selected: true })).toHaveLength(1);
    expect(screen.getByRole('radio', { name: 'Tomás' })).toBeSelected();
  });

  it('gives a chip its own accessibilityLabel when the option has one', async () => {
    await render(
      <ThemeProvider>
        <ChipRow
          accessibilityLabel="Prueba"
          options={[{ value: 'a', label: 'Libre 50', accessibilityLabel: 'Libre 50 metros' }, { value: 'b', label: 'Pecho 50' }]}
          value="a"
          onChange={jest.fn()}
        />
      </ThemeProvider>,
    );

    expect(screen.getByRole('radio', { name: 'Libre 50 metros' })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Pecho 50' })).toBeOnTheScreen();
  });

  it('calls onChange with the value of the pressed chip', async () => {
    const onChange = await renderRow();

    await fireEvent.press(screen.getByRole('radio', { name: 'Sara' }));

    expect(onChange).toHaveBeenCalledWith('sara');
  });

  it('scrolls horizontally when the chips do not fit', async () => {
    await renderRow();

    const scroller = screen.container.queryAll((node) => node.type === 'RCTScrollView')[0];
    expect(scroller.props.horizontal).toBe(true);
  });

  describe('scrolling to the chosen chip', () => {
    const scrollTo = ScrollView.prototype.scrollTo as jest.Mock;
    // Three chips of 100 in a viewport of 300 with a gap of 8: the third one ends at 316 and is cut off.
    const chips: [string, number][] = [['Lucía', 0], ['Tomás', 108], ['Sara', 216]];
    const row = (value: string) => (
      <ThemeProvider>
        <ChipRow accessibilityLabel="Deportista" options={options} value={value} onChange={jest.fn()} />
      </ThemeProvider>
    );
    const layOut = async () => {
      const scroller = screen.container.queryAll((node) => node.type === 'RCTScrollView')[0];
      await fireEvent(scroller, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 44 } } });
      for (const [name, x] of chips) {
        await fireEvent(screen.getByRole('radio', { name }), 'layout', { nativeEvent: { layout: { x, y: 0, width: 100, height: 44 } } });
      }
    };

    beforeEach(() => scrollTo.mockClear());

    it('scrolls to a chosen chip that is cut off when it opens, with no animation', async () => {
      await render(row('sara'));
      await layOut();

      expect(scrollTo).toHaveBeenCalledTimes(1);
      expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ animated: false }));
      expect(scrollTo.mock.calls[0][0].x).toBeGreaterThan(0);
    });

    it('does not scroll when the chosen chip is already fully visible', async () => {
      await render(row('lucia'));
      await layOut();

      expect(scrollTo).not.toHaveBeenCalled();
    });

    it('scrolls with animation when the value changes to a chip that is cut off', async () => {
      await render(row('lucia'));
      await layOut();
      await screen.rerender(row('sara'));

      expect(scrollTo).toHaveBeenCalledTimes(1);
      expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ animated: true }));
    });

    it('does nothing when the value matches no option', async () => {
      await render(row('nadie'));
      await layOut();

      expect(scrollTo).not.toHaveBeenCalled();
    });
  });
});

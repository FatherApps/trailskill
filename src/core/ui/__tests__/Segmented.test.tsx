import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { ScrollView, StyleSheet } from 'react-native';

import { colors, contrastRatio, size, ThemeProvider, typography, type ThemeName } from '../../theme';
import { Segmented, segmentedColors } from '../Segmented';

const themes: ThemeName[] = ['light', 'dark'];
// A group must not be `accessible` (that would hide its options from screen readers), so role queries skip it.
const groupOf = () => screen.container.queryAll((node) => node.props.accessibilityRole === 'radiogroup');

// The horizontal ScrollView inside the pill track (host component of the Jest mock).
const scrollerOf = () => screen.container.queryAll((node) => node.type === 'RCTScrollView')[0];

const options = [
  { value: 'FR', label: 'Libre' },
  { value: 'BK', label: 'Espalda' },
  { value: 'BR', label: 'Pecho' },
];

async function renderSegmented(value = 'FR') {
  const onChange = jest.fn();
  await render(<Segmented accessibilityLabel="Estilo" options={options} value={value} onChange={onChange} />);
  return onChange;
}

describe('Segmented', () => {
  it('is a labelled radio group with one radio per option', async () => {
    await renderSegmented();

    const groups = groupOf();
    expect(groups).toHaveLength(1);
    expect(groups[0].props.accessibilityLabel).toBe('Estilo');
    expect(groups[0].props.accessible).not.toBe(true);
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    for (const { label } of options) expect(screen.getByRole('radio', { name: label })).toBeOnTheScreen();
  });

  it('announces the selected option as selected and checked, and the others as not', async () => {
    await renderSegmented('BK');

    const selected = screen.getByRole('radio', { name: 'Espalda' });
    expect(selected.props.accessibilityState).toMatchObject({
      selected: true,
      checked: true,
    });
    for (const label of ['Libre', 'Pecho']) {
      expect(screen.getByRole('radio', { name: label }).props.accessibilityState).toMatchObject({
        selected: false,
        checked: false,
      });
    }
    expect(screen.getAllByRole('radio', { selected: true })).toHaveLength(1);
  });

  it('calls onChange with the value of the pressed option', async () => {
    const onChange = await renderSegmented();

    await fireEvent.press(screen.getByRole('radio', { name: 'Pecho' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('BR');
  });

  it('is a pill track with segments at least 48 dp tall that keep the width of their label', async () => {
    await renderSegmented();

    const track = StyleSheet.flatten(groupOf()[0].props.style);
    expect(track).toMatchObject({ borderRadius: 999, overflow: 'hidden' });
    for (const radio of screen.getAllByRole('radio')) {
      const style = StyleSheet.flatten(radio.props.style);
      expect(style.minHeight).toBeGreaterThanOrEqual(48);
      expect(style.minHeight).toBe(size['target-min']);
      expect(style.borderRadius).toBe(999);
      // Fill the track when everything fits, never shrink below the label when it does not.
      expect(style.flexGrow).toBe(1);
      expect(style.flexShrink).toBe(0);
      expect(style.flex).toBeUndefined();
      expect(style.width).toBeUndefined();
      expect(style.height).toBeUndefined();
    }
  });

  it('scrolls horizontally inside the pill track instead of squeezing the options', async () => {
    await renderSegmented();

    const scroller = scrollerOf();
    expect(scroller.props.horizontal).toBe(true);
    expect(scroller.props.showsHorizontalScrollIndicator).toBe(false);
    expect(StyleSheet.flatten(scroller.props.contentContainerStyle)).toMatchObject({ flexGrow: 1 });
    expect(within(scroller).getAllByRole('radio')).toHaveLength(3);
    expect(within(groupOf()[0]).getByRole('radio', { name: 'Libre' })).toBeOnTheScreen();
  });

  it('paints the selected option primary with on-primary text and the others in ink', async () => {
    await renderSegmented('FR');

    const selected = StyleSheet.flatten(screen.getByRole('radio', { name: 'Libre' }).props.style);
    const other = StyleSheet.flatten(screen.getByRole('radio', { name: 'Pecho' }).props.style);
    expect(selected.backgroundColor).toBe(colors.light.primary);
    expect(other.backgroundColor).not.toBe(colors.light.primary);

    expect(StyleSheet.flatten(screen.getByText('Libre').props.style).color).toBe(colors.light['on-primary']);
    expect(StyleSheet.flatten(screen.getByText('Pecho').props.style)).toMatchObject({
      ...typography.label,
      color: colors.light.ink,
    });
  });

  it('lets long labels wrap instead of clipping them', async () => {
    await render(
      <Segmented
        accessibilityLabel="Tipo de sesión"
        options={[
          { value: 'a', label: 'Entrenamiento en piscina corta' },
          { value: 'b', label: 'Competencia en piscina larga' },
        ]}
        value="a"
        onChange={jest.fn()}
      />,
    );

    for (const text of screen.container.queryAll((node) => node.type === 'Text')) {
      expect(text.props.numberOfLines).toBeUndefined();
      expect(text.props.allowFontScaling).not.toBe(false);
    }
  });

  describe('long labels with the text at 200 %', () => {
    const longOptions = [
      { value: 'a', label: 'Esperanza de la mañana' },
      { value: 'b', label: 'Mariposa' },
      { value: 'c', label: '100 m combinado individual' },
    ];

    it('keeps the radio semantics, the 48 dp minimum and never truncates a label', async () => {
      await render(
        <ThemeProvider fontScale={2}>
          <Segmented accessibilityLabel="Estilo" options={longOptions} value="b" onChange={jest.fn()} />
        </ThemeProvider>,
      );

      expect(groupOf()[0].props.accessibilityLabel).toBe('Estilo');
      expect(screen.getAllByRole('radio')).toHaveLength(3);
      expect(screen.getByRole('radio', { name: 'Mariposa' }).props.accessibilityState).toMatchObject({
        checked: true,
        selected: true,
      });
      expect(screen.getAllByRole('radio', { selected: true })).toHaveLength(1);
      for (const radio of screen.getAllByRole('radio')) {
        const style = StyleSheet.flatten(radio.props.style);
        expect(style.minHeight).toBeGreaterThanOrEqual(48);
        expect(style.flexShrink).toBe(0);
        expect(style.flex).toBeUndefined();
      }
      for (const { label } of longOptions) {
        const text = screen.getByText(label);
        expect(text.props.numberOfLines).toBeUndefined();
        expect(StyleSheet.flatten(text.props.style).fontSize).toBe(typography.label.fontSize * 2);
      }
    });

    // The Jest ScrollView mock has no layout engine: the test feeds the layouts and watches `scrollTo`.
    describe('keeps the selected option in view', () => {
      const layouts = {
        a: { x: 0, width: 300 },
        b: { x: 300, width: 180 },
        c: { x: 480, width: 340 },
      };
      const layoutEvent = ({ x, width }: { x: number; width: number }) => ({
        nativeEvent: { layout: { x, y: 0, width, height: 48 } },
      });
      let scrollTo: jest.SpyInstance;
      beforeEach(() => {
        scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo');
      });
      afterEach(() => scrollTo.mockRestore());

      const renderWith = (value: string, set = longOptions) => (
        <ThemeProvider fontScale={2}>
          <Segmented accessibilityLabel="Estilo" options={set} value={value} onChange={jest.fn()} />
        </ThemeProvider>
      );

      async function measureScroller(viewport: number, content: number) {
        await fireEvent(scrollerOf(), 'layout', layoutEvent({ x: 0, width: viewport }));
        await fireEvent(scrollerOf(), 'contentSizeChange', content, 48);
      }

      async function layOut(set = longOptions, positions: Record<string, { x: number; width: number }> = layouts) {
        for (const option of set) {
          await fireEvent(
            screen.getByRole('radio', { name: option.label }),
            'layout',
            layoutEvent(positions[option.value]),
          );
        }
      }

      it('scrolls to the option that is selected when it is laid out', async () => {
        await render(renderWith('c'));
        await measureScroller(300, 820);
        await layOut();

        expect(scrollTo).toHaveBeenLastCalledWith({ x: 480, animated: false });
      });

      it('scrolls to the newly selected option when the value changes', async () => {
        const view = await render(renderWith('a'));
        await measureScroller(300, 820);
        await layOut();
        scrollTo.mockClear();

        await view.rerender(renderWith('c'));
        expect(scrollTo).toHaveBeenLastCalledWith({ x: 480, animated: true });

        await view.rerender(renderWith('b'));
        expect(scrollTo).toHaveBeenLastCalledWith({ x: 300, animated: true });
      });

      it('does not scroll when every option fits in the track', async () => {
        const view = await render(renderWith('a'));
        await measureScroller(300, 200);
        await layOut();
        await view.rerender(renderWith('c'));

        expect(scrollTo).not.toHaveBeenCalled();
      });

      it('clamps the target to the scrollable range', async () => {
        const view = await render(renderWith('a'));
        await measureScroller(200, 500);
        await layOut(longOptions, { ...layouts, c: { x: 400, width: 120 } });
        scrollTo.mockClear();

        await view.rerender(renderWith('c'));

        expect(scrollTo).toHaveBeenLastCalledWith({ x: 300, animated: true });
      });

      it('uses the newly measured position after the options are replaced', async () => {
        const view = await render(renderWith('a'));
        await measureScroller(200, 800);
        await layOut();

        const replaced = [
          { value: 'x', label: 'Combinado' },
          { value: 'c', label: '100 m combinado individual' },
        ];
        await view.rerender(renderWith('c', replaced));
        // The old x of `c` (480) is stale and must not be used.
        expect(scrollTo).not.toHaveBeenCalledWith({ x: 480, animated: true });

        scrollTo.mockClear();
        await layOut(replaced, { x: { x: 0, width: 200 }, c: { x: 250, width: 340 } });
        expect(scrollTo).toHaveBeenLastCalledWith({ x: 250, animated: false });
      });
    });
  });

  describe.each(themes)('%s theme contrast', (theme) => {
    const c = colors[theme];

    it('selected label (on-primary) on primary is at least 4.5:1', () => {
      const { background, text } = segmentedColors.selected;
      expect(contrastRatio(c[text], c[background])).toBeGreaterThanOrEqual(4.5);
    });

    it('unselected label (ink) on the track (surface-1) is at least 4.5:1', () => {
      expect(contrastRatio(c[segmentedColors.unselected], c[segmentedColors.track])).toBeGreaterThanOrEqual(4.5);
    });
  });
});

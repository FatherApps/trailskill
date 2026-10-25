import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { colors, contrastRatio, size, typography, type ThemeName } from '../../theme';
import { Segmented, segmentedColors } from '../Segmented';

const themes: ThemeName[] = ['light', 'dark'];
// A group must not be `accessible` (that would hide its options from screen readers), so role queries skip it.
const groupOf = () => screen.container.queryAll((node) => node.props.accessibilityRole === 'radiogroup');

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
    expect(selected.props.accessibilityState).toMatchObject({ selected: true, checked: true });
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

  it('is a pill track with segments at least 48 dp tall that share the width', async () => {
    await renderSegmented();

    const track = StyleSheet.flatten(groupOf()[0].props.style);
    expect(track).toMatchObject({ borderRadius: 999, flexDirection: 'row' });
    for (const radio of screen.getAllByRole('radio')) {
      const style = StyleSheet.flatten(radio.props.style);
      expect(style.minHeight).toBeGreaterThanOrEqual(48);
      expect(style.minHeight).toBe(size['target-min']);
      expect(style.borderRadius).toBe(999);
      expect(style.flex).toBe(1);
      expect(style.width).toBeUndefined();
      expect(style.height).toBeUndefined();
    }
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

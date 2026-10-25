import { fireEvent, render, screen } from '@testing-library/react-native';
import { processColor, StyleSheet } from 'react-native';

import { colors, contrastRatio, radius, type ThemeName } from '../../theme';
import { iconPaths } from '../icons';
import { Tag, tagColors, type TagVariant } from '../Tag';

const themes: ThemeName[] = ['light', 'dark'];
const variants = Object.keys(tagColors) as TagVariant[];

describe('Tag', () => {
  it('is a passive text element labelled by its text', async () => {
    await render(<Tag label="Fuente: externa" variant="info" />);

    const tag = screen.getByRole('text', { name: 'Fuente: externa' });
    expect(tag.props.accessibilityState).toEqual({});
    expect(tag.props.onPress).toBeUndefined();
  });

  it('draws its icon in the variant text color and keeps the label as its name', async () => {
    await render(<Tag label="Fuente: externa" variant="info" icon="cloud_download" />);

    const paths = screen.container.queryAll((node) => node.type === 'RNSVGPath');
    expect(paths).toHaveLength(1);
    expect(paths[0].props.d).toBe(iconPaths.cloud_download);
    expect(paths[0].props.fill).toEqual({
      type: 0,
      payload: processColor(colors.light[tagColors.info.text]),
    });
    expect(screen.queryByRole('image')).toBeNull();
    expect(screen.getByRole('text', { name: 'Fuente: externa' })).toBeOnTheScreen();
  });

  it.each(variants)('%s is a pill that grows with its text', async (variant) => {
    await render(<Tag label="Infantil B" variant={variant} />);

    const style = StyleSheet.flatten(screen.getByRole('text', { name: 'Infantil B' }).props.style);
    expect(style.borderRadius).toBe(999);
    expect(style.minHeight).toBe(24);
    expect(style.height).toBeUndefined();
    expect(style.width).toBeUndefined();
  });

  const layout = (lines: number) => ({ nativeEvent: { lines: Array.from({ length: lines }, () => ({})) } });

  it.each(variants)('%s keeps the pill radius for one line of text', async (variant) => {
    await render(<Tag label="Infantil B" variant={variant} />);
    const tag = screen.getByRole('text', { name: 'Infantil B' });
    expect(StyleSheet.flatten(tag.props.style).borderRadius).toBe(radius.full);

    await fireEvent(screen.getByText('Infantil B', { includeHiddenElements: true }), 'textLayout', layout(1));
    expect(StyleSheet.flatten(tag.props.style).borderRadius).toBe(radius.full);
  });

  it.each(variants)('%s uses radius-md once its text wraps', async (variant) => {
    const label = 'Otra escuela: Club Acuático Norte del Litoral Occidental';
    await render(<Tag label={label} variant={variant} />);

    await fireEvent(screen.getByText(label, { includeHiddenElements: true }), 'textLayout', layout(2));
    const style = StyleSheet.flatten(screen.getByRole('text', { name: label }).props.style);
    expect(style.borderRadius).toBe(radius.md);
  });

  it.each(variants)('%s centers its icon on one line and aligns it with the first line once the text wraps', async (variant) => {
    const label = 'Otra escuela: Club Acuático Norte del Litoral Occidental';
    await render(<Tag label={label} variant={variant} icon="schedule" />);
    const align = () => StyleSheet.flatten(screen.getByRole('text', { name: label }).props.style).alignItems;
    expect(align()).toBe('center');

    await fireEvent(screen.getByText(label, { includeHiddenElements: true }), 'textLayout', layout(1));
    expect(align()).toBe('center');

    await fireEvent(screen.getByText(label, { includeHiddenElements: true }), 'textLayout', layout(2));
    expect(align()).toBe('flex-start');
  });

  it('never truncates its label', async () => {
    await render(<Tag label="Infantil B" />);
    const props = screen.getByText('Infantil B', { includeHiddenElements: true }).props;
    expect(props.numberOfLines).toBeUndefined();
    expect(props.ellipsizeMode).toBeUndefined();
  });

  describe.each(themes)('%s theme contrast', (theme) => {
    const c = colors[theme];

    it.each(variants)('%s text is at least 4.5:1', (variant) => {
      const { background, text } = tagColors[variant];
      // The outline tag is transparent: it sits on the canvas or on a card.
      const surfaces = background ? [c[background]] : [c['surface-0'], c['surface-1']];
      for (const surface of surfaces) {
        expect(contrastRatio(c[text], surface)).toBeGreaterThanOrEqual(4.5);
      }
    });
  });
});

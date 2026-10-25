import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { colors, contrastRatio, type ThemeName } from '../../theme';
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

  it.each(variants)('%s is a pill that grows with its text', async (variant) => {
    await render(<Tag label="Infantil B" variant={variant} />);

    const style = StyleSheet.flatten(screen.getByRole('text', { name: 'Infantil B' }).props.style);
    expect(style.borderRadius).toBe(999);
    expect(style.minHeight).toBe(24);
    expect(style.height).toBeUndefined();
    expect(style.width).toBeUndefined();
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

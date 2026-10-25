import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { colors, contrastRatio, type ThemeName } from '../../../core/theme';
import { AthleteFilters, athleteFiltersColors, type AthleteFiltersProps } from '../components/AthleteFilters';

const themes: ThemeName[] = ['light', 'dark'];
const hidden = { includeHiddenElements: true };

const base: AthleteFiltersProps = {
  query: '',
  onQueryChange: () => {},
  filters: {},
  onFilterPress: () => {},
};

describe('AthleteFilters', () => {
  it('has a search field with the placeholder and a leading search icon', async () => {
    await render(<AthleteFilters {...base} />);

    const field = screen.getByLabelText('Buscar por nombre');
    expect(field.props.placeholder).toBe('Buscar por nombre');
    expect(JSON.stringify(screen.toJSON())).toContain('RNSVGSvgView');
  });

  it('reports what is typed and shows the query it is given', async () => {
    const onQueryChange = jest.fn();
    await render(<AthleteFilters {...base} query="Lu" onQueryChange={onQueryChange} />);

    expect(screen.getByLabelText('Buscar por nombre').props.value).toBe('Lu');
    await fireEvent.changeText(screen.getByLabelText('Buscar por nombre'), 'Luc');

    expect(onQueryChange).toHaveBeenCalledWith('Luc');
  });

  it('has the three filter chips, which only report the press', async () => {
    const onFilterPress = jest.fn();
    await render(<AthleteFilters {...base} onFilterPress={onFilterPress} />);

    expect(screen.getAllByRole('button').map((chip) => chip.props.accessibilityLabel)).toEqual(['Categoría', 'Grupo', 'Entrenador']);
    await fireEvent.press(screen.getByRole('button', { name: 'Grupo' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Entrenador' }));

    expect(onFilterPress.mock.calls).toEqual([['group'], ['coach']]);
  });

  it('shows an active filter with its value and a close icon, and the others as outlines', async () => {
    await render(<AthleteFilters {...base} filters={{ category: 'Infantil B' }} />);

    expect(screen.getByRole('button', { name: 'Categoría: Infantil B' })).toBeSelected();
    expect(screen.getByRole('button', { name: 'Grupo' })).not.toBeSelected();
    const active = StyleSheet.flatten(screen.getByLabelText('Infantil B', hidden).props.style);
    // The chip and the tag inside it share the label: the tag is the second.
    const inactiveTag = screen.getAllByLabelText('Grupo', hidden)[1];
    const inactive = StyleSheet.flatten(inactiveTag.props.style);
    expect(active.backgroundColor).toBe(colors.light['primary-tint']);
    expect(inactive).toMatchObject({ backgroundColor: 'transparent', borderColor: colors.light['border-strong'] });
    // The active chip carries the close icon, the inactive ones none.
    expect(screen.getByLabelText('Infantil B', hidden).queryAll((node) => String(node.type) === 'RNSVGSvgView').length).toBe(1);
    expect(inactiveTag.queryAll((node) => String(node.type) === 'RNSVGSvgView').length).toBe(0);
  });

  it('gives every chip a touch area of at least 48 dp', async () => {
    await render(<AthleteFilters {...base} />);

    for (const chip of screen.getAllByRole('button')) {
      expect(StyleSheet.flatten(chip.props.style).minHeight).toBeGreaterThanOrEqual(48);
    }
  });

  it.each(themes)('keeps the typed text and the placeholder readable in the %s theme', (theme) => {
    const c = colors[theme];
    expect(contrastRatio(c[athleteFiltersColors.text], c[athleteFiltersColors.background])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c[athleteFiltersColors.placeholder], c[athleteFiltersColors.background])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c[athleteFiltersColors.border], c[athleteFiltersColors.background])).toBeGreaterThanOrEqual(3);
  });
});

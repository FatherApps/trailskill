import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { colors, contrastRatio, ThemeProvider, type ThemeName } from '../../../core/theme';
import { ConsoleNav, consoleNavColors, type ConsoleNavProps } from '../components/ConsoleNav';

const themes: ThemeName[] = ['light', 'dark'];
const labels = ['Deportistas', 'Entrenadores', 'Récords', 'Mediciones', 'Autorizaciones', 'Ajustes'];
const base: ConsoleNavProps = { variant: 'side', activeId: 'athletes', onSelect: () => {}, schoolName: 'Escuela Delfines' };

const style = (testID: string) => StyleSheet.flatten(screen.getByTestId(testID).props.style);

describe('ConsoleNav', () => {
  it('lists the six destinations in order as tabs, with the active one selected', async () => {
    await render(<ConsoleNav {...base} activeId="records" />);

    expect(screen.getAllByRole('tab').map((tab) => tab.props.accessibilityLabel)).toEqual(labels);
    expect(screen.getByRole('tab', { name: 'Récords' })).toBeSelected();
    expect(screen.getByRole('tab', { name: 'Deportistas' })).not.toBeSelected();
  });

  it('reports the chosen destination', async () => {
    const onSelect = jest.fn();
    await render(<ConsoleNav {...base} onSelect={onSelect} />);

    await fireEvent.press(screen.getByRole('tab', { name: 'Autorizaciones' }));

    expect(onSelect).toHaveBeenCalledWith('authorizations');
  });

  it('shows the logo and the school name passed by props', async () => {
    await render(<ConsoleNav {...base} />);

    expect(screen.getByRole('image', { name: 'TrailSkill' })).toBeOnTheScreen();
    expect(screen.getByText('Escuela Delfines')).toBeOnTheScreen();
  });

  it('stacks the pills in a white panel on the side and lays them in a wrapping row on top', async () => {
    await render(<ConsoleNav {...base} variant="side" />);
    expect(style('console-nav-side')).toMatchObject({ width: 240, backgroundColor: colors.light['surface-1'] });
    expect(style('console-nav-tabs')).toMatchObject({ flexDirection: 'column' });

    await screen.unmount();
    await render(<ConsoleNav {...base} variant="top" />);
    expect(screen.queryByTestId('console-nav-side')).toBeNull();
    expect(style('console-nav-top').backgroundColor).toBe(colors.light['surface-1']);
    expect(style('console-nav-tabs')).toMatchObject({ flexDirection: 'row', flexWrap: 'wrap' });
  });

  it.each(['side', 'top'] as const)('makes the active pill dark and every pill at least 48 dp high (%s)', async (variant) => {
    await render(<ConsoleNav {...base} variant={variant} />);

    const active = StyleSheet.flatten(screen.getByRole('tab', { name: 'Deportistas' }).props.style);
    const inactive = StyleSheet.flatten(screen.getByRole('tab', { name: 'Ajustes' }).props.style);
    expect(active.backgroundColor).toBe(colors.light.primary);
    expect(inactive.backgroundColor).toBe('transparent');
    for (const tab of screen.getAllByRole('tab')) {
      expect(StyleSheet.flatten(tab.props.style).minHeight).toBeGreaterThanOrEqual(48);
    }
  });

  it.each(themes)('keeps every label readable in the %s theme', (theme) => {
    const c = colors[theme];
    expect(contrastRatio(c[consoleNavColors.active.text], c[consoleNavColors.active.background])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c[consoleNavColors.inactive], c[consoleNavColors.panel])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c[consoleNavColors.caption], c[consoleNavColors.panel])).toBeGreaterThanOrEqual(4.5);
  });

  it('follows the theme', async () => {
    await render(<ThemeProvider name="dark"><ConsoleNav {...base} /></ThemeProvider>);

    expect(style('console-nav-side').backgroundColor).toBe(colors.dark['surface-1']);
  });
});

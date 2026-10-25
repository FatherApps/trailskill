import { fireEvent, render, screen } from '@testing-library/react-native';
import { Dimensions, Text } from 'react-native';

import { ThemeProvider } from '../../../core/theme';
import { ConsoleScreen, type ConsoleScreenProps, type ConsoleSectionProps } from '..';

jest.mock('../../../core/sync', () => ({ db: {} }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));

const hidden = { includeHiddenElements: true };

// The React Native jest setup reports a system font scale of 2: these tests start from 100 %.
const realGet = Dimensions.get.bind(Dimensions);
beforeEach(() => {
  jest.spyOn(Dimensions, 'get').mockImplementation((dim) => ({ ...realGet(dim), fontScale: 1 }));
});
afterEach(() => jest.restoreAllMocks());

const show = (width: number, sections?: ConsoleScreenProps['sections']) => (
  <ThemeProvider>
    <ConsoleScreen width={width} schoolName="Escuela Delfines" sections={sections} />
  </ThemeProvider>
);

const layoutShown = () =>
  screen.queryByTestId('console-nav-side', hidden)
    ? 'expanded'
    : screen.queryByTestId('console-nav-top', hidden)
      ? 'medium'
      : 'compact';

describe('ConsoleScreen layout', () => {
  it.each([
    [599, 'compact'],
    [600, 'medium'],
    [1023, 'medium'],
    [1024, 'expanded'],
  ])('at %s dp shows the %s layout', async (width, layout) => {
    await render(show(width));

    expect(layoutShown()).toBe(layout);
  });
});

describe('ConsoleScreen sections', () => {
  it('opens on a section without content showing only its title', async () => {
    await render(show(1280));

    expect(screen.getByRole('header', { name: 'Deportistas' })).toBeOnTheScreen();
  });

  it('shows the section whose tab is pressed', async () => {
    await render(show(800));

    await fireEvent.press(screen.getByRole('tab', { name: 'Récords' }));

    expect(screen.getByRole('header', { name: 'Récords' })).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Récords' })).toBeSelected();
  });

  it('keeps the active section when the width changes between layouts', async () => {
    const { rerender } = await render(show(1280));
    await fireEvent.press(screen.getByRole('tab', { name: 'Récords' }));

    for (const [width, layout] of [
      [800, 'medium'],
      [360, 'compact'],
      [1280, 'expanded'],
    ] as const) {
      await rerender(show(width));
      expect(layoutShown()).toBe(layout);
      expect(screen.getByRole('header', { name: 'Récords' })).toBeOnTheScreen();
      // The compact layout has no console navigation.
      if (layout !== 'compact') expect(screen.getByRole('tab', { name: 'Récords' })).toBeSelected();
    }
  });

  it('renders the content given for a destination and lets it navigate', async () => {
    const sections = {
      athletes: ({ onNavigate, schoolName }: ConsoleSectionProps) => (
        <Text onPress={() => onNavigate('coaches')}>Contenido de {schoolName}</Text>
      ),
    };
    await render(show(1280, sections));

    await fireEvent.press(screen.getByText('Contenido de Escuela Delfines'));

    expect(screen.getByRole('header', { name: 'Entrenadores' })).toBeOnTheScreen();
    expect(screen.queryByText(/^Contenido de/)).toBeNull();
  });

  it('titles the settings screen "Categorías" while its tab stays "Ajustes"', async () => {
    await render(show(1280));

    await fireEvent.press(screen.getByRole('tab', { name: 'Ajustes' }));

    expect(screen.getByRole('header', { name: 'Categorías' })).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Ajustes' })).toBeSelected();
  });
});

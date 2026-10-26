import { fireEvent, render, screen } from '@testing-library/react-native';
import { Dimensions, BackHandler, Text } from 'react-native';

import { breakpoint, ThemeProvider } from '../../../core/theme';
import { ConsoleLayout, consoleLayoutFor, type ConsoleLayoutProps } from '../components/ConsoleLayout';

const hidden = { includeHiddenElements: true };
const onClose = jest.fn();

const detail = { label: 'Detalle de Lucía Ramírez', content: <Text>Contenido del detalle</Text>, onClose };

const base = (width: number, extra: Partial<ConsoleLayoutProps> = {}): ConsoleLayoutProps => ({
  width,
  schoolName: 'Escuela Delfines',
  activeId: 'athletes',
  onSelect: () => {},
  children: <Text>Contenido principal</Text>,
  ...extra,
});

const show = (width: number, extra?: Partial<ConsoleLayoutProps>) => render(<ConsoleLayout {...base(width, extra)} />);

// The React Native jest setup reports a system font scale of 2: these tests start from 100 %.
const realGet = Dimensions.get.bind(Dimensions);
beforeEach(() => {
  jest.spyOn(Dimensions, 'get').mockImplementation((dim) => ({ ...realGet(dim), fontScale: 1 }));
});
afterEach(() => jest.restoreAllMocks());

describe('consoleLayoutFor', () => {
  it.each([
    [0, 'compact'],
    [599, 'compact'],
    [600, 'medium'],
    [1023, 'medium'],
    [1024, 'expanded'],
    [1280, 'expanded'],
  ])('uses the %s dp layout of the %s breakpoint', (width, expected) => {
    expect(consoleLayoutFor(width, breakpoint)).toBe(expected);
  });
});

describe('ConsoleLayout', () => {
  beforeEach(() => onClose.mockClear());

  it.each([
    [1024, 'console-nav-side'],
    [1023, 'console-nav-top'],
    [600, 'console-nav-top'],
  ])('at %s dp shows the %s', async (width, testID) => {
    await show(width);

    expect(screen.getByTestId(testID)).toBeOnTheScreen();
    expect(screen.getByText('Contenido principal')).toBeOnTheScreen();
  });

  it('changes exactly at 599/600 and 1023/1024', async () => {
    const shown = async (width: number) => {
      await show(width);
      const ids = ['console-nav-side', 'console-nav-top'].filter((id) => screen.queryByTestId(id));
      await screen.unmount();
      return ids;
    };

    expect(await shown(599)).toEqual(['console-nav-top']);
    expect(await shown(600)).toEqual(['console-nav-top']);
    expect(await shown(1023)).toEqual(['console-nav-top']);
    expect(await shown(1024)).toEqual(['console-nav-side']);
  });

  describe('expanded navigation by text scale', () => {
    // The system font scale stays at 1: the text scale comes from the theme, as in the gallery's 200 % option.
    const at = (fontScale: number) =>
      render(<ThemeProvider fontScale={fontScale}><ConsoleLayout {...base(1280, { detail })} /></ThemeProvider>);

    it('keeps the side navigation at 100 % text and below 1.5', async () => {
      await at(1);
      expect(screen.getByTestId('console-nav-side')).toBeOnTheScreen();
      await screen.unmount();
      await at(1.49);
      expect(screen.getByTestId('console-nav-side')).toBeOnTheScreen();
    });

    it.each([1.5, 2])('uses the top navigation from a %s text scale, with the detail panel beside the content', async (scale) => {
      await at(scale);

      expect(screen.queryByTestId('console-nav-side')).toBeNull();
      expect(screen.getByTestId('console-nav-top')).toBeOnTheScreen();
      expect(screen.getByTestId('detail-panel')).toBeOnTheScreen();
      expect(screen.getByText('Contenido principal')).toBeOnTheScreen();
    });
  });

  it.each([360, 599])('compact at %s dp shows the seven destinations and reports the one pressed', async (width) => {
    const onSelect = jest.fn();
    await show(width, { onSelect });

    expect(screen.getByTestId('console-nav-top')).toBeOnTheScreen();
    expect(screen.getAllByRole('tab')).toHaveLength(7);
    expect(screen.getByText('Contenido principal')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('tab', { name: 'Mediciones' }));
    expect(onSelect).toHaveBeenCalledWith('measurements');
  });

  it('compact with a detail open has no navigation', async () => {
    await show(360, { detail });

    expect(screen.queryByTestId('console-nav-top')).toBeNull();
    expect(screen.queryByRole('tab')).toBeNull();
  });

  it('reports a destination chosen in the navigation', async () => {
    const onSelect = jest.fn();
    await show(1280, { onSelect });

    await fireEvent.press(screen.getByRole('tab', { name: 'Mediciones' }));

    expect(onSelect).toHaveBeenCalledWith('measurements');
  });

  describe('detail', () => {
    it('expanded: a 340 panel beside the content with a labelled Cerrar button', async () => {
      await show(1280, { detail });

      expect(screen.getByTestId('detail-panel')).toBeOnTheScreen();
      expect(screen.getByText('Contenido del detalle')).toBeOnTheScreen();
      expect(screen.getByText('Contenido principal')).toBeOnTheScreen();
      expect(screen.queryByTestId('side-sheet')).toBeNull();

      await fireEvent.press(screen.getByRole('button', { name: 'Cerrar' }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('expanded without a detail has no panel', async () => {
      await show(1280);

      expect(screen.queryByTestId('detail-panel')).toBeNull();
    });

    it('medium: opens in a side sheet and hides the content behind it from accessibility', async () => {
      await show(800, { detail });

      expect(screen.getByTestId('side-sheet')).toBeOnTheScreen();
      expect(screen.queryByTestId('detail-panel')).toBeNull();
      expect(screen.queryByRole('tab', { name: 'Deportistas' })).toBeNull();
      expect(screen.queryByText('Contenido principal')).toBeNull();
      expect(screen.getByRole('tab', { name: 'Deportistas', ...hidden })).toBeOnTheScreen();
      expect(screen.getByText('Contenido principal', hidden)).toBeOnTheScreen();
      expect(screen.getByText('Contenido del detalle')).toBeOnTheScreen();
    });

    it('medium: tapping the scrim closes the sheet and the content is reachable again without it', async () => {
      await show(800, { detail });

      await fireEvent.press(screen.getByTestId('side-sheet-scrim'));
      expect(onClose).toHaveBeenCalledTimes(1);

      await screen.rerender(<ConsoleLayout {...base(800)} />);
      expect(screen.queryByTestId('side-sheet')).toBeNull();
      expect(screen.getByRole('tab', { name: 'Deportistas' })).toBeOnTheScreen();
    });

    it('compact: the detail takes the whole screen with a Volver button', async () => {
      await show(360, { detail });

      expect(screen.getByText('Contenido del detalle')).toBeOnTheScreen();
      expect(screen.queryByText('Contenido principal')).toBeNull();
      expect(screen.queryByTestId('side-sheet')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Cerrar' })).toBeNull();

      await fireEvent.press(screen.getByRole('button', { name: 'Volver' }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  // The content scrolls too, except in the compact detail, which replaces it.
  it.each([
    [1280, 'panel', 2, 0],
    [360, 'full-screen detail', 1, 0],
    [800, 'side sheet', 2, 1],
  ])('lets a tall detail scroll in the %s dp %s, unless a parent scrolls instead', async (width, _, scrolling, parentScrolls) => {
    const scrolls = async (extra: Partial<ConsoleLayoutProps>) => {
      await show(width, { detail, ...extra });
      const count = JSON.stringify(screen.toJSON()).split('RCTScrollView').length - 1;
      await screen.unmount();
      return count;
    };

    expect(await scrolls({})).toBe(scrolling);
    // The sheet is an overlay over the layout, so it scrolls itself even when the page scrolls.
    expect(await scrolls({ scrollEnabled: false })).toBe(parentScrolls);
  });

  describe('Android back in the compact detail', () => {
    afterEach(() => jest.restoreAllMocks());

    it('closes the detail like Volver and is only subscribed while it is open', async () => {
      let handler: Parameters<typeof BackHandler.addEventListener>[1] | undefined;
      const remove = jest.fn();
      const add = jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_, listener) => {
        handler = listener;
        return { remove };
      });
      await show(360);
      expect(add).not.toHaveBeenCalled();

      await screen.rerender(<ConsoleLayout {...base(360, { detail })} />);
      expect(add).toHaveBeenCalledTimes(1);
      expect(handler?.(undefined as never)).toBe(true);
      expect(onClose).toHaveBeenCalledTimes(1);

      await screen.rerender(<ConsoleLayout {...base(360)} />);
      expect(remove).toHaveBeenCalled();
    });
  });

  it('scrolls its content unless a parent scrolls instead', async () => {
    await show(1280);
    expect(JSON.stringify(screen.toJSON())).toContain('RCTScrollView');

    await screen.unmount();
    await show(1280, { scrollEnabled: false });
    expect(JSON.stringify(screen.toJSON())).not.toContain('RCTScrollView');
  });
});

describe('ConsoleLayout: content that scrolls on its own', () => {
  it('does not wrap the children in its own scroll view, and still scrolls the detail', async () => {
    await show(1280, { childrenScroll: true, detail });
    const json = JSON.stringify(screen.toJSON());

    expect(screen.getByText('Contenido principal')).toBeOnTheScreen();
    // The only scroll view is the one of the detail panel.
    expect(json.match(/RCTScrollView/g)).toHaveLength(1);
    expect(screen.getByText('Contenido del detalle')).toBeOnTheScreen();
  });

  it('keeps the layout scroll view by default', async () => {
    await show(1280);

    expect(JSON.stringify(screen.toJSON())).toContain('RCTScrollView');
  });
});

describe('ConsoleLayout: sheet', () => {
  const sheet = { label: 'Filtrar por categoría', content: <Text>Contenido de la hoja</Text>, onClose: jest.fn() };

  it.each([1280, 800, 360])('opens a side sheet over the content at %s dp and hides what is behind it', async (width) => {
    await show(width, { sheet });

    expect(screen.getByTestId('side-sheet')).toHaveProp('accessibilityLabel', 'Filtrar por categoría');
    expect(screen.getByText('Contenido de la hoja')).toBeOnTheScreen();
    expect(screen.queryByText('Contenido principal')).toBeNull();
    expect(screen.getByText('Contenido principal', hidden)).toBeOnTheScreen();
  });

  it('closes from Cerrar', async () => {
    await show(800, { sheet });

    await fireEvent.press(screen.getByRole('button', { name: 'Cerrar' }));

    expect(sheet.onClose).toHaveBeenCalledTimes(1);
  });

  it('shows no sheet by default', async () => {
    await show(360);

    expect(screen.queryByTestId('side-sheet')).toBeNull();
  });
});

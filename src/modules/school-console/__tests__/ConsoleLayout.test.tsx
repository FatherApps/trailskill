import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { breakpoint } from '../../../core/theme';
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

    expect(await shown(599)).toEqual([]);
    expect(await shown(600)).toEqual(['console-nav-top']);
    expect(await shown(1023)).toEqual(['console-nav-top']);
    expect(await shown(1024)).toEqual(['console-nav-side']);
  });

  it('compact has no console navigation: the phone navigation belongs to the app', async () => {
    await show(360);

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

  it('scrolls its content unless a parent scrolls instead', async () => {
    await show(1280);
    expect(JSON.stringify(screen.toJSON())).toContain('RCTScrollView');

    await screen.unmount();
    await show(1280, { scrollEnabled: false });
    expect(JSON.stringify(screen.toJSON())).not.toContain('RCTScrollView');
  });
});

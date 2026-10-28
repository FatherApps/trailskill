import { fireEvent, render, screen } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';

import { ThemeProvider } from '../../../core/theme';
import { MarksScreen, type MarksView } from '..';

jest.mock('../../../core/sync', () => ({ db: {} }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));

// Synthetic data only.
const data: Extract<MarksView, { kind: 'data' }> = {
  kind: 'data',
  athletes: [
    { id: 'a1', name: 'Lucía R.', initials: 'LR', color: 'athlete-3' },
    { id: 'a2', name: 'Tomás R.', initials: 'TR', color: 'athlete-2' },
  ],
  selectedId: 'a1',
  firstName: 'Lucía',
  pool: 'SCM',
  cards: [
    { id: 'FR-50m', event: 'Libre 50', time: 3482, origin: 'competition', date: '2026-10-18' },
    { id: 'BK-50m', event: 'Espalda 50', time: 4108, origin: 'training', date: '2026-10-02' },
    { id: 'BK-100m', event: 'Espalda 100', time: null },
  ],
};

// How the cards of the screen are laid out: the direction of the container that holds the card.
const containerStyle = (label: RegExp) => StyleSheet.flatten((screen.getByLabelText(label).parent!.props as { style: never }).style);
const layoutOf = (label: RegExp) => containerStyle(label).flexDirection;
const libre50 = /^Libre 50: /;

const show = (view: MarksView, { onSelectAthlete = jest.fn(), onPoolChange = jest.fn() } = {}) =>
  render(
    <ThemeProvider>
      <MarksScreen view={view} onSelectAthlete={onSelectAthlete} onPoolChange={onPoolChange} scrollEnabled={false} />
    </ThemeProvider>,
  );

describe('MarksScreen', () => {
  it('titles the screen with the chosen athlete', async () => {
    await show(data);

    expect(screen.getByRole('header', { name: 'Marcas de Lucía' })).toBeOnTheScreen();
  });

  it('shows the time, the origin and the date of an event with a mark', async () => {
    await show(data);

    expect(screen.getByText('Libre 50')).toBeOnTheScreen();
    expect(screen.getByText('34,82')).toBeOnTheScreen();
    expect(screen.getByLabelText('Comp. · 18 oct')).toBeOnTheScreen();
    expect(screen.getByLabelText('Entreno · 2 oct')).toBeOnTheScreen();
  });

  it('says "Aún sin tiempo" for an event with no time, never zero', async () => {
    await show(data);

    expect(screen.getByText('Espalda 100')).toBeOnTheScreen();
    expect(screen.getByText('Aún sin tiempo')).toBeOnTheScreen();
    expect(screen.queryByText(/^0[,:.]0/)).toBeNull();
  });

  it('chooses another athlete from the chips', async () => {
    const onSelectAthlete = jest.fn();
    await show(data, { onSelectAthlete });

    await fireEvent.press(screen.getByRole('radio', { name: /Tomás R\./ }));

    expect(onSelectAthlete).toHaveBeenCalledWith('a2');
  });

  it('switches the pool between 25 m and 50 m', async () => {
    const onPoolChange = jest.fn();
    await show(data, { onPoolChange });

    expect(screen.getByRole('radio', { name: 'Piscina 25 m' })).toBeSelected();
    await fireEvent.press(screen.getByRole('radio', { name: 'Piscina 50 m' }));

    expect(onPoolChange).toHaveBeenCalledWith('LCM');
  });

  it('has no FECNA label when nothing was imported', async () => {
    await show(data);

    expect(screen.queryByText(/FECNA/)).toBeNull();
  });

  it('says there are no athletes when the person manages none', async () => {
    await show({ kind: 'empty' });

    expect(screen.getByText('Aún no hay deportistas')).toBeOnTheScreen();
  });

  describe('with large text', () => {
    const realGet = Dimensions.get.bind(Dimensions);
    afterEach(() => jest.restoreAllMocks());

    it('lays the cards out in rows with normal text', async () => {
      jest.spyOn(Dimensions, 'get').mockImplementation((dim) => ({ ...realGet(dim), fontScale: 1 }));
      await show(data);

      expect(layoutOf(libre50)).toBe('row');
      expect(containerStyle(libre50).flexWrap).toBe('wrap');
    });

    it.each([
      ['the gallery scales the text', { themeScale: 2, osScale: 1 }],
      ['the system scales the text', { themeScale: 1, osScale: 2 }],
    ])('stacks the cards in one column when %s, so no word or time breaks', async (_who, { themeScale, osScale }) => {
      jest.spyOn(Dimensions, 'get').mockImplementation((dim) => ({ ...realGet(dim), fontScale: osScale }));
      await render(
        <ThemeProvider fontScale={themeScale}>
          <MarksScreen view={data} onSelectAthlete={jest.fn()} onPoolChange={jest.fn()} scrollEnabled={false} />
        </ThemeProvider>,
      );

      expect(layoutOf(libre50)).toBe('column');
      // A wrapping column shrinks each card to the content width instead of filling the screen.
      expect(containerStyle(libre50).flexWrap).not.toBe('wrap');
    });
  });
});

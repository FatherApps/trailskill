import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { Dimensions, FlatList, StyleSheet } from 'react-native';

import { t } from '../../../core/i18n';
import { ThemeProvider, space } from '../../../core/theme';
import { MarksScreen, type MarksView } from '..';
import { marksFixture, marksSections, measured } from '../__fixtures__/marks';

jest.mock('../../../core/sync', () => ({ db: {} }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));

// Synthetic data only. The fixtures group with the same functions the container runs.
const data = marksFixture as Extract<MarksView, { kind: 'data' }>;
const strokeName = (code: string) => t(`sport.stroke.${code}`);

const show = (view: MarksView, { onSelectAthlete = jest.fn(), onPoolChange = jest.fn(), scrollEnabled = false, fontScale }: { onSelectAthlete?: jest.Mock; onPoolChange?: jest.Mock; scrollEnabled?: boolean; fontScale?: number } = {}) =>
  render(
    <ThemeProvider fontScale={fontScale}>
      <MarksScreen view={view} onSelectAthlete={onSelectAthlete} onPoolChange={onPoolChange} scrollEnabled={scrollEnabled} />
    </ThemeProvider>,
  );

const groupIds = () => screen.getAllByTestId(/^marks-group-/).map((node) => String(node.props.testID).replace('marks-group-', ''));
const flat = (node: { props: { style?: unknown } }) => StyleSheet.flatten(node.props.style as never) ?? {};

// The stroke icons inside a rendered node: its own box is the one that hides from screen readers when decorative.
type Json = { type: string; props: { testID?: string; style?: unknown; importantForAccessibility?: string }; children?: (Json | string)[] | null };
const nodes = (root: Json): Json[] => [root, ...(root.children ?? []).flatMap((child) => (typeof child === 'string' ? [] : nodes(child)))];
const iconsIn = (testID?: string) => {
  const tree = screen.toJSON() as unknown as Json;
  const scope = testID ? nodes(tree).find((node) => node.props.testID === testID)! : tree;
  return nodes(scope).filter((node) => flat(node).borderRadius === 999 && flat(node).width === 44);
};

const realGet = Dimensions.get.bind(Dimensions);

describe('MarksScreen', () => {
  // The test environment reports a doubled font scale; these tests are about normal text unless they say otherwise.
  beforeEach(() => jest.spyOn(Dimensions, 'get').mockImplementation((dim) => ({ ...realGet(dim), fontScale: 1 })));
  afterEach(() => jest.restoreAllMocks());

  it('titles the screen with the chosen athlete', async () => {
    await show(data);

    expect(screen.getByRole('header', { name: 'Marcas de Lucía' })).toBeOnTheScreen();
  });

  it('puts a titled group for each stroke, in the order given, announced as a header', async () => {
    await show(data);

    expect(groupIds()).toEqual(data.sections.map((section) => section.id));
    for (const { id } of data.sections) expect(screen.getByTestId(`marks-group-${id}`).props.accessibilityRole).toBe('header');
  });

  it('titles a group in display 22, so the token the design names is the one used', async () => {
    await show(data);

    const { fontSize } = flat(screen.getByTestId('marks-group-FR'));
    expect(fontSize).toBe(22);
  });

  it('counts the events with a time over the ones the group lists', async () => {
    await show(data);

    expect(screen.getByTestId('marks-count-FR')).toHaveTextContent('2 de 2 con tiempo');
    expect(screen.getByTestId('marks-count-BK')).toHaveTextContent('1 de 2 con tiempo');
    expect(screen.getByTestId('marks-count-IM')).toHaveTextContent('0 de 1 con tiempo');
  });

  it('puts a style chip under the pool for each group, with none for a stroke without events', async () => {
    const longPool = marksSections([measured('FR', '50m', 3601, '2026-09-12', { pool: 'LCM' })], 'LCM');
    await show({ ...data, pool: 'LCM', sections: longPool });

    expect(groupIds()).toEqual(['FR', 'BK', 'BR', 'FL']);
    expect(screen.queryByRole('radio', { name: strokeName('IM') })).toBeNull();
    for (const code of ['FR', 'BK', 'BR', 'FL']) expect(screen.getByRole('radio', { name: strokeName(code) })).toBeOnTheScreen();
  });

  it('scrolls to the group of the style chip that is pressed', async () => {
    const scrollToIndex = jest.spyOn(FlatList.prototype, 'scrollToIndex').mockImplementation(() => undefined);
    await show(data, { scrollEnabled: true });

    await fireEvent.press(screen.getByRole('radio', { name: strokeName('BR') }));

    expect(scrollToIndex).toHaveBeenCalledWith(expect.objectContaining({ index: data.sections.findIndex((section) => section.id === 'BR') }));
    scrollToIndex.mockRestore();
  });

  it('shows on a card the distance alone, with the whole event for screen readers', async () => {
    await show(data);

    const card = screen.getByTestId('marks-card-FR-50m');
    expect(within(card).getByText('50 m')).toBeOnTheScreen();
    expect(within(card).queryByText(/Libre/)).toBeNull();
    expect(card.props.accessibilityLabel).toMatch(/^Libre 50 metros: /);
  });

  it('shows the time and the origin and date of an event with a mark', async () => {
    await show(data);

    const card = screen.getByTestId('marks-card-FR-50m');
    expect(within(card).getByText('34,82')).toBeOnTheScreen();
    expect(within(card).getByLabelText('Comp. · 18 oct')).toBeOnTheScreen();
    expect(within(screen.getByTestId('marks-card-BK-50m')).getByLabelText('Entreno · 2 oct')).toBeOnTheScreen();
  });

  it('names the organization of an official result from sourceName, with the year', async () => {
    await show(data);

    expect(within(screen.getByTestId('marks-card-FR-100m')).getByLabelText('Federación Demo · 2025')).toBeOnTheScreen();
  });

  it('says "Aún sin tiempo" for an event with no time, never zero', async () => {
    await show(data);

    const card = screen.getByTestId('marks-card-BK-100m');
    expect(within(card).getByText('Aún sin tiempo')).toBeOnTheScreen();
    expect(within(card).queryByText(/^0[,:.]0/)).toBeNull();
    expect(flat(card).borderStyle).toBe('dashed');
  });

  it('announces the stroke once per group: the title says it and the cards and their icons do not', async () => {
    await show(data);

    const group = screen.getByTestId('marks-section-FR');
    expect(within(group).getAllByText(strokeName('FR'))).toHaveLength(1);
    expect(within(group).queryAllByRole('image')).toHaveLength(0);
  });

  it('puts the icon of the stroke on every card whose stroke has a pictogram, decorative', async () => {
    await show(data);

    const icons = iconsIn();
    expect(icons).toHaveLength(data.sections.flatMap((section) => section.cards).length);
    expect(icons.every((icon) => icon.props.importantForAccessibility === 'no-hide-descendants')).toBe(true);
    // The two events with no time carry the dotted frame of the empty variant.
    expect(icons.filter((icon) => flat(icon).borderStyle === 'dotted')).toHaveLength(2);
  });

  it('renders no icon for a stroke code the catalog does not know, and one for a valid code', async () => {
    const sections = marksSections([measured('XX' as never, '50m', 9000, '2026-10-18')], 'SCM').filter((section) => section.id === 'XX' || section.id === 'FR');
    await show({ ...data, sections });

    expect(iconsIn('marks-card-XX-50m')).toHaveLength(0);
    expect(iconsIn('marks-card-FR-50m')).toHaveLength(1);
  });

  it('shows a stroke outside the catalog as a group instead of dropping it', async () => {
    await show({ ...data, sections: marksSections([measured('XX' as never, '50m', 9000, '2026-10-18')], 'SCM') });

    expect(screen.getByTestId('marks-group-XX')).toHaveTextContent('XX');
  });

  it('shows the empty state, not a blank screen, when there are no sections', async () => {
    await show({ ...data, sections: [] });

    expect(screen.getByText('Sin pruebas para esta piscina')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Marcas de Lucía' })).toBeOnTheScreen();
  });

  it('virtualizes the groups and leaves room under the last row for the floating bar', async () => {
    await show(data, { scrollEnabled: true });

    const list = screen.getByTestId('marks-list');
    expect(list.props.data).toHaveLength(data.sections.length);
    expect(flat({ props: { style: list.props.contentContainerStyle } }).paddingBottom).toBeGreaterThanOrEqual(space[12] * 2);
  });

  it('chooses another athlete from the chips', async () => {
    const onSelectAthlete = jest.fn();
    await show(data, { onSelectAthlete });

    await fireEvent.press(screen.getByRole('radio', { name: /Tomás R\./ }));

    expect(onSelectAthlete).toHaveBeenCalledWith('fx-2');
  });

  it('switches the pool between 25 m and 50 m', async () => {
    const onPoolChange = jest.fn();
    await show(data, { onPoolChange });

    expect(screen.getByRole('radio', { name: 'Piscina 25 m' })).toBeSelected();
    await fireEvent.press(screen.getByRole('radio', { name: 'Piscina 50 m' }));

    expect(onPoolChange).toHaveBeenCalledWith('LCM');
  });

  it('says there are no athletes when the person manages none', async () => {
    await show({ kind: 'empty' });

    expect(screen.getByText('Aún no hay deportistas')).toBeOnTheScreen();
  });

  describe('with large text', () => {
    const grid = () => flat(screen.getByTestId('marks-grid-FR'));

    it('lays the cards out in two columns with normal text', async () => {
      jest.spyOn(Dimensions, 'get').mockImplementation((dim) => ({ ...realGet(dim), fontScale: 1 }));
      await show(data);

      expect(grid().flexDirection).toBe('row');
      expect(grid().flexWrap).toBe('wrap');
    });

    it.each([
      ['the gallery scales the text', { themeScale: 2, osScale: 1 }],
      ['the system scales the text', { themeScale: 1, osScale: 2 }],
    ])('stacks the cards in one column when %s, so no word or time breaks', async (_who, { themeScale, osScale }) => {
      jest.spyOn(Dimensions, 'get').mockImplementation((dim) => ({ ...realGet(dim), fontScale: osScale }));
      await show(data, { fontScale: themeScale });

      expect(grid().flexDirection).toBe('column');
      expect(grid().flexWrap).not.toBe('wrap');
    });

    it('lets the group title wrap and grow instead of cutting or overlapping the count at 200 %', async () => {
      await show(data, { fontScale: 2 });

      const title = screen.getByTestId('marks-group-FR');
      expect(title.props.numberOfLines).toBeUndefined();
      expect(flat(title).fontSize).toBe(44);
      expect(flat(title).lineHeight).toBeGreaterThan(flat(title).fontSize as number);
      expect(flat(screen.getByTestId('marks-heading-FR')).flexWrap).toBe('wrap');
    });

    it('reserves the corner of the icon on a card, so the title never sits under it', async () => {
      await show(data, { fontScale: 2 });

      expect(flat(screen.getByTestId('marks-card-FR-50m')).paddingRight).toBeGreaterThanOrEqual(64);
    });
  });
});

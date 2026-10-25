import { fireEvent, render, screen } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';

import { colors, contrastRatio, ThemeProvider, type ThemeName } from '../../../core/theme';
import { detailFixture, detailsFixture, sourceFixture } from '../__fixtures__/athletes';
import { AthleteDetail, athleteDetailColors } from '../components/AthleteDetail';

// The React Native jest setup reports a system font scale of 2: these tests start from 100 %.
const realGet = Dimensions.get.bind(Dimensions);
beforeEach(() => {
  jest.spyOn(Dimensions, 'get').mockImplementation((dim) => ({ ...realGet(dim), fontScale: 1 }));
});
afterEach(() => jest.restoreAllMocks());

const themes: ThemeName[] = ['light', 'dark'];
const hidden = { includeHiddenElements: true };

describe('AthleteDetail', () => {
  it('shows the full name as the title with the category and authorization tags', async () => {
    await render(<AthleteDetail athlete={detailFixture} onViewProfile={() => {}} />);

    expect(screen.getByRole('header', { name: 'Lucía Ramírez' })).toBeOnTheScreen();
    expect(screen.getByLabelText('Categoría B', hidden)).toBeOnTheScreen();
    expect(StyleSheet.flatten(screen.getByLabelText('Autorizado', hidden).props.style).backgroundColor).toBe(colors.light['success-bg']);
  });

  it('says a pending authorization with the warn tag', async () => {
    await render(<AthleteDetail athlete={detailsFixture.a3} onViewProfile={() => {}} />);

    expect(StyleSheet.flatten(screen.getByLabelText('Pendiente', hidden).props.style).backgroundColor).toBe(colors.light['warning-bg']);
    expect(screen.queryByLabelText('Autorizado', hidden)).toBeNull();
  });

  it('shows the guardian with the name and the contact', async () => {
    await render(<AthleteDetail athlete={detailFixture} onViewProfile={() => {}} />);

    expect(screen.getByText('Acudiente')).toBeOnTheScreen();
    expect(screen.getByText('Paula Gómez')).toBeOnTheScreen();
    expect(screen.getByText('paula.gomez@example.com')).toBeOnTheScreen();
  });

  it('lists the best marks with the event and the time, and the source tag when imported', async () => {
    await render(<AthleteDetail athlete={detailFixture} onViewProfile={() => {}} />);

    expect(screen.getByRole('header', { name: 'Mejores marcas' })).toBeOnTheScreen();
    expect(screen.getByLabelText('Libre 50, 34 segundos con 82 centésimas')).toBeOnTheScreen();
    expect(screen.getByText('34,82', hidden)).toBeOnTheScreen();
    expect(screen.getByText('1:19,66', hidden)).toBeOnTheScreen();
    expect(screen.getByLabelText(`Libre 100, 1 minuto, 19 segundos con 66 centésimas, ${sourceFixture}`)).toBeOnTheScreen();
    expect(StyleSheet.flatten(screen.getByLabelText(sourceFixture, hidden).props.style).backgroundColor).toBe(colors.light['primary-tint']);
    expect(screen.queryByLabelText('Libre 50', hidden)).toBeNull();
  });

  it('puts the source and the time below the event name at 200 % text, and beside it at 100 %', async () => {
    const row = () => StyleSheet.flatten(screen.getByText('Libre 100', hidden).parent!.props.style);
    await render(<AthleteDetail athlete={detailFixture} onViewProfile={() => {}} />);
    expect(row().flexDirection).toBe('row');
    expect(StyleSheet.flatten(screen.getByText('Libre 100', hidden).props.style).flexShrink).not.toBe(0);

    await screen.unmount();
    await render(<ThemeProvider fontScale={2}><AthleteDetail athlete={detailFixture} onViewProfile={() => {}} /></ThemeProvider>);
    expect(row().flexDirection).toBe('column');
    // The event name keeps its own line, whole.
    expect(StyleSheet.flatten(screen.getByText('Libre 100', hidden).props.style).flex).toBeUndefined();
  });

  it('shows a dash for a mark without time and says there are none when the list is empty', async () => {
    await render(
      <AthleteDetail
        athlete={{ ...detailFixture, bests: [{ id: 'x', event: 'Pecho 50', time: null }] }}
        onViewProfile={() => {}}
      />,
    );
    expect(screen.getByText('—', hidden)).toBeOnTheScreen();
    expect(screen.getByLabelText('Pecho 50, sin tiempo')).toBeOnTheScreen();
    expect(screen.queryByText('0,00', hidden)).toBeNull();

    await screen.rerender(<AthleteDetail athlete={detailsFixture.a3} onViewProfile={() => {}} />);
    expect(screen.getByText('Aún no hay marcas')).toBeOnTheScreen();
  });

  it('renders a best mark with an empty source without the tag', async () => {
    await render(
      <AthleteDetail
        athlete={{ ...detailFixture, bests: [{ id: 'x', event: 'Libre 50', time: 3482, source: '' }] }}
        onViewProfile={() => {}}
      />,
    );

    expect(screen.getByLabelText('Libre 50, 34 segundos con 82 centésimas')).toBeOnTheScreen();
    // A bare string inside a View throws on device ("Text strings must be rendered within a <Text>"); jest does not.
    const bareStrings = (node: unknown): string[] =>
      Array.isArray(node)
        ? node.flatMap(bareStrings)
        : node && typeof node === 'object'
          ? (((node as { type: string; children: unknown[] | null }).children ?? []) as unknown[]).flatMap((child) =>
              typeof child === 'string' ? (node as { type: string }).type === 'Text' ? [] : [child] : bareStrings(child),
            )
          : [];
    expect(bareStrings(screen.toJSON())).toEqual([]);
  });

  it('opens the full profile from a secondary button', async () => {
    const onViewProfile = jest.fn();
    await render(<AthleteDetail athlete={detailFixture} onViewProfile={onViewProfile} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Ver perfil completo' }));

    expect(onViewProfile).toHaveBeenCalledTimes(1);
    expect(StyleSheet.flatten(screen.getByRole('button', { name: 'Ver perfil completo' }).props.style).borderColor).toBe(colors.light.border);
  });

  it('never shows a document, a document status or a birth date', async () => {
    await render(<AthleteDetail athlete={detailFixture} onViewProfile={() => {}} />);

    expect(screen.queryByText(/documento|nacimiento|cédula|identificaci/i, hidden)).toBeNull();
    expect(screen.queryByLabelText(/documento|nacimiento|cédula|identificaci/i, hidden)).toBeNull();
  });

  it('wraps a long name', async () => {
    const name = 'María Fernanda de los Ángeles Restrepo Villegas';
    await render(<AthleteDetail athlete={{ ...detailFixture, name }} onViewProfile={() => {}} />);

    expect(screen.getByRole('header', { name })).toBeOnTheScreen();
  });

  it.each(themes)('keeps the texts readable in the %s theme', (theme) => {
    const c = colors[theme];
    expect(contrastRatio(c[athleteDetailColors.title], c[athleteDetailColors.background])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c[athleteDetailColors.caption], c[athleteDetailColors.background])).toBeGreaterThanOrEqual(4.5);
  });
});

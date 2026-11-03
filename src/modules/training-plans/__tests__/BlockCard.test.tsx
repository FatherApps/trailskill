import { render, screen } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';

import { colors, contrastRatio, space, type ThemeName } from '../../../core/theme';
import { phaseColors } from '../components/PhaseTag';
import { BlockCard } from '../components/BlockCard';
import { plansFixture } from '../__fixtures__/plans';
import type { BlockPhase, BlockRecording } from '../types';
import { strokeOf } from '../vocabulary';

const { vocabulary, blocks } = plansFixture;
const PHASE_LABEL: Record<BlockPhase, string> = { warm_up: 'Calentamiento', main: 'Principal', technique: 'Técnica', cool_down: 'Enfriamiento' };

describe('BlockCard', () => {
  it('shows the repetitions, distance and activity label', async () => {
    await render(<BlockCard block={{ ...blocks[0], repetitions: 4, distance: 100 }} vocabulary={vocabulary} />);

    expect(screen.getByText('4 × 100 m Libre')).toBeOnTheScreen();
  });

  it('falls back to the raw value for an unknown activity', async () => {
    await render(<BlockCard block={{ ...blocks[0], activity: 'unknown' }} vocabulary={vocabulary} />);

    expect(screen.getByText('1 × 200 m unknown')).toBeOnTheScreen();
  });

  it('shows the equipment line only when there is equipment', async () => {
    await render(<BlockCard block={blocks[2]} vocabulary={vocabulary} />);
    expect(screen.getByText('Implementos: Aletas, Tabla')).toBeOnTheScreen();

    await render(<BlockCard block={blocks[0]} vocabulary={vocabulary} />);
    expect(screen.queryByText(/^Implementos/)).toBeNull();
  });

  it('shows the send-off line only when there is a send-off', async () => {
    await render(<BlockCard block={{ ...blocks[1], sendOffSeconds: 90 }} vocabulary={vocabulary} />);
    expect(screen.getByText('Salida cada 1:30')).toBeOnTheScreen();

    await render(<BlockCard block={{ ...blocks[1], sendOffSeconds: null }} vocabulary={vocabulary} />);
    expect(screen.queryByText(/^Salida cada/)).toBeNull();
  });

  it('shows no recording line while the recording is not chosen yet', async () => {
    await render(<BlockCard block={{ ...blocks[0], recording: null }} vocabulary={vocabulary} />);

    expect(screen.getByText('1 × 200 m Libre')).toBeOnTheScreen();
    expect(screen.queryByText(/^Registro:/)).toBeNull();
  });

  it.each<[BlockRecording, string]>([
    ['completion', 'Registro: solo cumplimiento'],
    ['per_repetition', 'Registro: un tiempo por repetición'],
    ['series_total', 'Registro: total de la serie'],
  ])('shows the %s recording', async (recording, text) => {
    await render(<BlockCard block={{ ...blocks[0], recording }} vocabulary={vocabulary} />);

    expect(screen.getByText(text)).toBeOnTheScreen();
  });

  it.each<[BlockPhase, string]>([
    ['warm_up', 'Calentamiento'],
    ['main', 'Principal'],
    ['technique', 'Técnica'],
    ['cool_down', 'Enfriamiento'],
  ])('shows the %s phase as text', async (phase, text) => {
    await render(<BlockCard block={{ ...blocks[0], phase }} vocabulary={vocabulary} />);

    expect(screen.getByText(text, { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByLabelText(text)).toBeOnTheScreen();
  });

  it.each<BlockPhase>(['warm_up', 'main', 'technique', 'cool_down'])('fills the card with the %s phase colour and its text colour', async (phase) => {
    await render(<BlockCard block={{ ...blocks[0], phase }} vocabulary={vocabulary} />);

    expect(screen.getByTestId('block-card')).toHaveStyle({ backgroundColor: colors.light[phaseColors[phase].background] });
    expect(screen.getByText('1 × 200 m Libre')).toHaveStyle({ color: colors.light[phaseColors[phase].text] });
  });

  it('renders the footer slot', async () => {
    await render(
      <BlockCard block={blocks[0]} vocabulary={vocabulary}>
        <Text>Footer</Text>
      </BlockCard>,
    );

    expect(screen.getByText('Footer')).toBeOnTheScreen();
  });
});

describe('BlockCard row', () => {
  it('draws the phase colour as a bar and the phase as text in a single caption line', async () => {
    await render(<BlockCard variant="row" block={blocks[1]} vocabulary={vocabulary} />);

    expect(screen.getByText('8 × 50 m Libre')).toBeOnTheScreen();
    expect(screen.getByText('Principal · Salida cada 1:00 · Implementos: Paletas')).toBeOnTheScreen();
    expect(screen.getByTestId('phase-bar')).toHaveStyle({ width: space[1], backgroundColor: colors.light[phaseColors.main.background] });
  });

  it('leaves out the send-off and the equipment of a block without them', async () => {
    await render(<BlockCard variant="row" block={blocks[0]} vocabulary={vocabulary} />);

    expect(screen.getByText('Calentamiento')).toBeOnTheScreen();
  });

  it('renders the trailing slot beside the text and the children below it', async () => {
    await render(
      <BlockCard variant="row" block={blocks[0]} vocabulary={vocabulary} trailing={<Text>Trailing</Text>}>
        <Text>Footer</Text>
      </BlockCard>,
    );

    expect(screen.getByText('Trailing')).toBeOnTheScreen();
    expect(screen.getByText('Footer')).toBeOnTheScreen();
  });

  it('keeps the card layout by default, with no phase bar', async () => {
    await render(<BlockCard block={blocks[1]} vocabulary={vocabulary} />);

    expect(screen.queryByTestId('phase-bar')).toBeNull();
  });
});

describe('phaseColors', () => {
  const themes: ThemeName[] = ['light', 'dark'];

  it.each(Object.keys(phaseColors).flatMap((phase) => themes.map((theme) => [phase, theme] as const)))(
    '%s keeps 4.5:1 contrast in %s theme',
    (phase, theme) => {
      const { background, text } = phaseColors[phase as BlockPhase];

      expect(contrastRatio(colors[theme][text], colors[theme][background])).toBeGreaterThanOrEqual(4.5);
    },
  );
});

describe('PhaseTag on its card', () => {
  it.each<BlockPhase>(['warm_up', 'main', 'technique', 'cool_down'])('keeps the %s tag a chip: its own fill and border, apart from the card fill', async (phase) => {
    await render(<BlockCard block={{ ...blocks[0], phase }} vocabulary={vocabulary} />);

    const tag = StyleSheet.flatten(screen.getByLabelText(PHASE_LABEL[phase]).props.style);
    expect(tag.backgroundColor).not.toBe(colors.light[phaseColors[phase].background]);
    expect(tag.backgroundColor).toBe(colors.light['surface-1']);
    expect(tag.borderWidth).toBeGreaterThan(0);
    expect(tag.borderColor).toBe(colors.light['border-strong']);
  });

  it.each<ThemeName>(['light', 'dark'])('keeps 4.5:1 contrast for the tag text on its surface-1 fill in %s theme', (theme) => {
    expect(contrastRatio(colors[theme].ink, colors[theme]['surface-1'])).toBeGreaterThanOrEqual(4.5);
  });
});

// One path only the backstroke glyph draws, so the icon is checked for its stroke and not just for being there.
const BACKSTROKE_PATH = 'M20 18.5 17 5';
const paths = () => screen.container.queryAll((node) => node.type === 'RNSVGPath').map((node) => node.props.d as string);

describe('BlockCard stroke icon', () => {
  it('shows the icon of the block stroke at the top right, 12 dp from the edges, over the brand colour', async () => {
    await render(<BlockCard block={{ ...blocks[0], activity: 'BK' }} vocabulary={vocabulary} />);

    expect(paths()).toContain(BACKSTROKE_PATH);
    expect(StyleSheet.flatten(screen.getByTestId('block-stroke-icon').props.style)).toMatchObject({ position: 'absolute', top: space[3], right: space[3] });
    // The card is a brand colour: the onColor variant puts its 75 % white backing behind the glyph.
    expect(screen.container.queryAll((node) => node.props?.style && StyleSheet.flatten(node.props.style)?.opacity === 0.75)).not.toHaveLength(0);
  });

  it('reserves 64 dp on the right so the title never sits under the icon, and the card grows with the text', async () => {
    await render(<BlockCard block={{ ...blocks[0], activity: 'BK' }} vocabulary={vocabulary} />);

    const card = StyleSheet.flatten(screen.getByTestId('block-card').props.style);
    expect(card.paddingRight).toBeGreaterThanOrEqual(64);
    expect(card.height).toBeUndefined();
  });

  it.each(['Patada', 'unknown', ''])('shows no icon for the activity %p, which has no pictogram', async (activity) => {
    await render(<BlockCard block={{ ...blocks[0], activity }} vocabulary={vocabulary} />);

    expect(screen.queryByTestId('block-stroke-icon')).toBeNull();
    expect(paths()).toHaveLength(0);
  });

  it('keeps the usual padding on a card without icon', async () => {
    await render(<BlockCard block={{ ...blocks[0], activity: 'Patada' }} vocabulary={vocabulary} />);

    const card = StyleSheet.flatten(screen.getByTestId('block-card').props.style);
    expect(card.padding).toBe(space[5]);
    expect(card.paddingRight).toBeUndefined();
  });

  it('is decorative: the stroke is read once, by the summary text', async () => {
    await render(<BlockCard block={{ ...blocks[0], activity: 'BK' }} vocabulary={vocabulary} />);

    expect(screen.queryByRole('image')).toBeNull();
    expect(screen.queryByLabelText('Espalda')).toBeNull();
    expect(screen.getByText('1 × 200 m Espalda')).toBeOnTheScreen();
  });

  it('shows the small icon before the name in a row, and none for a drill', async () => {
    const { rerender } = await render(<BlockCard variant="row" block={{ ...blocks[0], activity: 'BK' }} vocabulary={vocabulary} />);

    expect(paths()).toContain(BACKSTROKE_PATH);
    expect(StyleSheet.flatten(screen.getByTestId('block-stroke-icon').props.style)).not.toHaveProperty('position');
    expect(screen.queryByRole('image')).toBeNull();

    await rerender(<BlockCard variant="row" block={{ ...blocks[0], activity: 'Patada' }} vocabulary={vocabulary} />);
    expect(screen.queryByTestId('block-stroke-icon')).toBeNull();
  });
});

describe('strokeOf', () => {
  it.each(['FR', 'BK', 'BR', 'FL', 'IM'])('keeps the stroke code %s', (code) => {
    expect(strokeOf(code)).toBe(code);
  });

  it.each(['Patada', 'fr', ''])('returns null for %p, which is no stroke', (value) => {
    expect(strokeOf(value)).toBeNull();
  });
});

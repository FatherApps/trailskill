import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { colors, contrastRatio, type ThemeName } from '../../../core/theme';
import { phaseColors } from '../components/PhaseTag';
import { BlockCard } from '../components/BlockCard';
import { plansFixture } from '../__fixtures__/plans';
import type { BlockPhase, BlockRecording } from '../types';

const { vocabulary, blocks } = plansFixture;

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

  it('renders the footer slot', async () => {
    await render(
      <BlockCard block={blocks[0]} vocabulary={vocabulary}>
        <Text>Footer</Text>
      </BlockCard>,
    );

    expect(screen.getByText('Footer')).toBeOnTheScreen();
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

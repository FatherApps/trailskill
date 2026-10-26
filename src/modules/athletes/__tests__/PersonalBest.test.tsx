import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { colors, contrastRatio, space, typography, radius, type ThemeName } from '../../../core/theme';
import { personalBestFixture as f } from '../__fixtures__/profile';
import { PersonalBest, personalBestColors, type PersonalBestProps } from '../components/PersonalBest';

const themes: ThemeName[] = ['light', 'dark'];

const base: PersonalBestProps = {
  stroke: f.stroke,
  distance: f.distance,
  pool: f.pool,
  best: f.best,
  improvement: f.improvement,
  kind: 'competition',
  date: f.date,
};

const hidden = { includeHiddenElements: true };
const style = (node: { props: { style?: unknown } }) => StyleSheet.flatten(node.props.style as never);

describe('PersonalBest', () => {
  it('shows the caption, the time, the improvement and the kind with the date', async () => {
    await render(<PersonalBest {...base} />);

    expect(screen.getByText('Marca personal · Libre 50 m (piscina de 25 m)', hidden)).toBeOnTheScreen();
    expect(screen.getByText('34,82', hidden)).toBeOnTheScreen();
    expect(screen.getByText('−2,28 en 6 meses', hidden)).toBeOnTheScreen();
    expect(screen.getByText('Competencia · 18 oct 2026', hidden)).toBeOnTheScreen();
  });

  it('draws the time at the time-lg size', async () => {
    await render(<PersonalBest {...base} />);

    expect(style(screen.getByText('34,82', hidden)).fontSize).toBe(typography['time-lg'].fontSize);
  });

  it('is one accessible element with a composed label', async () => {
    await render(<PersonalBest {...base} />);

    expect(
      screen.getByLabelText(
        'Marca personal, Libre 50 m, piscina de 25 m, 34 segundos con 82 centésimas, mejoró 2 segundos con 28 centésimas en 6 meses, Competencia, 18 de octubre de 2026',
      ),
    ).toBeOnTheScreen();
    expect(screen.queryAllByText(/./)).toHaveLength(0);
  });

  it('says one month in the singular', async () => {
    await render(<PersonalBest {...base} improvement={{ hundredths: 50, months: 1 }} />);

    expect(screen.getByText('−0,50 en 1 mes', hidden)).toBeOnTheScreen();
  });

  it('draws the improvement in success with an upward arrow', async () => {
    await render(<PersonalBest {...base} />);

    expect(style(screen.getByText('−2,28 en 6 meses', hidden)).color).toBe(colors.light.success);
    expect(screen.container.queryAll((node) => node.type === 'RNSVGPath')).toHaveLength(1);
  });

  it('shows the improvement as a success tag beside the time', async () => {
    await render(<PersonalBest {...base} />);

    const tag = screen.getByLabelText('−2,28 en 6 meses', hidden);
    expect(style(tag).backgroundColor).toBe(colors.light['success-bg']);
    expect(style(tag.parent!).flexDirection).toBe('row');
  });

  it('shows no improvement when there is none', async () => {
    await render(<PersonalBest {...base} improvement={undefined} />);

    expect(screen.queryByText(/−/, hidden)).toBeNull();
    expect(screen.container.queryAll((node) => node.type === 'RNSVGPath')).toHaveLength(0);
    expect(screen.getByLabelText(/^Marca personal, Libre 50 m, piscina de 25 m, 34 segundos con 82 centésimas, Competencia/))
      .toBeOnTheScreen();
  });

  it('shows a dash, never 0,00, and no improvement when there is no best time', async () => {
    await render(<PersonalBest {...base} best={null} kind={undefined} date={undefined} />);

    expect(screen.getByText('—', hidden)).toBeOnTheScreen();
    expect(screen.queryByText('0,00', hidden)).toBeNull();
    expect(screen.queryByText(/−/, hidden)).toBeNull();
    expect(screen.getByLabelText('Marca personal, Libre 50 m, piscina de 25 m, Sin marca personal')).toBeOnTheScreen();
  });

  it('names a training and formats its date', async () => {
    await render(<PersonalBest {...base} kind="training" date={f.trainingDate} />);

    expect(screen.getByText('Entrenamiento · 5 sep 2026', hidden)).toBeOnTheScreen();
    expect(screen.getByLabelText(/, Entrenamiento, 5 de septiembre de 2026$/)).toBeOnTheScreen();
  });

  it.each([
    ['only the kind', { kind: 'competition' as const, date: undefined }, 'Competencia'],
    ['only the date', { kind: undefined, date: f.date }, '18 oct 2026'],
    ['an invalid date', { kind: 'competition' as const, date: '18/10/2026' }, 'Competencia'],
  ])('omits what is missing with %s', async (_name, props, caption) => {
    await render(<PersonalBest {...base} {...props} />);

    expect(screen.getByText(caption, hidden)).toBeOnTheScreen();
  });

  it('shows no last caption without kind and date', async () => {
    await render(<PersonalBest {...base} kind={undefined} date={undefined} />);

    expect(screen.queryByText(/Competencia|Entrenamiento|·.*\d{4}/, hidden)).toBeNull();
  });

  it('is a surface-1 card with the design radius and padding', async () => {
    await render(<PersonalBest {...base} />);

    expect(style(screen.getByLabelText(/^Marca personal/))).toMatchObject({
      backgroundColor: colors.light['surface-1'],
      borderRadius: radius.md,
      padding: space[4],
    });
  });

  describe.each(themes)('%s theme contrast', (theme) => {
    const c = colors[theme];

    it.each([
      [personalBestColors.caption, personalBestColors.background],
      [personalBestColors.delta, 'success-bg'],
      [personalBestColors.time, personalBestColors.background],
    ] as const)('%s on %s is at least 4.5:1', (text, background) => {
      expect(contrastRatio(c[text], c[background])).toBeGreaterThanOrEqual(4.5);
    });
  });
});

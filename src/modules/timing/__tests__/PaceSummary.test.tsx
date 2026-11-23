import { render, screen } from '@testing-library/react-native';

import { ThemeProvider } from '../../../core/theme';
import { formatTime } from '../../../core/time';
import { PaceSummary, type PaceSummaryProps } from '../components/PaceSummary';

const OPTIMISTIC = 'Estimación optimista; la mayoría pierde ritmo al final';

// Synthetic 100 m: marks at 25/50/75 m in hundredths, finished in 66,00 s.
const marks = [
  { t: 1500, meters: 25 },
  { t: 3100, meters: 50 },
  { t: 4800, meters: 75 },
];

async function renderSummary(props: Partial<PaceSummaryProps> = {}) {
  await render(
    <ThemeProvider>
      <PaceSummary marks={marks} finalTime={6600} distance={100} formatTime={(v) => formatTime(v)} {...props} />
    </ThemeProvider>,
  );
}

describe('PaceSummary', () => {
  it('shows the pace per segment, the halves, the consistency and the projection of a 100 m with marks at 25/50/75 m', async () => {
    await renderSummary();

    expect(screen.getByText('0–25 m · 15,00 · 1:00,00 / 100 m')).toBeOnTheScreen();
    expect(screen.getByText('75–100 m · 18,00 · 1:12,00 / 100 m')).toBeOnTheScreen();
    expect(screen.getByText('1.ª mitad 31,00 · 2.ª mitad 35,00 · +4,00')).toBeOnTheScreen();
    expect(screen.getByText(/^Consistencia \d+,\d %/)).toBeOnTheScreen();
    // t75 + 25 m at the pace after the start segment: (4800 - 1500) / 50 m = 66 per meter, 25 m left: 4800 + 1650.
    expect(screen.getByText('Si mantiene este ritmo: 1:04,50')).toBeOnTheScreen();
    expect(screen.getByText(OPTIMISTIC)).toBeOnTheScreen();
  });

  it('does not show the projection with a single mark with meters', async () => {
    await renderSummary({ marks: [{ t: 3100, meters: 50 }] });

    expect(screen.queryByText(/Si mantiene este ritmo/)).not.toBeOnTheScreen();
    expect(screen.queryByText(OPTIMISTIC)).not.toBeOnTheScreen();
    expect(screen.getByText('0–50 m · 31,00 · 1:02,00 / 100 m')).toBeOnTheScreen();
  });

  it('ignores the marks without meters', async () => {
    await renderSummary({ marks: [{ t: 1500, meters: null }, { t: 3100, meters: 50 }] });

    expect(screen.queryByText(/Si mantiene este ritmo/)).not.toBeOnTheScreen();
    expect(screen.getByText('0–50 m · 31,00 · 1:02,00 / 100 m')).toBeOnTheScreen();
  });

  it('shows nothing when there is no mark with meters', async () => {
    await renderSummary({ marks: [{ t: 1500, meters: null }] });

    expect(screen.queryByText('Ritmo y proyección')).not.toBeOnTheScreen();
  });

  it('shows no halves when the half of the distance has no mark', async () => {
    await renderSummary({ marks: [{ t: 1500, meters: 25 }, { t: 4800, meters: 75 }] });

    expect(screen.queryByText(/mitad/)).not.toBeOnTheScreen();
    expect(screen.getByText(/Si mantiene este ritmo/)).toBeOnTheScreen();
  });
});

import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { colors, contrastRatio, size, type ThemeName } from '../../../core/theme';
import { historyFixture, historyResults } from '../__fixtures__/history';
import { HistoryList, type HistoryResult } from '../components/HistoryList';

const themes: ThemeName[] = ['light', 'dark'];
const byId = (id: string): HistoryResult => historyResults.find((result) => result.id === id)!;
const hiddenText = (text: string | RegExp) => screen.queryAllByText(text, { includeHiddenElements: true });

describe('HistoryList', () => {
  it('renders nothing without results', async () => {
    await render(<HistoryList results={[]} />);

    expect(screen.toJSON()).toBeNull();
  });

  it('is virtualized: it renders only the first window of a long history', async () => {
    const many = Array.from({ length: 40 }, (_, index) => ({ ...byId('race-pb'), id: `r-${index}` }));
    await render(<HistoryList results={many} />);

    const rows = screen.getAllByLabelText(/^Libre 50 m/);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(many.length);
  });

  it.each([
    ['race-pb', 'Libre 50 m, 18 de octubre de 2026, Competencia, 34 segundos con 82 centésimas, Marca personal'],
    ['repetition', 'Libre 50 m, 16 de octubre de 2026, Entrenamiento, Rep. 3, 35 segundos con 73 centésimas'],
    [
      'series-total',
      'Libre 200 m, 16 de octubre de 2026, Entrenamiento, Total serie, 2 minutos, 33 segundos con 80 centésimas',
    ],
    ['split', 'Libre 100 m, 11 de octubre de 2026, Competencia, Parcial 25 m, 16 segundos con 40 centésimas'],
    ['completed', 'Espalda 100 m, 9 de octubre de 2026, Entrenamiento, Completado, sin tiempo'],
    ['missing-time', 'Pecho 50 m, 9 de octubre de 2026, Entrenamiento, Sin registro'],
    ['on-device', 'Mariposa 50 m, 24 de octubre de 2026, Entrenamiento, 41 segundos con 20 centésimas, En el teléfono'],
    [
      'not-sent',
      'Combinado 200 m, 24 de octubre de 2026, Entrenamiento, 2 minutos, 42 segundos con 10 centésimas, No enviado',
    ],
    ['import', 'Mariposa 100 m, 7 de marzo de 2026, Competencia, FEDNAT, 1 minuto, 18 segundos con 55 centésimas'],
    [
      'external-timer',
      'Pecho 100 m, 20 de septiembre de 2026, Entrenamiento, Botón externo, 1 minuto, 22 segundos con 10 centésimas',
    ],
    [
      'other-school',
      'Espalda 50 m, 15 de agosto de 2026, Competencia, Otra escuela: Club Acuático Norte, 39 segundos con 5 centésimas',
    ],
  ])('makes the %s row one accessible element with a composed label', async (id, label) => {
    await render(<HistoryList results={[byId(id)]} />);

    expect(screen.getByLabelText(label)).toBeOnTheScreen();
    // The row label says everything: its parts are hidden from screen readers.
    expect(screen.queryAllByText(/./)).toHaveLength(0);
    expect(hiddenText(/./).length).toBeGreaterThan(0);
  });

  it('labels repetition, series total, split and race differently', async () => {
    await render(<HistoryList results={['race-pb', 'repetition', 'series-total', 'split'].map(byId)} />);

    expect(hiddenText(/18 oct 2026 · Competencia$/)).toHaveLength(1);
    expect(hiddenText('16 oct 2026 · Entrenamiento · Rep. 3')).toHaveLength(1);
    expect(hiddenText('16 oct 2026 · Entrenamiento · Total serie')).toHaveLength(1);
    expect(hiddenText('11 oct 2026 · Competencia · Parcial 25 m')).toHaveLength(1);
  });

  it('shows the origin as text in a Tag for each origin but the own one', async () => {
    await render(<HistoryList results={['race-pb', 'import', 'external-timer', 'other-school'].map(byId)} />);

    expect(hiddenText(historyFixture.sourceName)).toHaveLength(1);
    expect(hiddenText('Botón externo')).toHaveLength(1);
    expect(hiddenText(`Otra escuela: ${historyFixture.otherSchool}`)).toHaveLength(1);
  });

  it('shows no origin for an own result', async () => {
    await render(<HistoryList results={[byId('race-pb')]} />);

    for (const origin of ['Importado', 'Botón externo', /Otra escuela/, historyFixture.sourceName]) {
      expect(hiddenText(origin)).toHaveLength(0);
    }
  });

  it('falls back to a generic origin text when the data has no source name', async () => {
    await render(
      <HistoryList
        results={[
          { ...byId('import'), sourceName: undefined },
          { ...byId('other-school'), sourceName: undefined },
        ]}
      />,
    );

    expect(hiddenText('Importado')).toHaveLength(1);
    expect(hiddenText('Otra escuela')).toHaveLength(1);
  });

  it('shows a missing time as "—", never as 0,00', async () => {
    await render(<HistoryList results={[byId('missing-time')]} />);

    expect(hiddenText('—')).toHaveLength(1);
    expect(hiddenText(/0,00/)).toHaveLength(0);
    expect(screen.getByLabelText(/Sin registro/)).toBeOnTheScreen();
  });

  it('shows "Completado" for a result completed without a time', async () => {
    await render(<HistoryList results={[byId('completed')]} />);

    expect(hiddenText('Completado')).toHaveLength(1);
    expect(hiddenText('—')).toHaveLength(0);
    expect(hiddenText(/0,00/)).toHaveLength(0);
  });

  it('marks a personal best with MP', async () => {
    await render(<HistoryList results={[byId('race-pb'), byId('repetition')]} />);

    expect(hiddenText('MP')).toHaveLength(1);
  });

  it('shows the sync status only when the result is not synced', async () => {
    await render(<HistoryList results={[byId('race-pb')]} />);
    expect(screen.queryAllByTestId('sync-status', { includeHiddenElements: true })).toHaveLength(0);

    await render(<HistoryList results={[byId('on-device'), byId('not-sent'), byId('repetition')]} />);
    expect(screen.queryAllByTestId('sync-status', { includeHiddenElements: true })).toHaveLength(2);
    expect(hiddenText('En el teléfono')).toHaveLength(1);
    expect(hiddenText('No enviado')).toHaveLength(1);
  });

  it('uses the date helper: a malformed date is left out of the label', async () => {
    await render(<HistoryList results={[{ ...byId('race-pb'), date: 'ayer' }]} />);

    expect(
      screen.getByLabelText('Libre 50 m, Competencia, 34 segundos con 82 centésimas, Marca personal'),
    ).toBeOnTheScreen();
  });

  it('gives every row at least the minimum touch target height and no fixed width', async () => {
    await render(<HistoryList results={[byId('race-pb')]} />);

    const style = StyleSheet.flatten(screen.getAllByLabelText(/^Libre 50 m/)[0].props.style);
    expect(style.minHeight).toBe(size['target-min']);
    expect(style.width).toBeUndefined();
  });

  describe.each(themes)('%s theme contrast', (theme) => {
    it('keeps ink and ink-muted readable on the card surface', () => {
      const c = colors[theme];
      expect(contrastRatio(c.ink, c['surface-1'])).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(c['ink-muted'], c['surface-1'])).toBeGreaterThanOrEqual(4.5);
    });
  });
});

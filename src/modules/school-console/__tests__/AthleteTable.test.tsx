import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { colors, contrastRatio, type ThemeName } from '../../../core/theme';
import { spokenTime } from '../../../core/time';
import { athletesFixture, longTextAthleteFixture } from '../__fixtures__/athletes';
import { AthleteTable, athleteTableColors, type AthleteTableProps } from '../components/AthleteTable';

const themes: ThemeName[] = ['light', 'dark'];
const hidden = { includeHiddenElements: true };

const base: AthleteTableProps = {
  athletes: athletesFixture,
  bestLabel: 'MP Libre 50',
  selectedId: null,
  onSelect: () => {},
};

describe('AthleteTable', () => {
  describe('as a table', () => {
    it('has the six columns, the last one named by the event passed in', async () => {
      await render(<AthleteTable {...base} />);

      for (const column of ['Deportista', 'Categoría', 'Grupo', 'Entrenador', 'Autorización', 'MP Libre 50']) {
        expect(screen.getByText(column)).toBeOnTheScreen();
      }
    });

    it('lists one pressable row per athlete that says all its cells', async () => {
      await render(<AthleteTable {...base} />);

      expect(screen.getAllByRole('button')).toHaveLength(athletesFixture.length);
      expect(screen.getByRole('button', { name: `Lucía Ramírez, Infantil B, Grupo B, Paula G., Vigente, MP Libre 50: ${spokenTime(3482)}` })).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Sara Peña, Infantil B, Grupo B, Paula G., Pendiente, MP Libre 50: sin marca' })).toBeOnTheScreen();
    });

    it('shows the authorization as a tag, ok when valid and warn when pending', async () => {
      await render(<AthleteTable {...base} />);

      const valid = StyleSheet.flatten(screen.getAllByLabelText('Vigente', hidden)[0].props.style);
      const pending = StyleSheet.flatten(screen.getByLabelText('Pendiente', hidden).props.style);
      expect(valid.backgroundColor).toBe(colors.light['success-bg']);
      expect(pending.backgroundColor).toBe(colors.light['warning-bg']);
    });

    it('prints the time in mono and a dash when there is none, never 0,00', async () => {
      await render(<AthleteTable {...base} />);

      expect(screen.getByText('34,82', hidden)).toBeOnTheScreen();
      expect(screen.getByText('36,47', hidden)).toBeOnTheScreen();
      expect(screen.getAllByText('—', hidden)).toHaveLength(1);
      expect(screen.queryByText('0,00', hidden)).toBeNull();
      expect(StyleSheet.flatten(screen.getByText('34,82', hidden).props.style).fontFamily).toBe('IBMPlexMono_500Medium');
    });

    it('right-aligns the time column', async () => {
      await render(<AthleteTable {...base} />);

      expect(StyleSheet.flatten(screen.getByText('34,82', hidden).parent!.props.style).alignItems).toBe('flex-end');
      expect(StyleSheet.flatten(screen.getByText('MP Libre 50').props.style).textAlign).toBe('right');
    });

    it('marks the selected row with the tint and the selected state', async () => {
      await render(<AthleteTable {...base} selectedId="a2" />);

      const selected = screen.getByRole('button', { name: /^Mateo Castro/ });
      expect(selected).toBeSelected();
      expect(StyleSheet.flatten(selected.props.style).backgroundColor).toBe(colors.light['primary-tint']);
      const other = screen.getByRole('button', { name: /^Lucía Ramírez/ });
      expect(other).not.toBeSelected();
      expect(StyleSheet.flatten(other.props.style).backgroundColor).toBe(colors.light['surface-1']);
    });

    it('reports the pressed athlete and keeps every row at least 48 dp high', async () => {
      const onSelect = jest.fn();
      await render(<AthleteTable {...base} onSelect={onSelect} />);

      await fireEvent.press(screen.getByRole('button', { name: /^Julián Ortiz/ }));

      expect(onSelect).toHaveBeenCalledWith('a4');
      for (const row of screen.getAllByRole('button')) {
        expect(StyleSheet.flatten(row.props.style).minHeight).toBeGreaterThanOrEqual(48);
      }
    });

    it('wraps long text instead of clipping it', async () => {
      await render(<AthleteTable {...base} athletes={[longTextAthleteFixture]} />);

      expect(screen.getByText(longTextAthleteFixture.name, hidden)).toBeOnTheScreen();
      expect(screen.getByText('2:09,66', hidden)).toBeOnTheScreen();
    });

    it('has no horizontal scroll', async () => {
      await render(<AthleteTable {...base} />);

      expect(JSON.stringify(screen.toJSON())).not.toContain('RCTScrollView');
    });
  });

  describe('as a list (compact)', () => {
    it('shows a SwimmerRow per athlete with category, group and coach, and no column headers', async () => {
      await render(<AthleteTable {...base} compact />);

      expect(screen.queryByText('Deportista')).toBeNull();
      expect(screen.getAllByRole('button')).toHaveLength(athletesFixture.length);
      expect(screen.getByRole('button', { name: /^Lucía Ramírez, Infantil B · Grupo B · Paula G\./ })).toBeOnTheScreen();
      expect(screen.getAllByText('MP Libre 50', hidden)).toHaveLength(athletesFixture.length);
    });

    it('shows a dash for a missing time and the pending authorization tag', async () => {
      await render(<AthleteTable {...base} compact />);

      expect(screen.getByRole('button', { name: /^Sara Peña/ })).toBeOnTheScreen();
      expect(screen.getAllByText('—', hidden)).toHaveLength(1);
      expect(screen.queryByText('0,00', hidden)).toBeNull();
      expect(screen.getByLabelText('Pendiente', hidden)).toBeOnTheScreen();
    });

    it('selects, reports the pressed athlete and does not scroll sideways', async () => {
      const onSelect = jest.fn();
      await render(<AthleteTable {...base} compact selectedId="a1" onSelect={onSelect} />);

      expect(screen.getByRole('button', { name: /^Lucía Ramírez/ })).toBeSelected();
      await fireEvent.press(screen.getByRole('button', { name: /^Mateo Castro/ }));
      expect(onSelect).toHaveBeenCalledWith('a2');
      expect(JSON.stringify(screen.toJSON())).not.toContain('RCTScrollView');
    });
  });

  it.each(themes)('keeps the headers and the selected row readable in the %s theme', (theme) => {
    const c = colors[theme];
    expect(contrastRatio(c[athleteTableColors.header], c[athleteTableColors.background])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c[athleteTableColors.text], c[athleteTableColors.background])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c[athleteTableColors.text], c[athleteTableColors.selected])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c[athleteTableColors.header], c[athleteTableColors.selected])).toBeGreaterThanOrEqual(4.5);
  });
});

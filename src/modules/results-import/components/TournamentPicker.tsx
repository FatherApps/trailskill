import { Pressable, Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { Banner, Button, ChipRow, StateView, TextField } from '../../../core/ui';
import type { CalendarMonth } from '../data/tournamentCalendar';
import type { TournamentCatalogEntry, TournamentGroup } from '../data/tournamentCatalog';
import { MonthCalendar } from './MonthCalendar';
import { formatTournamentDate } from './tournamentDates';

export type TournamentPickerProps = {
  athleteName: string;
  online: boolean;
  text: string;
  onChangeText: (text: string) => void;
  years: number[];
  // null is «Todos».
  year: number | null;
  onChangeYear: (year: number | null) => void;
  calendarOpen: boolean;
  onToggleCalendar: () => void;
  month: CalendarMonth;
  counts: Record<string, number>;
  dateKey: string | null;
  onSelectDay: (dateKey: string) => void;
  onClearDay: () => void;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
  groups: TournamentGroup[];
  onPick: (entry: TournamentCatalogEntry) => void;
  onPasteUrl: () => void;
};

const ALL = 'all';

// Presentational: the catalog, the filters and their events come from the container.
export function TournamentPicker(props: TournamentPickerProps) {
  const { colors, space, typography } = useTheme();
  const { years, year, dateKey, groups } = props;
  const paste = <Button variant="ghost" label={t('results_import.tournament.pick.paste')} onPress={props.onPasteUrl} />;

  return (
    <>
      <Text style={[typography.body, { color: colors.ink }]}>{t('results_import.tournament.pick.intro', { name: props.athleteName })}</Text>
      {!props.online && (
        <Banner variant="info" icon="info">
          {t('results_import.tournament.pick.offline_note')}
        </Banner>
      )}
      <TextField label={t('results_import.tournament.pick.search_label')} value={props.text} onChangeText={props.onChangeText} autoCorrect={false} maxLength={80} />
      <ChipRow
        accessibilityLabel={t('results_import.tournament.pick.year_group')}
        options={[...years.map((value) => ({ value: String(value), label: String(value) })), { value: ALL, label: t('results_import.tournament.pick.year_all') }]}
        value={year === null ? ALL : String(year)}
        onChange={(value) => props.onChangeYear(value === ALL ? null : Number(value))}
      />
      <Button variant="secondary" label={t(props.calendarOpen ? 'results_import.tournament.calendar.close' : 'results_import.tournament.calendar.open')} onPress={props.onToggleCalendar} />
      {props.calendarOpen && (
        <MonthCalendar
          month={props.month}
          counts={props.counts}
          selected={dateKey}
          onSelect={props.onSelectDay}
          onPrevious={props.onPreviousMonth}
          onNext={props.onNextMonth}
        />
      )}
      {dateKey && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2] }}>
          <Text style={[typography['body-strong'], { color: colors.ink }]}>{t('results_import.tournament.calendar.selected', { date: formatTournamentDate(dateKey) })}</Text>
          <Button variant="ghost" label={t('results_import.tournament.calendar.clear')} onPress={props.onClearDay} />
        </View>
      )}
      {groups.length === 0 ? (
        <>
          <StateView kind="empty" title={t('results_import.tournament.pick.empty_title')} message={t('results_import.tournament.pick.empty_message')} />
          {paste}
        </>
      ) : (
        <>
          {groups.map((group) => (
            <View key={group.city} style={{ gap: space[2] }}>
              <Text accessibilityRole="header" style={[typography['body-strong'], { color: colors['ink-muted'] }]}>
                {group.city}
              </Text>
              {group.tournaments.map((entry) => (
                <Pressable
                  key={entry.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${entry.name}, ${formatTournamentDate(entry.dateKey)}`}
                  onPress={() => props.onPick(entry)}
                  style={{ backgroundColor: colors['surface-1'], padding: space[3], gap: space[1], borderWidth: 1, borderColor: colors['border-strong'] }}
                >
                  <Text style={[typography['body-strong'], { color: colors.ink }]}>{entry.name}</Text>
                  <Text style={[typography.body, { color: colors['ink-muted'] }]}>{formatTournamentDate(entry.dateKey)}</Text>
                </Pressable>
              ))}
            </View>
          ))}
          {paste}
        </>
      )}
    </>
  );
}

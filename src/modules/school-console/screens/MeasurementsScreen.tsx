import { t } from '../../../core/i18n';
import '../i18n';
import { AthleteFilters, type AthleteFiltersProps } from '../components/AthleteFilters';
import type { AthleteFilterId } from '../components/athleteTypes';
import type { ConsoleDestinationId } from '../components/ConsoleNav';
import { MeasurementLog, type MeasurementEntry } from '../components/MeasurementLog';
import { SectionFrame, type SectionView } from '../components/SectionFrame';

export type MeasurementsContent = {
  // Minutes since the data was updated; `null` when it is not known.
  updatedMinutesAgo: number | null;
  query: string;
  filters: AthleteFiltersProps['filters'];
  // Newest first; the filtering is the caller's.
  entries: MeasurementEntry[];
};

export type MeasurementsView = SectionView<MeasurementsContent>;

export type MeasurementsScreenProps = {
  // The width available to the console in dp: the caller measures it (window or preview).
  width: number;
  schoolName: string;
  view: MeasurementsView;
  onNavigate: (id: ConsoleDestinationId) => void;
  onQueryChange: (query: string) => void;
  onFilterPress: (id: AthleteFilterId) => void;
  // Set to false when a parent ScrollView scrolls instead (the development gallery).
  scrollEnabled?: boolean;
};

// Presentational: no network, database or repository; the caller supplies everything and handles the events.
// Conflicts are only flagged here: the platform administrator resolves them.
export function MeasurementsScreen({ width, schoolName, view, onNavigate, onQueryChange, onFilterPress, scrollEnabled }: MeasurementsScreenProps) {
  return (
    <SectionFrame
      section="measurements"
      width={width}
      schoolName={schoolName}
      view={view}
      onNavigate={onNavigate}
      scrollEnabled={scrollEnabled}
      summary={({ entries, updatedMinutesAgo }) => {
        const conflicts = entries.filter((entry) => entry.versions.length > 1).length;
        const count = t('schoolConsole.measurements.count', { count: entries.length });
        return {
          count: conflicts > 0 ? `${count} · ${t('schoolConsole.measurements.conflicts', { count: conflicts })}` : count,
          updatedMinutesAgo,
        };
      }}
    >
      {({ query, filters, entries }) => (
        <>
          <AthleteFilters query={query} onQueryChange={onQueryChange} filters={filters} onFilterPress={onFilterPress} />
          <MeasurementLog entries={entries} />
        </>
      )}
    </SectionFrame>
  );
}

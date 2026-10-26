import { t } from '../../../core/i18n';
import { Button } from '../../../core/ui';
import '../i18n';
import { AthleteFilterOptions, filterSheetLabel, type AthleteFilterOption } from '../components/AthleteFilterOptions';
import { AthleteFilters, type AthleteFiltersProps } from '../components/AthleteFilters';
import type { MeasurementFilterId } from '../components/athleteTypes';
import { isConflict, MeasurementLog, type MeasurementEntry } from '../components/MeasurementLog';
import { SectionFrame, type SectionView } from '../components/SectionFrame';
import { SideSheet } from '../components/SideSheet';
import type { ConsoleSectionProps } from './ConsoleScreen';

const chips: readonly MeasurementFilterId[] = ['category', 'event', 'coach', 'range'];

export type MeasurementsContent = {
  // Minutes since the data was updated; `null` when it is not known.
  updatedMinutesAgo: number | null;
  query: string;
  filters: AthleteFiltersProps<MeasurementFilterId>['filters'];
  // Newest first; the filtering and the paging are the caller's.
  entries: MeasurementEntry[];
  // How many measurements match the filters when `entries` is only the first page; absent: all of them are in `entries`.
  total?: number;
  // How many of them are in conflict; absent: counted from `entries`.
  conflicts?: number;
  // Present while there are more measurements than `entries`: shows "Mostrar más".
  onShowMore?: () => void;
};

export type MeasurementsView = SectionView<MeasurementsContent>;

// The options of the filter whose chip was pressed, shown in a side sheet over the screen.
export type MeasurementsFilterSheet = {
  id: MeasurementFilterId;
  options: AthleteFilterOption[];
  // The option that is applied now, if any.
  selectedId?: string;
  onChoose: (optionId: string) => void;
  onClose: () => void;
};

export type MeasurementsScreenProps = ConsoleSectionProps & {
  view: MeasurementsView;
  onQueryChange: (query: string) => void;
  onFilterPress: (id: MeasurementFilterId) => void;
  filterSheet?: MeasurementsFilterSheet;
  // Set to false when a parent ScrollView scrolls instead (the development gallery).
  scrollEnabled?: boolean;
};

// Presentational: no network, database or repository; the caller supplies everything and handles the events.
// Conflicts are only flagged here: the platform administrator resolves them.
export function MeasurementsScreen({ width, schoolName, view, onNavigate, onQueryChange, onFilterPress, filterSheet, scrollEnabled }: MeasurementsScreenProps) {
  return (
    <SectionFrame
      section="measurements"
      width={width}
      schoolName={schoolName}
      view={view}
      onNavigate={onNavigate}
      scrollEnabled={scrollEnabled}
      overlay={
        filterSheet && (
          <SideSheet label={filterSheetLabel(filterSheet.id)} onClose={filterSheet.onClose}>
            <AthleteFilterOptions id={filterSheet.id} options={filterSheet.options} selectedId={filterSheet.selectedId} onChoose={filterSheet.onChoose} />
          </SideSheet>
        )
      }
      summary={({ entries, total, conflicts, updatedMinutesAgo }) => {
        const inConflict = conflicts ?? entries.filter(isConflict).length;
        const count = t('schoolConsole.measurements.count', { count: total ?? entries.length });
        return {
          count: inConflict > 0 ? `${count} · ${t('schoolConsole.measurements.conflicts', { count: inConflict })}` : count,
          updatedMinutesAgo,
        };
      }}
    >
      {({ query, filters, entries, onShowMore }) => (
        <>
          <AthleteFilters<MeasurementFilterId> query={query} onQueryChange={onQueryChange} filters={filters} onFilterPress={onFilterPress} chips={chips} />
          <MeasurementLog entries={entries} />
          {onShowMore && <Button variant="secondary" label={t('schoolConsole.measurements.more')} onPress={onShowMore} />}
        </>
      )}
    </SectionFrame>
  );
}

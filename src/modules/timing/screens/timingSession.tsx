import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { t } from '../../../core/i18n';
import { distances, pools, strokes } from '../../../core/sport';
import { StateView } from '../../../core/ui';
import type { SessionType } from '../data/measurements';
import type { Choice } from '../data/sessionSetup';
import { orderedSelection, toggleAthlete } from '../domain/athleteSelection';
import '../i18n';
import { AthletePickerScreen } from './AthletePickerScreen';
import { TimingSetupScreen, type SetupAthlete } from './TimingSetupScreen';

// An athlete of the roster as the flows need it. The container of the app builds it, so this module never reads another module's tables.
export type RosterAthlete = Pick<SetupAthlete, 'id' | 'shortName' | 'initials' | 'color' | 'authorized'>;

const option = ({ code, nameKey }: { code: string; nameKey: string }) => ({ value: code, label: t(nameKey) });
const nameOf = (catalog: readonly { code: string; nameKey: string }[], code: string) => t(catalog.find((c) => c.code === code)?.nameKey ?? code);

// For example "Libre 50 m · Entrenamiento".
export const eventSubtitleOf = (choice: Choice) =>
  `${nameOf(strokes, choice.stroke)} ${nameOf(distances, choice.distance)} · ${t(`timing.session_type.${choice.sessionType}`)}`;

// A training time is a repetition and a competition time is a race: the two kinds a personal best can come from.
export const kindOf = (choice: Choice) => (choice.sessionType === 'competition' ? ('race' as const) : ('repetition' as const));

// Loads the roster once and shows the loading and error states; the session below starts only with a roster.
export function RosterGate({ loadRoster, children }: { loadRoster(): Promise<RosterAthlete[]>; children: (roster: RosterAthlete[]) => ReactNode }) {
  const [roster, setRoster] = useState<RosterAthlete[] | 'error'>();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    loadRoster()
      .then((athletes) => active && setRoster(athletes))
      .catch(() => active && setRoster('error'));
    return () => {
      active = false;
    };
  }, [loadRoster, attempt]);

  if (roster === undefined) return <StateView kind="loading" />;
  if (roster === 'error') {
    return (
      <View style={{ flex: 1 }}>
        <StateView
          kind="error"
          title={t('timing.setup.error_title')}
          message={t('timing.setup.error_message')}
          action={{ label: t('timing.summary.retry_load'), onPress: () => (setRoster(undefined), setAttempt((n) => n + 1)) }}
        />
      </View>
    );
  }
  return <>{children(roster)}</>;
}

export type TimingSetupStepProps = {
  subtitle: string;
  roster: RosterAthlete[];
  choice: Choice;
  onChoiceChange: (change: Partial<Choice>) => void;
  // The athletes chosen to be timed, in timing order.
  selectedIds: string[];
  onSelectedIdsChange: (update: (ids: string[]) => string[]) => void;
  // Source of the times: the one the flow uses, shown as the only option.
  sourceLabel: string;
  onStart: (authorized: RosterAthlete[]) => void;
  onBack: () => void;
};

// The setup screen of both flows: the event, the type of session and the athletes who will be timed.
export function TimingSetupStep({ subtitle, roster, choice, onChoiceChange, selectedIds, onSelectedIdsChange, sourceLabel, onStart, onBack }: TimingSetupStepProps) {
  const field = (value: string, options: readonly { code: string; nameKey: string }[]) => ({ value, options: options.map(option) });
  const authorized = roster.filter((a) => a.authorized);
  const [picking, setPicking] = useState(false);
  // Only an authorized athlete can be chosen; the others stay listed after them, marked as skipped.
  const selected = orderedSelection(authorized, selectedIds);

  if (picking) {
    return (
      <AthletePickerScreen
        subtitle={subtitle}
        athletes={authorized}
        selectedIds={selectedIds}
        groupCount={roster.length}
        onToggle={(id) => onSelectedIdsChange((ids) => toggleAthlete(ids, id))}
        onDone={() => setPicking(false)}
        onBack={() => setPicking(false)}
      />
    );
  }

  return (
    <TimingSetupScreen
      subtitle={subtitle}
      stroke={field(choice.stroke, strokes)}
      distance={field(choice.distance, distances)}
      pool={field(choice.pool, pools)}
      sessionType={{
        value: choice.sessionType,
        options: (['training', 'competition'] as const).map((value) => ({ value, label: t(`timing.session_type.${value}`) })),
      }}
      source={{ value: 'only', options: [{ value: 'only', label: sourceLabel }] }}
      onStrokeChange={(stroke) => onChoiceChange({ stroke })}
      onDistanceChange={(distance) => onChoiceChange({ distance })}
      onPoolChange={(pool) => onChoiceChange({ pool })}
      onSessionTypeChange={(sessionType) => onChoiceChange({ sessionType: sessionType as SessionType })}
      onSourceChange={() => {}}
      // shortcut: the best time is not read yet, so the rows show "—"; upgrade with a read of each athlete's best for the event.
      athletes={[...selected, ...roster.filter((a) => !a.authorized)].map((a) => ({ ...a, bestTime: null }))}
      selectedCount={selected.length}
      groupCount={roster.length}
      onChooseAthletes={() => setPicking(true)}
      onStart={() => selected.length > 0 && onStart(selected)}
      onBack={onBack}
    />
  );
}

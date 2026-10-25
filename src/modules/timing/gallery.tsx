import { useState, type ReactElement, type ReactNode } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { space } from '../../core/theme';
import type { GalleryEntry } from '../../core/ui';
import { seriesFixture } from './__fixtures__/series';
import { fixture } from './__fixtures__/timing';
import { ArrivalList } from './components/ArrivalList';
import { NameCard } from './components/NameCard';
import { arrivals as arrivalsOf, assignHighlighted, reopen, type Series } from './domain/series';
import { SeriesAssignmentScreen } from './screens/SeriesAssignmentScreen';
import { SeriesTimingScreen } from './screens/SeriesTimingScreen';
import { useFakeClock } from './__fixtures__/fakeClock';
import { StopwatchScreen, type StopwatchScreenProps } from './screens/StopwatchScreen';
import { TimingSetupScreen, type SetupAthlete } from './screens/TimingSetupScreen';
import { TimingSummaryScreen, type TimingSummaryScreenProps } from './screens/TimingSummaryScreen';

const noop = () => {};

// The preview box shrinks its children; a screen fills a phone-like area instead.
function ScreenFrame({ children }: { children: ReactNode }) {
  const { height } = useWindowDimensions();
  return <View style={{ alignSelf: 'stretch', height: height * 0.8 }}>{children}</View>;
}

// The summary has its own ScrollView, which cannot scroll nested in the gallery: it takes a full height and the gallery scrolls.
function FullScreen({ children }: { children: ReactNode }) {
  const { height } = useWindowDimensions();
  return <View style={{ alignSelf: 'stretch', minHeight: height }}>{children}</View>;
}

const handlers = { onStart: noop, onSplit: noop, onStop: noop, onSave: noop, onDiscard: noop, onBack: noop };

function StopwatchPreview(props: Partial<StopwatchScreenProps>) {
  return (
    <ScreenFrame>
      <StopwatchScreen
        {...fixture.stopwatchScreen}
        {...handlers}
        exitConfirmVisible={false}
        onConfirmExit={noop}
        onCancelExit={noop}
        {...props}
      />
    </ScreenFrame>
  );
}

// The clock advances by itself, like the container's clock will.
function RunningPreview({ withSplits, offline }: { withSplits: boolean; offline?: boolean }) {
  const elapsed = useFakeClock(true, fixture.times.running);
  return (
    <StopwatchPreview
      state="running"
      elapsedHundredths={elapsed}
      splits={withSplits ? fixture.splits : undefined}
      offline={offline}
    />
  );
}

// The container owns the sheet: tapping back while running opens it.
function ExitConfirmPreview() {
  const [visible, setVisible] = useState(false);
  const elapsed = useFakeClock(!visible, fixture.times.running);
  const close = () => setVisible(false);
  return (
    <StopwatchPreview
      state="running"
      elapsedHundredths={elapsed}
      onBack={() => setVisible(true)}
      exitConfirmVisible={visible}
      onConfirmExit={close}
      onCancelExit={close}
    />
  );
}

// Holds the selections, so tapping an option changes it in the gallery.
function SetupPreview({ athletes, selectedCount }: { athletes: SetupAthlete[]; selectedCount: number }) {
  const [values, setValues] = useState({
    stroke: fixture.setupScreen.stroke.value,
    distance: fixture.setupScreen.distance.value,
    pool: fixture.setupScreen.pool.value,
    sessionType: fixture.setupScreen.sessionType.value,
    source: fixture.setupScreen.source.value,
  });
  const set = (key: keyof typeof values) => (value: string) => setValues((current) => ({ ...current, [key]: value }));
  const { setupScreen } = fixture;

  return (
    <ScreenFrame>
      <TimingSetupScreen
        subtitle={setupScreen.subtitle}
        stroke={{ ...setupScreen.stroke, value: values.stroke }}
        distance={{ ...setupScreen.distance, value: values.distance }}
        pool={{ ...setupScreen.pool, value: values.pool }}
        sessionType={{ ...setupScreen.sessionType, value: values.sessionType }}
        source={{ ...setupScreen.source, value: values.source }}
        onStrokeChange={set('stroke')}
        onDistanceChange={set('distance')}
        onPoolChange={set('pool')}
        onSessionTypeChange={set('sessionType')}
        onSourceChange={set('source')}
        athletes={athletes}
        selectedCount={selectedCount}
        groupCount={setupScreen.groupCount}
        onChooseAthletes={noop}
        onStart={noop}
        onBack={noop}
      />
    </ScreenFrame>
  );
}

function SummaryPreview(props: Partial<TimingSummaryScreenProps>) {
  return (
    <FullScreen>
      <TimingSummaryScreen
        {...fixture.summaryScreen}
        status="ready"
        onRetry={noop}
        onRetryLoad={noop}
        onCorrect={noop}
        onFinish={noop}
        onBack={noop}
        {...props}
      />
    </FullScreen>
  );
}

// A component preview stretches to the preview width and stacks its cards.
function Stack({ children }: { children: ReactNode }) {
  return <View style={{ alignSelf: 'stretch', gap: space[2] }}>{children}</View>;
}

// The clock is fixed so the screen stays still for screenshots; the big button adds an arrival at that time.
function SeriesTimingPreview({
  initial,
  elapsed,
  disconnected,
  offline,
}: {
  initial: typeof seriesFixture.arrivals;
  elapsed: number;
  disconnected?: boolean;
  offline?: boolean;
}) {
  const [arrivals, setArrivals] = useState(initial);

  return (
    <ScreenFrame>
      <SeriesTimingScreen
        athleteCount={seriesFixture.athletes.length}
        eventSubtitle={seriesFixture.eventSubtitle}
        elapsedHundredths={elapsed}
        arrivals={arrivals}
        externalTimerDisconnected={disconnected}
        offline={offline}
        onUseOnScreenStopwatch={noop}
        onArrival={() => setArrivals((current) => [...current, { id: `arrival-${current.length + 1}`, time: elapsed }])}
        onUndoLast={() => setArrivals((current) => current.slice(0, -1))}
        onAssignNames={noop}
        onBack={noop}
      />
    </ScreenFrame>
  );
}

// Holds the series with the real rules, so tapping a card assigns and tapping a position reopens it.
function SeriesAssignmentPreview({
  initial,
  offline,
  completionOnly,
  completed = [],
}: {
  initial: Series;
  offline?: boolean;
  completionOnly?: boolean;
  completed?: string[];
}) {
  const [series, setSeries] = useState(initial);
  const [completedIds, setCompletedIds] = useState(completed);

  return (
    <ScreenFrame>
      <SeriesAssignmentScreen
        positions={arrivalsOf(series)}
        athletes={seriesFixture.athletes}
        eventSubtitle={seriesFixture.eventSubtitle}
        offline={offline}
        completionOnly={completionOnly}
        completedIds={completedIds}
        onToggleCompleted={(id) =>
          setCompletedIds((current) => (current.includes(id) ? current.filter((c) => c !== id) : [...current, id]))
        }
        onAssign={(athleteId) =>
          setSeries((current) => {
            const result = assignHighlighted(current, athleteId);
            return result.ok ? result.series : current;
          })
        }
        onReopen={(position) => setSeries((current) => reopen(current, position))}
        onSave={noop}
        onBack={noop}
      />
    </ScreenFrame>
  );
}

const stopped = { state: 'stopped', elapsedHundredths: fixture.times.final } as const;

export const galleryEntries: GalleryEntry[] = [
  {
    id: 'timingSetup',
    title: 'TimingSetupScreen',
    states: {
      setup: () => <SetupPreview athletes={fixture.setupScreen.athletes} selectedCount={3} />,
      'setup-skipped': () => <SetupPreview athletes={fixture.athletesWithSkipped} selectedCount={2} />,
      'setup-empty': () => <SetupPreview athletes={[]} selectedCount={0} />,
    },
  },
  {
    id: 'timingSummary',
    title: 'TimingSummaryScreen',
    states: {
      summary: () => <SummaryPreview />,
      'summary-loading': () => <SummaryPreview status="loading" />,
      'summary-error': () => <SummaryPreview status="error" />,
      'summary-empty': () => <SummaryPreview records={[]} />,
      'summary-offline': () => <SummaryPreview offline />,
    },
  },
  {
    id: 'stopwatch',
    title: 'StopwatchScreen',
    states: {
      ready: () => <StopwatchPreview />,
      running: () => <RunningPreview withSplits={false} />,
      'running-splits': () => <RunningPreview withSplits />,
      stopped: () => <StopwatchPreview {...stopped} bestTime={fixture.times.bestTime} splits={fixture.splits} />,
      'stopped-slower': () => (
        <StopwatchPreview {...stopped} elapsedHundredths={fixture.times.slower} bestTime={fixture.times.bestTime} />
      ),
      'stopped-no-pb': () => <StopwatchPreview {...stopped} bestTime={null} />,
      'exit-confirm': () => <ExitConfirmPreview />,
      offline: () => <RunningPreview withSplits={false} offline />,
      'pending-count': () => <StopwatchPreview syncState="on_device" pendingCount={3} />,
    },
  },
  {
    id: 'arrivalList',
    title: 'ArrivalList',
    states: {
      arrivals: () => <ArrivalList arrivals={seriesFixture.arrivals} />,
      'many-arrivals': () => <ArrivalList arrivals={seriesFixture.manyArrivals} />,
    },
  },
  {
    id: 'nameCard',
    title: 'NameCard',
    states: {
      unassigned: () => (
        <Stack>
          <NameCard name={seriesFixture.athletes[0].shortName} color="athlete-1" onPress={noop} />
        </Stack>
      ),
      assigned: () => (
        <Stack>
          <NameCard name={seriesFixture.athletes[1].shortName} color="athlete-2" position={2} onPress={noop} />
        </Stack>
      ),
      // Two assigned and two waiting, as in the middle of an assignment.
      'all-colours': () => (
        <Stack>
          {seriesFixture.athletes.map((athlete, index) => (
            <NameCard
              key={athlete.id}
              name={athlete.shortName}
              color={athlete.color}
              position={index < 2 ? index + 1 : null}
              onPress={noop}
            />
          ))}
        </Stack>
      ),
    },
  },
  {
    id: 'seriesTiming',
    title: 'SeriesTimingScreen',
    states: {
      'no-arrivals': () => <SeriesTimingPreview initial={[]} elapsed={seriesFixture.clock.empty} />,
      running: () => <SeriesTimingPreview initial={seriesFixture.arrivals.slice(0, 3)} elapsed={seriesFixture.clock.still} />,
      'external-disconnected': () => <SeriesTimingPreview initial={seriesFixture.arrivals.slice(0, 2)} elapsed={seriesFixture.clock.still} disconnected />,
      offline: () => <SeriesTimingPreview initial={seriesFixture.arrivals.slice(0, 2)} elapsed={seriesFixture.clock.still} offline />,
    },
  },
  {
    id: 'seriesAssignment',
    title: 'SeriesAssignmentScreen',
    states: {
      'in-progress': () => <SeriesAssignmentPreview initial={seriesFixture.series.partial} />,
      'all-assigned': () => <SeriesAssignmentPreview initial={seriesFixture.series.all} />,
      pending: () => <SeriesAssignmentPreview initial={seriesFixture.series.pending} />,
      reopened: () => <SeriesAssignmentPreview initial={reopen(seriesFixture.series.partial, 1)} />,
      'completion-off': () => <SeriesAssignmentPreview initial={seriesFixture.series.none} completionOnly />,
      'completion-on': () => (
        <SeriesAssignmentPreview
          initial={seriesFixture.series.none}
          completionOnly
          completed={seriesFixture.athletes.map((a) => a.id)}
        />
      ),
      offline: () => <SeriesAssignmentPreview initial={seriesFixture.series.partial} offline />,
    },
  },
] satisfies { id: string; title: string; states: Record<string, () => ReactElement> }[];

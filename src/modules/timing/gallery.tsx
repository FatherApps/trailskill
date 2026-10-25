import { useState, type ReactElement, type ReactNode } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { space } from '../../core/theme';
import type { GalleryEntry } from '../../core/ui';
import { seriesFixture } from './__fixtures__/series';
import { fixture } from './__fixtures__/timing';
import { ArrivalList } from './components/ArrivalList';
import { NameCard } from './components/NameCard';
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
    <ScreenFrame>
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
    </ScreenFrame>
  );
}

// A component preview stretches to the preview width and stacks its cards.
function Stack({ children }: { children: ReactNode }) {
  return <View style={{ alignSelf: 'stretch', gap: space[2] }}>{children}</View>;
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
] satisfies { id: string; title: string; states: Record<string, () => ReactElement> }[];

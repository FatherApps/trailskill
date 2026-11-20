import { render, screen } from '@testing-library/react-native';

import { ThemeProvider } from '../../../core/theme';
import { CompletionRow } from '../components/CompletionRow';
import { AthletePickerScreen } from '../screens/AthletePickerScreen';
import { TimingSetupScreen } from '../screens/TimingSetupScreen';
import { TimingSummaryScreen } from '../screens/TimingSummaryScreen';

// Poolside screens say the short name only (AthleteAvatar README): no avatar, no photo, not even the initials circle. Synthetic data only.
const avatar = () => screen.queryByTestId('athlete-avatar', { includeHiddenElements: true });
const noop = jest.fn();
const field = { options: [{ value: 'free', label: 'Libre' }], value: 'free' };

describe('poolside lists show no avatar', () => {
  it('the athlete picker', async () => {
    const athletes = [{ id: 'a1', shortName: 'Ana M.', initials: 'AM', color: 'athlete-1' as const }];
    await render(
      <ThemeProvider>
        <AthletePickerScreen subtitle="Escuela" athletes={athletes} selectedIds={[]} groupCount={1} onToggle={noop} onDone={noop} onBack={noop} />
      </ThemeProvider>,
    );

    expect(screen.getByText('Ana M.', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(avatar()).toBeNull();
  });

  it('the session setup', async () => {
    const athletes = [{ id: 'a1', shortName: 'Ana M.', initials: 'AM', color: 'athlete-1' as const, bestTime: 3482, authorized: true }];
    await render(
      <ThemeProvider>
        <TimingSetupScreen
          subtitle="Escuela"
          stroke={field}
          distance={field}
          pool={field}
          sessionType={field}
          source={field}
          onStrokeChange={noop}
          onDistanceChange={noop}
          onPoolChange={noop}
          onSessionTypeChange={noop}
          onSourceChange={noop}
          athletes={athletes}
          selectedCount={1}
          groupCount={1}
          onChooseAthletes={noop}
          onStart={noop}
          onBack={noop}
        />
      </ThemeProvider>,
    );

    expect(screen.getByText('1 · Ana M.', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(avatar()).toBeNull();
  });

  it('the summary of saved times', async () => {
    const records = [{ id: 'r1', shortName: 'Ana M.', initials: 'AM', color: 'athlete-1' as const, time: 3482, syncState: 'on_device' as const }];
    await render(
      <ThemeProvider>
        <TimingSummaryScreen subtitle="Escuela" status="ready" records={records} onRetry={noop} onRetryLoad={noop} onCorrect={noop} onFinish={noop} onBack={noop} />
      </ThemeProvider>,
    );

    expect(screen.getByText('Ana M.', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(avatar()).toBeNull();
  });

  it('the completion row', async () => {
    await render(
      <ThemeProvider>
        <CompletionRow athlete={{ shortName: 'Ana M.', initials: 'AM', color: 'athlete-1' }} checked={false} onToggle={noop} />
      </ThemeProvider>,
    );

    expect(screen.getByText('Ana M.', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(avatar()).toBeNull();
  });
});

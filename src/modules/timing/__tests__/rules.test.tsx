import { render, screen } from '@testing-library/react-native';
import fs from 'node:fs';
import path from 'node:path';
import { StyleSheet } from 'react-native';

import { Stopwatch } from '../components/Stopwatch';
import { StopwatchScreen } from '../screens/StopwatchScreen';
import { TimingSetupScreen } from '../screens/TimingSetupScreen';
import { TimingSummaryScreen } from '../screens/TimingSummaryScreen';
import { fixture } from '../__fixtures__/timing';

const moduleDir = path.join(__dirname, '..');

function filesIn(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? filesIn(full) : [full];
  });
}

const relative = (files: string[]) => files.map((file) => path.relative(moduleDir, file));

describe('src/modules/timing rules', () => {
  it('no screen or component imports from __fixtures__', () => {
    const files = [...filesIn(path.join(moduleDir, 'screens')), ...filesIn(path.join(moduleDir, 'components'))];
    expect(files.length).toBeGreaterThan(0);

    const offenders = files.filter((file) => /__fixtures__/.test(fs.readFileSync(file, 'utf8')));
    expect(relative(offenders)).toEqual([]);
  });

  it('no file of the module has a hexadecimal color literal', () => {
    const offenders = filesIn(moduleDir).filter(
      (file) =>
        !file.includes('__tests__') &&
        /#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b/i.test(fs.readFileSync(file, 'utf8')),
    );
    expect(relative(offenders)).toEqual([]);
  });

  it('no screen or component hard-codes user-visible Spanish copy outside i18n', () => {
    const files = [...filesIn(path.join(moduleDir, 'screens')), ...filesIn(path.join(moduleDir, 'components'))];
    const offenders = files.filter((file) => />\s*[A-ZÁÉÍÓÚ¿][a-záéíóúñ ]+\s*</.test(fs.readFileSync(file, 'utf8')));
    expect(relative(offenders)).toEqual([]);
  });

  it('keeps font scaling on, clips nothing and gives every control at least 48 dp', async () => {
    const noop = jest.fn();
    const stopwatch = { onStart: noop, onSplit: noop, onStop: noop, onSave: noop, onDiscard: noop };
    await render(
      <>
        <Stopwatch state="ready" elapsedHundredths={0} {...stopwatch} />
        <Stopwatch
          state="running"
          elapsedHundredths={3391}
          splits={[{ label: '25 m', value: 1640 }]}
          {...stopwatch}
        />
        <Stopwatch state="stopped" elapsedHundredths={3391} bestTime={null} {...stopwatch} />
        <StopwatchScreen
          {...fixture.stopwatchScreen}
          state="running"
          elapsedHundredths={3391}
          {...stopwatch}
          onBack={noop}
          exitConfirmVisible={false}
          onConfirmExit={noop}
          onCancelExit={noop}
        />
        <TimingSetupScreen
          {...fixture.setupScreen}
          onBack={noop}
          onStart={noop}
          onStrokeChange={noop}
          onDistanceChange={noop}
          onPoolChange={noop}
          onSessionTypeChange={noop}
          onSourceChange={noop}
          onChooseAthletes={noop}
        />
        <TimingSummaryScreen
          {...fixture.summaryScreen}
          status="ready"
          onRetry={noop}
          onRetryLoad={noop}
          onCorrect={noop}
          onFinish={noop}
          onBack={noop}
        />
      </>,
      // The exit sheet is a Modal: keep it closed so every node is reachable.
    );

    const texts = screen.container.queryAll((node) => node.type === 'Text');
    expect(texts.length).toBeGreaterThan(0);
    for (const text of texts) {
      expect(text.props.allowFontScaling).not.toBe(false);
      // Only the stopwatch clock is limited (see Stopwatch.test.tsx).
      if (text.props.testID !== 'stopwatch-time') expect(text.props.maxFontSizeMultiplier).toBeUndefined();
      expect(text.props.numberOfLines).toBeUndefined();
    }

    const controls = [...screen.getAllByRole('button', { includeHiddenElements: true }), ...screen.getAllByRole('radio')];
    for (const control of controls) {
      const style = StyleSheet.flatten(control.props.style);
      expect(style.width).toBeUndefined();
      expect(style.height).toBeUndefined();
      expect(style.minHeight).toBeGreaterThanOrEqual(48);
    }
  });
});

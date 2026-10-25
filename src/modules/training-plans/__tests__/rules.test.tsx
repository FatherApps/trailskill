import { render, screen } from '@testing-library/react-native';
import fs from 'node:fs';
import path from 'node:path';
import { StyleSheet } from 'react-native';

import { BlockCard } from '../components/BlockCard';
import { PlanBuilderScreen } from '../screens/PlanBuilderScreen';
import { TodayScreen } from '../screens/TodayScreen';
import { plansFixture } from '../__fixtures__/plans';

const moduleDir = path.join(__dirname, '..');

function filesIn(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? filesIn(full) : [full];
  });
}

const relative = (files: string[]) => files.map((file) => path.relative(moduleDir, file));
const shown = () => [...filesIn(path.join(moduleDir, 'screens')), ...filesIn(path.join(moduleDir, 'components'))];

describe('src/modules/training-plans rules', () => {
  it('no screen or component imports from __fixtures__', () => {
    expect(shown().length).toBeGreaterThan(0);

    const offenders = shown().filter((file) => /__fixtures__/.test(fs.readFileSync(file, 'utf8')));
    expect(relative(offenders)).toEqual([]);
  });

  it('no screen or component imports the sport catalog', () => {
    const offenders = shown().filter((file) => /core\/sport/.test(fs.readFileSync(file, 'utf8')));
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
    const offenders = shown().filter((file) => />\s*[A-ZÁÉÍÓÚ¿][a-záéíóúñ ]+\s*</.test(fs.readFileSync(file, 'utf8')));
    expect(relative(offenders)).toEqual([]);
  });

  it('keeps font scaling on, clips nothing and gives every control at least 48 dp', async () => {
    const noop = jest.fn();
    const { vocabulary, blocks, today } = plansFixture;
    await render(
      <>
        <BlockCard block={blocks[1]} vocabulary={vocabulary} />
        <PlanBuilderScreen
          planName="Resistencia aeróbica"
          blocks={blocks}
          vocabulary={vocabulary}
          editingId="b2"
          onAddBlock={noop}
          onEditBlock={noop}
          onMoveBlock={noop}
          onChangeBlock={noop}
          onDoneEditing={noop}
          onSaveTemplate={noop}
        />
        <TodayScreen athleteName="Lucía R." view={{ kind: 'data', content: today }} onReportToCoach={noop} />
      </>,
    );

    const texts = screen.container.queryAll((node) => node.type === 'Text');
    expect(texts.length).toBeGreaterThan(0);
    for (const text of texts) {
      expect(text.props.allowFontScaling).not.toBe(false);
      expect(text.props.maxFontSizeMultiplier).toBeUndefined();
      expect(text.props.numberOfLines).toBeUndefined();
    }

    const controls = [
      ...screen.getAllByRole('button'),
      ...screen.getAllByRole('radio'),
      ...screen.getAllByRole('checkbox'),
    ];
    expect(controls.length).toBeGreaterThan(10);
    for (const control of controls) {
      const style = StyleSheet.flatten(control.props.style);
      expect(style?.width).toBeUndefined();
      expect(style?.height).toBeUndefined();
      expect(style?.minHeight).toBeGreaterThanOrEqual(48);
    }
  });
});

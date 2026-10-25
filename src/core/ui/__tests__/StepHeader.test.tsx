import { fireEvent, render, screen } from '@testing-library/react-native';

import { colors, contrastRatio, type ThemeName } from '../../theme';
import { StepHeader, stepHeaderColors } from '..';

const themes: ThemeName[] = ['light', 'dark'];

describe('StepHeader', () => {
  it('announces the step as "Paso N de M" and shows the step title as a header', async () => {
    await render(<StepHeader step={2} total={4} title="Datos del nadador" onBack={jest.fn()} />);

    expect(screen.getByRole('text', { name: 'Paso 2 de 4' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Datos del nadador' })).toBeOnTheScreen();
  });

  it('has its own Back button in the top bar', async () => {
    const onBack = jest.fn();
    await render(<StepHeader step={2} total={4} title="Datos del nadador" onBack={onBack} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Volver' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('draws one decorative segment per step, filled up to the current one', async () => {
    await render(<StepHeader step={2} total={4} title="Datos del nadador" onBack={jest.fn()} />);

    const bar = screen.getByTestId('step-bar', { includeHiddenElements: true });
    expect(bar.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(bar.props.accessibilityElementsHidden).toBe(true);

    const segments = screen.getAllByTestId(/^step-(done|todo)$/, { includeHiddenElements: true });
    expect(segments.map((segment) => segment.props.testID)).toEqual([
      'step-done',
      'step-done',
      'step-todo',
      'step-todo',
    ]);
  });

  describe.each(themes)('%s theme contrast', (theme) => {
    const c = colors[theme];

    it('step and title text are at least 4.5:1 on the canvas', () => {
      for (const text of [stepHeaderColors.step, stepHeaderColors.title]) {
        expect(contrastRatio(c[text], c[stepHeaderColors.background])).toBeGreaterThanOrEqual(4.5);
      }
    });
  });
});

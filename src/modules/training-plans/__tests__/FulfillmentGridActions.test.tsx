import { fireEvent, render, screen } from '@testing-library/react-native';

import { FulfillmentGrid } from '../components/FulfillmentGrid';
import type { FulfillmentContent } from '../components/fulfillment';
import { FulfillmentScreen } from '../screens/FulfillmentScreen';
import { fulfillmentFixture } from '../__fixtures__/fulfillment';

const { grid, planName, dateLabel } = fulfillmentFixture;
const withSkipped: FulfillmentContent = { ...grid, athletes: grid.athletes.map((a) => (a.id === 'a3' ? { ...a, skipped: true } : a)) };

describe('FulfillmentGrid actions', () => {
  it('marks an athlete without an authorization as "se omitirá" and does not let their cells be marked', async () => {
    const onCycle = jest.fn();
    await render(<FulfillmentGrid {...withSkipped} onCycle={onCycle} />);

    expect(screen.getAllByText('Se omitirá')).toHaveLength(1);
    const skippedCell = screen.getByRole('button', { name: /^Sara P\. · Bloque 1,/ });
    expect(skippedCell.props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(skippedCell);
    expect(onCycle).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: /^Lucía R\. · Bloque 1,/ }));
    expect(onCycle).toHaveBeenCalledTimes(1);
  });

  it('opens the timing of a block that records times, and only of those', async () => {
    const onOpenTiming = jest.fn();
    await render(<FulfillmentGrid {...grid} onCycle={jest.fn()} onOpenTiming={onOpenTiming} />);

    // Fixture: block 2 records a time per repetition, block 5 a series total; the others record completion only.
    expect(screen.getAllByRole('button', { name: /^Cronometrar/ })).toHaveLength(2);
    await fireEvent.press(screen.getAllByRole('button', { name: /^Cronometrar/ })[0]!);
    expect(onOpenTiming).toHaveBeenCalledWith('b2');
  });

  it('shows no timing button when the caller gives no way to open it', async () => {
    await render(<FulfillmentGrid {...grid} onCycle={jest.fn()} />);

    expect(screen.queryByRole('button', { name: /^Cronometrar/ })).toBeNull();
  });
});

describe('FulfillmentScreen partial amount', () => {
  const partial = { athleteName: 'Lucía R.', max: 3, onPick: jest.fn(), onCancel: jest.fn() };

  it('asks how many repetitions were done and returns the picked count', async () => {
    await render(<FulfillmentScreen planName={planName} dateLabel={dateLabel} view={{ kind: 'data', content: grid }} onCycle={jest.fn()} partial={partial} />);

    expect(screen.getByText('¿Cuántas repeticiones hizo Lucía R.?')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: '4' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: '2' }));
    expect(partial.onPick).toHaveBeenCalledWith(2);
  });

  it('leaves the cell as it was when the question is cancelled', async () => {
    await render(<FulfillmentScreen planName={planName} dateLabel={dateLabel} view={{ kind: 'data', content: grid }} onCycle={jest.fn()} partial={partial} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));
    expect(partial.onCancel).toHaveBeenCalledTimes(1);
  });
});

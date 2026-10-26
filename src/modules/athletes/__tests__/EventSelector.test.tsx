import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { size } from '../../../core/theme';
import { eventFixture as e } from '../__fixtures__/profile';
import { EventSelector, type EventSelectorProps } from '../components/EventSelector';

const base: EventSelectorProps = {
  strokes: e.strokes,
  distances: e.distances,
  pools: e.pools.slice(0, 1),
  value: e.value,
  onChange: jest.fn(),
};

describe('EventSelector', () => {
  it('shows one chip per stroke and distance, in a single labelled row', async () => {
    await render(<EventSelector {...base} />);

    expect(screen.getByLabelText('Prueba')).toBeOnTheScreen();
    expect(screen.getAllByRole('radio')).toHaveLength(e.strokes.length * e.distances.length);
    expect(screen.getByRole('radio', { name: 'Libre 50 m' })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Mariposa 100 m' })).toBeOnTheScreen();
  });

  it('orders the chips by stroke, then by distance', async () => {
    await render(<EventSelector {...base} />);

    const names = screen.getAllByRole('radio').map((radio) => radio.props.accessibilityLabel);
    expect(names.slice(0, 4)).toEqual(['Libre 25 m', 'Libre 50 m', 'Libre 100 m', 'Espalda 25 m']);
  });

  it('marks only the chip of the selected stroke and distance', async () => {
    await render(<EventSelector {...base} />);

    expect(screen.getByRole('radio', { name: 'Libre 50 m' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Libre 100 m' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Espalda 50 m' })).not.toBeChecked();
  });

  it('has no pool row with a single pool', async () => {
    await render(<EventSelector {...base} />);

    expect(screen.queryByLabelText('Piscina')).toBeNull();
  });

  it('has a pool row when there are two pools', async () => {
    await render(<EventSelector {...base} pools={e.pools} />);

    expect(screen.getByLabelText('Piscina')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Piscina de 25 m' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Piscina de 50 m' })).not.toBeChecked();
  });

  it.each([
    ['Espalda 50 m', { stroke: 'BK', distance: '50m', pool: 'SCM' }],
    ['Libre 100 m', { stroke: 'FR', distance: '100m', pool: 'SCM' }],
    ['Piscina de 50 m', { stroke: 'FR', distance: '50m', pool: 'LCM' }],
  ])('chooses %s and reports the full new value', async (label, expected) => {
    const onChange = jest.fn();
    await render(<EventSelector {...base} pools={e.pools} onChange={onChange} />);

    await fireEvent.press(screen.getByRole('radio', { name: label }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(expected);
  });

  it('gives every option a 48 dp target', async () => {
    await render(<EventSelector {...base} pools={e.pools} />);

    for (const radio of screen.getAllByRole('radio')) {
      expect(StyleSheet.flatten(radio.props.style).minHeight).toBeGreaterThanOrEqual(size['target-min']);
    }
  });
});

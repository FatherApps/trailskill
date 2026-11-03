import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { size } from '../../../core/theme';
import { eventFixture as e } from '../__fixtures__/profile';
import { EventSelector, type EventSelectorProps } from '../components/EventSelector';

const base: EventSelectorProps = {
  events: e.events,
  pools: e.pools.slice(0, 1),
  value: e.value,
  onChange: jest.fn(),
};

describe('EventSelector', () => {
  it('shows one chip per event it is given, in a single labelled row, and no other', async () => {
    await render(<EventSelector {...base} />);

    expect(screen.getByLabelText('Prueba')).toBeOnTheScreen();
    expect(screen.getAllByRole('radio')).toHaveLength(e.events.length);
    expect(screen.getByRole('radio', { name: 'Libre 50 metros' })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Pecho 50 metros' })).toBeOnTheScreen();
    expect(screen.queryByRole('radio', { name: 'Mariposa 100 metros' })).toBeNull();
  });

  it('keeps the order it is given', async () => {
    await render(<EventSelector {...base} />);

    const names = screen.getAllByRole('radio').map((radio) => radio.props.accessibilityLabel);
    expect(names).toEqual(['Libre 50 metros', 'Libre 100 metros', 'Espalda 50 metros', 'Pecho 50 metros']);
  });

  it('shows nothing without events', async () => {
    await render(<EventSelector {...base} events={[]} pools={[]} />);

    expect(screen.queryByLabelText('Prueba')).toBeNull();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
  });

  it('marks only the chip of the selected stroke and distance', async () => {
    await render(<EventSelector {...base} />);

    expect(screen.getByRole('radio', { name: 'Libre 50 metros' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Libre 100 metros' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Espalda 50 metros' })).not.toBeChecked();
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
    ['Espalda 50 metros', { stroke: 'BK', distance: '50m', pool: 'SCM' }],
    ['Libre 100 metros', { stroke: 'FR', distance: '100m', pool: 'SCM' }],
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

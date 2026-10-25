import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { t } from '../../../core/i18n';
import { distances, strokes } from '../../../core/sport';
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
  it('shows a group for the stroke and one for the distance, with the sport catalog names', async () => {
    await render(<EventSelector {...base} />);

    const strokeGroup = screen.getByLabelText('Estilo');
    const distanceGroup = screen.getByLabelText('Distancia');
    expect(strokeGroup).toBeOnTheScreen();
    expect(distanceGroup).toBeOnTheScreen();

    for (const { nameKey } of strokes.filter((s) => e.strokes.includes(s.code))) {
      expect(screen.getByRole('radio', { name: t(nameKey) })).toBeOnTheScreen();
    }
    for (const { nameKey } of distances.filter((d) => e.distances.includes(d.code))) {
      expect(screen.getByRole('radio', { name: t(nameKey) })).toBeOnTheScreen();
    }
    expect(screen.getAllByRole('radio')).toHaveLength(e.strokes.length + e.distances.length);
  });

  it('marks the selected stroke and distance', async () => {
    await render(<EventSelector {...base} />);

    expect(screen.getByRole('radio', { name: 'Libre' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Espalda' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: '50 m' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '25 m' })).not.toBeChecked();
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
    ['Espalda', { stroke: 'BK', distance: '50m', pool: 'SCM' }],
    ['100 m', { stroke: 'FR', distance: '100m', pool: 'SCM' }],
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

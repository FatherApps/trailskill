import { View } from 'react-native';

import { t } from '../../../core/i18n';
import type { DistanceCode, PoolCode, StrokeCode } from '../../../core/sport';
import { useTheme } from '../../../core/theme';
import { ChipRow } from '../../../core/ui';
import '../i18n';
import { distanceLabel, poolLabel, strokeLabel } from './sportLabel';

export type EventValue = { stroke: StrokeCode; distance: DistanceCode; pool: PoolCode };

export type EventSelectorProps = {
  strokes: StrokeCode[];
  distances: DistanceCode[];
  // The pool row shows only when the school uses both.
  pools: PoolCode[];
  value: EventValue;
  onChange: (value: EventValue) => void;
};

// One chip per stroke and distance ("Libre 50 m"), stroke first; the pool stays a row of its own.
export function EventSelector({ strokes, distances, pools, value, onChange }: EventSelectorProps) {
  const { space } = useTheme();
  const events = strokes.flatMap((stroke) => distances.map((distance) => ({ stroke, distance })));

  return (
    <View style={{ gap: space[2] }}>
      <ChipRow
        accessibilityLabel={t('athletes.event_selector.event')}
        options={events.map(({ stroke, distance }) => ({
          value: `${stroke}|${distance}`,
          label: `${strokeLabel(stroke)} ${distanceLabel(distance)}`,
        }))}
        value={`${value.stroke}|${value.distance}`}
        onChange={(chosen) => {
          const event = events.find((item) => `${item.stroke}|${item.distance}` === chosen);
          if (event) onChange({ ...value, ...event });
        }}
      />
      {pools.length > 1 && (
        <ChipRow
          accessibilityLabel={t('athletes.event_selector.pool')}
          options={pools.map((code) => ({ value: code, label: poolLabel(code) }))}
          value={value.pool}
          onChange={(pool) => onChange({ ...value, pool })}
        />
      )}
    </View>
  );
}

import { View } from 'react-native';

import { t } from '../../../core/i18n';
import type { DistanceCode, PoolCode, StrokeCode } from '../../../core/sport';
import { useTheme } from '../../../core/theme';
import { ChipRow, Segmented } from '../../../core/ui';
import '../i18n';
import { distanceLabel, poolLabel, strokeLabel } from './sportLabel';

export type EventValue = { stroke: StrokeCode; distance: DistanceCode; pool: PoolCode };

export type EventSelectorProps = {
  // Only the events the athlete has results in, in the order to show them.
  events: { stroke: StrokeCode; distance: DistanceCode }[];
  // Only the pools the athlete has results in; the secondary row shows when there is more than one.
  pools: PoolCode[];
  value: EventValue;
  onChange: (value: EventValue) => void;
};

// One chip per event with results ("Libre 50 m"); the pool is a secondary control below, only when there is a choice.
export function EventSelector({ events, pools, value, onChange }: EventSelectorProps) {
  const { space } = useTheme();
  if (events.length === 0) return null;

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
        <Segmented
          accessibilityLabel={t('athletes.event_selector.pool')}
          options={pools.map((code) => ({ value: code, label: poolLabel(code) }))}
          value={value.pool}
          onChange={(pool) => onChange({ ...value, pool })}
        />
      )}
    </View>
  );
}

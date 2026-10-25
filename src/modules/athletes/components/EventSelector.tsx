import { View } from 'react-native';

import { t } from '../../../core/i18n';
import type { DistanceCode, PoolCode, StrokeCode } from '../../../core/sport';
import { useTheme } from '../../../core/theme';
import { Segmented } from '../../../core/ui';
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

export function EventSelector({ strokes, distances, pools, value, onChange }: EventSelectorProps) {
  const { space } = useTheme();

  return (
    <View style={{ gap: space[2] }}>
      <Segmented
        accessibilityLabel={t('athletes.event_selector.stroke')}
        options={strokes.map((code) => ({ value: code, label: strokeLabel(code) }))}
        value={value.stroke}
        onChange={(stroke) => onChange({ ...value, stroke })}
      />
      <Segmented
        accessibilityLabel={t('athletes.event_selector.distance')}
        options={distances.map((code) => ({ value: code, label: distanceLabel(code) }))}
        value={value.distance}
        onChange={(distance) => onChange({ ...value, distance })}
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

import { useState, type ReactNode } from 'react';
import { ScrollView, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';

import type { AthleteFilterId, MeasurementFilterId } from './components/athleteTypes';

// The preview box shrinks its children to their content; these components need the full width.
export const FullWidth = ({ children }: { children: ReactNode }) => <View style={{ alignSelf: 'stretch' }}>{children}</View>;

export const noop = () => {};

// A console screen in the gallery. `fixedWidth` shows a layout regardless of the device; otherwise the screen follows
// the width of the preview.
export function ConsolePreview({ fixedWidth, children }: { fixedWidth?: number; children: (width: number) => ReactNode }) {
  const [measured, setMeasured] = useState(useWindowDimensions().width);

  // A fixed width can be wider than the phone: it scrolls sideways inside the preview.
  if (fixedWidth !== undefined) {
    return (
      <ScrollView horizontal testID="console-preview" style={{ alignSelf: 'stretch' }}>
        <View style={{ width: fixedWidth, minHeight: 720 }}>{children(fixedWidth)}</View>
      </ScrollView>
    );
  }

  return (
    <View
      testID="console-preview"
      onLayout={(event: LayoutChangeEvent) => setMeasured(event.nativeEvent.layout.width)}
      style={{ alignSelf: 'stretch', minHeight: 720 }}
    >
      {children(measured)}
    </View>
  );
}

// The filter values a chip shows once it is active.
export const filterValues: Record<AthleteFilterId | MeasurementFilterId, string> = {
  category: 'Categoría B',
  group: 'Grupo B',
  coach: 'Paula G.',
  event: 'Libre 50',
  range: 'Últimos 7 días',
};

// A chip press turns its filter on with a sample value, or off when it is already on.
export function toggleFilter<Id extends AthleteFilterId | MeasurementFilterId>(current: Partial<Record<Id, string>>, id: Id): Partial<Record<Id, string>> {
  if (current[id] === undefined) return { ...current, [id]: filterValues[id] };
  const rest = { ...current };
  delete rest[id];
  return rest;
}

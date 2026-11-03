import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { ScrollView, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { useTheme } from '../theme';
import { Chip, type InitialsDotProps } from './Chip';

export type ChipRowOption<T extends string> = { value: T; label: string; accessibilityLabel?: string; dot?: InitialsDotProps };

export type ChipRowProps<T extends string> = {
  options: ChipRowOption<T>[];
  value: T;
  onChange: (value: T) => void;
  // Names the group for screen readers, for example "Deportista".
  accessibilityLabel: string;
};

type Span = { x: number; width: number };

// One row of chips where exactly one is chosen; when they do not fit, the row scrolls sideways.
// The chosen chip is brought into view only when it is not fully visible: at open without animation, on a later choice animated.
export function ChipRow<T extends string>({ options, value, onChange, accessibilityLabel }: ChipRowProps<T>) {
  const { space } = useTheme();
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const offset = useRef(0);
  const [viewport, setViewport] = useState<number>();
  const [chips, setChips] = useState<Record<string, Span>>({});
  // The value already brought into view; `undefined` until the row has opened.
  const shown = useRef<T | undefined>(undefined);
  const chosen = chips[value];

  useEffect(() => {
    if (viewport === undefined || !chosen || shown.current === value) return;
    const opening = shown.current === undefined;
    shown.current = value;
    const left = offset.current;
    if (chosen.x >= left && chosen.x + chosen.width <= left + viewport) return;
    // Centred, never before the start.
    scroller.current?.scrollTo({ x: Math.max(0, chosen.x - (viewport - chosen.width) / 2), y: 0, animated: !opening });
  }, [value, viewport, chosen]);

  const onChipLayout = (key: string) => (event: LayoutChangeEvent) => {
    const { x, width } = event.nativeEvent.layout;
    setChips((previous) => (previous[key]?.x === x && previous[key]?.width === width ? previous : { ...previous, [key]: { x, width } }));
  };

  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      <ScrollView
        ref={scroller}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: space[2] }}
        scrollEventThrottle={16}
        onLayout={(event: LayoutChangeEvent) => setViewport(event.nativeEvent.layout.width)}
        onScroll={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
          offset.current = event.nativeEvent.contentOffset.x;
        }}
      >
        {options.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            accessibilityLabel={option.accessibilityLabel}
            dot={option.dot}
            selected={option.value === value}
            onPress={() => onChange(option.value)}
            onLayout={onChipLayout(option.value)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

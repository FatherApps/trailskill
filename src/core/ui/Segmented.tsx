import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View, type ScrollViewInstance } from 'react-native';

import { useTheme, type ColorToken } from '../theme';

export type SegmentedOption<T extends string> = { value: T; label: string };

export type SegmentedProps<T extends string> = {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  // Names the group for screen readers, for example "Estilo".
  accessibilityLabel: string;
};

// There is no disabled state: an option that does not apply is removed, not shown disabled (design-system README).
export const segmentedColors: {
  track: ColorToken;
  unselected: ColorToken;
  selected: { background: ColorToken; text: ColorToken };
} = {
  track: 'surface-1',
  unselected: 'ink',
  selected: { background: 'primary', text: 'on-primary' },
};

export function Segmented<T extends string>({ options, value, onChange, accessibilityLabel }: SegmentedProps<T>) {
  const { colors, space, radius, size, typography } = useTheme();
  const scroller = useRef<ScrollViewInstance>(null);
  const layouts = useRef(new Map<T, { x: number }>());
  const viewport = useRef(0);
  // Same measurement as `viewport`, in state because the option cap must re-render. Unset until measured: a cap of 0 would collapse the options.
  const [viewportWidth, setViewportWidth] = useState<number>();
  const content = useRef(0);

  // Options keep the width of their label up to the viewport, so a long set scrolls: bring the selected one into view.
  // Nothing to do when everything fits, and the target never goes past the end of the content.
  const reveal = useCallback((target: T, animated: boolean) => {
    const layout = layouts.current.get(target);
    const max = content.current - viewport.current;
    // Layout events can arrive in any order: wait until both sizes are known.
    if (layout && viewport.current > 0 && content.current > 0 && max > 0)
      scroller.current?.scrollTo({ x: Math.max(0, Math.min(layout.x, max)), animated });
  }, []);
  // Drop removed options only: kept ones are not re-measured when their frame does not move.
  // Declared before the reveal effect so it never scrolls to a removed option's position.
  useEffect(() => {
    for (const key of layouts.current.keys()) {
      if (!options.some((option) => option.value === key)) layouts.current.delete(key);
    }
  }, [options]);
  useEffect(() => reveal(value, true), [reveal, value]);

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={{
        overflow: 'hidden',
        padding: space[1],
        borderWidth: 1.5,
        borderColor: colors.border,
        borderRadius: radius.full,
        backgroundColor: colors[segmentedColors.track],
      }}
    >
      <ScrollView
        ref={scroller}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1 }}
        onLayout={({ nativeEvent: { layout } }) => {
          viewport.current = layout.width;
          setViewportWidth(layout.width > 0 ? layout.width : undefined);
          reveal(value, false);
        }}
        onContentSizeChange={(width) => {
          content.current = width;
          reveal(value, false);
        }}
      >
        {options.map((option) => {
          const selected = option.value === value;
          const { background, text } = segmentedColors.selected;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              // Android reads `checked` for radios, iOS reads `selected`.
              accessibilityState={{ checked: selected, selected }}
              onPress={() => onChange(option.value)}
              onLayout={({ nativeEvent: { layout } }) => {
                layouts.current.set(option.value, { x: layout.x });
                if (selected) reveal(option.value, false);
              }}
              style={{
                flexGrow: 1,
                flexShrink: 0,
                // An option never exceeds the viewport, so its label wraps between words and it is seen whole.
                maxWidth: viewportWidth,
                minHeight: size['target-min'],
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: space[3],
                borderRadius: radius.full,
                backgroundColor: selected ? colors[background] : 'transparent',
              }}
            >
              <Text
                style={[
                  typography.label,
                  {
                    textAlign: 'center',
                    color: colors[selected ? text : segmentedColors.unselected],
                  },
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

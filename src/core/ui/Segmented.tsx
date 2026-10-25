import { useCallback, useEffect, useRef } from 'react';
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
  const content = useRef(0);
  const optionKey = options.map((option) => option.value).join('|');

  // Options keep the width of their label, so a long set scrolls: bring the selected one into view.
  // Nothing to do when everything fits, and the target never goes past the end of the content.
  const reveal = useCallback((target: T, animated: boolean) => {
    const layout = layouts.current.get(target);
    const max = content.current - viewport.current;
    if (layout && max > 0) scroller.current?.scrollTo({ x: Math.max(0, Math.min(layout.x, max)), animated });
  }, []);
  // Declared before the reveal effect so a changed option set never scrolls to a stale position.
  useEffect(() => layouts.current.clear(), [optionKey]);
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

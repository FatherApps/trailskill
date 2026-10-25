import { useState, type ReactNode } from 'react';
import { Pressable, Text, View, type LayoutChangeEvent } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { Icon } from '../../../core/ui';
import '../i18n';

export type TimingHeaderProps = {
  title: string;
  subtitle?: string;
  onBack: () => void;
  // For example a sync pill; the header does not know what it is.
  trailing?: ReactNode;
};

export function TimingHeader({ title, subtitle, onBack, trailing }: TimingHeaderProps) {
  const { colors, space, radius, size, typography } = useTheme();
  const [widths, setWidths] = useState<{ container?: number; text?: number; trailing?: number }>({});
  const measured = (key: 'container' | 'text' | 'trailing') => (event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    setWidths((current) => (current[key] === width ? current : { ...current, [key]: width }));
  };

  // Same approach as the Stopwatch action row: natural widths come from a hidden copy, so the choice cannot oscillate.
  // The trailing slot drops under the title and subtitle when back button, text and slot do not fit on one row.
  const { container, text, trailing: trailingWidth } = widths;
  const stacked =
    trailing != null &&
    container !== undefined &&
    text !== undefined &&
    trailingWidth !== undefined &&
    size['target-min'] + text + trailingWidth + 2 * space[3] > container - 2 * space[4];

  const titleBlock = (
    <>
      <Text accessibilityRole="header" style={[typography.title, { color: colors.ink }]}>
        {title}
      </Text>
      {subtitle !== undefined && <Text style={[typography.caption, { color: colors['ink-muted'] }]}>{subtitle}</Text>}
    </>
  );

  return (
    <View
      testID="timing-header"
      onLayout={measured('container')}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        paddingTop: space[4],
        paddingHorizontal: space[4],
        paddingBottom: space[2],
        backgroundColor: colors['surface-0'],
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}
        onPress={onBack}
        style={{
          minWidth: size['target-min'],
          minHeight: size['target-min'],
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: radius.full,
          backgroundColor: colors['surface-1'],
        }}
      >
        <Icon name="arrow_back" />
      </Pressable>
      {trailing != null && (
        <View
          pointerEvents="none"
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          style={{ position: 'absolute', flexDirection: 'row', opacity: 0 }}
        >
          <View testID="timing-header-text-measure" onLayout={measured('text')} style={{ flexShrink: 0 }}>
            {titleBlock}
          </View>
          <View testID="timing-header-trailing-measure" onLayout={measured('trailing')} style={{ flexShrink: 0 }}>
            {trailing}
          </View>
        </View>
      )}
      {/* minWidth 0 lets a long title wrap inside the row instead of pushing the trailing slot out. */}
      <View testID="timing-header-text" style={{ flex: 1, minWidth: 0 }}>
        {titleBlock}
        {stacked && (
          <View testID="timing-header-trailing" style={{ alignSelf: 'flex-start', marginTop: space[1] }}>
            {trailing}
          </View>
        )}
      </View>
      {!stacked && trailing != null && <View testID="timing-header-trailing">{trailing}</View>}
    </View>
  );
}

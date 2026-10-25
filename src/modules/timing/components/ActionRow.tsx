import { useState, type ReactElement } from 'react';
import { PixelRatio, View, type LayoutChangeEvent } from 'react-native';

import { typography as baseTypography, useTheme } from '../../../core/theme';
import { Button, type ButtonProps } from '../../../core/ui';

// Same threshold as the athletes HistoryList: from this combined (theme x system) text scale, stack.
const largeTextScale = 1.5;

export function useLargeText(): boolean {
  const { typography } = useTheme();
  return (typography.caption.fontSize / baseTypography.caption.fontSize) * PixelRatio.getFontScale() >= largeTextScale;
}

const noop = () => {};

// The secondary button (left) takes its content width and the primary one the rest. If that does not fit, or
// the text is large, they stack full width with the primary on top.
// The natural widths come from a hidden, absolutely positioned copy of the buttons: they do not depend on the
// layout chosen below, so the decision cannot oscillate; it only changes when a measurement does.
export function ActionRow({
  secondary,
  primary,
  large,
  renderPrimary = (props) => <Button {...props} />,
}: {
  secondary: ButtonProps;
  primary: ButtonProps;
  large: boolean;
  // For a primary control that wraps Button, such as ArrivalButton.
  renderPrimary?: (props: ButtonProps) => ReactElement;
}) {
  const { space } = useTheme();
  const [widths, setWidths] = useState<{ container?: number; secondary?: number; primary?: number }>({});
  const measured = (key: 'container' | 'secondary' | 'primary') => (event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    setWidths((current) => (current[key] === width ? current : { ...current, [key]: width }));
  };

  const { container, secondary: secondaryWidth, primary: primaryWidth } = widths;
  const stacked =
    large ||
    (container !== undefined &&
      secondaryWidth !== undefined &&
      primaryWidth !== undefined &&
      secondaryWidth + space[2] + primaryWidth > container);

  const secondarySlot = (
    <View key="secondary" testID="stopwatch-secondary-slot" style={stacked ? undefined : { flexShrink: 0 }}>
      <Button {...secondary} />
    </View>
  );
  const primarySlot = (
    <View key="primary" testID="stopwatch-primary-slot" style={stacked ? undefined : { flex: 1 }}>
      {renderPrimary(primary)}
    </View>
  );

  return (
    <View testID="stopwatch-actions" onLayout={measured('container')}>
      <View
        testID="stopwatch-measure"
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={{ position: 'absolute', flexDirection: 'row', opacity: 0 }}
      >
        <View testID="stopwatch-secondary-measure" onLayout={measured('secondary')} style={{ flexShrink: 0 }}>
          <Button {...secondary} onPress={noop} />
        </View>
        <View testID="stopwatch-primary-measure" onLayout={measured('primary')} style={{ flexShrink: 0 }}>
          {renderPrimary({ ...primary, onPress: noop })}
        </View>
      </View>
      <View
        testID="stopwatch-actions-layout"
        style={{ flexDirection: stacked ? 'column' : 'row', gap: space[2] }}
      >
        {stacked ? [primarySlot, secondarySlot] : [secondarySlot, primarySlot]}
      </View>
    </View>
  );
}

import { useState } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { useTheme, type ColorToken } from '../theme';

export type TextFieldProps = Omit<TextInputProps, 'style' | 'editable'> & {
  label: string;
  help?: string;
  error?: string;
  protected?: boolean;
};

type FieldColors = {
  background: ColorToken;
  border: ColorToken;
  text: ColorToken;
  placeholder: ColorToken;
  label: ColorToken;
  help: ColorToken;
};

export const textFieldColors: Record<'rest' | 'error' | 'protected', FieldColors> = {
  rest: {
    background: 'surface-1',
    border: 'border-strong',
    text: 'ink',
    placeholder: 'ink-muted',
    label: 'ink',
    help: 'ink-muted',
  },
  error: {
    background: 'danger-bg',
    border: 'danger-text',
    text: 'ink',
    placeholder: 'ink-muted',
    label: 'ink',
    help: 'danger-text',
  },
  protected: {
    background: 'surface-2',
    border: 'surface-2',
    text: 'ink-muted',
    placeholder: 'ink-muted',
    label: 'ink',
    help: 'ink-muted',
  },
};

const styles = StyleSheet.create({
  field: { gap: 6 },
  box: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5 },
  input: { flex: 1, alignSelf: 'stretch', paddingHorizontal: 0, paddingVertical: 0 },
});

export function TextField({
  label,
  help,
  error,
  protected: isProtected,
  readOnly,
  onFocus,
  onBlur,
  ...inputProps
}: TextFieldProps) {
  const { colors, space, radius, size, typography } = useTheme();
  const [focused, setFocused] = useState(false);

  const locked = !!isProtected || !!readOnly;
  const state = isProtected ? textFieldColors.protected : error ? textFieldColors.error : textFieldColors.rest;
  const hint = error ?? help;

  return (
    <View style={styles.field}>
      <Text
        accessible={false}
        importantForAccessibility="no"
        style={[typography.label, { color: colors[state.label] }]}
      >
        {label}
      </Text>
      <View
        style={[
          styles.box,
          {
            minHeight: size['field-h'],
            borderRadius: radius.sm,
            paddingHorizontal: space[3],
            backgroundColor: colors[state.background],
            borderColor: colors[state.border],
          },
          focused &&
            !locked && {
              borderColor: colors.focus,
              outlineColor: colors.focus,
              outlineWidth: 1,
              outlineStyle: 'solid',
            },
        ]}
      >
        {/* No accessibilityRole: React Native has no textbox role, and 'none' would drop the native EditText semantics. */}
        <TextInput
          {...inputProps}
          readOnly={readOnly}
          editable={!locked}
          accessibilityLabel={label}
          accessibilityHint={hint}
          accessibilityState={{ disabled: locked }}
          placeholderTextColor={colors[state.placeholder]}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          style={[styles.input, typography.body, { color: colors[state.text] }]}
        />
      </View>
      {error ? (
        <Text accessibilityLiveRegion="polite" style={[typography.caption, { color: colors['danger-text'] }]}>
          {error}
        </Text>
      ) : help ? (
        <Text
          importantForAccessibility="no"
          accessibilityElementsHidden
          style={[typography.caption, { color: colors[state.help] }]}
        >
          {help}
        </Text>
      ) : null}
    </View>
  );
}

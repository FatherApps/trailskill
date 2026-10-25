import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { t } from '../i18n';
import { useTheme, type ColorToken } from '../theme';
import { Button, type ButtonVariant } from './Button';
import { Icon } from './Icon';
import type { IconName } from './icons';

export type StateKind = 'loading' | 'empty' | 'error' | 'offline' | 'denied';

type Message = Exclude<StateKind, 'loading'>;

export type StateViewProps =
  | { kind: 'loading' }
  | {
      kind: Message;
      // What is happening.
      title: string;
      // Why, or what comes next.
      message: string;
      // At most one action. Empty uses the lime primary button: if the screen already has its main
      // action, do not pass one here, so the screen keeps a single lime action.
      action?: { label: string; onPress: () => void };
      // Replaces the default Material Symbol of the kind (see stateViewIcons), e.g. group or table for empty.
      icon?: IconName;
    };

// Below this delay nothing is shown, so fast loads do not flash a skeleton.
const SKELETON_DELAY_MS = 300;

export const stateViewColors: {
  background: ColorToken;
  title: ColorToken;
  message: ColorToken;
  skeleton: ColorToken;
  kinds: Record<Message, { ring: ColorToken; icon: ColorToken; action: ButtonVariant }>;
} = {
  background: 'surface-1',
  title: 'ink',
  message: 'ink-muted',
  skeleton: 'surface-2',
  kinds: {
    empty: { ring: 'lilac', icon: 'on-color', action: 'primary' },
    error: { ring: 'danger-bg', icon: 'danger-text', action: 'secondary' },
    offline: { ring: 'warning-bg', icon: 'warning-text', action: 'secondary' },
    denied: { ring: 'lilac', icon: 'on-color', action: 'ghost' },
  },
};

// Default icon of each kind, from the design-system README. Loading has none: it shows a skeleton.
const stateViewIcons: Record<Message, IconName> = { empty: 'timer', error: 'error', offline: 'wifi_off', denied: 'lock' };

const styles = StyleSheet.create({
  card: { alignItems: 'center' },
  ring: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  text: { textAlign: 'center', maxWidth: 300 },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  avatar: { width: 40, height: 40 },
  line: { height: 14 },
});

function Skeleton() {
  const { colors, space, radius, typography } = useTheme();
  const fill = { backgroundColor: colors[stateViewColors.skeleton], borderRadius: radius.full };

  return (
    <>
      {[
        ['60%', '35%'],
        ['70%', '30%'],
      ].map(([first, second]) => (
        <View key={first} style={[styles.skeletonRow, { gap: space[3] }]}>
          <View style={[styles.avatar, fill]} />
          <View style={{ flex: 1, gap: space[3] }}>
            <View style={[styles.line, fill, { width: first as `${number}%` }]} />
            <View style={[styles.line, fill, { width: second as `${number}%` }]} />
          </View>
        </View>
      ))}
      <Text style={[typography.caption, { color: colors[stateViewColors.message] }]}>{t('state.loading')}</Text>
    </>
  );
}

// Presentational: renders only what it is given and never queries the network.
export function StateView(props: StateViewProps) {
  const { colors, space, radius, typography } = useTheme();
  const loading = props.kind === 'loading';
  const [showSkeleton, setShowSkeleton] = useState(false);

  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => setShowSkeleton(true), SKELETON_DELAY_MS);
    // Reset on leave, so a later loading state waits the full delay again.
    return () => {
      clearTimeout(timer);
      setShowSkeleton(false);
    };
  }, [loading]);

  return (
    <View
      testID="state-view"
      accessibilityLiveRegion="polite"
      accessibilityState={loading ? { busy: true } : undefined}
      style={[
        styles.card,
        {
          gap: loading ? space[3] : space[2],
          paddingVertical: space[8],
          paddingHorizontal: space[4],
          borderRadius: radius.md,
          backgroundColor: colors[stateViewColors.background],
        },
      ]}
    >
      {props.kind === 'loading' ? (
        showSkeleton && <Skeleton />
      ) : (
        <>
          <View
            style={[
              styles.ring,
              { borderRadius: radius.full, marginBottom: space[2], backgroundColor: colors[stateViewColors.kinds[props.kind].ring] },
            ]}
          >
            <Icon name={props.icon ?? stateViewIcons[props.kind]} color={stateViewColors.kinds[props.kind].icon} />
          </View>
          <Text
            accessibilityRole="header"
            style={[typography.title, styles.text, { color: colors[stateViewColors.title] }]}
          >
            {props.title}
          </Text>
          <Text style={[typography.body, styles.text, { color: colors[stateViewColors.message] }]}>{props.message}</Text>
          {props.action && (
            <Button
              variant={stateViewColors.kinds[props.kind].action}
              label={props.action.label}
              onPress={props.action.onPress}
            />
          )}
        </>
      )}
    </View>
  );
}

import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { Button, IconButton } from '../../../core/ui';
import '../i18n';

export type VideoPlayerScreenProps = {
  /** "Libre 50 m · Piscina de 25 m". */
  event: string;
  /** "8 nov 2026 · 0:31,450". */
  detail: string;
  /** The video, with the phone's own play, pause and seek controls. */
  player: ReactNode;
  // Missing for a video linked to a received time (#1201): where the clock started is not known.
  onJumpToStart?: () => void;
  onBack: () => void;
};

// Presentational. The time's video (#1089) on a dark background, as the camera screen, with a button that takes it to the start.
export function VideoPlayerScreen({ event, detail, player, onJumpToStart, onBack }: VideoPlayerScreenProps) {
  const { colors, space, typography } = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.header, padding: space[4], gap: space[3] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
        <IconButton icon="arrow_back" label={t('family_timing.player.back')} onPress={onBack} />
        <View style={{ flex: 1 }}>
          <Text accessibilityRole="header" style={[typography['body-strong'], { color: colors['on-header'] }]} numberOfLines={1}>
            {event}
          </Text>
          <Text style={[typography.caption, { color: colors['on-header'] }]} numberOfLines={1}>
            {detail}
          </Text>
        </View>
      </View>
      <View accessibilityLabel={t('family_timing.player.video')} style={{ flex: 1 }}>
        {player}
      </View>
      {onJumpToStart && <Button variant="secondary" label={t('family_timing.player.jump_to_start')} onPress={onJumpToStart} />}
    </SafeAreaView>
  );
}

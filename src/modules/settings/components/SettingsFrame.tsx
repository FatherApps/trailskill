import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '../../../core/theme';
import { BackButton } from '../../../core/ui';

// The frame shared by "Ajustes" and its two inner screens: back, title, an optional line under it, and the settings below.
export function SettingsFrame({ title, intro, onBack, children }: { title: string; intro?: string; onBack: () => void; children: ReactNode }) {
  const { colors, space, typography } = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors['surface-0'] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingTop: space[2] }}>
        <BackButton onPress={onBack} />
        <Text accessibilityRole="header" style={[typography.title, { color: colors.ink }]}>
          {title}
        </Text>
      </View>
      <ScrollView contentContainerStyle={{ gap: space[6], padding: space[4], paddingBottom: space[12] * 2 }}>
        {intro && <Text style={[typography.body, { color: colors['ink-muted'] }]}>{intro}</Text>}
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { t } from '../../../core/i18n';
import { themeModes, timePrecisions, type ThemeMode, type TimePrecision } from '../../../core/preferences';
import { useTheme } from '../../../core/theme';
import { formatMillis } from '../../../core/time';
import { IconButton, Segmented } from '../../../core/ui';
import '../i18n';

export type SettingsScreenProps = {
  themeMode: ThemeMode;
  timePrecision: TimePrecision;
  onThemeModeChange: (mode: ThemeMode) => void;
  onTimePrecisionChange: (precision: TimePrecision) => void;
  onBack: () => void;
};

// A fixed synthetic time for the example under the precision choice.
const EXAMPLE_MILLIS = 65_372;

function Section({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  const { colors, space, typography } = useTheme();
  return (
    <View style={{ gap: space[2] }}>
      <Text accessibilityRole="header" style={[typography.subtitle, { color: colors.ink }]}>
        {label}
      </Text>
      {children}
      <Text style={[typography.caption, { color: colors['ink-muted'] }]}>{hint}</Text>
    </View>
  );
}

// Presentational: the caller reads and saves the preferences.
export function SettingsScreen({ themeMode, timePrecision, onThemeModeChange, onTimePrecisionChange, onBack }: SettingsScreenProps) {
  const { colors, space, typography } = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors['surface-0'] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingTop: space[2] }}>
        <IconButton icon="arrow_back" label={t('settings.back')} onPress={onBack} />
        <Text accessibilityRole="header" style={[typography.title, { color: colors.ink }]}>
          {t('settings.title')}
        </Text>
      </View>
      <ScrollView contentContainerStyle={{ gap: space[6], padding: space[4] }}>
        <Section label={t('settings.theme.label')} hint={t('settings.theme.hint')}>
          <Segmented
            accessibilityLabel={t('settings.theme.label')}
            value={themeMode}
            onChange={onThemeModeChange}
            options={themeModes.map((mode) => ({ value: mode, label: t(`settings.theme.${mode}`) }))}
          />
        </Section>
        <Section label={t('settings.precision.label')} hint={t('settings.precision.hint')}>
          <Segmented
            accessibilityLabel={t('settings.precision.label')}
            value={timePrecision}
            onChange={onTimePrecisionChange}
            options={timePrecisions.map((precision) => ({ value: precision, label: t(`settings.precision.${precision}`) }))}
          />
          <Text style={[typography['time-md'], { color: colors.ink }]}>
            {t('settings.precision.example', { time: formatMillis(EXAMPLE_MILLIS, { precision: timePrecision }) })}
          </Text>
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

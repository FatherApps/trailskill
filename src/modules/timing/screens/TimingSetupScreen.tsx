import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { Button, Segmented, type SegmentedOption } from '../../../core/ui';
import { TimingHeader } from '../components/TimingHeader';
import '../i18n';

// The options arrive from the container (catalogs and session choices); the screen only draws them.
export type SetupField = { options: SegmentedOption<string>[]; value: string };

export type TimingSetupScreenProps = {
  // For example the group and the time of the session.
  subtitle: string;
  stroke: SetupField;
  distance: SetupField;
  pool: SetupField;
  sessionType: SetupField;
  source: SetupField;
  onStrokeChange: (value: string) => void;
  onDistanceChange: (value: string) => void;
  onPoolChange: (value: string) => void;
  onSessionTypeChange: (value: string) => void;
  onSourceChange: (value: string) => void;
  // Slot for the athlete rows, drawn between the selectors and the start button.
  athletes?: ReactNode;
  onStart: () => void;
  onBack: () => void;
};

export function TimingSetupScreen({
  subtitle,
  stroke,
  distance,
  pool,
  sessionType,
  source,
  onStrokeChange,
  onDistanceChange,
  onPoolChange,
  onSessionTypeChange,
  onSourceChange,
  athletes,
  onStart,
  onBack,
}: TimingSetupScreenProps) {
  const { colors, space, typography } = useTheme();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors['surface-0'] }}>
      <TimingHeader title={t('timing.setup.title')} subtitle={subtitle} onBack={onBack} />
      <ScrollView contentContainerStyle={{ gap: space[4], padding: space[4] }}>
        <Text style={[typography.subtitle, { color: colors.ink }]}>{t('timing.setup.question')}</Text>
        <Segmented accessibilityLabel={t('timing.setup.stroke')} onChange={onStrokeChange} {...stroke} />
        <Segmented accessibilityLabel={t('timing.setup.distance')} onChange={onDistanceChange} {...distance} />
        <Segmented accessibilityLabel={t('timing.setup.pool')} onChange={onPoolChange} {...pool} />
        <Segmented accessibilityLabel={t('timing.setup.session_type')} onChange={onSessionTypeChange} {...sessionType} />
        <Segmented accessibilityLabel={t('timing.setup.source')} onChange={onSourceChange} {...source} />
        {athletes}
        <View>
          <Button size="timing" label={t('timing.setup.start')} onPress={onStart} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

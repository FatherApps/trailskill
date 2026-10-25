import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { Segmented } from '../../../core/ui';
import { TimingHeader } from '../components/TimingHeader';
import '../i18n';

export type SchoolChoiceScreenProps = {
  schools: { id: string; name: string }[];
  onChoose: (schoolId: string) => void;
  onBack: () => void;
};

// Asked before any timing starts when a person runs several schools: every time is written for one school, so none is guessed.
// Nothing is selected until a tap, which also moves on (same selector as the athlete profile).
export function SchoolChoiceScreen({ schools, onChoose, onBack }: SchoolChoiceScreenProps) {
  const { colors, space, typography } = useTheme();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors['surface-0'] }}>
      <TimingHeader title={t('timing.setup.title')} onBack={onBack} />
      <View style={{ gap: space[4], padding: space[4] }}>
        <Text style={[typography.subtitle, { color: colors.ink }]}>{t('timing.school.question')}</Text>
        <Segmented
          accessibilityLabel={t('timing.school.label')}
          options={schools.map((school) => ({ value: school.id, label: school.name }))}
          value=""
          onChange={onChoose}
        />
      </View>
    </SafeAreaView>
  );
}

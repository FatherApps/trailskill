import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { Banner, Button, TextField } from '../../../core/ui';
import { TimingHeader } from '../components/TimingHeader';
import { formatMeters, parseSplitMeters } from '../domain/splitMeters';
import '../i18n';

export type SplitMetersScreenProps = {
  // The event, for example "Libre 100 m · Entrenamiento".
  subtitle: string;
  // Meters of the event: the review keeps every mark below it.
  distance: number;
  // One per mark, in order: "Parcial 2 · 0:25,10" and the meters it has now (`null`: none).
  splits: { label: string; meters: number | null }[];
  // Meters increase and stay above 0 and below the distance; an empty field is no meters, never 0.
  onSave: (meters: (number | null)[]) => void;
  onBack: () => void;
};

// The optional step between stopping and saving: the meters were filled from the pool, and any of them can be corrected.
export function SplitMetersScreen({ subtitle, distance, splits, onSave, onBack }: SplitMetersScreenProps) {
  const { colors, space, typography } = useTheme();
  const [texts, setTexts] = useState(() => splits.map((split) => (split.meters === null ? '' : formatMeters(split.meters))));
  const [reason, setReason] = useState<'format' | 'range' | 'order'>();

  function save() {
    const parsed = parseSplitMeters(texts, distance);
    if (parsed.ok) onSave(parsed.value);
    else setReason(parsed.reason);
  }

  const error = reason && t(`timing.meters.error_${reason}`, { distance });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors['surface-0'] }}>
      <TimingHeader title={t('timing.meters.title')} subtitle={subtitle} onBack={onBack} />
      <ScrollView contentContainerStyle={{ gap: space[4], padding: space[4] }} keyboardShouldPersistTaps="handled">
        {error && <Banner variant="warn">{error}</Banner>}
        <Text style={[typography.body, { color: colors['ink-muted'] }]}>{t('timing.meters.help')}</Text>
        {splits.map((split, index) => (
          <TextField
            key={index}
            label={t('timing.meters.field_label', { label: split.label })}
            help={t('timing.meters.field_help')}
            value={texts[index]}
            onChangeText={(text) => setTexts((current) => current.map((value, i) => (i === index ? text : value)))}
            keyboardType="numbers-and-punctuation"
            autoCorrect={false}
          />
        ))}
        <Button label={t('timing.meters.save')} onPress={save} />
      </ScrollView>
    </SafeAreaView>
  );
}

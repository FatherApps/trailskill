import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { formatTime, type Hundredths } from '../../../core/time';
import { Button, TextField, TimeValue } from '../../../core/ui';
import { TimingHeader } from '../components/TimingHeader';
import { parseTimeInput } from '../domain/timeInput';
import '../i18n';

export type TimeCorrectionScreenProps = {
  // The event, for example "Libre 50 m · Entrenamiento".
  subtitle: string;
  // Short name of the athlete whose saved time is corrected.
  athleteName: string;
  // `null` is a missing time: the field starts empty.
  initialTime: Hundredths | null;
  // Why the container could not save, already worded for the person.
  error?: string;
  // `null` is a missing time, never 0.
  onSave: (time: Hundredths | null) => void;
  onBack: () => void;
};

export function TimeCorrectionScreen({ subtitle, athleteName, initialTime, error, onSave, onBack }: TimeCorrectionScreenProps) {
  const { colors, space, typography } = useTheme();
  const [text, setText] = useState(initialTime === null ? '' : formatTime(initialTime));
  const [unreadable, setUnreadable] = useState(false);

  function save() {
    const parsed = parseTimeInput(text);
    setUnreadable(!parsed.ok);
    if (parsed.ok) onSave(parsed.value);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors['surface-0'] }}>
      <TimingHeader title={t('timing.correct.title')} subtitle={subtitle} onBack={onBack} />
      <ScrollView contentContainerStyle={{ gap: space[4], padding: space[4] }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: space[1] }}>
          <Text style={[typography['body-strong'], { color: colors.ink }]}>{athleteName}</Text>
          <Text style={[typography.caption, { color: colors['ink-muted'] }]}>{t('timing.correct.current')}</Text>
          <TimeValue value={initialTime} />
        </View>
        <TextField
          label={t('timing.correct.field_label')}
          help={t('timing.correct.field_help')}
          error={unreadable ? t('timing.correct.error_format') : error}
          value={text}
          onChangeText={setText}
          keyboardType="numbers-and-punctuation"
          autoCorrect={false}
          onSubmitEditing={save}
        />
        <Button label={t('timing.correct.save')} onPress={save} />
      </ScrollView>
    </SafeAreaView>
  );
}

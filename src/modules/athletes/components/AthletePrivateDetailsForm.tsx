import { useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { Banner, Button, Segmented, TextField } from '../../../core/ui';
import { GENDERS, isValidBirthDate, type Gender, type PrivateDetailsInput } from '../data/athletePrivateDetailsRules';
import '../i18n';
import { formatDate } from './formatDate';

type GenderChoice = Gender | '';

export type AthletePrivateDetailsFormProps = {
  // What the swimmer has now (null: not answered); the form keeps what is being typed.
  birthDate: string | null;
  gender: Gender | null;
  // The date on the phone (local, YYYY-MM-DD), from the container: the last day that can be saved.
  today: string;
  // What the fields start with; the saved values when absent (a gallery state shows a half-typed form).
  draft?: { birthDate: string; gender: GenderChoice };
  saving?: boolean;
  failed?: boolean;
  // The sync state after a save, from the container.
  status?: ReactNode;
  onSave: (details: PrivateDetailsInput) => void;
};

// Presentational: no database or repository. A flat section of the "Datos del nadador" card (divider and subtitle, no card of its own).
// "Guardar" is on only when something changed and the date, when there is one, is real and not in the future.
export function AthletePrivateDetailsForm({ birthDate, gender, today, draft, saving = false, failed = false, status, onSave }: AthletePrivateDetailsFormProps) {
  const { colors, space, typography } = useTheme();
  const [values, setValues] = useState<{ birthDate: string; gender: GenderChoice }>(draft ?? { birthDate: birthDate ?? '', gender: gender ?? '' });
  const text = values.birthDate.trim();
  const valid = text === '' || isValidBirthDate(text, today);
  // A real date that is later than today is "future"; anything else that is not valid (before 1900, not a date) is "invalid".
  const error = valid ? undefined : t(isValidBirthDate(text, text) && text > today ? 'athletes.edit.private.birth_date_future' : 'athletes.edit.private.birth_date_invalid');
  const changed = (text || null) !== birthDate || (values.gender || null) !== gender;
  const reason = !valid ? t('athletes.edit.private.save_invalid') : !changed ? t('athletes.edit.private.save_unchanged') : undefined;
  const shown = text !== '' && valid ? formatDate(text, 'long') : null;

  return (
    <View style={{ alignSelf: 'stretch', gap: space[3], paddingTop: space[4], borderTopWidth: 1, borderTopColor: colors.border }}>
      <Text accessibilityRole="header" style={[typography['body-strong'], { color: colors.ink }]}>
        {t('athletes.edit.private.title')}
      </Text>
      <TextField
        label={t('athletes.edit.private.birth_date')}
        value={values.birthDate}
        help={shown ?? t('athletes.edit.private.birth_date_hint')}
        error={error}
        placeholder="AAAA-MM-DD"
        maxLength={10}
        keyboardType="numbers-and-punctuation"
        autoCorrect={false}
        onChangeText={(next) => setValues((current) => ({ ...current, birthDate: next }))}
      />
      <View style={{ gap: space[2] }}>
        <Text style={[typography.caption, { color: colors['ink-muted'] }]}>{t('athletes.edit.private.gender')}</Text>
        <Segmented<GenderChoice>
          accessibilityLabel={t('athletes.edit.private.gender')}
          value={values.gender}
          onChange={(next) => setValues((current) => ({ ...current, gender: next }))}
          options={[
            { value: '', label: t('athletes.edit.private.gender_unset') },
            ...GENDERS.map((value) => ({ value, label: t(`athletes.edit.private.gender_${value}`) })),
          ]}
        />
      </View>
      {failed && (
        <Banner variant="warn" icon="error">
          {t('athletes.edit.private.save_failed')}
        </Banner>
      )}
      <Button
        variant="primary"
        label={t('athletes.edit.save')}
        loading={saving}
        disabledReason={reason}
        onPress={() => valid && onSave({ birthDate: text || null, gender: values.gender || null })}
      />
      {status}
    </View>
  );
}

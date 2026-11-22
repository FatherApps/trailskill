import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { Banner, Button, TextField } from '../../../core/ui';
import { cleanAthleteName, MAX_ATHLETE_NAME_LENGTH } from '../data/athleteName';
import '../i18n';

export type AthleteNameFormProps = {
  // The names the swimmer has now (trimmed); the form keeps what is being typed.
  firstName: string;
  lastName: string;
  // What the fields start with; the saved names when absent (a gallery state shows a half-typed form).
  draft?: { firstName: string; lastName: string };
  saving?: boolean;
  failed?: boolean;
  // The sync state after a save, from the container.
  status?: ReactNode;
  onSave: (names: { firstName: string; lastName: string }) => void;
};

// Presentational: no database or repository. "Guardar" is on only when something changed and neither name is empty after trimming.
export function AthleteNameForm({ firstName, lastName, draft, saving = false, failed = false, status, onSave }: AthleteNameFormProps) {
  const { space } = useTheme();
  const [values, setValues] = useState(draft ?? { firstName, lastName });
  const first = cleanAthleteName(values.firstName);
  const last = cleanAthleteName(values.lastName);
  const changed = first !== firstName.trim() || last !== lastName.trim();
  const reason = first === null || last === null ? t('athletes.edit.save_missing') : !changed ? t('athletes.edit.save_unchanged') : undefined;

  return (
    <View style={{ alignSelf: 'stretch', gap: space[3] }}>
      <TextField
        label={t('athletes.edit.first_name')}
        value={values.firstName}
        help={t('athletes.edit.name_limit', { max: MAX_ATHLETE_NAME_LENGTH })}
        error={first === null ? t('athletes.edit.first_name_required') : undefined}
        maxLength={MAX_ATHLETE_NAME_LENGTH}
        onChangeText={(text) => setValues((current) => ({ ...current, firstName: text }))}
        autoCapitalize="words"
        autoComplete="given-name"
        textContentType="givenName"
      />
      <TextField
        label={t('athletes.edit.last_name')}
        value={values.lastName}
        help={t('athletes.edit.name_limit', { max: MAX_ATHLETE_NAME_LENGTH })}
        error={last === null ? t('athletes.edit.last_name_required') : undefined}
        maxLength={MAX_ATHLETE_NAME_LENGTH}
        onChangeText={(text) => setValues((current) => ({ ...current, lastName: text }))}
        autoCapitalize="words"
        autoComplete="family-name"
        textContentType="familyName"
      />
      {failed && (
        <Banner variant="warn" icon="error">
          {t('athletes.edit.save_failed')}
        </Banner>
      )}
      <Button
        variant="primary"
        label={t('athletes.edit.save')}
        loading={saving}
        disabledReason={reason}
        onPress={() => first !== null && last !== null && onSave({ firstName: first, lastName: last })}
      />
      {status}
    </View>
  );
}

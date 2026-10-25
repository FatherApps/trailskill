import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '../../../core/theme';
import { Button, StepHeader, SwimmerRow, TextField } from '../../../core/ui';
import { ScreenFrame } from '../components/ScreenFrame';
import { t } from '../i18n';

export type AddAthleteField = 'firstName' | 'lastName';

export type AddedAthlete = {
  id: string;
  // Already shortened with the athletes module ("Lucía R."): this screen never formats names.
  name: string;
  initials: string;
  color: 'athlete-1' | 'athlete-2' | 'athlete-3' | 'athlete-4';
};

export type AddAthletesScreenProps = {
  // 1-based position in the flow: a guardian goes through four steps.
  step: number;
  total: number;
  values: Record<AddAthleteField, string>;
  // The profiles added so far: only names, never a document number or a birth date.
  athletes: AddedAthlete[];
  // 'self': an adult has one own profile, so the form goes away once it exists.
  relation: 'guardian' | 'self';
  busy?: boolean;
  // The sync state of one profile, supplied by the caller (src/core/sync owns it).
  renderStatus?: (athleteId: string) => ReactNode;
  onChange: (field: AddAthleteField, value: string) => void;
  onAdd: () => void;
  onContinue: () => void;
  onBack: () => void;
};

const styles = StyleSheet.create({ list: { overflow: 'hidden' }, separator: { height: StyleSheet.hairlineWidth } });

// Step 3 of registration for a guardian: only first and last name. Category and group are assigned by the school.
export function AddAthletesScreen({
  step,
  total,
  values,
  athletes,
  relation,
  busy = false,
  renderStatus,
  onChange,
  onAdd,
  onContinue,
  onBack,
}: AddAthletesScreenProps) {
  const { colors, space, radius } = useTheme();
  const [submitted, setSubmitted] = useState(false);
  const missing = (field: AddAthleteField) => submitted && values[field].trim() === '';
  const showForm = relation === 'guardian' || athletes.length === 0;

  function add() {
    if (values.firstName.trim() === '' || values.lastName.trim() === '') {
      setSubmitted(true);
      return;
    }
    setSubmitted(false);
    onAdd();
  }

  return (
    <ScreenFrame
      title={t('accounts.create_title')}
      footer={
        <Button
          label={t('accounts.athletes.continue')}
          disabledReason={athletes.length === 0 ? t('accounts.athletes.add_first') : undefined}
          onPress={onContinue}
        />
      }
    >
      <StepHeader step={step} total={total} title={t('accounts.athletes.title')} onBack={onBack} />
      {athletes.length > 0 && (
        <View style={[styles.list, { paddingVertical: space[1], borderRadius: radius.md, backgroundColor: colors['surface-1'] }]}>
          {athletes.map((athlete, index) => (
            <View key={athlete.id}>
              {index > 0 && <View style={[styles.separator, { backgroundColor: colors.border }]} />}
              <SwimmerRow
                name={athlete.name}
                initials={athlete.initials}
                color={athlete.color}
                detail={t(`accounts.athletes.relation_${relation}`)}
                status={renderStatus?.(athlete.id)}
              />
            </View>
          ))}
        </View>
      )}
      {showForm && (
        <>
          <TextField
            label={t('accounts.athletes.first_name_label')}
            value={values.firstName}
            error={missing('firstName') ? t('accounts.athletes.first_name_required') : undefined}
            onChangeText={(text) => onChange('firstName', text)}
            autoCapitalize="words"
            autoComplete="given-name"
            textContentType="givenName"
          />
          <TextField
            label={t('accounts.athletes.last_name_label')}
            value={values.lastName}
            error={missing('lastName') ? t('accounts.athletes.last_name_required') : undefined}
            onChangeText={(text) => onChange('lastName', text)}
            autoCapitalize="words"
            autoComplete="family-name"
            textContentType="familyName"
          />
          <Button
            variant="secondary"
            label={t(athletes.length === 0 ? 'accounts.athletes.add' : 'accounts.athletes.add_another')}
            loading={busy}
            onPress={add}
          />
        </>
      )}
    </ScreenFrame>
  );
}

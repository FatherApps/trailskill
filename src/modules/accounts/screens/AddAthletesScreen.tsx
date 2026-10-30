import { useState, type ReactNode } from 'react';

import { Banner, Button, ColorCard, Segmented, StepHeader, TextField } from '../../../core/ui';
import { AddAthleteCard } from '../components/AddAthleteCard';
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
  // Whether "Continuar" can be pressed. Defaults to "at least one profile is listed"; the caller says otherwise when the list could not be read (somebody may be added).
  canContinue?: boolean;
  busy?: boolean;
  // "Continuar" is keeping the reached step: it cannot be pressed again.
  continuing?: boolean;
  // The last add did not work: nothing was saved and the typed names are still there.
  // 'add': the profile was not saved; 'continue': the reached step was not saved.
  failed?: false | 'add' | 'continue';
  // The categories of the school invitation, when it brings some: choosing one is optional ('' is no category).
  categories?: { id: string; name: string }[];
  categoryId?: string;
  onCategoryChange?: (categoryId: string) => void;
  // Optional, for the official results import. It lives in memory only (see the container): this screen just shows it.
  identityNumber?: string;
  identityNumberInvalid?: boolean;
  onIdentityNumberChange?: (text: string) => void;
  // The sync state of one profile, supplied by the caller (src/core/sync owns it).
  renderStatus?: (athleteId: string) => ReactNode;
  onChange: (field: AddAthleteField, value: string) => void;
  onAdd: () => void;
  onContinue: () => void;
};

// The server rejects a name longer than this (accounts_adult_profiles and the managed profiles check constraints).
const NAME_MAX_LENGTH = 100;

// Step 3 of registration for a guardian: only first and last name. Category and group are assigned by the school.
export function AddAthletesScreen({
  step,
  total,
  values,
  athletes,
  canContinue = athletes.length > 0,
  busy = false,
  continuing = false,
  failed = false,
  categories = [],
  categoryId = '',
  onCategoryChange,
  identityNumber = '',
  identityNumberInvalid = false,
  onIdentityNumberChange,
  renderStatus,
  onChange,
  onAdd,
  onContinue,
}: AddAthletesScreenProps) {
  const [submitted, setSubmitted] = useState(false);
  const missing = (field: AddAthleteField) => submitted && values[field].trim() === '';

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
          // Busy also while another profile saves: the tap is not ignored in silence. With nobody added the button is not allowed rather than waiting, so it shows its reason, not a spinner.
          loading={continuing || (busy && canContinue)}
          disabledReason={canContinue ? undefined : t('accounts.athletes.add_first')}
          onPress={onContinue}
        />
      }
    >
      {/* No Back button: the account already exists, so going back would leave the registration half done. */}
      <StepHeader step={step} total={total} title={t('accounts.athletes.title')} />
      {athletes.map((athlete) => (
        <ColorCard key={athlete.id} color={athlete.color} title={athlete.name} detail={t('accounts.athletes.relation_guardian')}>
          {renderStatus?.(athlete.id)}
        </ColorCard>
      ))}
      {failed && (
        <Banner variant="warn" icon="error">
          {t(failed === 'add' ? 'accounts.athletes.add_failed' : 'accounts.athletes.continue_failed')}
        </Banner>
      )}
      <TextField
        label={t('accounts.athletes.first_name_label')}
        value={values.firstName}
        help={t('accounts.athletes.name_limit', { max: NAME_MAX_LENGTH })}
        error={missing('firstName') ? t('accounts.athletes.first_name_required') : undefined}
        maxLength={NAME_MAX_LENGTH}
        onChangeText={(text) => onChange('firstName', text)}
        autoCapitalize="words"
        autoComplete="given-name"
        textContentType="givenName"
      />
      <TextField
        label={t('accounts.athletes.last_name_label')}
        value={values.lastName}
        help={t('accounts.athletes.name_limit', { max: NAME_MAX_LENGTH })}
        error={missing('lastName') ? t('accounts.athletes.last_name_required') : undefined}
        maxLength={NAME_MAX_LENGTH}
        onChangeText={(text) => onChange('lastName', text)}
        autoCapitalize="words"
        autoComplete="family-name"
        textContentType="familyName"
      />
      <TextField
        label={t('accounts.athletes.identity_number_label')}
        value={identityNumber}
        help={t('accounts.athletes.identity_number_help')}
        error={identityNumberInvalid ? t('accounts.athletes.identity_number_invalid') : undefined}
        onChangeText={(text) => onIdentityNumberChange?.(text)}
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        importantForAutofill="no"
      />
      {categories.length > 0 && (
        <Segmented
          accessibilityLabel={t('accounts.athletes.category_label')}
          options={[{ value: '', label: t('accounts.athletes.category_none') }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
          value={categoryId}
          onChange={(next) => onCategoryChange?.(next)}
        />
      )}
      <AddAthleteCard
        label={t(athletes.length === 0 ? 'accounts.athletes.add' : 'accounts.athletes.add_another')}
        busy={busy || continuing}
        onPress={add}
      />
    </ScreenFrame>
  );
}

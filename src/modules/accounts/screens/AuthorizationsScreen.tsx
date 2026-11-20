import { useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { useTheme } from '../../../core/theme';
import { BackButton, Banner, Button, ConfirmSheet, StepHeader, type AthleteAvatarSlot } from '../../../core/ui';
import { athleteColor } from '../../athletes';
import { AthleteAvatarWithPhoto } from '../components/AthleteAvatarWithPhoto';
import { ConsentCard } from '../components/ConsentCard';
import { ScreenFrame } from '../components/ScreenFrame';
import type { AuthorizationPurpose } from '../data/authorizationStatus';
import type { AuthorizationRecord, AuthorizationText } from '../data/authorizations';
import { t } from '../i18n';
import { LEGAL_REVIEW_PENDING } from '../legalReview';

export type AuthorizationsScreenProps = {
  // Registration is a step with "Continuar"; manage is the screen opened later from the home screen.
  mode: 'registration' | 'manage';
  step?: { current: number; total: number };
  athletes: { id: string; name: string }[];
  // The current text of each purpose.
  texts: AuthorizationText[];
  // The authorizations in force of this adult, by athlete and purpose.
  inForce: Record<string, Partial<Record<AuthorizationPurpose, AuthorizationRecord>>>;
  // The texts the adult checked, one entry per athlete and purpose. May be empty in registration.
  // Resolves true when everything was saved; a false keeps the checked boxes so the person can try again.
  onSave: (selected: { athleteId: string; text: AuthorizationText }[]) => Promise<boolean>;
  onWithdraw: (authorizationId: string) => void;
  // The last save or withdrawal did not work on this device.
  // 'load': the texts or authorizations could not be read; true: the last save or withdrawal failed.
  failed?: boolean | 'load';
  onBack?: () => void;
  // The athlete's avatar; by default the one that finds the photo and show_photo in the local database. The gallery passes a plain one.
  Avatar?: AthleteAvatarSlot;
};

// "Ana M." -> "AM": the first letter of the first two words.
const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word.charAt(0).toUpperCase()).join('');

// Nothing is ever pre-checked: the selection is local and starts empty every time the screen opens.
export function AuthorizationsScreen({ mode, step, athletes, texts, inForce, onSave, onWithdraw, failed, onBack, Avatar = AthleteAvatarWithPhoto }: AuthorizationsScreenProps) {
  const { colors, typography } = useTheme();
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // State updates land after the render: a ref blocks a second press made before the loading state shows.
  const saveInFlight = useRef(false);
  const keyOf = (athleteId: string, purpose: AuthorizationPurpose) => `${athleteId}:${purpose}`;
  const registration = mode === 'registration';

  // A purpose that is now in force (for example after a partial save) leaves the selection, so withdrawing it later shows it unchecked.
  const stale = Object.keys(selected).filter((key) => {
    const [athleteId, purpose] = key.split(':') as [string, AuthorizationPurpose];
    return inForce[athleteId]?.[purpose];
  });
  if (stale.length > 0) setSelected(Object.fromEntries(Object.entries(selected).filter(([key]) => !stale.includes(key))));

  async function save() {
    const chosen = athletes.flatMap((athlete) =>
      texts.filter((text) => selected[keyOf(athlete.id, text.purpose)] && !inForce[athlete.id]?.[text.purpose]).map((text) => ({ athleteId: athlete.id, text })),
    );
    // Manage with nothing checked has nothing to save; registration continues without authorizing.
    if (chosen.length === 0 && !registration) return;
    if (saveInFlight.current) return;
    saveInFlight.current = true;
    setSaving(true);
    try {
      if (await onSave(chosen)) setSelected({});
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  }

  function confirmWithdrawal() {
    if (withdrawing) onWithdraw(withdrawing);
    setWithdrawing(null);
  }

  return (
    <ScreenFrame
      title={registration ? t('accounts.create_title') : t('accounts.authorizations.title')}
      before={
        !registration && onBack ? (
          <View style={{ alignSelf: 'flex-start' }}>
            <BackButton onPress={onBack} />
          </View>
        ) : undefined
      }
      footer={<Button label={t(registration ? 'accounts.authorizations.continue' : 'accounts.authorizations.save')} onPress={save} loading={saving} />}
    >
      {registration && step && onBack && (
        <StepHeader step={step.current} total={step.total} title={t('accounts.authorizations.title')} onBack={onBack} />
      )}
      {LEGAL_REVIEW_PENDING && (
        <Banner variant="warn" icon="info">
          {t('accounts.authorizations.provisional')}
        </Banner>
      )}
      {failed && (
        <Banner variant="warn" icon="error">
          {t(failed === 'load' ? 'accounts.authorizations.load_failed' : 'accounts.authorizations.save_failed')}
        </Banner>
      )}
      <Text style={[typography.body, { color: colors['ink-muted'] }]}>{t('accounts.authorizations.intro')}</Text>
      {athletes.length === 0 && <Text style={[typography.body, { color: colors.ink }]}>{t('accounts.authorizations.empty')}</Text>}
      {athletes.map((athlete) => (
        <ConsentCard
          key={athlete.id}
          athleteName={athlete.name}
          avatar={<Avatar athleteId={athlete.id} initials={initialsOf(athlete.name)} color={athleteColor(athlete.id)} size="sm" />}
          texts={texts}
          inForce={inForce[athlete.id] ?? {}}
          selected={Object.fromEntries(texts.map(({ purpose }) => [purpose, selected[keyOf(athlete.id, purpose)] === true]))}
          onToggle={(purpose) => setSelected((current) => ({ ...current, [keyOf(athlete.id, purpose)]: !current[keyOf(athlete.id, purpose)] }))}
          onWithdraw={setWithdrawing}
        />
      ))}
      <ConfirmSheet
        visible={withdrawing !== null}
        title={t('accounts.authorizations.withdraw_title')}
        message={t('accounts.authorizations.withdraw_message')}
        confirmLabel={t('accounts.authorizations.withdraw_confirm')}
        cancelLabel={t('accounts.authorizations.withdraw_cancel')}
        destructive
        onConfirm={confirmWithdrawal}
        onCancel={() => setWithdrawing(null)}
      />
    </ScreenFrame>
  );
}

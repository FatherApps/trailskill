import { useState } from 'react';
import { Text, View } from 'react-native';

import { useTheme } from '../../../core/theme';
import { Banner, Button, ConfirmSheet, StepHeader, Tag } from '../../../core/ui';
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
};

// Nothing is ever pre-checked: the selection is local and starts empty every time the screen opens.
export function AuthorizationsScreen({ mode, step, athletes, texts, inForce, onSave, onWithdraw, failed, onBack }: AuthorizationsScreenProps) {
  const { colors, space, typography } = useTheme();
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
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
    if (await onSave(chosen)) setSelected({});
  }

  function confirmWithdrawal() {
    if (withdrawing) onWithdraw(withdrawing);
    setWithdrawing(null);
  }

  return (
    <ScreenFrame
      title={registration ? t('accounts.create_title') : t('accounts.authorizations.title')}
      before={!registration && onBack ? <Button variant="ghost" label={t('common.back')} onPress={onBack} /> : undefined}
      footer={<Button label={t(registration ? 'accounts.authorizations.continue' : 'accounts.authorizations.save')} onPress={save} />}
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
        <View key={athlete.id} style={{ gap: space[3] }}>
          <Text accessibilityRole="header" style={[typography.subtitle, { color: colors.ink }]}>
            {athlete.name}
          </Text>
          {!inForce[athlete.id]?.record_times && <Tag variant="warn" label={t('accounts.authorizations.skipped')} />}
          {texts.map((text) => (
            <ConsentCard
              key={text.purpose}
              text={text}
              accepted={inForce[athlete.id]?.[text.purpose]}
              checked={selected[keyOf(athlete.id, text.purpose)] === true}
              onToggle={() => setSelected((current) => ({ ...current, [keyOf(athlete.id, text.purpose)]: !current[keyOf(athlete.id, text.purpose)] }))}
              onWithdraw={setWithdrawing}
            />
          ))}
        </View>
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

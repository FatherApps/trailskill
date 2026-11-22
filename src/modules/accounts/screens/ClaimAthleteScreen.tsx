import { useState } from 'react';
import { Text } from 'react-native';

import { useTheme } from '../../../core/theme';
import { Banner, Button, Segmented } from '../../../core/ui';
import { JoinTextCard } from '../components/JoinTextCard';
import { ScreenFrame } from '../components/ScreenFrame';
import type { AuthorizationText } from '../data/authorizations';
import { JOIN_PURPOSES } from '../data/invitations';
import { t } from '../i18n';
import { LEGAL_REVIEW_PENDING } from '../legalReview';

// Who opens the link: a guardian of the swimmer, or the adult swimmer claiming their own profile.
export type ClaimRelation = 'guardian' | 'self';

// Why the claim did not go through; each has its own text.
export type ClaimFailure = 'not_allowed' | 'link_not_found' | 'invalid' | 'other';

export type ClaimAthleteScreenProps = {
  // The three authorizations of joining a school, as they are now. 'loading' while they are read; 'missing' when they have not reached
  // the phone yet (a new account may open the link before its first sync): the screen then cannot offer to accept.
  texts: AuthorizationText[] | 'loading' | 'missing';
  busy: boolean;
  failure: ClaimFailure | null;
  // Accepting records the three authorizations together, so there are no boxes: the person reads them and accepts or leaves.
  onAccept: (relation: ClaimRelation) => void;
  onRetryTexts: () => void;
  onCancel: () => void;
};

// Presentational: the container reads the texts and sends the claim. Never pre-selects the swimmer's side for an adult: the guardian
// is the default because claiming as the swimmer is the exception (PROVISIONAL, issue 1423).
export function ClaimAthleteScreen({ texts, busy, failure, onAccept, onRetryTexts, onCancel }: ClaimAthleteScreenProps) {
  const { colors, typography } = useTheme();
  const [relation, setRelation] = useState<ClaimRelation>('guardian');
  const ready = Array.isArray(texts);

  return (
    <ScreenFrame
      title={t('accounts.claim.title')}
      footer={
        <>
          <Button label={t('accounts.claim.accept')} loading={busy} disabledReason={ready ? undefined : t('accounts.claim.accept_wait')} onPress={() => onAccept(relation)} />
          <Button variant="secondary" label={t('accounts.claim.cancel')} onPress={onCancel} />
        </>
      }
    >
      {LEGAL_REVIEW_PENDING && (
        <Banner variant="warn" icon="info">
          {t('accounts.authorizations.provisional')}
        </Banner>
      )}
      <Text style={[typography.body, { color: colors['ink-muted'] }]}>{t('accounts.claim.intro')}</Text>
      <Segmented
        accessibilityLabel={t('accounts.claim.relation_label')}
        value={relation}
        onChange={(value) => !busy && setRelation(value)}
        options={[
          { value: 'guardian', label: t('accounts.claim.relation_guardian') },
          { value: 'self', label: t('accounts.claim.relation_self') },
        ]}
      />
      {texts === 'loading' && <Text style={[typography.body, { color: colors['ink-muted'] }]}>{t('accounts.claim.loading')}</Text>}
      {texts === 'missing' && (
        <>
          <Banner variant="warn" icon="error">
            {t('accounts.claim.texts_missing')}
          </Banner>
          <Button variant="secondary" label={t('accounts.claim.retry')} onPress={onRetryTexts} />
        </>
      )}
      {Array.isArray(texts) && (
        <>
          <Text style={[typography.body, { color: colors['ink-muted'] }]}>{t('accounts.claim.texts_intro')}</Text>
          {JOIN_PURPOSES.flatMap((purpose) => texts.filter((text) => text.purpose === purpose)).map((text) => (
            <JoinTextCard key={text.purpose} text={text} />
          ))}
        </>
      )}
      {failure && (
        <Banner variant="warn" icon="error">
          {t(`accounts.claim.failure.${failure}`)}
        </Banner>
      )}
    </ScreenFrame>
  );
}

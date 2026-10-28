import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { typography as baseTypography, useTheme } from '../../../core/theme';
import { Banner, Button, Icon, StepHeader, TextField } from '../../../core/ui';
import { ChoiceCard } from '../components/ChoiceCard';
import { InvalidInvitationBanner, InvitationBanner, type Invitation } from '../components/notices';
import { Mark, type Provider } from '../components/ProviderButton';
import { ScreenFrame } from '../components/ScreenFrame';
import { t } from '../i18n';
import type { SwimmerChoice } from './WhoSwimsScreen';

export type ProviderRegistrationField = 'firstName' | 'lastName';

export type ProviderRegistrationScreenProps = {
  // The email the provider already verified: shown, never asked.
  email: string;
  // Absent when the session came from the emailed code: the email is verified all the same, but no provider vouches for it.
  provider?: Provider;
  swimmer?: SwimmerChoice;
  values: Record<ProviderRegistrationField, string>;
  errors?: { swimmer?: 'required'; firstName?: 'required'; lastName?: 'required' };
  busy?: boolean;
  // The profile could not be saved: what was typed stays, and the button tries again.
  failed?: boolean;
  invitation?: Invitation;
  invalidInvitation?: boolean;
  onSelect: (choice: SwimmerChoice) => void;
  onChange: (field: ProviderRegistrationField, value: string) => void;
  onSubmit: () => void;
  // Leaves the registration: the session is open, so going back means signing out.
  onBack?: () => void;
};

const largeTextScale = 1.5;

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', borderWidth: 1 },
  cardText: { flex: 1 },
  names: { flexDirection: 'row' },
  name: { flex: 1 },
  error: { flexDirection: 'row', alignItems: 'flex-start' },
  errorText: { flexShrink: 1 },
});

const providerName: Record<Provider, string> = { google: 'Google', microsoft: 'Microsoft' };
const privacyKey = (provider?: Provider) => (provider ? 'accounts.provider_registration.privacy' : 'accounts.provider_registration.privacy_email');

// Registration of an account that signed in with Google or Microsoft: the provider replaces the email and the code, nothing else.
// What the person is, their name and the authorizations that follow are the same as with the code (design: "Después de Google o Microsoft").
export function ProviderRegistrationScreen({
  email,
  provider,
  swimmer,
  values,
  errors,
  busy = false,
  failed = false,
  invitation,
  invalidInvitation,
  onSelect,
  onChange,
  onSubmit,
  onBack,
}: ProviderRegistrationScreenProps) {
  const { colors, space, radius, typography } = useTheme();
  // The gallery preview scale (theme) and the system scale both apply: side by side no longer fits with large text.
  const { fontScale } = useWindowDimensions();
  const stacked = (typography.caption.fontSize / baseTypography.caption.fontSize) * fontScale >= largeTextScale;
  const name = provider ? providerName[provider] : '';
  const verified = provider ? t('accounts.provider_registration.verified', { provider: name }) : t('accounts.provider_registration.verified_email');
  const first = values.firstName.trim();

  return (
    <ScreenFrame
      title={t('accounts.create_title')}
      subtitle={invitation?.school}
      footer={
        <View style={{ gap: space[3] }}>
          <Button label={t('accounts.who.continue')} onPress={onSubmit} loading={busy} />
          <Text style={[typography.caption, { color: colors['ink-muted'], textAlign: 'center' }]}>
            {t(privacyKey(provider), { provider: name })}
          </Text>
        </View>
      }
    >
      <StepHeader
        step={1}
        total={2}
        title={first ? t('accounts.provider_registration.title', { name: first }) : t('accounts.provider_registration.title_plain')}
        onBack={onBack}
      />
      {invitation && <InvitationBanner {...invitation} />}
      {invalidInvitation && <InvalidInvitationBanner />}
      {/* The verified email: the provider's mark, the address and what vouches for it. Only used here, so it is not a component. */}
      <View
        accessible
        accessibilityLabel={`${email}, ${verified}`}
        style={[
          styles.card,
          { gap: space[3], padding: space[3], borderRadius: radius.md, borderColor: colors.border, backgroundColor: colors['surface-1'] },
        ]}
      >
        {provider && <Mark provider={provider} />}
        <View style={[styles.cardText, { gap: space[1] }]}>
          <Text style={[typography.subtitle, { color: colors.ink }]}>{email}</Text>
          <Text style={[typography.caption, { color: colors['ink-muted'] }]}>{verified}</Text>
        </View>
        <Icon name="verified_user" color="success" />
      </View>
      <View style={{ gap: space[2] }}>
        <Text style={[typography.label, { color: colors.ink }]}>{t('accounts.provider_registration.registering_as')}</Text>
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={t('accounts.provider_registration.registering_as')}
          style={{ flexDirection: stacked ? 'column' : 'row', gap: space[2] }}
        >
          <ChoiceCard
            title={t('accounts.provider_registration.guardian_title')}
            detail={t('accounts.provider_registration.guardian_detail')}
            icon="family_restroom"
            color="lilac"
            selected={swimmer === 'child'}
            stacked={stacked}
            onPress={() => onSelect('child')}
          />
          <ChoiceCard
            title={t('accounts.provider_registration.adult_title')}
            detail={t('accounts.provider_registration.adult_detail')}
            icon="person"
            color="lilac"
            selected={swimmer === 'adult'}
            stacked={stacked}
            onPress={() => onSelect('adult')}
          />
        </View>
        {errors?.swimmer && (
          <View style={[styles.error, { gap: space[1] }]}>
            <Icon name="error" size="icon-sm" color="danger-text" />
            <Text accessibilityLiveRegion="polite" style={[styles.errorText, typography.caption, { color: colors['danger-text'] }]}>
              {t('accounts.provider_registration.choose')}
            </Text>
          </View>
        )}
        {swimmer === 'child' && (
          <Banner variant="info" icon="info">
            {t('accounts.who.child_notice')}
          </Banner>
        )}
      </View>
      <View style={{ gap: space[2] }}>
        <View style={[styles.names, { flexDirection: stacked ? 'column' : 'row', gap: space[2] }]}>
          <View style={stacked ? undefined : styles.name}>
            <TextField
              label={t('accounts.details.first_name_label')}
              error={errors?.firstName ? t('accounts.details.first_name_required') : undefined}
              value={values.firstName}
              onChangeText={(text) => onChange('firstName', text)}
              autoCapitalize="words"
              autoComplete="given-name"
              textContentType="givenName"
            />
          </View>
          <View style={stacked ? undefined : styles.name}>
            <TextField
              label={t('accounts.details.last_name_label')}
              error={errors?.lastName ? t('accounts.details.last_name_required') : undefined}
              value={values.lastName}
              onChangeText={(text) => onChange('lastName', text)}
              autoCapitalize="words"
              autoComplete="family-name"
              textContentType="familyName"
            />
          </View>
        </View>
        {provider && <Text style={[typography.caption, { color: colors['ink-muted'] }]}>{t('accounts.provider_registration.name_hint', { provider: name })}</Text>}
      </View>
      {failed && (
        <Banner variant="warn" icon="error">
          {t('accounts.provider_registration.failed')}
        </Banner>
      )}
    </ScreenFrame>
  );
}

import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { useTheme } from '../../../core/theme';
import { Button, ColorCard, Icon, Logo, Segmented, type SegmentedOption } from '../../../core/ui';
import { OfflineNotice } from '../components/OfflineNotice';
import { t } from '../i18n';
import { ProviderSignIn } from './ProviderSignIn';
import { SignInContainer } from './SignInContainer';

export type SignInLandingProps = {
  onCreateAccount: () => void;
};

type Tab = 'create' | 'sign-in';

// The first screen without a session: one control picks between registering and signing in.
export function SignInLanding({ onCreateAccount }: SignInLandingProps) {
  const { colors, space, typography } = useTheme();
  const [tab, setTab] = useState<Tab>('create');
  const options: SegmentedOption<Tab>[] = [
    { value: 'create', label: t('auth.create_account') },
    { value: 'sign-in', label: t('accounts.landing.sign_in_tab') },
  ];
  const footer = [typography.caption, { color: colors['ink-muted'], textAlign: 'center' as const }];
  // Sticks to the bottom when the content is short; with large text the scroll takes over.
  const footerBox = { flex: 1, justifyContent: 'flex-end', gap: space[4] } as const;

  return (
    <ScrollView
      testID="sign-in-scroll"
      keyboardShouldPersistTaps="handled"
      style={{ flex: 1, backgroundColor: colors['surface-0'] }}
      contentContainerStyle={{ flexGrow: 1, padding: space[4], gap: space[4] }}
    >
      <View style={{ alignItems: 'flex-start' }}>
        <Logo />
      </View>
      {tab === 'create' ? (
        <ColorCard color="lime" decoration={{ dot: 'coral', titleDot: 'lilac' }} title={t('accounts.landing.create_card_title')} detail={t('accounts.landing.create_card_detail')} />
      ) : (
        <ColorCard color="lilac" decoration={{ dot: 'lime' }} title={t('accounts.landing.sign_in_title')} detail={t('accounts.landing.sign_in_detail')} />
      )}
      <Segmented options={options} value={tab} onChange={setTab} accessibilityLabel={t('accounts.landing.tabs_label')} />
      <ProviderSignIn />
      {tab === 'create' ? (
        <>
          <Button label={t('auth.create_account')} onPress={onCreateAccount} />
          <View testID="sign-in-footer" style={footerBox}>
            <View testID="minors-notice" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space[2] }}>
              <View testID="minors-notice-icon">
                <Icon name="shield_person" color="ink-muted" />
              </View>
              <Text style={[typography.caption, { flex: 1, color: colors['ink-muted'] }]}>{t('accounts.landing.minors_notice')}</Text>
            </View>
            <Text style={footer}>{t('accounts.landing.school_invitation')}</Text>
          </View>
        </>
      ) : (
        <>
          <SignInContainer />
          <View testID="sign-in-footer" style={footerBox}>
            <OfflineNotice>
              <Text style={typography['body-strong']}>{t('accounts.landing.offline_label')}</Text>
              {t('accounts.landing.offline_message')}
            </OfflineNotice>
            <Text style={footer}>
              {t('accounts.landing.help_question')}{' '}
              <Text style={[typography['body-strong'], { color: colors.ink, textDecorationLine: 'underline' }]}>{t('accounts.landing.help_action')}</Text>
            </Text>
          </View>
        </>
      )}
    </ScrollView>
  );
}

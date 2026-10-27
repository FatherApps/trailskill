import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { useTheme } from '../../../core/theme';
import { Banner, Button, ColorCard, Logo, Segmented, type SegmentedOption } from '../../../core/ui';
import { t } from '../i18n';
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
        <ColorCard color="lime" title={t('accounts.landing.create_card_title')} detail={t('accounts.landing.create_card_detail')} />
      ) : (
        <ColorCard color="lilac" title={t('accounts.landing.sign_in_title')} detail={t('accounts.landing.sign_in_detail')} />
      )}
      <Segmented options={options} value={tab} onChange={setTab} accessibilityLabel={t('accounts.landing.tabs_label')} />
      {tab === 'create' ? (
        <>
          <Button label={t('auth.create_account')} onPress={onCreateAccount} />
          <View style={{ gap: space[2] }}>
            <Text style={footer}>{t('accounts.landing.minors_notice')}</Text>
            <Text style={footer}>{t('accounts.landing.school_invitation')}</Text>
          </View>
        </>
      ) : (
        <>
          {/* The container keeps its own "Crear cuenta" link: here it only switches tab, the registration starts from the button above. */}
          <SignInContainer onCreateAccount={() => setTab('create')} />
          <Banner variant="warn" icon="wifi_off">
            <Text style={typography['body-strong']}>{t('accounts.landing.offline_label')}</Text>
            {t('accounts.landing.offline_message')}
          </Banner>
          <Text style={footer}>{t('accounts.landing.help')}</Text>
        </>
      )}
    </ScrollView>
  );
}

import { useState } from 'react';
import { Text, View } from 'react-native';

import { useTheme } from '../../../core/theme';
import { Button, ColorCard, Segmented, type SegmentedOption } from '../../../core/ui';
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
    { value: 'create', label: t('accounts.landing.create_tab') },
    { value: 'sign-in', label: t('accounts.landing.sign_in_tab') },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors['surface-0'] }}>
      <View style={{ padding: space[4], paddingBottom: 0 }}>
        <Segmented options={options} value={tab} onChange={setTab} accessibilityLabel={t('accounts.landing.tabs_label')} />
      </View>
      {tab === 'create' ? (
        <View style={{ padding: space[4], gap: space[4] }}>
          <ColorCard color="lime" title={t('accounts.landing.create_card_title')} />
          <Button label={t('auth.create_account')} onPress={onCreateAccount} />
        </View>
      ) : (
        <>
          <Text
            accessibilityRole="header"
            style={[typography.title, { color: colors.ink, paddingHorizontal: space[4], paddingTop: space[4] }]}
          >
            {t('accounts.landing.sign_in_title')}
          </Text>
          {/* The container keeps its own "Crear cuenta" link: here it only switches tab, the registration starts from the button above. */}
          <SignInContainer onCreateAccount={() => setTab('create')} />
        </>
      )}
    </View>
  );
}

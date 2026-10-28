import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { type AuthProvider, useSession } from '../../../core/session';
import { useTheme } from '../../../core/theme';
import { StateView } from '../../../core/ui';
import { ProviderOptions } from '../components/ProviderOptions';
import { t } from '../i18n';
import { ENABLED_PROVIDERS } from '../providerAvailability';

// Google and Microsoft on the landing, both tabs. Cancelling is not a failure; a success needs nothing here, because
// the session gate moves to the app. A failure leaves the email code available below.
export function ProviderSignIn() {
  const { signInWithProvider } = useSession();
  const { space } = useTheme();
  const [failure, setFailure] = useState<'offline' | 'provider_failed'>();
  const last = useRef<AuthProvider>('google');
  // A second press while the browser is open must not open another one.
  const busy = useRef(false);

  async function signInWith(provider: AuthProvider) {
    if (busy.current) return;
    busy.current = true;
    last.current = provider;
    setFailure(undefined);
    try {
      await signInWithProvider(provider);
    } catch (error) {
      setFailure(isAuthRetryableFetchError(error) ? 'offline' : 'provider_failed');
    } finally {
      busy.current = false;
    }
  }

  if (ENABLED_PROVIDERS.length === 0) return null;
  return (
    <View style={{ gap: space[4] }}>
      <ProviderOptions providers={ENABLED_PROVIDERS} onGoogle={() => void signInWith('google')} onMicrosoft={() => void signInWith('azure')} />
      {failure === 'offline' && (
        <StateView
          kind="offline"
          title={t('accounts.failure.offline_title')}
          message={t('accounts.failure.provider_offline_message')}
          action={{ label: t('sync.retry'), onPress: () => void signInWith(last.current) }}
        />
      )}
      {failure === 'provider_failed' && (
        <StateView kind="error" title={t('accounts.failure.provider_title')} message={t('accounts.failure.provider_message')} />
      )}
    </View>
  );
}

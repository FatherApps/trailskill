import { BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque';
import { IBMPlexMono_500Medium, IBMPlexMono_600SemiBold } from '@expo-google-fonts/ibm-plex-mono';
import {
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
} from '@expo-google-fonts/ibm-plex-sans';
import { PowerSyncContext } from '@powersync/react';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { I18nextProvider } from 'react-i18next';
import { StatusBar, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { i18n } from '../core/i18n';
import { SessionProvider, useSession } from '../core/session';
import { db } from '../core/sync';
import { ThemeProvider, useTheme } from '../core/theme';
import { createSecureStoreRegistrationDraftRepository, discardStaleDraft } from '../modules/accounts';

SplashScreen.preventAutoHideAsync();

const registrationDrafts = createSecureStoreRegistrationDraftRepository();

// Guarded groups redirect on their own when the session changes: no navigation calls in the auth flow.
// redirectTo is needed for a cold start: without it the guarded "/" is an unmatched route.
export function SessionGate() {
  const { session } = useSession();
  const { name, colors } = useTheme();
  const insets = useSafeAreaInsets();

  // A registration draft older than 24 hours goes away when the app opens.
  useEffect(() => {
    discardStaleDraft(registrationDrafts).catch(() => {});
  }, []);

  // The bars are translucent (edge-to-edge): this padding keeps every screen out from under them.
  return (
    <View
      testID="safe-area-root"
      style={{
        flex: 1,
        backgroundColor: colors['surface-0'],
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      <StatusBar barStyle={name === 'dark' ? 'light-content' : 'dark-content'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={session != null} redirectTo="/sign-in">
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        <Stack.Protected guard={session == null}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
      </Stack>
    </View>
  );
}

export default function RootLayout() {
  // A font error must not trap the app on the splash screen: it falls back to the system font.
  const [loaded, error] = useFonts({
    BricolageGrotesque_800ExtraBold,
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    IBMPlexSans_600SemiBold,
    IBMPlexMono_500Medium,
    IBMPlexMono_600SemiBold,
  });
  const ready = loaded || error != null;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <I18nextProvider i18n={i18n}>
      <ThemeProvider>
        <PowerSyncContext.Provider value={db}>
          <SessionProvider>
            <SessionGate />
          </SessionProvider>
        </PowerSyncContext.Provider>
      </ThemeProvider>
    </I18nextProvider>
  );
}

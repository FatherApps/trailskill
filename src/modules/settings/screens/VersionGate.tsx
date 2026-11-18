import * as Application from 'expo-application';
import { useMemo, type ReactNode } from 'react';
import { Linking, Platform } from 'react-native';

import { UpdateBanner } from '../components/UpdateBanner';
import {
  createSecureStoreAppVersionsCache,
  createSupabaseAppVersionsRepository,
  type AppPlatform,
  type AppVersionsCache,
  type AppVersionsRepository,
} from '../data/appVersions';
import { useVersionGate } from '../data/useVersionGate';
import { UpdateRequiredScreen } from './UpdateRequiredScreen';

const defaultRepository = createSupabaseAppVersionsRepository();
const defaultCache = createSecureStoreAppVersionsCache();

const playUrlOf = (applicationId: string | null) =>
  applicationId ? `https://play.google.com/store/apps/details?id=${applicationId}` : 'https://play.google.com/store';

export type VersionGateProps = {
  children: ReactNode;
  // Injected by tests; the app uses the server, the secure store and the installed build.
  repository?: AppVersionsRepository;
  cache?: AppVersionsCache;
  nativeVersion?: string | null;
  platform?: AppPlatform;
  playUrl?: string;
};

// Minimum version gate (issue #1189): below the minimum the app does not open, below the latest it shows a notice. With no signal it
// never blocks (fail open): it uses the last saved answer and acts as soon as the server answers.
export function VersionGate({
  children,
  repository = defaultRepository,
  cache = defaultCache,
  nativeVersion = Application.nativeApplicationVersion,
  platform = Platform.OS === 'ios' ? 'ios' : 'android',
  playUrl = playUrlOf(Application.applicationId),
}: VersionGateProps) {
  const { status, dismiss } = useVersionGate({ repository, cache, nativeVersion, platform });
  const openStore = useMemo(() => () => void Linking.openURL(playUrl).catch(() => {}), [playUrl]);

  if (status === 'blocked') return <UpdateRequiredScreen onUpdate={openStore} />;
  return (
    <>
      {status === 'update' && <UpdateBanner onUpdate={openStore} onDismiss={dismiss} />}
      {children}
    </>
  );
}

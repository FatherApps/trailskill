import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { useSession } from '../core/session';

// trailskill://auth-callback: the link the system browser returns with, outside both guarded groups.
// A sign-in that is waiting reads the result itself; if Android closed the app meanwhile, this route trades the code.
export default function AuthCallback() {
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code?: string | string[] }>();
  const { resumeProviderSignIn } = useSession();

  useEffect(() => {
    // A failure leaves the person signed out on the sign-in screen: nothing here can show it.
    if (typeof code === 'string' && code) resumeProviderSignIn(code).catch(() => {});
  }, [code, resumeProviderSignIn]);

  useEffect(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  return null;
}

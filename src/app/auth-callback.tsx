import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { authFailureSummary, useSession } from '../core/session';

// trailskill://auth-callback: the link the system browser returns with, outside both guarded groups.
// A sign-in that is waiting reads the result itself; if Android closed the app meanwhile, this route trades the code.
export default function AuthCallback() {
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code?: string | string[] }>();
  const { resumeProviderSignIn } = useSession();

  useEffect(() => {
    // A failure leaves the person signed out on the sign-in screen: nothing here can show it, so it is logged in
    // development, as its name and code only (the message can carry the code or the email).
    if (typeof code === 'string' && code) {
      resumeProviderSignIn(code).catch((error: unknown) => {
        if (__DEV__) console.error('[auth] Could not finish the provider sign-in', authFailureSummary(error));
      });
    }
  }, [code, resumeProviderSignIn]);

  useEffect(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  return null;
}

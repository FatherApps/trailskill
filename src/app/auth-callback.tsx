import { useRouter } from 'expo-router';
import { useEffect } from 'react';

// trailskill://auth-callback: the link the system browser returns with. useSession().signInWithProvider reads its code,
// so this route only keeps the router from showing an unmatched route, outside both guarded groups.
export default function AuthCallback() {
  const router = useRouter();
  useEffect(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);
  return null;
}

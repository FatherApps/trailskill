import { useRouter } from 'expo-router';

import { useFirstScreenReady } from '../../core/startup';
import { SignInLanding } from '../../modules/accounts';

export default function SignIn() {
  const router = useRouter();
  // Signed out there is nothing to read: the screen paints from the first frame.
  useFirstScreenReady();
  return <SignInLanding onCreateAccount={() => router.push('/register')} />;
}

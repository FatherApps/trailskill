import { useRouter } from 'expo-router';

import { SignInLanding } from '../../modules/accounts';

export default function SignIn() {
  const router = useRouter();
  return <SignInLanding onCreateAccount={() => router.push('/register')} />;
}

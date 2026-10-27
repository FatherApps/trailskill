import { useRouter } from 'expo-router';

import { SignInContainer } from '../../modules/accounts';

export default function SignIn() {
  const router = useRouter();
  return <SignInContainer onCreateAccount={() => router.push('/register')} />;
}

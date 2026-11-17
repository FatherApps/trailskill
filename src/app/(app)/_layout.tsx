import { Stack, useRouter, useSegments } from 'expo-router';

import { AppLayoutContainer } from '../../modules/school-console';

// The session gate, the registration steps and the phone bar live in school-console: this route only hands over the navigator.
export default function Layout() {
  return <AppLayoutContainer router={useRouter()} segments={useSegments()} stack={<Stack screenOptions={{ headerShown: false }} />} />;
}

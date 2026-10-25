import { Redirect, Stack } from 'expo-router';

import { galleryEntries, type GalleryEntry } from '../../core/ui';
import { galleryEntries as timingGalleryEntries } from '../../modules/timing';

type GalleryGroup = { id: string; title: string; entries: GalleryEntry[] };

// The registry lives here, not in registry.ts: Expo Router treats every .ts file in src/app as a route.
export const galleryGroups: GalleryGroup[] = [
  { id: 'core-ui', title: 'core/ui', entries: galleryEntries },
  { id: 'timing', title: 'timing', entries: timingGalleryEntries },
];

export function findGalleryEntry(id: string): GalleryEntry | undefined {
  return galleryGroups.flatMap((group) => group.entries).find((entry) => entry.id === id);
}

export default function DevLayout() {
  if (!__DEV__) return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}

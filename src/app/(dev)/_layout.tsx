import { Redirect, Stack } from 'expo-router';

import { galleryEntries, type GalleryEntry } from '../../core/ui';
import { galleryEntries as timingGalleryEntries } from '../../modules/timing';
import { galleryEntries as accountsEntries } from '../../modules/accounts';
import { galleryEntries as athletesGalleryEntries } from '../../modules/athletes';
import { galleryEntries as schoolConsoleGalleryEntries } from '../../modules/school-console';
import { galleryEntries as trainingPlansGalleryEntries } from '../../modules/training-plans';

type GalleryGroup = { id: string; title: string; entries: GalleryEntry[] };

// The registry lives here, not in registry.ts: Expo Router treats every .ts file in src/app as a route.
export const galleryGroups: GalleryGroup[] = [
  { id: 'core-ui', title: 'core/ui', entries: galleryEntries },
  { id: 'timing', title: 'timing', entries: timingGalleryEntries },
  { id: 'accounts', title: 'accounts', entries: accountsEntries },
  { id: 'athletes', title: 'athletes', entries: athletesGalleryEntries },
  { id: 'school-console', title: 'school-console', entries: schoolConsoleGalleryEntries },
  { id: 'training-plans', title: 'training-plans', entries: trainingPlansGalleryEntries },
];

export function findGalleryEntry(id: string): GalleryEntry | undefined {
  return galleryGroups.flatMap((group) => group.entries).find((entry) => entry.id === id);
}

export default function DevLayout() {
  if (!__DEV__) return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}

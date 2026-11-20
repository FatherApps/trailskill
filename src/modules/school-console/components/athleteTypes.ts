import type { ReactNode } from 'react';

import type { Hundredths } from '../../../core/time';
import type { AthleteAvatarRenderer, SwimmerRowProps } from '../../../core/ui';

export type AthleteAuthorization = 'valid' | 'pending';

// One row of the athletes list. No document number, no birth date: the console never shows them.
export type AthleteRow = {
  id: string;
  // Full name.
  name: string;
  initials: string;
  color: SwimmerRowProps['color'];
  category: string;
  group: string;
  // `null` when the coach's name is not known: the console shows "Sin dato", never a guess.
  coach: string | null;
  authorization: AthleteAuthorization;
  // The personal best of the event the list shows, `null` when there is none (never zero).
  bestTime: Hundredths | null;
  // The athlete's avatar with their photo, at the size the row asks for; absent: the initials.
  avatar?: AthleteAvatarRenderer;
};

export type AthleteBest = {
  id: string;
  // Already built, for example "Libre 50" (see eventLabel).
  event: string;
  time: Hundredths | null;
  // Name of the source when the mark was imported.
  source?: string;
};

// The category selector of the detail: the choices the admin can make and what happens when one is picked.
export type CategoryChoice = {
  // `id: null` clears the category.
  options: { id: string | null; label: string }[];
  selectedId: string | null;
  // Already translated; `null` when the last change worked.
  error: string | null;
  onChoose: (categoryId: string | null) => void;
};

// Ending the swimmer's link with the school (the «baja»): the confirmation is part of the detail, the call belongs to the caller.
export type EndLink = {
  // Already translated; `null` when there is nothing to say (never tried, or the last try worked).
  error: string | null;
  // Fires only after the admin confirmed.
  onConfirm: () => void;
};

export type AthleteDetailData = {
  id: string;
  name: string;
  // The athlete's avatar with their photo, at the size the panel asks for (`md`); absent: none.
  avatar?: AthleteAvatarRenderer;
  category: string;
  authorization: AthleteAuthorization;
  // `null` for each part that is not known: the console shows "Sin dato".
  guardian: { name: string | null; contact: string | null };
  bests: AthleteBest[];
  // The bests could not be read: not the same as an athlete with no times.
  bestsError?: boolean;
  // Absent while the console has no categories to choose from: the detail only shows the category tag.
  categoryChoice?: CategoryChoice;
  // The guardian sharing controls (a container that reads and changes the choice); absent when the caller has no repository for them.
  guardianSharing?: ReactNode;
  // Absent unless the caller can end the link (the school admin): the detail has no baja button.
  endLink?: EndLink;
};

export type AthleteFilterId = 'category' | 'group' | 'coach';

// The chips of the measurement log: the date range is one of a few presets.
export type MeasurementFilterId = 'category' | 'event' | 'coach' | 'range';

import type { Hundredths } from '../../../core/time';
import type { SwimmerRowProps } from '../../../core/ui';

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

export type AthleteDetailData = {
  id: string;
  name: string;
  category: string;
  authorization: AthleteAuthorization;
  // `null` for each part that is not known: the console shows "Sin dato".
  guardian: { name: string | null; contact: string | null };
  bests: AthleteBest[];
  // Absent while the console has no categories to choose from: the detail only shows the category tag.
  categoryChoice?: CategoryChoice;
};

export type AthleteFilterId = 'category' | 'group' | 'coach';

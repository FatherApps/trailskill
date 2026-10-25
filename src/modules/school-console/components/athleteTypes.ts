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
  coach: string;
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

export type AthleteDetailData = {
  id: string;
  name: string;
  category: string;
  authorization: AthleteAuthorization;
  guardian: { name: string; contact: string };
  bests: AthleteBest[];
};

export type AthleteFilterId = 'category' | 'group' | 'coach';

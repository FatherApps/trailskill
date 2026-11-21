import { useEffect, useRef } from 'react';

import type { ConflictReviewRepository } from './conflictReview';
import type { KnownPlatformAdminRepository } from './knownPlatformAdmin';

export type CorrectionRouter = { replace(href: string): void };

// The screens the landing itself shows once it has chosen with the platform admin answer: the home screen at "/" and My athletes. Segments are
// the route's: ['(app)'] is "/", ['(app)', 'athletes'] is My athletes. A profile is never replaced: the person may have opened it (the
// landing's own redirect to the profile of a single athlete is corrected at the next start, from the stored answer), and the console and My
// swimmers are chosen before the platform admin answer counts.
function onLandingScreen(segments: string[]): boolean {
  const [, first, second] = segments;
  return first === undefined || (first === 'athletes' && second === undefined);
}

/**
 * Asks the server in the background (issue 1311) whether the signed-in person is a platform admin when the phone already knew an answer,
 * and remembers the new one. The landing used the known answer to choose a screen, so when the answer changed, in either direction, "/"
 * is opened again to choose with the new one, but only while the person is still on a screen the landing itself shows (see onLandingScreen). A failed lookup
 * changes nothing. Nothing known yet: the landing asked itself and remembers the answer, so there is nothing to correct.
 */
export function usePlatformAdminRouteCorrection({
  repository,
  known,
  userId,
  router,
  segments,
}: {
  repository: Pick<ConflictReviewRepository, 'isPlatformAdmin'>;
  known: KnownPlatformAdminRepository;
  userId: string | undefined;
  router: CorrectionRouter;
  segments: string[];
}): void {
  const latest = useRef({ router, segments });
  useEffect(() => {
    latest.current = { router, segments };
  });
  useEffect(() => {
    if (!userId) return;
    let active = true;
    known
      .read(userId)
      .catch(() => null)
      .then((saved) => {
        if (saved === null || !active) return undefined;
        return repository.isPlatformAdmin(userId).then(
          (admin) => {
            if (!active) return;
            // Saved first: "/" reads the phone's answer again, and must not read the old one.
            return known
              .write(userId, admin)
              .catch(() => {})
              .then(() => {
                if (active && admin !== saved && onLandingScreen(latest.current.segments)) latest.current.router.replace('/');
              });
          },
          () => {},
        );
      });
    return () => {
      active = false;
    };
  }, [repository, known, userId]);
}

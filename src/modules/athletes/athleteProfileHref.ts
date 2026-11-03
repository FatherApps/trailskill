import { trimName } from '../../core/i18n';

// The route of an athlete's profile. The name goes along (and only the name, never other data) so the band shows it from the first frame.
export function athleteProfileHref(athleteId: string, fullName: string): string {
  const name = trimName(fullName);
  return name ? `/athletes/${athleteId}?name=${encodeURIComponent(name)}` : `/athletes/${athleteId}`;
}

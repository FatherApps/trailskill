import { db } from '../../../core/sync';
import { trimName } from '../../../core/i18n';
import type { AdultProfile } from './adultProfiles';
import type { ManagedAthleteRow } from './managedAthletes';

// One guardian of an athlete. `name` and `contact` are null when that guardian has no profile on this device: never a guess.
export type Guardian = { userId: string; name: string | null; contact: string | null };

// What a school admin reads of other adults: a name for any adult, and name and contact for an athlete's guardians. Local database only.
// Never an identity number or a birth date: the adult_profiles table does not hold them.
export interface AdultDirectoryRepository {
  /** The "First Last" name of each user that has a profile, by user id. A user without a profile (or a blank name) is not in the map. */
  listNames(userIds: string[]): Promise<Map<string, string>>;
  /** The athlete's guardians (relation 'guardian', never 'self'), sorted by user id, no repeats. */
  listGuardians(athleteId: string): Promise<Guardian[]>;
}

type ProfileRow = { first_name: string | null; last_name: string | null; contact_email: string | null };

const fullName = (first: string | null, last: string | null) => trimName(`${trimName(first ?? '')} ${trimName(last ?? '')}`);
// Only the users with a non-blank name make it into the map.
const namesOf = (pairs: [string, string][]) => new Map(pairs.filter(([, name]) => name !== ''));
const orNull = (value: string | null) => trimName(value ?? '') || null;

export function createPowerSyncAdultDirectoryRepository(): AdultDirectoryRepository {
  return {
    async listNames(userIds) {
      if (userIds.length === 0) return new Map();
      const rows = await db.getAll<ProfileRow & { id: string }>(
        `SELECT id, first_name, last_name FROM adult_profiles WHERE id IN (${userIds.map(() => '?').join(', ')})`,
        userIds,
      );
      return namesOf(rows.map((row) => [row.id, fullName(row.first_name, row.last_name)]));
    },
    async listGuardians(athleteId) {
      const rows = await db.getAll<ProfileRow & { user_id: string }>(
        `SELECT DISTINCT m.user_id AS user_id, p.first_name AS first_name, p.last_name AS last_name, p.contact_email AS contact_email
         FROM athlete_managers m LEFT JOIN adult_profiles p ON p.id = m.user_id
         WHERE m.athlete_id = ? AND m.relation = 'guardian' ORDER BY m.user_id`,
        [athleteId],
      );
      return rows.map((row) => ({
        userId: row.user_id,
        name: fullName(row.first_name, row.last_name) || null,
        contact: orNull(row.contact_email),
      }));
    },
  };
}

export type AdultContact = AdultProfile & { contactEmail: string | null };

export function createInMemoryAdultDirectoryRepository(data: { profiles?: AdultContact[]; managers?: ManagedAthleteRow[] } = {}): AdultDirectoryRepository {
  const { profiles = [], managers = [] } = data;
  const profileOf = (userId: string) => profiles.find((profile) => profile.userId === userId);
  return {
    async listNames(userIds) {
      return namesOf(
        userIds.map((id) => {
          const profile = profileOf(id);
          return [id, profile ? fullName(profile.firstName, profile.lastName) : ''];
        }),
      );
    },
    async listGuardians(athleteId) {
      const ids = new Set(managers.filter((row) => row.athleteId === athleteId && row.relation === 'guardian').map((row) => row.userId));
      return [...ids].sort().map((userId) => {
        const profile = profileOf(userId);
        return {
          userId,
          name: (profile && fullName(profile.firstName, profile.lastName)) || null,
          contact: orNull(profile?.contactEmail ?? null),
        };
      });
    },
  };
}

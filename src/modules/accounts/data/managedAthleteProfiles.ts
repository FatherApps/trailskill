import { writeBatch, type WriteBatch } from '../../../core/sync';
import type { AthleteProfileInput, AthleteRepository } from '../../athletes';
import type { ManagedAthleteRow } from './managedAthletes';

export type ManagedAthleteRelation = 'guardian' | 'self';

export type ManagedAthleteInput = AthleteProfileInput & { userId: string; relation: ManagedAthleteRelation };

export interface ManagedAthleteProfileRepository {
  /**
   * Creates the athlete profile and the user's manager link in one local transaction and returns the athlete id.
   * A user has one 'self' profile: asking for a second returns the existing one and writes nothing.
   */
  createManagedAthlete(input: ManagedAthleteInput): Promise<string>;
}

export function createPowerSyncManagedAthleteProfileRepository(athletes: AthleteRepository): ManagedAthleteProfileRepository {
  return {
    createManagedAthlete: ({ userId, firstName, lastName, relation }) =>
      writeBatch(async (batch) => {
        if (relation === 'self') {
          const [own] = await batch.getAll<{ athlete_id: string }>(
            "SELECT athlete_id FROM athlete_managers WHERE user_id = ? AND relation = 'self' LIMIT 1",
            [userId],
          );
          if (own) return own.athlete_id;
        }
        // The athlete row goes first: the connector uploads both rows of this transaction as one request.
        const id = await athletes.createProfile(batch, { firstName, lastName });
        await batch.write('athlete_managers', { athlete_id: id, user_id: userId, relation });
        return id;
      }),
  };
}

// Test fake: `rows` are the links a ManagedAthleteRepository fake reads.
export function createInMemoryManagedAthleteProfileRepository(
  athletes: AthleteRepository,
  rows: ManagedAthleteRow[],
): ManagedAthleteProfileRepository {
  const batch: WriteBatch = { getAll: async () => [], write: async () => '', edit: async () => {}, delete: async () => {} };
  return {
    async createManagedAthlete({ userId, firstName, lastName, relation }) {
      const own = rows.find((row) => row.userId === userId && row.relation === 'self');
      if (relation === 'self' && own) return own.athleteId;
      const athleteId = await athletes.createProfile(batch, { firstName, lastName });
      rows.push({ userId, athleteId, relation });
      return athleteId;
    },
  };
}

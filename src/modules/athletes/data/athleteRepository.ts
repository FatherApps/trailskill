import type { WriteBatch } from '../../../core/sync';
import type { ManagedAthleteRepository } from '../../accounts';
import type { SchoolAthlete, SchoolAthleteRepository } from './schoolAthletes';

export type AthleteProfileInput = { firstName: string; lastName: string };

export interface AthleteRepository {
  /**
   * Writes the athlete row (names trimmed) inside the caller's batch and returns its id. The manager link belongs to accounts
   * and must go in the same batch, after this row, so both reach the server together.
   */
  createProfile(batch: WriteBatch, input: AthleteProfileInput): Promise<string>;
  /** The athletes the user manages that are on the device. Never document number or birth date: they do not exist. */
  listManaged(userId: string): Promise<SchoolAthlete[]>;
  /** Every athlete on the device. */
  listOnDevice(): Promise<SchoolAthlete[]>;
}

export function createPowerSyncAthleteRepository(
  managed: ManagedAthleteRepository,
  athletes: SchoolAthleteRepository,
): AthleteRepository {
  return {
    createProfile: (batch, { firstName, lastName }) =>
      batch.write('athletes', { first_name: firstName.trim(), last_name: lastName.trim() }),
    listManaged: async (userId) => athletes.listByIds(await managed.listManagedAthleteIds(userId)),
    listOnDevice: () => athletes.listAll(),
  };
}

/** Test fake: `managed` is the same repository the accounts fake writes its links to. */
export function createInMemoryAthleteRepository(
  managed: ManagedAthleteRepository,
  rows: SchoolAthlete[] = [],
): AthleteRepository {
  const sorted = (list: SchoolAthlete[]) =>
    [...list].sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName) || a.id.localeCompare(b.id));
  return {
    async createProfile(_batch, { firstName, lastName }) {
      const id = `athlete-${rows.length + 1}`;
      rows.push({ id, firstName: firstName.trim(), lastName: lastName.trim(), categoryId: null, groupIds: [] });
      return id;
    },
    async listManaged(userId) {
      const ids = await managed.listManagedAthleteIds(userId);
      return sorted(rows.filter((a) => ids.includes(a.id)));
    },
    listOnDevice: async () => sorted(rows),
  };
}

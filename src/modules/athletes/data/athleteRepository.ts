import { writeBatch, type WriteBatch } from '../../../core/sync';
import type { ManagedAthleteRepository } from '../../accounts';
import { cleanAthleteNames } from './athleteName';
import type { SchoolAthlete, SchoolAthleteRepository } from './schoolAthletes';

export type AthleteProfileInput = { firstName: string; lastName: string };

export interface AthleteRepository {
  /**
   * Writes the athlete row (names trimmed) inside the caller's batch and returns its id. The manager link belongs to accounts
   * and must go in the same batch, after this row, so both reach the server together.
   */
  createProfile(batch: WriteBatch, input: AthleteProfileInput): Promise<string>;
  /**
   * Changes the first and last name (trimmed, 1 to 100 characters each: anything else throws) of an athlete that is on the device.
   * Local-first: the row changes here and the edit waits in the upload queue; the server decides who may do it (issue 1364).
   */
  renameProfile(athleteId: string, input: AthleteProfileInput): Promise<void>;
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
    renameProfile: async (athleteId, input) => {
      const names = cleanAthleteNames(input);
      await writeBatch(async (batch) => {
        // writeRecord-style writes insert a row that is missing: an edit must never create a nameless athlete.
        if ((await batch.getAll('SELECT id FROM athletes WHERE id = ?', [athleteId])).length === 0) throw new Error(`Athlete ${athleteId} is not on this device`);
        await batch.write('athletes', { id: athleteId, first_name: names.firstName, last_name: names.lastName });
      });
    },
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
      rows.push({ id, firstName: firstName.trim(), lastName: lastName.trim(), categoryId: null, groupIds: [], endedAt: null });
      return id;
    },
    async renameProfile(athleteId, input) {
      const names = cleanAthleteNames(input);
      const row = rows.find((candidate) => candidate.id === athleteId);
      if (!row) throw new Error(`Athlete ${athleteId} is not on this device`);
      Object.assign(row, names);
    },
    async listManaged(userId) {
      const ids = await managed.listManagedAthleteIds(userId);
      return sorted(rows.filter((a) => ids.includes(a.id)));
    },
    listOnDevice: async () => sorted(rows),
  };
}

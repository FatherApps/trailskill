import { db, useQuery, writeBatch, writeRecord } from '../../../core/sync';
import type { AuthorizationPurpose } from './authorizationStatus';

export type AuthorizationText = { id: string; purpose: AuthorizationPurpose; version: number; body: string };

/** One authorization of the signed-in adult, with the exact text and version accepted. The evidence never changes; only `withdrawnAt` is set later. */
export type AuthorizationRecord = {
  id: string;
  userId: string;
  athleteId: string;
  purpose: AuthorizationPurpose;
  textId: string;
  textVersion: number;
  textBody: string;
  acceptedAt: string;
  withdrawnAt: string | null;
};

export interface AuthorizationRepository {
  /** The latest version of the text of each purpose in the language, in screen order. Local database only. */
  listCurrentTexts(language: string): Promise<AuthorizationText[]>;
  /** The authorizations this adult gave for the athletes, oldest first, each with the text it accepted. */
  listAuthorizations(userId: string, athleteIds: string[]): Promise<AuthorizationRecord[]>;
  /** Writes exactly one authorization row for the text's purpose and returns its id. */
  accept(input: { userId: string; athleteId: string; text: AuthorizationText }, now?: Date): Promise<string>;
  /** Records the withdrawal of an authorization on this device; the evidence is kept. A second withdrawal keeps the first. Rejects an id that is not on the device. */
  withdraw(id: string, now?: Date): Promise<void>;
  /** Whether the athlete currently has a valid authorization for the purpose. */
  isInForce(athleteId: string, purpose: AuthorizationPurpose): Promise<boolean>;
}

const PURPOSE_ORDER: AuthorizationPurpose[] = ['record_times', 'import_official_results', 'share_results_with_school'];

const byPurpose = (a: { purpose: AuthorizationPurpose }, b: { purpose: AuthorizationPurpose }) =>
  PURPOSE_ORDER.indexOf(a.purpose) - PURPOSE_ORDER.indexOf(b.purpose);

// The latest event wins: an acceptance grants, a withdrawal on this phone revokes, and the synced status (which also
// covers another adult's withdrawal) follows its own is_granted. On a tie, not granted wins; no event is not granted.
// shortcut: device and server clocks are mixed and compared as they are, so the server status stays authoritative once synced; upgrade if skew shows up in the field.
const IN_FORCE_SQL = `
  SELECT COALESCE((
    SELECT is_granted FROM (
      SELECT accepted_at AS at, 1 AS is_granted FROM authorizations WHERE athlete_id = ? AND purpose = ? AND accepted_at IS NOT NULL
      UNION ALL
      SELECT withdrawn_at, 0 FROM authorizations WHERE athlete_id = ? AND purpose = ? AND withdrawn_at IS NOT NULL
      UNION ALL
      SELECT updated_at, is_granted FROM authorization_status WHERE athlete_id = ? AND purpose = ?
    ) ORDER BY julianday(at) DESC, is_granted ASC LIMIT 1
  ), 0) AS in_force`;

const inForceParams = (athleteId: string, purpose: AuthorizationPurpose) => [athleteId, purpose, athleteId, purpose, athleteId, purpose];

type RecordRow = {
  id: string;
  user_id: string;
  athlete_id: string;
  purpose: AuthorizationPurpose;
  text_id: string;
  text_version: number;
  text_body: string;
  accepted_at: string;
  withdrawn_at: string | null;
};

export function createPowerSyncAuthorizationRepository(): AuthorizationRepository {
  return {
    async listCurrentTexts(language) {
      const rows = await db.getAll<AuthorizationText>(
        `SELECT t.id, t.purpose, t.version, t.body FROM authorization_texts t
         WHERE t.language = ? AND t.version = (SELECT MAX(version) FROM authorization_texts WHERE purpose = t.purpose AND language = t.language)`,
        [language],
      );
      return rows.sort(byPurpose);
    },
    async listAuthorizations(userId, athleteIds) {
      const rows = await db.getAll<RecordRow>(
        `SELECT a.id, a.user_id, a.athlete_id, a.purpose, a.text_id, t.version AS text_version, t.body AS text_body, a.accepted_at, a.withdrawn_at
         FROM authorizations a JOIN authorization_texts t ON t.id = a.text_id
         WHERE a.user_id = ? AND a.athlete_id IN (SELECT value FROM json_each(?))
         ORDER BY julianday(a.accepted_at), a.id`,
        [userId, JSON.stringify(athleteIds)],
      );
      return rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        athleteId: row.athlete_id,
        purpose: row.purpose,
        textId: row.text_id,
        textVersion: row.text_version,
        textBody: row.text_body,
        acceptedAt: row.accepted_at,
        withdrawnAt: row.withdrawn_at,
      }));
    },
    accept({ userId, athleteId, text }, now = new Date()) {
      return writeRecord('authorizations', {
        user_id: userId,
        athlete_id: athleteId,
        purpose: text.purpose,
        text_id: text.id,
        accepted_at: now.toISOString(),
      });
    },
    withdraw(id, now = new Date()) {
      // One transaction: writeRecord alone would INSERT a broken row for an id that is not here. Only withdrawn_at is sent; the server fills in the rest.
      return writeBatch(async (batch) => {
        const [row] = await batch.getAll<{ withdrawn_at: string | null }>('SELECT withdrawn_at FROM authorizations WHERE id = ?', [id]);
        if (!row) throw new Error(`Cannot withdraw authorization ${id}: it is not on this device`);
        if (row.withdrawn_at !== null) return;
        await batch.write('authorizations', { id, withdrawn_at: now.toISOString() });
      });
    },
    async isInForce(athleteId, purpose) {
      const rows = await db.getAll<{ in_force: number }>(IN_FORCE_SQL, inForceParams(athleteId, purpose));
      return rows[0]?.in_force === 1;
    },
  };
}

/** Reactive and local only: no network. Other modules use it to know whether an athlete may be processed for a purpose. */
export function useHasValidAuthorization(athleteId: string, purpose: AuthorizationPurpose): boolean {
  const { data } = useQuery<{ in_force: number }>(IN_FORCE_SQL, inForceParams(athleteId, purpose));
  return data[0]?.in_force === 1;
}

export function createInMemoryAuthorizationRepository(texts: AuthorizationText[]): AuthorizationRepository {
  const rows: AuthorizationRecord[] = [];
  let next = 0;
  return {
    async listCurrentTexts() {
      return PURPOSE_ORDER.flatMap((purpose) => {
        const latest = texts.filter((text) => text.purpose === purpose).sort((a, b) => b.version - a.version)[0];
        return latest ? [latest] : [];
      });
    },
    async listAuthorizations(userId, athleteIds) {
      return rows.filter((row) => row.userId === userId && athleteIds.includes(row.athleteId)).map((row) => ({ ...row }));
    },
    async accept({ userId, athleteId, text }, now = new Date()) {
      const id = `authorization-${++next}`;
      rows.push({
        id,
        userId,
        athleteId,
        purpose: text.purpose,
        textId: text.id,
        textVersion: text.version,
        textBody: text.body,
        acceptedAt: now.toISOString(),
        withdrawnAt: null,
      });
      return id;
    },
    async withdraw(id, now = new Date()) {
      const row = rows.find((candidate) => candidate.id === id);
      if (!row) throw new Error(`Cannot withdraw authorization ${id}: it is not on this device`);
      row.withdrawnAt ??= now.toISOString();
    },
    async isInForce(athleteId, purpose) {
      const events = rows
        .filter((row) => row.athleteId === athleteId && row.purpose === purpose)
        .flatMap((row) => [
          { at: Date.parse(row.acceptedAt), granted: true },
          ...(row.withdrawnAt ? [{ at: Date.parse(row.withdrawnAt), granted: false }] : []),
        ])
        .sort((a, b) => b.at - a.at || Number(a.granted) - Number(b.granted));
      return events[0]?.granted ?? false;
    },
  };
}

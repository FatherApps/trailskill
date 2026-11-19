import { db } from '../../../core/sync';

// Which saved time each video belongs to (#1089). The link lives only on this phone (a local-only table): the video stays in
// the phone's gallery, so another phone, or this one after reinstalling, shows the time without a video. A later version can
// find the video again by its file name, which carries the time's id (decision 19).

export type FamilyVideo = {
  measurementId: string;
  /** The video's id in the phone's gallery. */
  assetId: string;
  /** Milliseconds from the start of the video to the start of the clock. */
  startOffsetMillis: number;
};

export interface FamilyVideoRepository {
  /** Links a saved time to its video; a second video for the same time replaces the first (one video, one time). */
  link(userId: string, video: FamilyVideo): Promise<void>;
  /** The videos this person recorded on this phone. */
  listByUser(userId: string): Promise<FamilyVideo[]>;
}

const TABLE = 'family_timing_videos';

type Row = { measurement_id: string; asset_id: string; start_offset_ms: number | null };

export function createPowerSyncFamilyVideoRepository(): FamilyVideoRepository {
  return {
    async link(userId, video) {
      await db.writeTransaction(async (tx) => {
        await tx.execute(`DELETE FROM ${TABLE} WHERE created_by = ? AND measurement_id = ?`, [userId, video.measurementId]);
        await tx.execute(
          `INSERT INTO ${TABLE} (id, created_at, created_by, measurement_id, asset_id, start_offset_ms) VALUES (uuid(), ?, ?, ?, ?, ?)`,
          [new Date().toISOString(), userId, video.measurementId, video.assetId, video.startOffsetMillis],
        );
      });
    },
    async listByUser(userId) {
      const rows = await db.getAll<Row>(`SELECT measurement_id, asset_id, start_offset_ms FROM ${TABLE} WHERE created_by = ?`, [userId]);
      return rows.map((row) => ({ measurementId: row.measurement_id, assetId: row.asset_id, startOffsetMillis: row.start_offset_ms ?? 0 }));
    },
  };
}

export function createInMemoryFamilyVideoRepository(seed: (FamilyVideo & { userId: string })[] = []) {
  const rows = [...seed];
  const repository: FamilyVideoRepository = {
    async link(userId, video) {
      const kept = rows.filter((row) => !(row.userId === userId && row.measurementId === video.measurementId));
      rows.length = 0;
      rows.push(...kept, { ...video, userId });
    },
    async listByUser(userId) {
      return rows.filter((row) => row.userId === userId).map(({ userId: _owner, ...video }) => video);
    },
  };
  return { repository, rows };
}

import { validatedBody, type Notice, type NoticeRepository } from './notices';

export function createInMemoryNoticeRepository(): NoticeRepository {
  const stored: Notice[] = [];
  return {
    async list(athleteId, assignmentId) {
      return stored
        .filter((notice) => notice.athleteId === athleteId && notice.assignmentId === assignmentId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
        .map((notice) => ({ ...notice }));
    },
    async add(notice) {
      const body = validatedBody(notice.body);
      const id = `notice-${stored.length + 1}`;
      stored.push({ ...notice, body, id, createdAt: notice.createdAt ?? new Date().toISOString() });
      return id;
    },
  };
}

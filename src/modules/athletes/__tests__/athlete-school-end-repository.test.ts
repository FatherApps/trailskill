import {
  createInMemoryAthleteSchoolEndRepository,
  createInMemoryAthleteSchoolRepository,
  createSupabaseAthleteSchoolEndRepository,
  type AthleteSchoolRow,
} from '..';

// The Supabase client is never reached: the repository takes a fake with the one method it uses.
jest.mock('../../../core/sync', () => ({ supabase: {}, db: {} }));

// Synthetic data only.
const link = (athleteId: string, schoolId: string): AthleteSchoolRow => ({ athleteId, schoolId, categoryId: null });

describe('Supabase athlete school end repository', () => {
  it('ends the link with the end_athlete_school function and the ids of the athlete and the school', async () => {
    const client = { rpc: jest.fn().mockResolvedValue({ data: '2026-11-20T10:00:00+00:00', error: null }) };

    await expect(createSupabaseAthleteSchoolEndRepository(client).endLink('a1', 's1')).resolves.toBeUndefined();

    expect(client.rpc).toHaveBeenCalledWith('end_athlete_school', { athlete: 'a1', school: 's1' });
  });

  it.each([
    ['42501', 'not_allowed'],
    ['P0002', 'not_enrolled'],
  ])('maps the database error %s to %s', async (code, message) => {
    const client = { rpc: jest.fn().mockResolvedValue({ data: null, error: Object.assign(new Error('db'), { code }) }) };

    await expect(createSupabaseAthleteSchoolEndRepository(client).endLink('a1', 's1')).rejects.toThrow(message);
  });

  it('rejects with the original error for anything else, offline included', async () => {
    const failure = Object.assign(new Error('Failed to fetch'), { code: '' });
    const client = { rpc: jest.fn().mockResolvedValue({ data: null, error: failure }) };

    await expect(createSupabaseAthleteSchoolEndRepository(client).endLink('a1', 's1')).rejects.toBe(failure);
  });
});

describe('in-memory athlete school end repository', () => {
  const rows = () => [link('a1', 's1'), link('a1', 's2'), link('a2', 's1')];

  it('ends the link of that school only: the athlete stays active in the others and nobody else changes', async () => {
    const data = rows();
    const links = createInMemoryAthleteSchoolRepository(data);

    await createInMemoryAthleteSchoolEndRepository(data, ['s1']).endLink('a1', 's1');

    await expect(links.listActiveSchools('a1')).resolves.toEqual(['s2']);
    await expect(links.listActiveSchools('a2')).resolves.toEqual(['s1']);
    // The baja deletes nothing: the ended link is still listed.
    await expect(links.listByAthlete('a1')).resolves.toHaveLength(2);
  });

  it('answers that the athlete is active in no school once the last link is ended', async () => {
    const data = rows();
    const ends = createInMemoryAthleteSchoolEndRepository(data, ['s1', 's2']);

    await ends.endLink('a1', 's1');
    await ends.endLink('a1', 's2');

    await expect(createInMemoryAthleteSchoolRepository(data).listActiveSchools('a1')).resolves.toEqual([]);
  });

  it('keeps the first end when it is repeated', async () => {
    const data = rows();
    const ends = createInMemoryAthleteSchoolEndRepository(data, ['s1']);

    await ends.endLink('a1', 's1');
    const first = data[0].endedAt;
    await ends.endLink('a1', 's1');

    expect(data[0].endedAt).toBe(first);
  });

  it('refuses a school the caller does not administer and changes nothing', async () => {
    const data = rows();

    await expect(createInMemoryAthleteSchoolEndRepository(data, ['s2']).endLink('a2', 's1')).rejects.toThrow('not_allowed');

    await expect(createInMemoryAthleteSchoolRepository(data).listActiveSchools('a2')).resolves.toEqual(['s1']);
  });

  it('refuses an athlete that is not in the school', async () => {
    await expect(createInMemoryAthleteSchoolEndRepository(rows(), ['s2']).endLink('a2', 's2')).rejects.toThrow('not_enrolled');
  });
});

import {
  createGuardianRecordsRepository,
  createInMemoryGuardianSharingRepository,
  createSupabaseGuardianSharingRepository,
  GuardianSharingError,
  type GuardianSharingClient,
} from '../data/guardianSharing';

// The adapter takes the client as a parameter; the default one needs the sync layer mocked.
jest.mock('../../../core/sync', () => ({ supabase: {} }));

type Answer = { data?: unknown; error?: { code?: string; message?: string } | null };

// A client whose rpc answers in order; the last answer repeats.
function client(...answers: Answer[]) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const rpc: GuardianSharingClient['rpc'] = async (name, args) => {
    calls.push({ name, args });
    const answer = answers[Math.min(calls.length, answers.length) - 1];
    return { data: answer.data ?? null, error: answer.error ?? null };
  };
  return { client: { rpc } satisfies GuardianSharingClient, calls };
}

const deadlock = { error: { code: '40P01', message: 'deadlock detected' } };
const ok: Answer = {};

function repository(...answers: Answer[]) {
  const delays: number[] = [];
  const { client: c, calls } = client(...answers);
  return { repo: createSupabaseGuardianSharingRepository(c, async (ms) => void delays.push(ms)), calls, delays };
}

describe('the Supabase guardian sharing repository', () => {
  it('calls the RPC of each operation with the arguments of the migration', async () => {
    const { repo, calls } = repository({ data: true }, ok, { data: false }, ok, ok);
    expect(await repo.getSchoolDefault('school-1')).toBe(true);
    await repo.setSchoolDefault('school-1', true);
    expect(await repo.getSwimmer('athlete-1', 'school-1')).toBe(false);
    await repo.setSwimmer('athlete-1', 'school-1', true);
    await repo.setRecordShared('measurement-1', false);
    expect(calls).toEqual([
      { name: 'timing_guardian_sharing_default', args: { school: 'school-1' } },
      { name: 'timing_set_guardian_sharing_default', args: { school: 'school-1', shares_all: true } },
      { name: 'timing_guardian_sharing', args: { athlete: 'athlete-1', school: 'school-1' } },
      { name: 'timing_set_guardian_sharing', args: { athlete: 'athlete-1', school: 'school-1', shares_all: true } },
      { name: 'timing_set_measurement_guardian_shared', args: { measurement: 'measurement-1', shared: false } },
    ]);
  });

  it.each([
    ['the school default', (r: ReturnType<typeof repository>['repo']) => r.setSchoolDefault('school-1', true)],
    ['the switch of a swimmer', (r: ReturnType<typeof repository>['repo']) => r.setSwimmer('athlete-1', 'school-1', true)],
  ])('retries %s after a deadlock (40P01) until it works, waiting longer each time', async (_name, change) => {
    const { repo, calls, delays } = repository(deadlock, deadlock, ok);
    await expect(change(repo)).resolves.toBeUndefined();
    expect(calls).toHaveLength(3);
    expect(delays).toHaveLength(2);
    expect(delays[1]).toBeGreaterThan(delays[0]);
  });

  it('gives up after three tries and rejects with the code so the screen shows the error', async () => {
    const { repo, calls, delays } = repository(deadlock);
    await expect(repo.setSwimmer('athlete-1', 'school-1', true)).rejects.toMatchObject({ name: 'GuardianSharingError', code: '40P01' });
    expect(calls).toHaveLength(3);
    expect(delays).toHaveLength(2);
  });

  it('does not retry any other failure, 42501 included', async () => {
    const { repo, calls, delays } = repository({ error: { code: '42501', message: 'only a coach or school admin of this school can do this' } });
    const failure = await repo.setSchoolDefault('school-1', true).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(GuardianSharingError);
    expect(failure).toMatchObject({ code: '42501' });
    expect(calls).toHaveLength(1);
    expect(delays).toEqual([]);
  });

  it('does not retry a read or a record change, and a failure without a code is unexpected', async () => {
    const { repo, calls } = repository({ error: { message: 'Failed to fetch' } });
    await expect(repo.getSchoolDefault('school-1')).rejects.toMatchObject({ code: 'unexpected' });
    await expect(repo.setRecordShared('measurement-1', true)).rejects.toMatchObject({ code: 'unexpected' });
    expect(calls).toHaveLength(2);
  });

  it('never puts the server message in the error', async () => {
    const { repo } = repository({ error: { code: '42501', message: 'athlete Ana Perez' } });
    const failure = (await repo.setSwimmer('athlete-1', 'school-1', true).catch((error: unknown) => error)) as Error;
    expect(failure.message).not.toContain('Ana');
  });
});

describe('the in-memory guardian sharing repository', () => {
  it('starts with nothing shared and keeps what is set', async () => {
    const repo = createInMemoryGuardianSharingRepository();
    expect(await repo.getSchoolDefault('school-1')).toBe(false);
    expect(await repo.getSwimmer('athlete-1', 'school-1')).toBe(false);
    await repo.setSchoolDefault('school-1', true);
    await repo.setSwimmer('athlete-2', 'school-1', true);
    expect(await repo.getSchoolDefault('school-1')).toBe(true);
    expect(await repo.getSwimmer('athlete-2', 'school-1')).toBe(true);
    expect(await repo.getSwimmer('athlete-1', 'school-1')).toBe(true);
  });
});

describe('the guardian records repository', () => {
  // The fields the list reads of a timing measurement; the rest is not needed.
  const measurement = (id: string, schoolId: string, guardianVisible?: boolean | null) =>
    ({ id, schoolId, stroke: 'FR', distance: '50m', pool: 'SCM', kind: 'race', hundredths: 3482, capturedAt: '2026-11-01T08:00:00Z', guardianVisible }) as never;

  it('lists the swimmer\'s records of the school only, with what the device knows of their visibility', async () => {
    const repo = createGuardianRecordsRepository({
      listByAthlete: async () => [measurement('r1', 'school-a', true), measurement('r2', 'school-b', true), measurement('r3', 'school-a', false)],
    });
    const list = await repo.list('a1', 'school-a');
    expect(list.map((r) => [r.id, r.shared])).toEqual([
      ['r1', true],
      ['r3', false],
    ]);
  });

  it('keeps a visibility the device does not know as null, never false', async () => {
    const repo = createGuardianRecordsRepository({ listByAthlete: async () => [measurement('r1', 'school-a', null), measurement('r2', 'school-a')] });
    expect((await repo.list('a1', 'school-a')).map((r) => r.shared)).toEqual([null, null]);
  });
});

import {
  createInMemoryAthleteRegistrationRepository,
  createSupabaseAthleteRegistrationRepository,
  type ClaimAthleteInput,
  type RegisterAthleteInput,
} from '..';

// The Supabase client is never reached: the repository takes a fake with the one method it uses.
jest.mock('../../../core/sync', () => ({ supabase: {}, db: {} }));

// Synthetic data only.
const registration: RegisterAthleteInput = { athleteId: 'a1', schoolId: 's1', firstName: 'Ana', lastName: 'Uno', guardianAuthorizationCollected: true };
const claim: ClaimAthleteInput = {
  token: 't'.repeat(32),
  relation: 'guardian',
  acceptedAt: '2026-11-22T10:00:00.000Z',
  authorizations: [
    { id: 'x1', purpose: 'record_times', textId: 'tx1' },
    { id: 'x2', purpose: 'import_official_results', textId: 'tx2' },
    { id: 'x3', purpose: 'share_results_with_school', textId: 'tx3' },
  ],
};
const failure = (code: string) => ({ data: null, error: Object.assign(new Error('db'), { code }) });

describe('Supabase athlete registration repository', () => {
  it('registers with register_athlete_in_school and returns the link the server made', async () => {
    const client = { rpc: jest.fn().mockResolvedValue({ data: { athlete_id: 'a1', token: 'tok', expires_at: '2026-12-06T10:00:00+00:00' }, error: null }) };

    await expect(createSupabaseAthleteRegistrationRepository(client).register(registration)).resolves.toEqual({
      athleteId: 'a1',
      token: 'tok',
      expiresAt: '2026-12-06T10:00:00+00:00',
    });

    expect(client.rpc).toHaveBeenCalledWith('register_athlete_in_school', {
      athlete_id: 'a1',
      school_id: 's1',
      first_name: 'Ana',
      last_name: 'Uno',
      guardian_authorization_collected: true,
    });
  });

  it('claims with claim_athlete, sending the authorizations with the ids made on the device, and returns the athlete id', async () => {
    const client = { rpc: jest.fn().mockResolvedValue({ data: 'a1', error: null }) };

    await expect(createSupabaseAthleteRegistrationRepository(client).claim(claim)).resolves.toBe('a1');

    expect(client.rpc).toHaveBeenCalledWith('claim_athlete', {
      token: claim.token,
      relation: 'guardian',
      accepted_at: claim.acceptedAt,
      authorizations: [
        { id: 'x1', purpose: 'record_times', text_id: 'tx1' },
        { id: 'x2', purpose: 'import_official_results', text_id: 'tx2' },
        { id: 'x3', purpose: 'share_results_with_school', text_id: 'tx3' },
      ],
    });
  });

  it.each([
    ['42501', 'not_allowed'],
    ['22023', 'invalid'],
    ['P0002', 'link_not_found'],
  ])('maps the database error %s to %s', async (code, message) => {
    const client = { rpc: jest.fn().mockResolvedValue(failure(code)) };

    await expect(createSupabaseAthleteRegistrationRepository(client).register(registration)).rejects.toThrow(message);
    await expect(createSupabaseAthleteRegistrationRepository(client).claim(claim)).rejects.toThrow(message);
  });

  it('rejects with the original error for anything else, offline included', async () => {
    const offline = Object.assign(new Error('Failed to fetch'), { code: '' });
    const client = { rpc: jest.fn().mockResolvedValue({ data: null, error: offline }) };

    await expect(createSupabaseAthleteRegistrationRepository(client).register(registration)).rejects.toBe(offline);
    await expect(createSupabaseAthleteRegistrationRepository(client).claim(claim)).rejects.toBe(offline);
  });
});

describe('in-memory athlete registration repository', () => {
  it('records the registration and answers with a link of 14 days (provisional, as the server)', async () => {
    const repository = createInMemoryAthleteRegistrationRepository({ now: () => new Date('2026-11-22T10:00:00.000Z') });

    const link = await repository.register(registration);

    expect(link).toEqual({ athleteId: 'a1', token: '1'.padStart(32, '0'), expiresAt: '2026-12-06T10:00:00.000Z' });
    expect(repository.registered).toEqual([registration]);
  });

  it('answers a re-send of the same swimmer with the same link', async () => {
    const repository = createInMemoryAthleteRegistrationRepository();

    const first = await repository.register(registration);

    await expect(repository.register(registration)).resolves.toEqual(first);
    expect(repository.registered).toHaveLength(1);
  });

  it('records the claim and answers with the swimmer of the link', async () => {
    const repository = createInMemoryAthleteRegistrationRepository();
    const { token } = await repository.register(registration);

    await expect(repository.claim({ ...claim, token })).resolves.toBe('a1');

    expect(repository.claimed).toEqual([{ ...claim, token }]);
  });

  it('refuses a claim for an unknown or already used link', async () => {
    const repository = createInMemoryAthleteRegistrationRepository();
    const { token } = await repository.register(registration);

    await expect(repository.claim({ ...claim, token: 'unknown' })).rejects.toThrow('link_not_found');
    await repository.claim({ ...claim, token });
    await expect(repository.claim({ ...claim, token })).rejects.toThrow('link_not_found');
  });

  it('refuses a claim after the link expired', async () => {
    let now = new Date('2026-11-22T10:00:00.000Z');
    const repository = createInMemoryAthleteRegistrationRepository({ now: () => now });
    const { token } = await repository.register(registration);

    now = new Date('2026-12-07T10:00:00.000Z');

    await expect(repository.claim({ ...claim, token })).rejects.toThrow('link_not_found');
  });

  it('rejects every call with the error it is told to, and records nothing', async () => {
    const repository = createInMemoryAthleteRegistrationRepository();
    repository.rejectWith = 'not_allowed';

    await expect(repository.register(registration)).rejects.toThrow('not_allowed');
    await expect(repository.claim(claim)).rejects.toThrow('not_allowed');

    expect(repository.registered).toEqual([]);
    expect(repository.claimed).toEqual([]);
  });
});

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

  it('renews with renew_athlete_claim_link and returns the new link', async () => {
    const client = { rpc: jest.fn().mockResolvedValue({ data: { athlete_id: 'a1', token: 'new', expires_at: '2026-12-06T10:00:00+00:00' }, error: null }) };

    await expect(createSupabaseAthleteRegistrationRepository(client).renew('a1')).resolves.toEqual({ athleteId: 'a1', token: 'new', expiresAt: '2026-12-06T10:00:00+00:00' });

    expect(client.rpc).toHaveBeenCalledWith('renew_athlete_claim_link', { athlete_id: 'a1' });
  });

  it('revokes with revoke_athlete_claim_link', async () => {
    const client = { rpc: jest.fn().mockResolvedValue({ data: null, error: null }) };

    await expect(createSupabaseAthleteRegistrationRepository(client).revoke('a1')).resolves.toBeUndefined();

    expect(client.rpc).toHaveBeenCalledWith('revoke_athlete_claim_link', { athlete_id: 'a1' });
  });

  it.each([
    ['42501', 'not_allowed'],
    ['55000', 'not_open'],
  ])('maps the database error %s of renew and revoke to %s', async (code, message) => {
    const client = { rpc: jest.fn().mockResolvedValue(failure(code)) };

    await expect(createSupabaseAthleteRegistrationRepository(client).renew('a1')).rejects.toThrow(message);
    await expect(createSupabaseAthleteRegistrationRepository(client).revoke('a1')).rejects.toThrow(message);
  });

  describe('findLink', () => {
    const reader = (data: unknown, error: (Error & { code?: string }) | null = null) => {
      const eq = jest.fn(() => ({ maybeSingle: () => Promise.resolve({ data, error }) }));
      const select = jest.fn(() => ({ eq }));
      return { client: { from: jest.fn(() => ({ select })) }, select, eq };
    };
    const rpc = { rpc: jest.fn() };
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const past = new Date(Date.now() - 86_400_000).toISOString();

    it.each([
      ['open', { token: 't', expires_at: future, claimed_at: null, revoked_at: null }],
      ['expired', { token: 't', expires_at: past, claimed_at: null, revoked_at: null }],
      ['revoked', { token: 't', expires_at: future, claimed_at: null, revoked_at: past }],
      ['claimed', { token: 't', expires_at: past, claimed_at: past, revoked_at: null }],
    ])('reads the claim row of the swimmer and says it is %s', async (status, row) => {
      const { client, select, eq } = reader(row);

      await expect(createSupabaseAthleteRegistrationRepository(rpc, client).findLink('a1')).resolves.toEqual({ status, token: 't', expiresAt: row.expires_at });

      expect(client.from).toHaveBeenCalledWith('athlete_claims');
      expect(select).toHaveBeenCalledWith('token, expires_at, claimed_at, revoked_at');
      expect(eq).toHaveBeenCalledWith('athlete_id', 'a1');
    });

    it('answers null when the swimmer has no link, or the caller may not read it', async () => {
      await expect(createSupabaseAthleteRegistrationRepository(rpc, reader(null).client).findLink('a1')).resolves.toBeNull();
    });

    it('rejects with the error of the read', async () => {
      const offline = Object.assign(new Error('Failed to fetch'), { code: '' });

      await expect(createSupabaseAthleteRegistrationRepository(rpc, reader(null, offline).client).findLink('a1')).rejects.toBe(offline);
    });
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

  it('refuses a re-send for another school or by another user, as the server does, and one with other names', async () => {
    const repository = createInMemoryAthleteRegistrationRepository();
    await repository.register(registration);

    await expect(repository.register({ ...registration, schoolId: 's2' })).rejects.toThrow('not_allowed');
    await expect(repository.register({ ...registration, firstName: 'Otro' })).rejects.toThrow('invalid');
    repository.userId = 'another-admin';
    await expect(repository.register(registration)).rejects.toThrow('not_allowed');
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

  it('refuses a claim by staff of the enrolling school, leaves the link unused and lets staff of another school claim', async () => {
    const repository = createInMemoryAthleteRegistrationRepository();
    const { token } = await repository.register(registration);

    repository.staffSchoolIds = ['s1'];
    await expect(repository.claim({ ...claim, token })).rejects.toThrow('not_allowed');
    expect(repository.claimed).toEqual([]);

    repository.staffSchoolIds = ['s2'];
    await expect(repository.claim({ ...claim, token })).resolves.toBe('a1');
  });

  it('keeps the link usable by the family after a staff attempt', async () => {
    const repository = createInMemoryAthleteRegistrationRepository();
    const { token } = await repository.register(registration);

    repository.staffSchoolIds = ['s1'];
    await expect(repository.claim({ ...claim, token })).rejects.toThrow('not_allowed');
    repository.staffSchoolIds = [];

    await expect(repository.claim({ ...claim, token })).resolves.toBe('a1');
  });

  it('rejects every call with the error it is told to, and records nothing', async () => {
    const repository = createInMemoryAthleteRegistrationRepository();
    repository.rejectWith = 'not_allowed';

    await expect(repository.register(registration)).rejects.toThrow('not_allowed');
    await expect(repository.claim(claim)).rejects.toThrow('not_allowed');

    expect(repository.registered).toEqual([]);
    expect(repository.claimed).toEqual([]);
  });
  describe('renewing and revoking', () => {
    const open = async (now = () => new Date('2026-11-22T10:00:00.000Z')) => {
      const repository = createInMemoryAthleteRegistrationRepository({ now });
      repository.adminSchoolIds = ['s1'];
      const first = await repository.register(registration);
      const claimWith = (token: string) => repository.claim({ ...claim, token });
      return { repository, first, claimWith };
    };

    it('renew gives a new token and the old one stops working at once', async () => {
      const { repository, first, claimWith } = await open();

      const renewed = await repository.renew('a1');

      expect(renewed.token).not.toBe(first.token);
      expect(renewed.expiresAt).toBe('2026-12-06T10:00:00.000Z');
      await expect(claimWith(first.token)).rejects.toThrow('link_not_found');
      await expect(claimWith(renewed.token)).resolves.toBe('a1');
    });

    it('revoke makes the link fail with link_not_found, and renewing it issues a new one', async () => {
      const { repository, first, claimWith } = await open();

      await repository.revoke('a1');
      await expect(claimWith(first.token)).rejects.toThrow('link_not_found');
      await expect(repository.findLink('a1')).resolves.toMatchObject({ status: 'revoked' });

      const renewed = await repository.renew('a1');
      await expect(repository.findLink('a1')).resolves.toMatchObject({ status: 'open', token: renewed.token });
      await expect(claimWith(renewed.token)).resolves.toBe('a1');
    });

    it('is refused for anyone who is not an active admin of the school, the user who registered the swimmer included, as the server does', async () => {
      const { repository } = await open();
      repository.adminSchoolIds = [];

      await expect(repository.renew('a1')).rejects.toThrow('not_allowed');
      await expect(repository.revoke('a1')).rejects.toThrow('not_allowed');
      await expect(repository.renew('unknown')).rejects.toThrow('not_allowed');
      await expect(repository.findLink('a1')).resolves.toBeNull();

      repository.adminSchoolIds = ['another-school'];
      await expect(repository.renew('a1')).rejects.toThrow('not_allowed');

      repository.adminSchoolIds = ['s1'];
      await expect(repository.renew('a1')).resolves.toMatchObject({ athleteId: 'a1' });
    });

    it('is refused with not_open once the link was claimed or the school ended the swimmer', async () => {
      const { repository, first, claimWith } = await open();
      await claimWith(first.token);

      await expect(repository.renew('a1')).rejects.toThrow('not_open');
      await expect(repository.revoke('a1')).rejects.toThrow('not_open');
      await expect(repository.findLink('a1')).resolves.toMatchObject({ status: 'claimed' });

      const other = await open();
      other.repository.endedAthleteIds = ['a1'];
      await expect(other.repository.renew('a1')).rejects.toThrow('not_open');
      await expect(other.claimWith(other.first.token)).rejects.toThrow('link_not_found');
    });

    it('reports an expired link as expired and renews it', async () => {
      let time = new Date('2026-11-22T10:00:00.000Z');
      const { repository, claimWith } = await open(() => time);
      time = new Date('2026-12-07T10:00:00.000Z');

      await expect(repository.findLink('a1')).resolves.toMatchObject({ status: 'expired' });
      const renewed = await repository.renew('a1');
      await expect(claimWith(renewed.token)).resolves.toBe('a1');
    });
  });
});

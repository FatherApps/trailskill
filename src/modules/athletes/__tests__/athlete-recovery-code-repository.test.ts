import * as SecureStore from 'expo-secure-store';

import {
  createInMemoryAthleteRecoveryCodeRepository,
  createInMemoryRecoveryCodeVault,
  createSecureStoreRecoveryCodeVault,
  createSupabaseAthleteRecoveryCodeRepository,
} from '..';

// The Supabase client is never reached: the repository takes a fake with the one method it uses.
jest.mock('../../../core/sync', () => ({ supabase: {}, db: {} }));
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => void store.set(key, value)),
    deleteItemAsync: jest.fn(async (key: string) => void store.delete(key)),
  };
});

// Synthetic texts only.
const row = { main_code: 'TR-TEST-AAAA', recovery_codes: ['RC-TEST-0001', 'RC-TEST-0002'] };
const rpcError = (code: string, message = 'db') => ({ data: null, error: Object.assign(new Error(message), { code }) });

describe('Supabase athlete recovery code repository', () => {
  it('asks for the codes with issue_athlete_recovery_code and maps the row', async () => {
    const client = { rpc: jest.fn().mockResolvedValue({ data: [row], error: null }) };

    await expect(createSupabaseAthleteRecoveryCodeRepository(client).issue('a1')).resolves.toEqual({
      mainCode: 'TR-TEST-AAAA',
      recoveryCodes: ['RC-TEST-0001', 'RC-TEST-0002'],
    });
    expect(client.rpc).toHaveBeenCalledWith('issue_athlete_recovery_code', { athlete: 'a1' });
  });

  it('answers null when the server returns no row (the owner already confirmed)', async () => {
    const client = { rpc: jest.fn().mockResolvedValue({ data: [], error: null }) };

    await expect(createSupabaseAthleteRecoveryCodeRepository(client).issue('a1')).resolves.toBeNull();
  });

  it('refuses an answer of another shape instead of storing something unknown', async () => {
    const client = { rpc: jest.fn().mockResolvedValue({ data: [{ main_code: 1 }], error: null }) };

    await expect(createSupabaseAthleteRecoveryCodeRepository(client).issue('a1')).rejects.toThrow('unexpected_recovery_codes_answer');
  });

  it('confirms the set of the code the owner saved with confirm_athlete_recovery_codes', async () => {
    const client = { rpc: jest.fn().mockResolvedValue({ data: null, error: null }) };

    await expect(createSupabaseAthleteRecoveryCodeRepository(client).confirm('a1', 'TR-TEST-AAAA')).resolves.toBeUndefined();
    expect(client.rpc).toHaveBeenCalledWith('confirm_athlete_recovery_codes', { athlete: 'a1', main_code: 'TR-TEST-AAAA' });
  });

  it.each([
    ['P0001', 'recovery_set_superseded', 'recovery_set_superseded'],
    ['P0001', 'no_recovery_identity', 'no_recovery_identity'],
    ['42501', 'db', 'not_allowed'],
  ])('maps the confirm error %s %s to %s', async (code, message, known) => {
    const client = { rpc: jest.fn().mockResolvedValue(rpcError(code, message)) };

    await expect(createSupabaseAthleteRecoveryCodeRepository(client).confirm('a1', 'TR-TEST-AAAA')).rejects.toThrow(known);
  });

  it('regenerates with regenerate_athlete_recovery_codes and returns the texts', async () => {
    const client = { rpc: jest.fn().mockResolvedValue({ data: ['RC-TEST-0009'], error: null }) };

    await expect(createSupabaseAthleteRecoveryCodeRepository(client).regenerate('a1')).resolves.toEqual(['RC-TEST-0009']);
    expect(client.rpc).toHaveBeenCalledWith('regenerate_athlete_recovery_codes', { athlete: 'a1' });
  });

  it.each([
    ['42501', 'db', 'not_allowed'],
    ['P0001', 'no_recovery_code_used', 'no_recovery_code_used'],
    ['P0001', 'no_recovery_identity', 'no_recovery_identity'],
  ])('maps the database error %s %s to %s', async (code, message, known) => {
    const client = { rpc: jest.fn().mockResolvedValue(rpcError(code, message)) };

    await expect(createSupabaseAthleteRecoveryCodeRepository(client).regenerate('a1')).rejects.toThrow(known);
  });

  it('rejects with the original error for anything else, offline included', async () => {
    const offline = Object.assign(new Error('Failed to fetch'), { code: '' });
    const client = { rpc: jest.fn().mockResolvedValue({ data: null, error: offline }) };

    await expect(createSupabaseAthleteRecoveryCodeRepository(client).issue('a1')).rejects.toBe(offline);
  });
});

describe('in-memory athlete recovery code repository', () => {
  it('issues 8 recovery codes and no more once the owner confirmed', async () => {
    const repository = createInMemoryAthleteRecoveryCodeRepository(['a1']);

    const issued = await repository.issue('a1');
    expect(issued?.recoveryCodes).toHaveLength(8);
    await repository.confirm('a1', issued!.mainCode);
    await expect(repository.issue('a1')).resolves.toBeNull();
  });

  it('confirms only the set that was issued last, as the server does', async () => {
    const repository = createInMemoryAthleteRecoveryCodeRepository(['a1']);
    const first = await repository.issue('a1');
    const second = await repository.issue('a1');

    await expect(repository.confirm('a1', first!.mainCode)).rejects.toThrow('recovery_set_superseded');
    await expect(repository.confirm('a1', second!.mainCode)).resolves.toBeUndefined();
    await expect(createInMemoryAthleteRecoveryCodeRepository(['a1']).confirm('a1', 'TR-TEST-a1')).rejects.toThrow('no_recovery_identity');
  });

  it('refuses a swimmer the caller does not manage', async () => {
    await expect(createInMemoryAthleteRecoveryCodeRepository(['a1']).issue('a2')).rejects.toThrow('not_allowed');
  });

  it('regenerates only after a recovery code was used, and replaces the set', async () => {
    const repository = createInMemoryAthleteRecoveryCodeRepository(['a1']);
    const first = await repository.issue('a1');
    await repository.confirm('a1', first!.mainCode);

    await expect(repository.regenerate('a1')).rejects.toThrow('no_recovery_code_used');
    repository.used.add('a1');
    const second = await repository.regenerate('a1');
    expect(second).toHaveLength(8);
    expect(second).not.toEqual(first?.recoveryCodes);
  });
});

describe('recovery code vault', () => {
  it('keeps the code per user and swimmer in memory', async () => {
    const vault = createInMemoryRecoveryCodeVault();
    await vault.set('u1', 'a1', 'TR-TEST-AAAA');

    await expect(vault.get('u1', 'a1')).resolves.toBe('TR-TEST-AAAA');
    await expect(vault.get('u2', 'a1')).resolves.toBeNull();
    await expect(vault.get('u1', 'a2')).resolves.toBeNull();
  });

  it('saves the code in the encrypted store, one entry per swimmer and user, and another user never reads it', async () => {
    const vault = createSecureStoreRecoveryCodeVault();
    await vault.set('u1', 'a1', 'TR-ABCD-EFGH-JKMN-PQRS');
    await vault.set('u1', 'a2', 'TR-WXYZ-2345-6789-ABCD');

    await expect(vault.get('u1', 'a1')).resolves.toBe('TR-ABCD-EFGH-JKMN-PQRS');
    await expect(vault.get('u1', 'a2')).resolves.toBe('TR-WXYZ-2345-6789-ABCD');
    await expect(vault.get('u2', 'a1')).resolves.toBeNull();
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('trailskill-recovery-code.u1.a1', 'TR-ABCD-EFGH-JKMN-PQRS');
  });

  it('keeps the code when the user signs out and signs back in: sign-out leaves this entry alone, a new vault over the same store reads it', async () => {
    await createSecureStoreRecoveryCodeVault().set('u3', 'a1', 'TR-ABCD-EFGH-JKMN-PQRS');

    // Signing back in builds everything again (a restart of the app, for the vault): the store is what keeps the code.
    await expect(createSecureStoreRecoveryCodeVault().get('u3', 'a1')).resolves.toBe('TR-ABCD-EFGH-JKMN-PQRS');
  });

  it('fails closed on a corrupt value: it is not read as a code, and saving another entry or the same one leaves it untouched', async () => {
    const vault = createSecureStoreRecoveryCodeVault();
    await SecureStore.setItemAsync('trailskill-recovery-code.u4.a1', '{"broken": ');

    await expect(vault.get('u4', 'a1')).rejects.toThrow('recovery_code_unreadable');
    await expect(vault.set('u4', 'a2', 'TR-WXYZ-2345-6789-ABCD')).resolves.toBeUndefined();
    await expect(vault.set('u4', 'a1', 'TR-ABCD-EFGH-JKMN-PQRS')).rejects.toThrow('recovery_code_unreadable');

    expect(await SecureStore.getItemAsync('trailskill-recovery-code.u4.a1')).toBe('{"broken": ');
    await expect(vault.get('u4', 'a2')).resolves.toBe('TR-WXYZ-2345-6789-ABCD');
  });

  it('never writes a different code over a stored one, but accepts the same one again', async () => {
    const vault = createSecureStoreRecoveryCodeVault();
    await vault.set('u5', 'a1', 'TR-ABCD-EFGH-JKMN-PQRS');

    await expect(vault.set('u5', 'a1', 'TR-ABCD-EFGH-JKMN-PQRS')).resolves.toBeUndefined();
    await expect(vault.set('u5', 'a1', 'TR-WXYZ-2345-6789-ABCD')).rejects.toThrow('recovery_code_conflict');
    await expect(vault.get('u5', 'a1')).resolves.toBe('TR-ABCD-EFGH-JKMN-PQRS');
  });

  it('keeps a pending-confirmation marker until it is cleared, and remove forgets the code and the marker', async () => {
    const vault = createSecureStoreRecoveryCodeVault();
    await vault.set('u6', 'a1', 'TR-ABCD-EFGH-JKMN-PQRS');
    await expect(vault.isConfirmPending('u6', 'a1')).resolves.toBe(false);

    await vault.setConfirmPending('u6', 'a1', true);
    await expect(createSecureStoreRecoveryCodeVault().isConfirmPending('u6', 'a1')).resolves.toBe(true);
    await vault.setConfirmPending('u6', 'a1', false);
    await expect(vault.isConfirmPending('u6', 'a1')).resolves.toBe(false);

    await vault.setConfirmPending('u6', 'a1', true);
    await vault.remove('u6', 'a1');
    await expect(vault.get('u6', 'a1')).resolves.toBeNull();
    await expect(vault.isConfirmPending('u6', 'a1')).resolves.toBe(false);
  });
});

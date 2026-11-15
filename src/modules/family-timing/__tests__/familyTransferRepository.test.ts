import { createPowerSyncFamilyTransferRepository, FamilyTransferError } from '../data/familyTransfers';

const mockRpc = jest.fn();
jest.mock('../../../core/sync', () => ({ db: {}, supabase: { rpc: (...args: unknown[]) => mockRpc(...args) } }));

beforeEach(() => mockRpc.mockReset());

describe('createPowerSyncFamilyTransferRepository send', () => {
  it('returns the short name the server sends back', async () => {
    mockRpc.mockResolvedValue({ data: 'Ana M.', error: null });
    await expect(createPowerSyncFamilyTransferRepository().send('m1', 'TS-BBBBBB')).resolves.toBe('Ana M.');
    expect(mockRpc).toHaveBeenCalledWith('send_family_time', { measurement: 'm1', share_code: 'TS-BBBBBB' });
  });

  it('turns a null answer, an unknown code, into unknown_code', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    const sent = createPowerSyncFamilyTransferRepository().send('m1', 'TS-ZZZZZZ');
    await expect(sent).rejects.toBeInstanceOf(FamilyTransferError);
    await expect(sent).rejects.toMatchObject({ code: 'unknown_code' });
  });

  it('keeps the server errors', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'too_many_attempts' } });
    await expect(createPowerSyncFamilyTransferRepository().send('m1', 'TS-BBBBBB')).rejects.toMatchObject({ code: 'too_many_attempts' });
  });
});

import {
  createIdentityNumberHold,
  createSupabaseIdentityDocumentRepository,
  isValidIdentityNumber,
  normalizeIdentityNumber,
} from '../data/identityDocuments';

const mockRpc = jest.fn();
const mockUnsent = jest.fn();
jest.mock('../../../core/sync', () => ({
  countUnsentRecords: () => mockUnsent(),
  supabase: { rpc: (name: string, args: unknown) => mockRpc(name, args) },
}));

// Synthetic numbers only: never a real identity document.
describe('identity number rules', () => {
  it('drops spaces, dots and hyphens', () => {
    expect(normalizeIdentityNumber(' 9 876.543-21 ')).toBe('987654321');
  });

  it('accepts 1 to 20 letters and digits, nothing else', () => {
    expect(isValidIdentityNumber('AB12')).toBe(true);
    expect(isValidIdentityNumber('1'.repeat(20))).toBe(true);
    expect(isValidIdentityNumber('')).toBe(false);
    expect(isValidIdentityNumber('1'.repeat(21))).toBe(false);
    expect(isValidIdentityNumber('AB/12')).toBe(false);
  });
});

describe('identity number hold', () => {
  it('take returns the number once and forgets it', () => {
    const hold = createIdentityNumberHold();
    hold.put('a1', '987654321');

    expect(hold.take('a1')).toBe('987654321');
    expect(hold.take('a1')).toBeUndefined();
  });

  it('clear forgets every number', () => {
    const hold = createIdentityNumberHold();
    hold.put('a1', '987654321');
    hold.put('a2', 'AB12');
    hold.clear();

    expect(hold.take('a1')).toBeUndefined();
    expect(hold.take('a2')).toBeUndefined();
  });
});

describe('Supabase identity document repository', () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockUnsent.mockReset().mockResolvedValue({ unsent: 0, rejected: 0 });
  });

  it('saves through the server function with the athlete and the number', async () => {
    mockRpc.mockResolvedValue({ error: null });

    await createSupabaseIdentityDocumentRepository().save({ athleteId: 'a1', identityNumber: '987654321' });

    expect(mockRpc).toHaveBeenCalledWith('save_athlete_identity_number', { athlete_id: 'a1', identity_number: '987654321' });
  });

  it('fails without the number in the message when the server refuses', async () => {
    mockRpc.mockResolvedValue({ error: { code: '42501', message: 'denied 987654321' } });

    const failure = await createSupabaseIdentityDocumentRepository()
      .save({ athleteId: 'a1', identityNumber: '987654321' })
      .catch((error: Error) => error);

    expect(failure).toEqual(new Error('Saving the identity number failed (42501)'));
    expect((failure as Error).message).not.toContain('987654321');
  });

  it('waits for the upload queue to empty before sending', async () => {
    jest.useFakeTimers();
    try {
      mockUnsent.mockResolvedValueOnce({ unsent: 2, rejected: 0 }).mockResolvedValue({ unsent: 0, rejected: 0 });
      mockRpc.mockResolvedValue({ error: null });

      const saving = createSupabaseIdentityDocumentRepository().save({ athleteId: 'a1', identityNumber: '987654321' });
      await jest.advanceTimersByTimeAsync(0);
      expect(mockRpc).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(1000);
      await saving;

      expect(mockRpc).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('gives up without sending when the queue never empties', async () => {
    jest.useFakeTimers();
    try {
      mockUnsent.mockResolvedValue({ unsent: 1, rejected: 0 });

      const saving = createSupabaseIdentityDocumentRepository()
        .save({ athleteId: 'a1', identityNumber: '987654321' })
        .catch((error: Error) => error);
      await jest.advanceTimersByTimeAsync(31_000);

      expect(await saving).toBeInstanceOf(Error);
      expect(mockRpc).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});

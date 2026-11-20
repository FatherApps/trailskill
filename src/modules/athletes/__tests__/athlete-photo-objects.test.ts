import { createSupabasePhotoObjects, PhotoRejectedError } from '..';

// Synthetic data only. Supabase Storage is faked: the tests read how its answers become a retry, a rejection or a success.
const mockUpload = jest.fn();
const mockRemove = jest.fn();

jest.mock('../../../core/sync', () => ({
  db: {},
  useQuery: jest.fn(),
  writeRecord: jest.fn(),
  deleteRecord: jest.fn(),
  supabase: { storage: { from: () => ({ upload: (...args: unknown[]) => mockUpload(...args), remove: (...args: unknown[]) => mockRemove(...args) }) } },
}));
jest.mock('expo-file-system', () => ({
  Directory: class {},
  File: class {
    async bytes() {
      return new Uint8Array([1, 2, 3]);
    }
  },
  Paths: { cache: '', document: '' },
}));

const PATH = 'a1111111-1111-4111-8111-111111111111/11111111-1111-4111-8111-111111111111.jpg';

describe('Supabase photo objects', () => {
  beforeEach(() => {
    mockUpload.mockReset();
    mockRemove.mockReset();
  });

  it('uploads the JPEG without overwriting', async () => {
    mockUpload.mockResolvedValue({ error: null });

    await createSupabasePhotoObjects().upload(PATH, 'file:///kept.jpg');

    expect(mockUpload).toHaveBeenCalledWith(PATH, new Uint8Array([1, 2, 3]), { contentType: 'image/jpeg', upsert: false });
  });

  it('an object that is already there is a success: an earlier try went up and only the row was missing', async () => {
    mockUpload.mockResolvedValue({ error: { statusCode: '409' } });

    await expect(createSupabasePhotoObjects().upload(PATH, 'file:///kept.jpg')).resolves.toBeUndefined();
  });

  it.each([400, 413, 415])('a %s is refused for good', async (status) => {
    mockUpload.mockResolvedValue({ error: { statusCode: String(status) } });

    await expect(createSupabasePhotoObjects().upload(PATH, 'file:///kept.jpg')).rejects.toBeInstanceOf(PhotoRejectedError);
  });

  it.each([401, 403, 500])('a %s is tried again later, never refused for good', async (status) => {
    mockUpload.mockResolvedValue({ error: { statusCode: String(status) } });

    const result = createSupabasePhotoObjects().upload(PATH, 'file:///kept.jpg');

    await expect(result).rejects.toThrow('could not be uploaded');
    await expect(result).rejects.not.toBeInstanceOf(PhotoRejectedError);
  });

  it('removing succeeds only when Storage names the object it deleted', async () => {
    mockRemove.mockResolvedValue({ data: [{ name: PATH }], error: null });

    await expect(createSupabasePhotoObjects().remove(PATH)).resolves.toBeUndefined();
  });

  it('an empty answer is a failure: Storage answers a delete its policy filters out with an empty list and no error', async () => {
    mockRemove.mockResolvedValue({ data: [], error: null });

    await expect(createSupabasePhotoObjects().remove(PATH)).rejects.toThrow('could not be deleted');
  });

  it('an error is a failure', async () => {
    mockRemove.mockResolvedValue({ data: null, error: { message: 'Network request failed' } });

    await expect(createSupabasePhotoObjects().remove(PATH)).rejects.toThrow('could not be deleted');
  });
});

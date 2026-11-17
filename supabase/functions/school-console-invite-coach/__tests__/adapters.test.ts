import { createInvitationStore, type Db, type DbError } from '../adapters.ts';

const SCHOOL = '11111111-1111-4111-8111-111111111111';
const EMAIL = 'coach@example.test';
const SCHOOL_NAME = 'Escuela de prueba';
const SCHOOL_ROW: Reply = { data: { name: SCHOOL_NAME }, error: null };

type Reply = { data: Record<string, unknown> | null; error: DbError | null };

function fakeDb(replies: { insert?: Reply; selectOne?: Reply; school?: Reply }) {
  const calls: { method: string; args: unknown[] }[] = [];
  const db: Db = {
    async insert(...args) {
      calls.push({ method: 'insert', args });
      return replies.insert ?? { data: null, error: null };
    },
    async selectOne(...args) {
      calls.push({ method: 'selectOne', args });
      if (args[0] === 'schools') return replies.school ?? SCHOOL_ROW;
      return replies.selectOne ?? { data: null, error: null };
    },
  };
  return { db, calls };
}

describe('createInvitationStore', () => {
  it('inserts the school and email only, and answers the created invitation', async () => {
    const { db, calls } = fakeDb({ insert: { data: { id: 'i1' }, error: null } });
    expect(await createInvitationStore(db).create(SCHOOL, EMAIL)).toEqual({ ok: true, value: { id: 'i1', schoolId: SCHOOL, email: EMAIL, schoolName: SCHOOL_NAME } });
    expect(calls).toEqual([
      { method: 'insert', args: ['coach_invitations', { school_id: SCHOOL, email: EMAIL }] },
      { method: 'selectOne', args: ['schools', { id: SCHOOL }, 'name'] },
    ]);
  });

  it('maps 42501 to not_authorized', async () => {
    const { db } = fakeDb({ insert: { data: null, error: { code: '42501', message: 'new row violates row-level security policy' } } });
    expect(await createInvitationStore(db).create(SCHOOL, EMAIL)).toEqual({ ok: false, error: { code: 'not_authorized' } });
  });

  it('maps 23514 (the email check refusing what the handler normalized) to bad_request', async () => {
    const { db } = fakeDb({ insert: { data: null, error: { code: '23514' } } });
    expect(await createInvitationStore(db).create(SCHOOL, EMAIL)).toEqual({ ok: false, error: { code: 'bad_request' } });
  });

  it('maps 23505 to the existing pending invitation of the school and email', async () => {
    const { db, calls } = fakeDb({ insert: { data: null, error: { code: '23505' } }, selectOne: { data: { id: 'i0' }, error: null } });
    expect(await createInvitationStore(db).create(SCHOOL, EMAIL)).toEqual({ ok: true, value: { id: 'i0', schoolId: SCHOOL, email: EMAIL, schoolName: SCHOOL_NAME } });
    expect(calls[1]).toEqual({ method: 'selectOne', args: ['coach_invitations', { school_id: SCHOOL, email: EMAIL, status: 'pending' }, 'id'] });
    expect(calls[2]).toEqual({ method: 'selectOne', args: ['schools', { id: SCHOOL }, 'name'] });
  });

  it('throws, without the database message, on any other error', async () => {
    const { db } = fakeDb({ insert: { data: null, error: { code: '08006', message: 'secret-internal-detail' } } });
    await expect(createInvitationStore(db).create(SCHOOL, EMAIL)).rejects.toThrow('Creating the invitation failed (08006)');
  });

  it('throws when a duplicate cannot be read back', async () => {
    const { db } = fakeDb({ insert: { data: null, error: { code: '23505' } } });
    await expect(createInvitationStore(db).create(SCHOOL, EMAIL)).rejects.toThrow('Reading the pending invitation failed');
  });

  it('throws when the insert answers no id', async () => {
    const { db } = fakeDb({ insert: { data: {}, error: null } });
    await expect(createInvitationStore(db).create(SCHOOL, EMAIL)).rejects.toThrow('Creating the invitation failed');
  });

  it.each([
    ['an error', { data: null, error: { code: '42501', message: 'secret-internal-detail' } }],
    ['no row', { data: null, error: null }],
    ['a name that is not a string', { data: { name: 42 }, error: null }],
    ['an empty name', { data: { name: '' }, error: null }],
  ])('throws, without the database message, when reading the school answers %s', async (_name, school) => {
    for (const insert of [{ data: { id: 'i1' }, error: null }, { data: null, error: { code: '23505' } }]) {
      const { db } = fakeDb({ insert, selectOne: { data: { id: 'i0' }, error: null }, school });
      const message = await createInvitationStore(db).create(SCHOOL, EMAIL).then(() => '', (e: Error) => e.message);
      expect(message).toMatch(/^Reading the school failed/);
      expect(message).not.toContain('secret-internal-detail');
    }
  });
});

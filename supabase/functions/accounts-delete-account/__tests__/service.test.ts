import { createAccountDeletion } from '../service.ts';
import { CODE, createMemoryStore, createRecordingMailer, DELETE_AFTER, EMAIL } from './fakes.ts';

const USER = 'user-from-jwt';
const SCHOOLS = [{ id: 's1', name: 'Escuela de prueba' }];

function setup(answers: Parameters<typeof createMemoryStore>[0] = {}, mailerOptions: Parameters<typeof createRecordingMailer>[0] = {}) {
  const { store, calls } = createMemoryStore(answers);
  const { mailer, emails } = createRecordingMailer(mailerOptions);
  let n = 0;
  return { service: createAccountDeletion({ store, mailer, newKey: () => `key-${++n}` }), calls, emails };
}

describe('account deletion service', () => {
  let error: jest.SpyInstance;
  let log: jest.SpyInstance;
  beforeEach(() => {
    error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  describe('request', () => {
    it('emails the code to the address of the database and answers code_sent without the code', async () => {
      const s = setup();
      const outcome = await s.service.request(USER);
      expect(outcome).toEqual({ ok: true, value: { status: 'code_sent', emailSent: true } });
      expect(JSON.stringify(outcome)).not.toContain(CODE);
      expect(s.calls).toEqual([{ method: 'request', args: [USER] }]);
      expect(s.emails).toHaveLength(1);
      expect(s.emails[0]).toMatchObject({ to: EMAIL, subject: 'Tu código para eliminar tu cuenta de Swimcro', idempotencyKey: 'account-deletion-code/key-1' });
      expect(s.emails[0].text).toContain(CODE);
    });

    it('answers emailSent false when the mailer sent nothing (the test mailer)', async () => {
      expect(await setup({}, { sent: false }).service.request(USER)).toEqual({ ok: true, value: { status: 'code_sent', emailSent: false } });
    });

    it('answers unavailable when delivery fails, and logs the kind only', async () => {
      const s = setup({}, { failWith: new Error('Resend delivery failed (HTTP 500)') });
      expect(await s.service.request(USER)).toEqual({ ok: false, error: { code: 'unavailable' } });
      expect(error).toHaveBeenCalledWith('accounts-delete-account code email failed: Resend delivery failed (HTTP 500)');
    });

    it('logs "unknown" for a delivery error that is not a fixed message', async () => {
      const s = setup({}, { failWith: new Error(`boom ${EMAIL} ${CODE}`) });
      await s.service.request(USER);
      expect(error).toHaveBeenCalledWith('accounts-delete-account code email failed: unknown');
    });

    it.each([
      ['school', 'blocked_by_school'],
      ['platform_admin', 'platform_admin'],
    ] as const)('maps a block for %s to %s with the schools, and sends nothing', async (reason, code) => {
      const s = setup({ request: { status: 'blocked', reason, schools: SCHOOLS } });
      expect(await s.service.request(USER)).toEqual({ ok: false, error: { code, schools: SCHOOLS } });
      expect(s.emails).toEqual([]);
    });

    it('maps rate_limited and sends nothing', async () => {
      const s = setup({ request: { status: 'rate_limited' } });
      expect(await s.service.request(USER)).toEqual({ ok: false, error: { code: 'rate_limited' } });
      expect(s.emails).toEqual([]);
    });

    it('maps already_marked to the date and sends nothing', async () => {
      const s = setup({ request: { status: 'already_marked', deleteAfter: DELETE_AFTER } });
      expect(await s.service.request(USER)).toEqual({ ok: true, value: { status: 'already_marked', deleteAfter: DELETE_AFTER } });
      expect(s.emails).toEqual([]);
    });

    it('never logs the code', async () => {
      const s = setup({}, { failWith: new Error('Resend delivery failed (network)') });
      await s.service.request(USER);
      for (const spy of [error, log]) expect(JSON.stringify(spy.mock.calls)).not.toContain(CODE);
    });
  });

  describe('confirm', () => {
    it('marks the account, emails the date and how to cancel, and answers marked', async () => {
      const s = setup();
      expect(await s.service.confirm(USER, CODE)).toEqual({ ok: true, value: { status: 'marked', deleteAfter: DELETE_AFTER, emailSent: true } });
      expect(s.calls).toEqual([{ method: 'confirm', args: [USER, CODE] }]);
      expect(s.emails).toHaveLength(1);
      expect(s.emails[0]).toMatchObject({ to: EMAIL, idempotencyKey: 'account-deletion-marked/key-1' });
      expect(s.emails[0].text).toContain('20 de diciembre de 2026');
      expect(s.emails[0].text).toContain('Cancelar eliminación');
    });

    it('still answers marked, with emailSent false and the kind logged, when the email fails after marking', async () => {
      const s = setup({}, { failWith: new Error('Resend delivery failed (network)') });
      expect(await s.service.confirm(USER, CODE)).toEqual({ ok: true, value: { status: 'marked', deleteAfter: DELETE_AFTER, emailSent: false } });
      expect(error).toHaveBeenCalledWith('accounts-delete-account marked email failed: Resend delivery failed (network)');
    });

    it.each(['invalid_code', 'code_expired', 'too_many_attempts'] as const)('maps %s and sends nothing', async (status) => {
      const s = setup({ confirm: { status } });
      expect(await s.service.confirm(USER, CODE)).toEqual({ ok: false, error: { code: status } });
      expect(s.emails).toEqual([]);
    });

    it('maps a block with its schools, and sends nothing', async () => {
      const s = setup({ confirm: { status: 'blocked', reason: 'school', schools: SCHOOLS } });
      expect(await s.service.confirm(USER, CODE)).toEqual({ ok: false, error: { code: 'blocked_by_school', schools: SCHOOLS } });
      expect(s.emails).toEqual([]);
    });

    it('maps already_marked to the date and sends nothing', async () => {
      const s = setup({ confirm: { status: 'already_marked', deleteAfter: DELETE_AFTER } });
      expect(await s.service.confirm(USER, CODE)).toEqual({ ok: true, value: { status: 'already_marked', deleteAfter: DELETE_AFTER } });
      expect(s.emails).toEqual([]);
    });

    it('never logs the code or the address', async () => {
      const s = setup({}, { failWith: new Error(`boom ${EMAIL} ${CODE}`) });
      await s.service.confirm(USER, CODE);
      for (const spy of [error, log]) {
        expect(JSON.stringify(spy.mock.calls)).not.toContain(CODE);
        expect(JSON.stringify(spy.mock.calls)).not.toContain(EMAIL);
      }
    });
  });

  describe('cancel', () => {
    it.each(['cancelled', 'not_marked'] as const)('answers %s', async (status) => {
      const s = setup({ cancel: { status } });
      expect(await s.service.cancel(USER)).toEqual({ ok: true, value: { status } });
      expect(s.calls).toEqual([{ method: 'cancel', args: [USER] }]);
    });
  });

  it('does not catch a store failure', async () => {
    const { mailer } = createRecordingMailer();
    const store = createMemoryStore().store;
    store.request = async () => {
      throw new Error('Calling request_account_deletion failed (08006)');
    };
    await expect(createAccountDeletion({ store, mailer }).request(USER)).rejects.toThrow('08006');
  });
});

import { createRunWorker } from '../service.ts';
import { createFakeClock, createMemoryStore, createRecordingMailer, KEY, LEASE_MS, mail } from './fakes.ts';

const SUMMARY = { erased: 0, stopped: 0, skipped: 0, sent: { reminder: 0, deleted: 0, stopped: 0 }, failed: 0 };

function setup(storeOptions: Parameters<typeof createMemoryStore>[0] = {}, mailerOptions: Parameters<typeof createRecordingMailer>[0] = {}) {
  const memory = createMemoryStore(storeOptions);
  const { mailer, emails } = createRecordingMailer(mailerOptions);
  const time = createFakeClock();
  return { ...memory, emails, time, run: createRunWorker({ store: memory.store, mailer, clock: time.clock }) };
}

describe('account deletion worker run', () => {
  let error: jest.SpyInstance;
  let log: jest.SpyInstance;
  let warn: jest.SpyInstance;
  beforeEach(() => {
    error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  const logged = () => JSON.stringify([error.mock.calls, log.mock.calls, warn.mock.calls]);

  it('does nothing when nothing is due', async () => {
    expect(await setup().run()).toEqual(SUMMARY);
  });

  it('passes the same instant of the clock to every call of the run', async () => {
    const s = setup({ due: ['r1'], mails: [mail('reminder', 'r2')] });
    await s.run();
    const instants = s.calls.filter((c) => c.now).map((c) => c.now!.getTime());
    expect(instants).toHaveLength(3);
    expect(new Set(instants).size).toBe(1);
    expect(instants[0]).toBe(new Date('2026-12-01T12:00:00.000Z').getTime());
  });

  it('sends the reminder once across two runs (the day-23 path)', async () => {
    const s = setup({ mails: [mail('reminder', 'r1')] });
    expect((await s.run()).sent.reminder).toBe(1);
    expect((await s.run()).sent.reminder).toBe(0);
    expect(s.emails).toHaveLength(1);
    expect(s.emails[0]).toMatchObject({ to: 'r1@example.test', subject: 'Tu cuenta de Swimcro se eliminará pronto', idempotencyKey: 'account-deletion-reminder/r1' });
    expect(s.emails[0].text).toContain('20 de diciembre de 2026');
    expect(s.emails[0].text).toContain('Cancelar eliminación');
  });

  it('erases the due account and sends the deleted notice with the keys (the day-30 path)', async () => {
    const s = setup({ due: ['r1'], mails: [mail('deleted', 'r1', [KEY, 'SECOND-KEY'])] });
    expect(await s.run()).toEqual({ ...SUMMARY, erased: 1, sent: { reminder: 0, deleted: 1, stopped: 0 } });
    expect(s.emails).toHaveLength(1);
    expect(s.emails[0].idempotencyKey).toBe('account-deletion-deleted/r1');
    expect(s.emails[0].text).toContain(KEY);
    expect(s.emails[0].text).toContain('SECOND-KEY');
    expect(s.emails[0].text).toContain('no volveremos a mostrarlas');
  });

  it('writes the deleted notice without the keys section when there are none', async () => {
    const s = setup({ mails: [mail('deleted', 'r1')] });
    await s.run();
    expect(s.emails[0].text).toContain('fueron eliminados');
    expect(s.emails[0].text).not.toContain('clave');
  });

  it('counts a stopped erase and sends its notice', async () => {
    const s = setup({ due: ['r1'], eraseResults: { r1: 'stopped' }, mails: [mail('stopped', 'r1')] });
    expect(await s.run()).toEqual({ ...SUMMARY, stopped: 1, sent: { reminder: 0, deleted: 0, stopped: 1 } });
    expect(s.emails[0].idempotencyKey).toBe('account-deletion-stopped/r1');
    expect(s.emails[0].text).toContain('sigue activa');
    expect(s.emails[0].text).toContain('No se eliminó nada');
  });

  it('counts a skipped erase', async () => {
    expect(await setup({ due: ['r1'], eraseResults: { r1: 'skipped' } }).run()).toEqual({ ...SUMMARY, skipped: 1 });
  });

  it('does not let an erase error on one request block the others, and logs the kind only', async () => {
    const s = setup({ due: ['r1', 'r2', 'r3'], eraseResults: { r2: new Error('Calling erase_account failed (40001)') } });
    expect(await s.run()).toEqual({ ...SUMMARY, erased: 2, failed: 1 });
    expect(error).toHaveBeenCalledWith('accounts-deletion-worker erase failed: Calling erase_account failed (40001)');
  });

  it('logs "unknown" for an erase error that is not a fixed message', async () => {
    const s = setup({ due: ['r1'], eraseResults: { r1: new Error(`boom ${KEY} r1@example.test`) } });
    await s.run();
    expect(error).toHaveBeenCalledWith('accounts-deletion-worker erase failed: unknown');
    expect(logged()).not.toContain(KEY);
  });

  it('leaves an email unfinished when the send fails, counts it, and retries it only after the lease', async () => {
    const s = setup({ mails: [mail('reminder', 'r1'), mail('reminder', 'r2')] }, { failFor: ['r1@example.test'] });
    expect(await s.run()).toEqual({ ...SUMMARY, sent: { reminder: 1, deleted: 0, stopped: 0 }, failed: 1 });
    expect(s.rows.map((r) => r.finished)).toEqual([false, true]);
    expect(error).toHaveBeenCalledWith('accounts-deletion-worker reminder email failed: Resend delivery failed (network)');
    // Still leased: the next run does not touch it.
    expect((await s.run()).failed).toBe(0);
    expect(s.emails).toHaveLength(2);
    // After the lease it is claimed and tried again.
    s.time.advance(LEASE_MS + 1);
    expect((await s.run()).failed).toBe(1);
    expect(s.emails).toHaveLength(3);
  });

  it('leaves an email unfinished when the mailer sent nothing (the test mailer)', async () => {
    const s = setup({ mails: [mail('reminder', 'r1')] }, { sent: false });
    expect(await s.run()).toEqual({ ...SUMMARY, failed: 1 });
    expect(s.rows[0].finished).toBe(false);
  });

  it('two runs in a row send each email once', async () => {
    const s = setup({ due: ['r1'], mails: [mail('reminder', 'r2'), mail('deleted', 'r1', [KEY]), mail('stopped', 'r3')] });
    await s.run();
    await s.run();
    expect(s.emails.map((e) => e.idempotencyKey).sort()).toEqual(['account-deletion-deleted/r1', 'account-deletion-reminder/r2', 'account-deletion-stopped/r3']);
  });

  it('never logs addresses, request ids or keys', async () => {
    const s = setup(
      { due: ['r1', 'r2'], eraseResults: { r2: new Error('Calling erase_account failed (40001)') }, mails: [mail('deleted', 'r3', [KEY]), mail('reminder', 'r4')] },
      { failFor: ['r4@example.test'] },
    );
    await s.run();
    for (const secret of [KEY, '@example.test', 'r1', 'r2', 'r3', 'r4']) expect(logged()).not.toContain(secret);
  });

  it('does not catch a failure to list or claim', async () => {
    const s = setup();
    s.store.listDue = async () => {
      throw new Error('Calling list_due_account_deletions failed (08006)');
    };
    await expect(s.run()).rejects.toThrow('08006');
  });
});

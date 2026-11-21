import fs from 'node:fs';
import path from 'node:path';

// index.ts starts Deno.serve on import and cannot load under Jest, so the wiring is checked on its source.
const source = fs.readFileSync(path.join(__dirname, '..', 'index.ts'), 'utf8');

describe('accounts-deletion-worker entry point', () => {
  it('authenticates the call with the shared secret ACCOUNTS_WORKER_SECRET', () => {
    expect(source).toMatch(/Deno\.env\.get\('ACCOUNTS_WORKER_SECRET'\)/);
    expect(source).toMatch(/secret:/);
  });

  it('calls the database functions as service role, with no session', () => {
    expect(source).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(source).toMatch(/persistSession: false/);
    expect(source).toMatch(/createWorkerStore\(/);
  });

  it('runs on the real clock and selects the mailer from RESEND_API_KEY and RESEND_FROM', () => {
    expect(source).toMatch(/now: \(\) => new Date\(\)/);
    expect(source).toMatch(/Deno\.env\.get\('RESEND_API_KEY'\)/);
    expect(source).toMatch(/Deno\.env\.get\('RESEND_FROM'\)/);
    expect(source).toMatch(/selectMailer\(/);
  });

  it('drains the Storage deletion queue through the Storage API, with the grace period from STORAGE_ORPHAN_GRACE_HOURS', () => {
    expect(source).toMatch(/createStorageDrain\(/);
    expect(source).toMatch(/admin\.storage\.from\(bucket\)\.remove\(paths\)/);
    expect(source).toMatch(/Deno\.env\.get\('STORAGE_ORPHAN_GRACE_HOURS'\)/);
    expect(source).not.toMatch(/storage\.objects/);
  });
});

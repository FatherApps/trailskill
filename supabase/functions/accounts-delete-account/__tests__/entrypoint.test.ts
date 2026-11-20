import fs from 'node:fs';
import path from 'node:path';

// index.ts starts Deno.serve on import and cannot load under Jest, so the wiring is checked on its source.
const source = fs.readFileSync(path.join(__dirname, '..', 'index.ts'), 'utf8');

describe('accounts-delete-account entry point', () => {
  it('finds the user with the anon key and the caller token, never from the request body', () => {
    expect(source).toMatch(/SUPABASE_ANON_KEY/);
    expect(source).toMatch(/Authorization/);
    expect(source).toMatch(/auth\.getUser\(\)/);
    expect(source).not.toMatch(/request\.json|\.body/);
  });

  it('calls the database functions as service role, with no session', () => {
    expect(source).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(source).toMatch(/createClient\(url, serviceKey, \{ auth: \{ persistSession: false \} \}\)/);
    expect(source).toMatch(/createAccountDeletionStore\(/);
  });

  it('selects the mailer from RESEND_API_KEY and RESEND_FROM', () => {
    expect(source).toMatch(/Deno\.env\.get\('RESEND_API_KEY'\)/);
    expect(source).toMatch(/Deno\.env\.get\('RESEND_FROM'\)/);
    expect(source).toMatch(/selectMailer\(/);
  });
});

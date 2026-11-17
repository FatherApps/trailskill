import fs from 'node:fs';
import path from 'node:path';

// index.ts starts Deno.serve on import and cannot load under Jest, so the wiring is checked on its source.
const source = fs.readFileSync(path.join(__dirname, '..', 'index.ts'), 'utf8');

describe('school-console-invite-coach entry point', () => {
  it('acts as the caller, never with the service_role key', () => {
    expect(source).not.toMatch(/service_?role/i);
    expect(source).toMatch(/SUPABASE_ANON_KEY/);
    expect(source).toMatch(/Authorization/);
  });

  it('wires the Resend sender from RESEND_API_KEY and RESEND_FROM, and falls back to the test sender without the key', () => {
    expect(source).toMatch(/Deno\.env\.get\('RESEND_API_KEY'\)/);
    expect(source).toMatch(/Deno\.env\.get\('RESEND_FROM'\)/);
    expect(source).toMatch(/createResendSender\(/);
    expect(source).toMatch(/createTestSender\(\)/);
  });
});

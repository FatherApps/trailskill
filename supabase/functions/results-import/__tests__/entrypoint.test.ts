import fs from 'node:fs';
import path from 'node:path';

import { createCoColombiaacuatica } from '../providers/co-colombiaacuatica/index.ts';
import { createCoFecna } from '../providers/co-fecna/index.ts';
import { createProviderRegistry, type OrganizationData } from '../registry.ts';

// index.ts starts Deno.serve on import and cannot load under Jest, so the wiring is checked on its source.
const source = fs.readFileSync(path.join(__dirname, '..', 'index.ts'), 'utf8');

describe('results-import entry point', () => {
  it('registers the co-fecna adapter and the co-colombiaacuatica platform in the production registry', () => {
    expect(source).toMatch(/import \{ createCoFecna \} from '\.\/providers\/co-fecna\/index\.ts';/);
    expect(source).toMatch(/import \{ createCoColombiaacuatica \} from '\.\/providers\/co-colombiaacuatica\/index\.ts';/);
    expect(source).toMatch(/createProviderRegistry\(\[\s*createCoFecna\(\)\s*\],\s*\[\s*createCoColombiaacuatica\(\)\s*\]\)/);
  });
});

describe('results-import entry point athletes', () => {
  it('gives the service the reader of the athlete (name, birth date, gender) and the PDF of the platform stays behind a dynamic import', () => {
    expect(source).toMatch(/createResultsImport\(\{[\s\S]*athletes: createAthleteProfiles\(db\),[\s\S]*\}\)/);
    const unpdf = fs.readFileSync(path.join(__dirname, '..', 'providers', 'co-colombiaacuatica', 'unpdf.ts'), 'utf8');
    // Pinned to one version, loaded only when a PDF is read, never at startup (Jest and a lookup that finds a zip never load it).
    expect(unpdf).toMatch(/await import\('npm:unpdf@2\.1\.0'\)/);
    expect(unpdf).not.toMatch(/^import .* from 'npm:/m);
  });
});

describe('results-import entry point operator', () => {
  it('recognises the operator by the function\'s own service role key, and hands the check to the handler', () => {
    expect(source).toMatch(/createIsOperatorToken\(Deno\.env\.get\('SUPABASE_SERVICE_ROLE_KEY'\)\)/);
    expect(source).toMatch(/createHandler\(\{ authenticate, isOperatorToken, service, official \}\)/);
  });
});

describe('production providers side by side', () => {
  const fecna = createCoFecna();
  const platform = createCoColombiaacuatica();
  const country = fecna.key.slice(0, 2).toUpperCase();
  const organization = (id: string, type: OrganizationData['type'], parentId: string | null, provider: string | null): OrganizationData => ({
    id,
    type,
    countryCode: country,
    parentId,
    provider,
  });

  it('builds without a key clash and the two keys differ', () => {
    expect(() => createProviderRegistry([fecna], [platform])).not.toThrow();
    expect(fecna.key).not.toBe(platform.key);
  });

  it('keeps resolving the federation adapter from its school and from the federation, and never as a platform', () => {
    const registry = createProviderRegistry([fecna], [platform]);
    const organizations = [
      organization('federation', 'federation', null, fecna.key),
      organization('league', 'league', 'federation', null),
      organization('school', 'school', 'league', null),
    ];
    expect(registry.resolve(organizations, 'school')).toBe(fecna);
    expect(registry.resolve(organizations, 'federation')).toBe(fecna);
    expect(registry.platformFor(organizations, 'federation')).toBeNull();
  });

  it('resolves a results platform organization to the platform adapter, which has no parent to resolve from', () => {
    const registry = createProviderRegistry([fecna], [platform]);
    const organizations = [organization('platform', 'results_platform', null, platform.key)];
    expect(registry.platformFor(organizations, 'platform')).toBe(platform);
    expect(registry.resolve(organizations, 'platform')).toBeNull();
  });

  it('never crosses keys between organization types', () => {
    const registry = createProviderRegistry([fecna], [platform]);
    const organizations = [
      organization('platform', 'results_platform', null, fecna.key),
      organization('federation', 'federation', null, platform.key),
    ];
    expect(registry.platformFor(organizations, 'platform')).toBeNull();
    expect(registry.resolve(organizations, 'platform')).toBeNull();
    expect(registry.platformFor(organizations, 'federation')).toBeNull();
    expect(registry.resolve(organizations, 'federation')).toBeNull();
  });
});

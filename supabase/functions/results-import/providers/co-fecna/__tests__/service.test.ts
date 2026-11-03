import { createProviderRegistry, type OrganizationData } from '../../../registry.ts';
import { createResultsImport, type Claim, type QueryGate } from '../../../service.ts';
import type { History } from '../parse.ts';
import { createHttpSource } from '../source.ts';
import { createCoFecnaProvider, type Source } from '../provider.ts';

const NUMBERS = ['0000000001', '0000000002', '0000000003', '0000000004', '0000000005'];
const chain: OrganizationData[] = [{ id: 'fed', type: 'federation', countryCode: 'CO', parentId: null, provider: 'co-fecna' }];
const who = { userId: 'user-1', athleteId: 'athlete-1', organizationId: 'fed', firstName: 'Ana', lastName: 'Pérez' };

const history = (): History => ({ affiliations: [{ club: null, league: null, years: [2026] }], results: [] });

let stored = 0;

function setup(roster = NUMBERS.map((key) => ({ key, value: key, name: 'PEREZ ANA' })), openSource?: Source) {
  const source: Source = openSource ?? { roster: async () => roster, history: async () => history() };
  const claims: unknown[] = [];
  const releases: unknown[] = [];
  const gate: QueryGate = {
    async claim(request): Promise<Claim> {
      claims.push(request);
      return { status: 'allowed', claimedAt: 'x' };
    },
    async release(request) {
      releases.push(request);
      return true;
    },
  };
  const service = createResultsImport({
    registry: createProviderRegistry([createCoFecnaProvider(() => source)]),
    gate,
    identityNumbers: { read: async () => null, keep: async () => true },
    confirmations: { record: async () => 'evidence-1', remove: async () => undefined },
    organizationChain: async () => chain,
    pending: { put: async () => `pending-${++stored}`, take: async () => null },
  });
  return { service, claims, releases };
}

describe('co-fecna through the results-import service', () => {
  it('is found by the registry from the organization data alone', async () => {
    const { service } = setup();
    expect((await service.findCandidates(who)).ok).toBe(true);
  });

  it('claims the gate once for a whole search with 5 candidates', async () => {
    const { service, claims } = setup();
    const outcome = await service.findCandidates(who);
    expect(outcome.ok && outcome.value).toHaveLength(5);
    expect(claims).toHaveLength(1);
  });

  it('answers unavailable, with a single claim, when more than 5 match', async () => {
    const { service, claims } = setup([...NUMBERS, '0000000006'].map((key) => ({ key, value: key, name: 'PEREZ ANA' })));
    expect(await service.findCandidates(who)).toEqual({ ok: false, error: { code: 'unavailable' } });
    expect(claims).toHaveLength(1);
  });

  // The real provider and source over a fake fetch: only a source that did not answer gives the claim back.
  describe('which failures give the claim back', () => {
    const over = (answer: () => Promise<Response>) => setup(undefined, createHttpSource(async () => answer()));

    it.each([500, 503])('gives it back when the source answers HTTP %i', async (status) => {
      const { service, releases } = over(async () => new Response('error', { status }));
      expect(await service.findCandidates(who)).toEqual({ ok: false, error: { code: 'unavailable' } });
      expect(releases).toHaveLength(1);
    });

    it('gives it back when the network fails', async () => {
      const { service, releases } = over(async () => {
        throw new TypeError('connect failed');
      });
      expect(await service.findCandidates(who)).toEqual({ ok: false, error: { code: 'unavailable' } });
      expect(releases).toHaveLength(1);
    });

    it.each([403, 404, 429])('keeps the whole window when the source answers HTTP %i', async (status) => {
      const { service, releases } = over(async () => new Response('error', { status }));
      expect(await service.findCandidates(who)).toEqual({ ok: false, error: { code: 'unavailable' } });
      expect(releases).toEqual([]);
    });

    it('keeps the whole window when the page changed shape', async () => {
      const { service, releases } = over(async () => new Response('<html>no swimmer list</html>', { status: 200 }));
      expect(await service.findCandidates(who)).toEqual({ ok: false, error: { code: 'unavailable' } });
      expect(releases).toEqual([]);
    });
  });
});

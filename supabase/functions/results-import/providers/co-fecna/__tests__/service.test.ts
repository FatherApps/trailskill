import { createProviderRegistry, type OrganizationData } from '../../../registry.ts';
import { createResultsImport, type Claim, type QueryGate } from '../../../service.ts';
import { createCoFecnaProvider, type History, type Source } from '../provider.ts';

const NUMBERS = ['0000000001', '0000000002', '0000000003', '0000000004', '0000000005'];
const chain: OrganizationData[] = [{ id: 'fed', type: 'federation', countryCode: 'CO', parentId: null, provider: 'co-fecna' }];
const who = { userId: 'user-1', athleteId: 'athlete-1', organizationId: 'fed', firstName: 'Ana', lastName: 'Pérez' };

const history = (): History => ({ name: 'PEREZ ANA', affiliations: [{ club: null, league: null, years: [2026] }], results: [] });

function setup(roster = NUMBERS.map((key) => ({ key, name: 'PEREZ ANA' }))) {
  const source: Source = { roster: async () => roster, history: async () => history() };
  const claims: unknown[] = [];
  const gate: QueryGate = {
    async claim(request): Promise<Claim> {
      claims.push(request);
      return { status: 'allowed' };
    },
  };
  const service = createResultsImport({
    registry: createProviderRegistry([createCoFecnaProvider(source)]),
    gate,
    identityNumbers: { read: async () => null, save: async () => undefined },
    confirmations: { record: async () => undefined },
    organizationChain: async () => chain,
  });
  return { service, claims };
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
    const { service, claims } = setup([...NUMBERS, '0000000006'].map((key) => ({ key, name: 'PEREZ ANA' })));
    expect(await service.findCandidates(who)).toEqual({ ok: false, error: { code: 'unavailable' } });
    expect(claims).toHaveLength(1);
  });
});

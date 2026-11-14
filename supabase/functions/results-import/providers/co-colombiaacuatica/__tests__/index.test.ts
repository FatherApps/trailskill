import { createCoColombiaacuatica } from '../index.ts';
import { PROVIDER_KEY } from '../lookup.ts';
import { lenex } from './lenexBuilder.ts';
import { buildZip } from './zipBuilder.ts';

const FOLDER = 'https://www.colombiaacuatica.com/backtun/torneos/2025/20251018/';

describe('createCoColombiaacuatica', () => {
  it('is the platform adapter under the provider key', () => {
    expect(createCoColombiaacuatica().key).toBe(PROVIDER_KEY);
  });

  it('accepts the address of a tournament folder and nothing else, without throwing', () => {
    const provider = createCoColombiaacuatica();
    expect(provider.accepts(FOLDER)).toBe(true);
    expect(provider.accepts(`${FOLDER}index.php`)).toBe(true);
    for (const url of ['https://example.invalid/', 'torneo de ayer', '']) expect(provider.accepts(url)).toBe(false);
  });

  it('looks the tournament up through the fetch it was given', async () => {
    const zip = await buildZip([{ name: 'resultados20251018.lef', data: new TextEncoder().encode(lenex()), method: 8 }]);
    const fetchImpl = jest.fn(async () => new Response(zip, { status: 200 }));
    const search = await createCoColombiaacuatica(fetchImpl).lookup(FOLDER, '1234567');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(search.found && search.results.length).toBe(3);
  });
});

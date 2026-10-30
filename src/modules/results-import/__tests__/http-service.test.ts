import { createHttpOfficialResultsService } from '../data/httpOfficialResultsService';

// The default wiring reads the Supabase session; these tests inject their own.
jest.mock('../../../core/sync', () => ({ supabase: {} }));

const URL = 'https://example.invalid/functions/v1/results-import';
const reply = (status: number, body: unknown) => jest.fn().mockResolvedValue({ status, json: async () => body });
const make = (fetch: jest.Mock, token: string | null = 'jwt-1') => createHttpOfficialResultsService({ url: URL, accessToken: async () => token, fetch });

describe('http official results service', () => {
  it('posts the action with the user token and returns the value', async () => {
    const fetch = reply(200, { ok: true, value: { confirmed: false, organizationId: null, confirmedAt: null, candidateName: null, hasNumber: false, lastThree: null } });
    const outcome = await make(fetch).status('a1');

    expect(outcome).toMatchObject({ ok: true, value: { confirmed: false } });
    expect(fetch).toHaveBeenCalledWith(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jwt-1' },
      body: JSON.stringify({ action: 'status', athleteId: 'a1' }),
    });
  });

  it('sends the chosen ids to import and nothing else about the results', async () => {
    const fetch = reply(200, { ok: true, value: { importId: 'i1', inserted: 2, duplicates: 0, changes: 0 } });
    await make(fetch).importChosen('a1', ['x1', 'x2']);

    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ action: 'import', athleteId: 'a1', resultIds: ['x1', 'x2'] });
  });

  it('keeps a missing time as null, never zero', async () => {
    const fetch = reply(200, { ok: true, value: { results: [{ id: 'x1', stroke: 'FR', distance: '50m', pool: 'LCM', hundredths: null, swumOn: '2026-03-14', competition: null }] } });
    const outcome = await make(fetch).results('a1');

    expect(outcome).toEqual({ ok: true, value: [{ id: 'x1', stroke: 'FR', distance: '50m', pool: 'LCM', hundredths: null, swumOn: '2026-03-14', competition: null }] });
  });

  it('drops any field of a result the contract does not list', async () => {
    const fetch = reply(200, { ok: true, value: { results: [{ id: 'x1', stroke: 'FR', distance: '50m', pool: 'LCM', hundredths: 2890, swumOn: '2026-03-14', competition: null, idNumber: '0000' }] } });
    const outcome = await make(fetch).results('a1');

    expect(outcome.ok && Object.keys(outcome.value[0]!)).not.toContain('idNumber');
  });

  it.each([
    [429, { code: 'rate_limited', retryAt: '2026-10-29T12:10:00Z' }],
    [403, { code: 'not_authorized' }],
    [409, { code: 'not_confirmed' }],
    [410, { code: 'unknown_id' }],
    [502, { code: 'unavailable' }],
  ])('passes the typed error of status %s through', async (status, error) => {
    expect(await make(reply(status, { ok: false, error })).results('a1')).toEqual({ ok: false, error });
  });

  it.each([
    ['a network failure', jest.fn().mockRejectedValue(new Error('network'))],
    ['a body that is not JSON', jest.fn().mockResolvedValue({ status: 502, json: async () => Promise.reject(new Error('bad json')) })],
    ['an unknown error shape', reply(500, { ok: false, error: { code: 'weird' } })],
    ['a success without the expected value', reply(200, { ok: true, value: {} })],
  ])('is unavailable after %s', async (_name, fetch) => {
    expect(await make(fetch).results('a1')).toEqual({ ok: false, error: { code: 'unavailable' } });
  });

  it('is unavailable without a session, and sends nothing', async () => {
    const fetch = reply(200, { ok: true, value: {} });
    expect(await make(fetch, null).results('a1')).toEqual({ ok: false, error: { code: 'unavailable' } });
    expect(fetch).not.toHaveBeenCalled();
  });
});

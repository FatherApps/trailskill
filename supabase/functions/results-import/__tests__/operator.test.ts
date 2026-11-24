import { createIsOperatorToken } from '../operator.ts';

// Throwaway keys, never a real one.
const KEY = 'throwaway-service-role-key';

describe('createIsOperatorToken', () => {
  it('accepts the key itself and nothing else', async () => {
    const is = createIsOperatorToken(KEY);
    expect(await is(KEY)).toBe(true);
    for (const other of [`${KEY}x`, KEY.slice(0, -1), KEY.toUpperCase(), ` ${KEY}`, 'another-key', 'a'.repeat(5000)]) expect(await is(other)).toBe(false);
  });

  it.each([[undefined], ['']])('never accepts anything when the key is %j, not even an empty token', async (key) => {
    const is = createIsOperatorToken(key);
    expect(await is('')).toBe(false);
    expect(await is('anything')).toBe(false);
    expect(await is(String(key))).toBe(false);
  });
});

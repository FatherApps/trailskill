// The operator of the function is the caller that holds its own service role key; `backfill_tournaments` is the only action that asks for it.
// Kept apart from the handler so changing how the operator is recognised (a different secret, a claim) touches this file and one line of `index.ts`.

const digest = async (text: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));

/**
 * Whether a bearer token is the operator's key. Both sides are hashed first, so the comparison is over 32 bytes whatever the token's length
 * and takes the same time wherever they differ. An empty or missing key never matches anything, not even an empty token.
 */
export function createIsOperatorToken(operatorKey: string | undefined) {
  return async function isOperatorToken(token: string): Promise<boolean> {
    if (!operatorKey || !token) return false;
    const [expected, given] = await Promise.all([digest(operatorKey), digest(token)]);
    let difference = 0;
    for (let index = 0; index < expected.length; index++) difference |= expected[index] ^ given[index];
    return difference === 0;
  };
}

import { CryptoDigestAlgorithm, digest, getRandomValues } from 'expo-crypto';

type CryptoScope = { crypto?: unknown };
type CryptoLike = { subtle?: unknown; getRandomValues?: unknown };

const ALGORITHMS: Record<string, CryptoDigestAlgorithm> = { 'SHA-256': CryptoDigestAlgorithm.SHA256 };

async function subtleDigest(algorithm: string | { name: string }, data: BufferSource): Promise<ArrayBuffer> {
  const name = (typeof algorithm === 'string' ? algorithm : algorithm.name).toUpperCase();
  const known = ALGORITHMS[name];
  if (!known) throw new Error(`Unsupported digest algorithm ${name}`);
  return digest(known, data);
}

// Hermes has no WebCrypto. Without crypto.subtle auth-js asks for code_challenge_method=plain, and without
// crypto.getRandomValues it builds the verifier from Math.random. Only what is missing is filled in.
export function installPkceCrypto(scope: CryptoScope = globalThis): void {
  if (typeof scope.crypto !== 'object' || scope.crypto === null) {
    Object.defineProperty(scope, 'crypto', { value: {}, configurable: true, writable: true });
  }
  const target = scope.crypto as CryptoLike;
  if (target.subtle === undefined) Object.defineProperty(target, 'subtle', { value: { digest: subtleDigest }, configurable: true });
  if (target.getRandomValues === undefined) Object.defineProperty(target, 'getRandomValues', { value: getRandomValues, configurable: true });
}

import { createCoFecnaProvider } from './provider.ts';
import { createHttpSource } from './source.ts';

/** The adapter for the registry: `createProviderRegistry([createCoFecna()])`; organizations pick it with the provider key `co-fecna`. */
export const createCoFecna = (fetchImpl: (url: string, init?: RequestInit) => Promise<Response> = fetch) =>
  createCoFecnaProvider(() => createHttpSource(fetchImpl));

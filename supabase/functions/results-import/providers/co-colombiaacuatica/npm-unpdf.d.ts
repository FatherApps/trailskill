// The part of unpdf this module uses, for the type check that does not resolve `npm:` addresses (Deno resolves the real one; the version is pinned here and in `unpdf.ts`).
declare module 'npm:unpdf@2.1.0' {
  export function getDocumentProxy(data: Uint8Array): Promise<{
    numPages: number;
    getPage(page: number): Promise<{ getTextContent(): Promise<{ items: unknown[] }> }>;
  }>;
}

// Only plain tokens (a PostgREST or PowerSync code, an HTTP status) pass as a discriminator: never free text.
const TOKEN = /^[\w.:-]{1,40}$/;

// The kind of a failure: the error name (or typeof) plus its code or status when it has a plain one. Never its message, which can carry stored data.
export function kindOf(error: unknown) {
  const kind = error instanceof Error ? error.name : typeof error;
  const { code, status } = (typeof error === 'object' && error !== null ? error : {}) as { code?: unknown; status?: unknown };
  const detail = [code, status].find((value) => (typeof value === 'string' || typeof value === 'number') && TOKEN.test(String(value)));
  return detail === undefined ? kind : `${kind} ${detail}`;
}

/** What is safe to log about an auth failure: never its message, which can carry the code or the email. */
export function authFailureSummary(error: unknown): { name?: string; code?: string; status?: number } {
  const { name, code, status } = (error ?? {}) as { name?: string; code?: string; status?: number };
  return { name, code, status };
}

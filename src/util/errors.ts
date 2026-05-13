/**
 * Extract a human-readable message from a caught value. Thrown values in
 * JS are `unknown`: `Error.message` is the happy path but bare strings,
 * objects, null and `undefined` all show up in the wild. Casting to
 * `(error as Error).message` produces `undefined` silently when the assumption
 * fails — this helper makes the message at least informative.
 */
export function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  if (e === undefined) return 'undefined';
  if (e === null) return 'null';
  try {
    // `JSON.stringify(undefined)` returns the value `undefined` (not a
    // string); the null-coalesce here handles any case where stringify
    // silently produces a non-string (functions, symbols, etc.).
    return JSON.stringify(e) ?? String(e);
  } catch {
    return String(e);
  }
}

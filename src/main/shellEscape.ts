/**
 * Escapes a string for safe use as a single-quoted shell argument.
 * Wraps in single quotes; escapes internal single quotes via the '\'' idiom.
 */
export function shellQuote(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'"
}

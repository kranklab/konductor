/**
 * Strip ANSI escape sequences from terminal output.
 * Handles SGR (colors/styles), OSC (terminal titles), and charset designations.
 */
export function stripAnsi(raw: string): string {
  return raw
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '') // CSI sequences (colors, cursor, etc.)
    .replace(/\x1b\][^\x07]*\x07/g, '') // OSC sequences (title, etc.)
    .replace(/\x1b[()][0-9A-B]/g, '') // Character set designations
}

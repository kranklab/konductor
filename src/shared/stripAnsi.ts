const ESC = '\u001b'
const BEL = '\u0007'

const CSI = new RegExp(`${ESC}\\[[0-9;]*[a-zA-Z]`, 'g')
const OSC = new RegExp(`${ESC}\\][^${BEL}]*${BEL}`, 'g')
const CHARSET = new RegExp(`${ESC}[()][0-9A-B]`, 'g')

/**
 * Strip ANSI escape sequences from terminal output.
 * Handles SGR (colors/styles), OSC (terminal titles), and charset designations.
 */
export function stripAnsi(raw: string): string {
  return raw.replace(CSI, '').replace(OSC, '').replace(CHARSET, '')
}

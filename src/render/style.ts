/**
 * ANSI palette shared by the text renderers.
 *
 * Meltify renders bold white borders, green public values, and red secret
 * values. ANSI byte-parity with Go's lipgloss output is not claimed (Go picks a
 * color profile per terminal); plain `NO_COLOR` output is the parity target.
 */

const RESET = '\x1b[0m';
export const BORDER_STYLE = '\x1b[1;38;2;255;255;255m'; // bold + #FFFFFF
export const PUBLIC_VALUE_STYLE = '\x1b[38;2;124;252;0m'; // #7CFC00
export const PRIVATE_VALUE_STYLE = '\x1b[38;2;255;85;85m'; // #FF5555

export interface Painters {
  border(text: string): string;
  value(text: string): string;
  sensitive(text: string): string;
}

/** Border/value/sensitive painters that pass text through when color is off. */
export function createPainters(color: boolean): Painters {
  const paint = (code: string, text: string): string => (color ? `${code}${text}${RESET}` : text);
  return {
    border: (text) => paint(BORDER_STYLE, text),
    value: (text) => paint(PUBLIC_VALUE_STYLE, text),
    sensitive: (text) => paint(PRIVATE_VALUE_STYLE, text),
  };
}

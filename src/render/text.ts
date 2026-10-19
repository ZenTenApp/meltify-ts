/**
 * Text renderer reproducing `meltify-info`'s terminal layout.
 *
 * With `color: false` (and in meltify when stdout is not a TTY or NO_COLOR is
 * set) the output is plain text and byte-compatible with the Go implementation.
 * Color mode approximates meltify's truecolor palette.
 */

import type { IdentityReport } from '../core/report.js';

export interface RenderTextOptions {
  /** Emit ANSI colors. Defaults to false, matching NO_COLOR/non-TTY output. */
  color?: boolean;
}

const RESET = '\x1b[0m';
const BORDER = '\x1b[1;38;2;255;255;255m'; // bold + #FFFFFF
const PUBLIC_VALUE = '\x1b[38;2;124;252;0m'; // #7CFC00
const PRIVATE_VALUE = '\x1b[38;2;255;85;85m'; // #FF5555

export function renderText(report: IdentityReport, options: RenderTextOptions = {}): string {
  const color = options.color ?? false;
  const paint = (code: string, text: string): string => (color ? `${code}${text}${RESET}` : text);
  const border = (text: string): string => paint(BORDER, text);
  const value = (text: string): string => paint(PUBLIC_VALUE, text);
  const sensitive = (text: string): string => paint(PRIVATE_VALUE, text);

  const lines: string[] = [];
  const blank = (): void => {
    lines.push('');
  };
  const blankPair = (): void => {
    lines.push('', '');
  };
  const block = (label: string, content: string, isSensitive: boolean): void => {
    lines.push(border(`-----BEGIN ${label}-----`));
    lines.push(isSensitive ? sensitive(content) : value(content));
    lines.push(border(`-----END ${label}-----`));
  };
  const doubleBlock = (label: string, content: string, isSensitive: boolean): void => {
    lines.push(border(`=====BEGIN ${label}=====`));
    lines.push(isSensitive ? sensitive(content) : value(content));
    lines.push(border(`=====END ${label}=====`));
  };
  const rawBorderBlock = (
    rawBorder: string,
    entries: readonly { text: string; isSensitive: boolean }[],
  ): void => {
    lines.push(border(rawBorder));
    for (const entry of entries) {
      lines.push(entry.isSensitive ? sensitive(entry.text) : value(entry.text));
    }
    lines.push(border(rawBorder));
  };

  blank();
  block('OPENSSH PRIVATE KEY', report.privateKeyBlock, true);
  blankPair();
  block('ED25519 SEED', report.seedHex, true);
  blankPair();
  doubleBlock('24-WORD SEED PHRASE (charmbracelet/MELT)', report.mnemonic24, true);
  blankPair();
  rawBorderBlock('----- nSecKey / hexSecKey -----', [
    { text: report.nsec, isSensitive: true },
    { text: report.privKeyHex, isSensitive: true },
  ]);
  blankPair();
  block('OPENSSH FINGERPRINT', report.fingerprint, false);
  blankPair();
  block('OPENSSH PUBLIC KEY', report.publicKeyLine, false);
  blankPair();
  rawBorderBlock('----- nPubKey / hexPubKey -----', [
    { text: report.npub, isSensitive: false },
    { text: report.pubKeyHex, isSensitive: false },
  ]);
  blankPair();
  for (const entry of report.addresses) {
    lines.push(value(`${entry.label}:${entry.address}`));
  }
  blank();
  lines.push(value(`bchat:${report.bchat}`));
  blank();

  return `${lines.join('\n')}\n`;
}

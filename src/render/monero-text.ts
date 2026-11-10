/**
 * Text renderer reproducing `meltify-monero`'s terminal layout.
 *
 * This is the sibling binary's output, not `meltify-info`'s: two sections
 * separated by a row of asterisks, each printing a seed, a primary address, and
 * a `(0, n)` subaddress block. With `color: false` the text is byte-compatible
 * with the Go binary under `NO_COLOR=1`.
 */

import type { MoneroAddressSection, MoneroReport } from '../core/monero-report.js';
import { createPainters } from './style.js';

export interface RenderMoneroTextOptions {
  /** Emit ANSI colors. Defaults to false, matching NO_COLOR/non-TTY output. */
  color?: boolean;
}

/** Width of the asterisk divider between the two sections, as Go prints it. */
const DIVIDER_WIDTH = 110;

const LEGACY_SEED_LABEL = '25-WORD MONERO LEGACY SEED';
const LEGACY_ADDRESS_LABEL = '----- MONERO ADDRESSES FROM 25-WORD LEGACY SEED -----';
/** Trailing space is intentional: it renders as `… 24-WORD SEED =====`. */
const UNSTOPPABLE_SEED_LABEL = 'MONERO (Unstoppable) 24-WORD SEED ';
const CAKE_SEED_LABEL = 'MONERO (Cake, Feather) 25-WORD SEED';
const MERGED_SEED_END_LABEL = 'MONERO LEGACY SEED';
const CAKE_PRIMARY_LABEL = 'MONERO PRIMARY ADDRESS (CAKE WALLET)';
const CAKE_ADDRESS_LABEL = '----- MONERO ADDRESSES FROM CAKE WALLET 25-WORD SEED -----';

export function renderMoneroText(
  report: MoneroReport,
  options: RenderMoneroTextOptions = {},
): string {
  const { border, value, sensitive } = createPainters(options.color ?? false);

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
  const rawBorderBlock = (rawBorder: string, entries: readonly string[]): void => {
    lines.push(border(rawBorder));
    for (const entry of entries) lines.push(value(entry));
    lines.push(border(rawBorder));
  };
  const subaddressLines = (section: MoneroAddressSection): string[] =>
    section.subaddresses.map((subaddress, index) => `subaddress 0,${index + 1} ${subaddress}`);
  const addressSection = (primaryLabel: string, borders: string, section: MoneroAddressSection): void => {
    blankPair();
    block(primaryLabel, section.primary, false);
    if (section.subaddresses.length > 0) {
      blankPair();
      rawBorderBlock(borders, subaddressLines(section));
    }
    blankPair();
  };

  // Section 1: the default CryptoNote legacy output.
  blank();
  doubleBlock(LEGACY_SEED_LABEL, report.legacyPhrase, true);
  addressSection('MONERO PRIMARY ADDRESS', LEGACY_ADDRESS_LABEL, report.monero);

  // Divider between the two sections.
  for (let i = 0; i < 2; i++) lines.push(border('*'.repeat(DIVIDER_WIDTH)));

  // Section 2: the Unstoppable 24-word phrase and the Cake/Feather 25-word seed
  // share one block, then the addresses from the Cake seed.
  blank();
  lines.push(border(`=====BEGIN ${UNSTOPPABLE_SEED_LABEL}=====`));
  lines.push(sensitive(report.mnemonic24));
  lines.push(border(`=====BEGIN ${CAKE_SEED_LABEL}=====`));
  lines.push(sensitive(report.cakePhrase));
  lines.push(border(`=====END ${MERGED_SEED_END_LABEL}=====`));
  addressSection(CAKE_PRIMARY_LABEL, CAKE_ADDRESS_LABEL, report.cake);

  return `${lines.join('\n')}\n`;
}

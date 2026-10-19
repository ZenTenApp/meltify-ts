/**
 * The `meltify-info` wallet address list.
 *
 * Order and labels are byte-for-byte significant: they define the report's line
 * sequence, and meltify's own test locks that order.
 */

import { bitcoinCash } from './cashaddr.js';
import { bitcoinNativeSegwit, dogecoin, litecoin } from './btc.js';
import { cosmos, ripple, silentPayment, solana, stellar, sui } from './chains.js';
import { ethereumAddress, tronAddress } from './evm.js';
import { beldexAddressFromLegacy, moneroAddressFromLegacy } from './legacy.js';
import { ton } from './ton.js';

export interface LabeledAddress {
  label: string;
  address: string;
}

/**
 * Derives all 30 `label:address` rows. EVM aliases reuse the Ethereum address;
 * Monero and Beldex come from the 25-word CryptoNote legacy phrase.
 */
export function deriveWalletAddresses(
  mnemonic: string,
  legacyPhrase: string,
): LabeledAddress[] {
  const eth = ethereumAddress(mnemonic);
  return [
    { label: 'arbitrum', address: eth },
    { label: 'arc', address: eth },
    { label: 'avalanche', address: eth },
    { label: 'base', address: eth },
    { label: 'beldex', address: beldexAddressFromLegacy(legacyPhrase) },
    { label: 'bitcoin', address: bitcoinNativeSegwit(mnemonic) },
    { label: 'bitcoincash', address: bitcoinCash(mnemonic) },
    { label: 'bnbchain', address: eth },
    { label: 'celo', address: eth },
    { label: 'cosmos', address: cosmos(mnemonic) },
    { label: 'cronos', address: eth },
    { label: 'dogecoin', address: dogecoin(mnemonic) },
    { label: 'ethereum', address: eth },
    { label: 'gnosis', address: eth },
    { label: 'hyperevm', address: eth },
    { label: 'litecoin', address: litecoin(mnemonic) },
    { label: 'monad', address: eth },
    { label: 'monero', address: moneroAddressFromLegacy(legacyPhrase) },
    { label: 'optimism', address: eth },
    { label: 'plasma', address: eth },
    { label: 'polygon', address: eth },
    { label: 'silentpayment', address: silentPayment(mnemonic) },
    { label: 'solana', address: solana(mnemonic) },
    { label: 'stablechain', address: eth },
    { label: 'stellar', address: stellar(mnemonic) },
    { label: 'sui', address: sui(mnemonic) },
    { label: 'ton', address: ton(mnemonic) },
    { label: 'tron', address: tronAddress(mnemonic) },
    { label: 'worldchain', address: eth },
    { label: 'xrpl', address: ripple(mnemonic) },
  ];
}

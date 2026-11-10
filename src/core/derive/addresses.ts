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
 *
 * `bip39Passphrase` feeds the mnemonic -> BIP39 seed step, so it moves every
 * chain address here except Monero and Beldex, which never touch a BIP39 seed.
 * The default (empty string) is the standard "no 25th word" derivation and is
 * what `meltify-info` always uses.
 */
export function deriveWalletAddresses(
  mnemonic: string,
  legacyPhrase: string,
  bip39Passphrase = '',
): LabeledAddress[] {
  const eth = ethereumAddress(mnemonic, bip39Passphrase);
  return [
    { label: 'arbitrum', address: eth },
    { label: 'arc', address: eth },
    { label: 'avalanche', address: eth },
    { label: 'base', address: eth },
    { label: 'beldex', address: beldexAddressFromLegacy(legacyPhrase) },
    { label: 'bitcoin', address: bitcoinNativeSegwit(mnemonic, bip39Passphrase) },
    { label: 'bitcoincash', address: bitcoinCash(mnemonic, bip39Passphrase) },
    { label: 'bnbchain', address: eth },
    { label: 'celo', address: eth },
    { label: 'cosmos', address: cosmos(mnemonic, bip39Passphrase) },
    { label: 'cronos', address: eth },
    { label: 'dogecoin', address: dogecoin(mnemonic, bip39Passphrase) },
    { label: 'ethereum', address: eth },
    { label: 'gnosis', address: eth },
    { label: 'hyperevm', address: eth },
    { label: 'litecoin', address: litecoin(mnemonic, bip39Passphrase) },
    { label: 'monad', address: eth },
    { label: 'monero', address: moneroAddressFromLegacy(legacyPhrase) },
    { label: 'optimism', address: eth },
    { label: 'plasma', address: eth },
    { label: 'polygon', address: eth },
    { label: 'silentpayment', address: silentPayment(mnemonic, bip39Passphrase) },
    { label: 'solana', address: solana(mnemonic, bip39Passphrase) },
    { label: 'stablechain', address: eth },
    { label: 'stellar', address: stellar(mnemonic, bip39Passphrase) },
    { label: 'sui', address: sui(mnemonic, bip39Passphrase) },
    { label: 'ton', address: ton(mnemonic, bip39Passphrase) },
    { label: 'tron', address: tronAddress(mnemonic, bip39Passphrase) },
    { label: 'worldchain', address: eth },
    { label: 'xrpl', address: ripple(mnemonic, bip39Passphrase) },
  ];
}

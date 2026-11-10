/**
 * Golden values for the fixed Ed25519 seed 00..1f.
 *
 * Copied verbatim from the Go reference (internal/derive/golden.go), which
 * captured them from seedify v1.36.0. These are independent of this port: if
 * any derivation drifts, these tests fail.
 */

export const GOLDEN_SEED_00_TO_1F = Uint8Array.from({ length: 32 }, (_, i) => i);

export const GOLDEN = {
  mnemonic24: 'abandon amount liar amount expire adjust cage candy arch gather drum bullet absurd math era live bid rhythm alien crouch range attend journey unaware',
  npub: 'npub102xk3gvg50prsrgm76ksy8nh6enrsgwpqgr3hku4g204z364lnns533vq7',
  nsec: 'nsec1wnrq2ka38vxtsn3j83s3td7xsdlxhrzk8w8qyunykmluk66lz64slqplsa',
  pubKeyHex: '7a8d68a188a3c2380d1bf6ad021e77d6663821c102071bdb95429f514755fce7',
  privKeyHex: '74c6055bb13b0cb84e323c6115b7c6837e6b8c563b8e027264b6ffcb6b5f16ab',
  bitcoin: 'bc1qslk39wvggqa0vl8nd6jckaz54dw3vk45c5w60m',
  bitcoincash: 'qptf4pe2u20g8ww73sguex6hsjh6rxcgfc4mkrcz2a',
  ethereum: '0xF9297b542BDb5DA50C364f9AE4Cbe1F3933bA40F',
  solana: '5Pobwp6d9ihN9Nz38f87gVCEBFMgipFiSM2VtUhVit6w',
  tron: 'TQ8xLycC44dA9nnvME3K6X41iMjmR3J1Vz',
  litecoin: 'ltc1q0rvyr86d5pf5hlzudx3w8ykee4h5lwqs22v6qx',
  dogecoin: 'DCz1sQFeqqfqJLwmWEBEjAxJ92Bhxf9gww',
  cosmos: 'cosmos16yy67pj7ncthhpmfmyascn2qp2al0g0e8j4qgh',
  stellar: 'GCTO7ULPT5QHXCG2ZRVXUXBFUAJ4AQPFCWRTPAROGCZZ4QD36GKV3JXB',
  ripple: 'r3u247nGDQcr1JX9fS8s5WY4tVNKK384Zu',
  sui: '0x7f96ee80ed7453fdd3b2cad7995da20e4ae5a76bded5015b4d1801bacd7801c9',
  silentPayment: 'sp1qqtu4m9jlt6yl2mjwst6pp0raqkyjapz50gthr52d0pschtwqany5gq5uryj0tecznmds8xngvnsv4yjg0d6vgdz6e2nsptqr8xt5ffflqqnzrduf',
  ton: 'UQBmx5RDvDnPuUVcu6F4oBs2m0brTn59RTCVlAELuxxeiVec',
  legacy25: 'tossed mural diplomat jump peaches gearbox yoga hyper sphere biscuit rated powder upcoming vacation zigzags boxes ornament renting glass gained island bemused alarms bakery ornament',
  reducedSeedHex: '132d0ca6e9a1f3ae316c12682d132ffa0f1112131415161718191a1b1c1d1e0f',
  moneroLegacyPrimary: '49HjJN4ZbLjDFqe3Mus7mPZBE6Q27cRGtPLfyuNejGdYZhvke36zj1xGq5kDCbSCXbc5TLTR7vygzVDYTcgFURLaLe4Gdds',
  moneroLegacySub0: '89JZu9GXu4zavCrprHJBhqe93rCDYAXGS75C8qoi1DKuKQwCfbZMM3tHxwH5H7Mx5ZaTPoHrEcTBEXyKiHYt47L6Q8ar72s',
  beldexLegacyPrimary: 'bxdX8BhX3i3bqdxkyw9Ph2Ls3C1sCXvQaWhBcQTZ2FfbHgqNBWHYS22FcbXP23wp7NewRx9JuSNHdSNHMHuUo3rv14ptKXWMH',
  beldexLegacySub0: 'LXCLvss2tsGavCrprHJBhqe93rCDYAXGS75C8qoi1DKuKQwCfbZMM3tHxwH5H7Mx5ZaTPoHrEcTBEXyKiHYt47L6QD5WBxA',

  // Cake Wallet / Unstoppable BIP39 conversion of mnemonic24 (account 0):
  // spend key from m/44'/128'/0'/0/0 reduced mod l with no Keccak, the 25-word
  // phrase it encodes, and the Monero primary + first subaddress from that phrase.
  cakeSpendKeyHex: '957e481803fc73f4876b58d112579c77a6ad010eaff103af49405e83ad5ef40f',
  cake25: 'autumn cunning eternal when delayed cause soil educated apex budget cake olympics utility soprano tilt unhappy liar cunning richly gleeful tiers rays vixen aces cunning',
  cakePrimary: '46DNbqv4kL5PP3i89Y2NJYSxMkDtFHZPpj4nEda1MRFC4kTHeywyxPj63zRav6ESWjUsF1qYHNu8rRzbGsbGcCGwT5bCHEo',
  cakeSub0: '86mTNi3FWyoDxtGvwuLJkFAEFpKauzHVo9e3Aha8uyxfjkVgo3oCYzhFYYTibgjigfK4PjN3yHPFQVcy3cQRPexbTiMtU7X',

  // Independently computed for seed 00..1f (standard Ed25519 public key of the
  // sc-reduced seed -> Montgomery u, tagged 0xBD). The Go test derives this from
  // its own implementation, so it is not an independent pin upstream.
  bchat: 'bdcdd6e612dc6ac3edbc24da774bc6cfabc6c26ae7a4762b7612750329a7df1d35',
} as const;

/**
 * Subaccount seeds for the same fixed seed 00..1f.
 *
 * The derivation is `SHA256(SHA256(utf8(label)) || seed)` (Go's
 * `sshkey.DeriveSubaccountKey`). These values were computed with Python's
 * `hashlib` and Node's `node:crypto`, not with this port, so they pin the
 * derivation independently; `test/subaccount.test.ts` recomputes them again
 * inside the test.
 */
export const SUBACCOUNT_GOLDEN = {
  label: 'alice',
  seedHex: 'e2e4e464be0ad932cc00bde7a2b01d0d56cfc333a2b436c27daa65c6c6391abd',
  // Downstream fields for that seed. These are regression pins recorded from the
  // first implementation, not independent derivations; the seed above is the
  // independent one.
  mnemonic24:
    'title cheese bomb lab pulse offer copy bless tray better also boy hollow thunder soldier final cycle become hedgehog slide hockey broken helmet person',
  pubKeyHex: 'b52d4d01bf672e97b68ecc251fc1b08d679e59f92912b6b73457ae2b9b68561d',
  npub: 'npub1k5k56qdlvuhf0d5wesj3lsds34neuk0e9yftdde527hzhxmg2cws93tkwg',
} as const;

/** Same derivation, other labels — keys only, since the report fields follow from them. */
export const SUBACCOUNT_SEEDS: Readonly<Record<string, string>> = {
  'alice': 'e2e4e464be0ad932cc00bde7a2b01d0d56cfc333a2b436c27daa65c6c6391abd',
  'alice/work': 'bf90499dd10336156363185dd054e7e73c9fd4537cc1aee715dd48859d0733a4',
  '日本語': '161adadb531ea10164df2ad995d9ec534164d8ad414fbc3dd3288d7ad2a2a794',
  'a': 'ba12e7a5f08b8bec6f3b35936e889b04a455f407059d84ec12f417f952220589',
};

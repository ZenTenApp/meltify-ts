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

  // Independently computed for seed 00..1f (standard Ed25519 public key of the
  // sc-reduced seed -> Montgomery u, tagged 0xBD). The Go test derives this from
  // its own implementation, so it is not an independent pin upstream.
  bchat: 'bdcdd6e612dc6ac3edbc24da774bc6cfabc6c26ae7a4762b7612750329a7df1d35',
} as const;

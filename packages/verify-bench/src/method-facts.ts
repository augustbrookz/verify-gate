/**
 * Facts about the verify-bench v1.1 held-out split, shown on
 * https://xyntherium.com/verify/benchmark/method. The page must not import the split itself
 * (held-out enforcement), so the counts live here; test/dataset-v11.test.ts recomputes every
 * one of them from the split and fails the build if they drift.
 */
export const HELDOUT_V11_FACTS = {
  items: 820,
  families: 550,
  from_regulations: 631,
  handwritten: 189,
  supported: 208,
  flawed: 612,
  contradicted: { total: 282, number: 126, negation: 125, date: 21, other: 10 },
  dropped_condition: 154,
  not_said: { total: 154, never_addressed: 144, other: 10 },
  cannot_settle: 22,
  dev_items: 1220,
  review_queue: 632,
  heldout_sha256: '0ee369192836b1704d10f7fae10291e625a7985e48b91f94461a9d5ed820dcb0',
  methodology_sha256: '4c8cb6050ea42e1f106a9945fe181b1472497e7193258c15654a1ae357a56448',
  methodology_commit: 'cb842bb5c2042d253a7e67569f2dcbc3d785488b',
  registered_at: '2026-10-18T00:58:53-06:00',
} as const;

/** The one-command reproduction, and whether its packages are on npm yet. */
export const REPRODUCE = {
  command: 'npx -y -p @xyntherium/verify-core@1.1.0 -p @xyntherium/verify-bench@1.1.0 verify-bench-reproduce',
  published: false,
} as const;

/** The public repository (verify-gate) and whether it is up yet. */
export const REPO = { url: 'https://github.com/augustbrookz/verify-gate', live: false } as const;

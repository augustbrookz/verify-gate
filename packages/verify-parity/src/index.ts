/**
 * @xyntherium/verify-parity — State Parity Audit for Xyntherium Verify:
 * canonical, hashed snapshots (RFC 8785 + SHA-256) with exact / tolerance /
 * excluded field modes; source change detection (real vs cosmetic, changed
 * conditions named); disagreement triage (did the runs see the same inputs?);
 * and parity records for the hash-chained ledger. Pure functions, no clock,
 * no environment, no network. It never changes a verification verdict.
 */
export * from './version';
export * from './canonical';
export * from './conditions';
export * from './snapshot';
export * from './source-change';
export * from './triage';
export * from './records';

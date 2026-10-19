/**
 * @xyntherium/verify-core — deterministic, model-free logic for Xyntherium
 * Verify: span matching, normalisation, qualifier rules, numeric and date
 * checks, the verdict contract, verdict and release rules, the evidence
 * ledger, calibration. No secrets, no network, no dependencies.
 */
export * from './contract';
export { FRESHNESS_VERSION, RULES_VERSION_LEGACY_LABELS, compareSemver, normalizeRulesVersion, parseSemver } from './rules-version';
export * from './hash';
export * from './jcs';
export * from './normalize';
export * from './spans';
export * from './sentences';
export * from './numbers';
export * from './text';
export * from './qualifiers';
export * from './checks';
export * from './templates';
export * from './retrieve';
export * from './claims';
export * from './citations';
export * from './rules';
export * from './release';
export * from './ledger';
export * from './calibration';
export * from './freshness';
export * from './engine';

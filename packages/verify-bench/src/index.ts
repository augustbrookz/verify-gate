/**
 * @xyntherium/verify-bench — the open benchmark for evidence-gated release of
 * RAG answers: dataset, construction scripts, scoring harness, and held-out
 * enforcement. The held-out split is deliberately NOT exported here; see
 * src/heldout.ts.
 */
export * from './types';
export * from './score';
export { loadDev, loadManifest, loadReviewQueue } from './dataset';
export { PREREGISTRATION } from './preregistration';

import type { ReleaseRecommendation, Verdict } from '@xyntherium/verify-core';

export const BENCH_VERSION = 'verify-bench-v1-alpha';

export type Split = 'dev' | 'heldout';

export const BENCH_VERSION_V11 = 'verify-bench-v1.1';

export type Category = 'supported' | 'contradicted' | 'qualifier_loss' | 'unsupported' | 'unverifiable' | 'adversarial' | 'numeric';

/** Where a public-source item's passages came from (v1.1). */
export interface ItemProvenance {
  source: string;
  citations: string[];
  urls: string[];
  version_date: string;
  license: string;
  claim_from?: string;
}

export interface BenchSource {
  id: string;
  title: string;
  text: string;
  retrieved_at?: string;
}

export interface BenchItem {
  id: string;
  family_id: string;
  split: Split;
  domain: string;
  category: Category;
  subcategory: string;
  question: string;
  answer: string;
  sources: BenchSource[];
  require_citations?: boolean;
  gold: {
    verdict: Verdict;
    failure_reason: string | null;
    target_claim: string;
    gold_spans: { source_id: string; quote: string }[];
    dropped_qualifier?: string;
    planted_change?: { from: string; to: string };
    expected_release: ReleaseRecommendation;
  };
  construction: { method: 'minimal_pair' | 'standalone'; base_item?: string; note: string };
  provenance?: ItemProvenance;
}

export interface ReviewQueueEntry {
  item_id: string;
  source: 'construction_check' | 'author_flag' | 'reviewer_flag';
  reason: string;
}

export interface Manifest {
  version: string;
  built_from: string[];
  split_rule: string;
  counts: {
    total: number;
    published: number;
    in_review_queue: number;
    by_split: Record<Split, number>;
    by_category: Record<string, number>;
  };
  sha256: { dev: string; heldout: string; review_queue: string };
}

/** A method's prediction for one item. A null verdict is an error, scored as an abstention. */
export interface Prediction {
  item_id: string;
  method: string;
  predicted_verdict: Verdict | null;
  predicted_reason?: string | null;
  predicted_release?: ReleaseRecommendation | null;
  qualifier_loss_flag?: boolean | null;
  internal_score?: number | null;
  latency_ms?: number | null;
  cost_cents?: number | null;
  error?: string | null;
}

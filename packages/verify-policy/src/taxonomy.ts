/**
 * The Verify Gate failure taxonomy: six rules (XYN-001…006) and the twenty
 * regression categories they cover. SARIF ruleIds, PR comment rows and ledger
 * findings all use these ids.
 */
import { ASSURANCE_SCOPE_SENTENCE, FRAMEWORK_DISCLAIMER } from './scope';

export const RULE_IDS = ['XYN-001', 'XYN-002', 'XYN-003', 'XYN-004', 'XYN-005', 'XYN-006'] as const;
export type RuleId = (typeof RULE_IDS)[number];

export interface FrameworkReference {
  framework: string;
  reference: string;
  title: string;
  disclaimer: typeof FRAMEWORK_DISCLAIMER;
}

export interface RuleInfo {
  id: RuleId;
  name: string;
  short: string;
  description: string;
  help: string;
  default_decision: string;
  frameworks: FrameworkReference[];
}

const NIST_SOURCES: FrameworkReference = {
  framework: 'NIST AI 600-1 (Generative AI Profile)',
  reference: 'MS-2.5-003',
  title: 'Review and verify sources and citations in GAI system outputs during pre-deployment risk measurement and ongoing monitoring activities',
  disclaimer: FRAMEWORK_DISCLAIMER,
};
const OWASP_MISINFO: FrameworkReference = {
  framework: 'OWASP Top 10 for LLM Applications (2025)',
  reference: 'LLM09:2025',
  title: 'Misinformation',
  disclaimer: FRAMEWORK_DISCLAIMER,
};

export const RULES: Record<RuleId, RuleInfo> = {
  'XYN-001': {
    id: 'XYN-001',
    name: 'contradicted-claim',
    short: 'Contradicted claim',
    description: `A confirmed span of a supplied source conflicts with the claim: a different number, unit, date, entity or polarity, broken arithmetic, or a newer passage that supersedes it. ${ASSURANCE_SCOPE_SENTENCE}`,
    help: 'Restate the value the source gives, or update the source if it is out of date. The finding shows the exact source passage.',
    default_decision: 'block when the claim is material',
    frameworks: [NIST_SOURCES, OWASP_MISINFO],
  },
  'XYN-002': {
    id: 'XYN-002',
    name: 'dropped-or-conflicting-qualifier',
    short: 'Dropped or conflicting qualifier',
    description: `A material condition, exception, time window, scope or modality that the source attaches to the claim is missing from the claim or conflicts with it ("may" restated as "will"). ${ASSURANCE_SCOPE_SENTENCE}`,
    help: 'Keep the condition the source states ("for annual plans", "within 30 days", "may"). The finding names the qualifier and its source passage.',
    default_decision: 'block when the claim is material',
    frameworks: [NIST_SOURCES, OWASP_MISINFO],
  },
  'XYN-003': {
    id: 'XYN-003',
    name: 'unsupported-claim',
    short: 'Unsupported claim',
    description: `No supplied source adequately supports the claim, including when a model-proposed quote does not exist in the source, or when the answer no longer makes an expected material claim. ${ASSURANCE_SCOPE_SENTENCE}`,
    help: 'Remove the claim, add the passage that supports it to the approved sources, or update the golden set if the expected claim changed on purpose.',
    default_decision: 'block when critical or high; otherwise warn',
    frameworks: [NIST_SOURCES, OWASP_MISINFO],
  },
  'XYN-004': {
    id: 'XYN-004',
    name: 'citation-problem',
    short: 'Missing or wrong citation',
    description: `Citations are required and a material claim has none, or cites a passage that does not support it. ${ASSURANCE_SCOPE_SENTENCE}`,
    help: 'Cite the passage that supports the claim.',
    default_decision: 'block when citations are required and the claim is material',
    frameworks: [NIST_SOURCES],
  },
  'XYN-005': {
    id: 'XYN-005',
    name: 'unresolved-claim',
    short: 'Unresolved claim',
    description: `The supplied sources cannot resolve the claim under the rules (a comparison with things the sources do not describe, a prediction, conflicting sources), or the claim split was low-confidence. ${ASSURANCE_SCOPE_SENTENCE}`,
    help: 'Supply a source that settles the claim, or soften it. Treated as treat_unverifiable_as (warn by default).',
    default_decision: 'warn (treat_unverifiable_as)',
    frameworks: [OWASP_MISINFO],
  },
  'XYN-006': {
    id: 'XYN-006',
    name: 'run-integrity',
    short: 'Check could not complete',
    description: `The check could not complete: a source file changed or is missing, the application endpoint timed out or failed past the retry policy, the verifier failed, the quota was exhausted, or too many claims stayed unresolved. A hold is never treated as a pass. ${ASSURANCE_SCOPE_SENTENCE}`,
    help: 'Fix the cause and re-run. Holds cannot be overridden.',
    default_decision: 'hold',
    frameworks: [],
  },
};

export interface GateCategory {
  id: number;
  key: string;
  rule: RuleId;
  expected: 'block' | 'warn' | 'hold' | 'not_pass';
  description: string;
}

/** The twenty regression categories (docs/verify-gate-architecture.md §3). */
export const GATE_CATEGORIES: GateCategory[] = [
  { id: 1, key: 'numeric_change', rule: 'XYN-001', expected: 'block', description: 'a number in the claim differs from the source' },
  { id: 2, key: 'unit_change', rule: 'XYN-001', expected: 'block', description: 'same number, different unit or rate' },
  { id: 3, key: 'date_change', rule: 'XYN-001', expected: 'block', description: 'a date or deadline differs' },
  { id: 4, key: 'negation_flip', rule: 'XYN-001', expected: 'block', description: 'polarity inverted' },
  { id: 5, key: 'wrong_entity', rule: 'XYN-001', expected: 'block', description: 'a fact attributed to the wrong plan, product or party' },
  { id: 6, key: 'arithmetic_error', rule: 'XYN-001', expected: 'block', description: 'a computed figure does not follow from its inputs' },
  { id: 7, key: 'superseded_source', rule: 'XYN-001', expected: 'block', description: 'the claim states a value a newer passage replaced' },
  { id: 8, key: 'omitted_condition', rule: 'XYN-002', expected: 'block', description: 'a material condition is dropped' },
  { id: 9, key: 'dropped_exception', rule: 'XYN-002', expected: 'block', description: 'an exception ("except", "unless") is dropped' },
  { id: 10, key: 'dropped_time_window', rule: 'XYN-002', expected: 'block', description: 'a time window or deadline is dropped' },
  { id: 11, key: 'scope_broadening', rule: 'XYN-002', expected: 'block', description: 'a limited scope is stated universally' },
  { id: 12, key: 'modality_shift', rule: 'XYN-002', expected: 'block', description: '"may" restated as "will" or "must"' },
  { id: 13, key: 'unsupported_addition', rule: 'XYN-003', expected: 'warn', description: 'a plausible claim no source addresses (block when critical)' },
  { id: 14, key: 'invented_quote', rule: 'XYN-003', expected: 'not_pass', description: 'a model-proposed quote that is not in the source' },
  { id: 15, key: 'prompt_injection_in_source', rule: 'XYN-003', expected: 'not_pass', description: 'instructions planted inside a source passage' },
  { id: 16, key: 'missing_citation', rule: 'XYN-004', expected: 'block', description: 'citations required, none given' },
  { id: 17, key: 'wrong_citation', rule: 'XYN-004', expected: 'block', description: 'the cited passage does not support the claim' },
  { id: 18, key: 'external_comparative', rule: 'XYN-005', expected: 'warn', description: 'a comparison with competitors or the market the sources do not describe' },
  { id: 19, key: 'missing_source', rule: 'XYN-006', expected: 'hold', description: 'a source file named in the golden set is missing or empty: abstain' },
  { id: 20, key: 'changed_source', rule: 'XYN-006', expected: 'hold', description: 'a source file no longer matches its recorded sha256' },
];

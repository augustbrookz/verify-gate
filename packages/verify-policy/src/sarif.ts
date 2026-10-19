/**
 * SARIF 2.1.0 for GitHub code scanning. One rule per XYN id (each description
 * carries the assurance scope), one result per non-pass finding, located at
 * the case's line in verify-gate.yml, fingerprinted with
 * sha256(suite | case | normalized_claim | verdict | source_hash | qualifier_type).
 */
import type { CaseTexts } from './gate-case';
import type { GateLedgerV1 } from './ledger';
import { GATE_VERSION } from './ledger';
import { ASSURANCE_SCOPE, ASSURANCE_SCOPE_SENTENCE, FRAMEWORK_DISCLAIMER } from './scope';
import { RULE_IDS, RULES } from './taxonomy';

export interface SarifLog {
  $schema: string;
  version: '2.1.0';
  runs: unknown[];
}

export function buildSarif(l: GateLedgerV1, o: { config_path: string; texts: Record<string, CaseTexts> }): SarifLog {
  const rules = RULE_IDS.map((id) => {
    const r = RULES[id];
    return {
      id,
      name: r.name,
      shortDescription: { text: r.short },
      fullDescription: { text: r.description },
      help: { text: `${r.help}\n\n${ASSURANCE_SCOPE_SENTENCE}`, markdown: `${r.help}\n\n_${ASSURANCE_SCOPE_SENTENCE}_` },
      defaultConfiguration: { level: id === 'XYN-005' ? 'warning' : 'error' },
      properties: {
        tags: ['ai', 'rag', 'grounding', 'verify-gate'],
        default_decision: r.default_decision,
        frameworks: r.frameworks.map((f) => ({ framework: f.framework, reference: f.reference, title: f.title, note: FRAMEWORK_DISCLAIMER })),
        assurance_scope: ASSURANCE_SCOPE,
      },
    };
  });
  const results = l.cases.flatMap((c) =>
    c.findings
      .filter((f) => f.decision !== 'pass')
      .map((f) => {
        const claim = f.claim_index !== null ? o.texts[`${c.suite}/${c.case_id}`]?.claims[f.claim_index] : null;
        const text = `${RULES[f.rule].short}: ${claim ? `"${claim.length > 200 ? `${claim.slice(0, 199)}…` : claim}" — ` : ''}${f.reason}. Decision: ${f.decision}${f.deterministic ? ' (deterministic)' : ' (model-dependent)'}${f.downgraded ? `; ${f.downgraded}` : ''}. Case ${c.suite}/${c.case_id}.`;
        return {
          ruleId: f.rule,
          ruleIndex: RULE_IDS.indexOf(f.rule),
          level: f.decision === 'warn' ? 'warning' : 'error',
          message: { text },
          locations: [{ physicalLocation: { artifactLocation: { uri: o.config_path }, region: { startLine: c.location.line ?? 1 } } }],
          partialFingerprints: { 'xyntheriumFinding/v1': f.fingerprint },
          properties: { suite: c.suite, case: c.case_id, decision: f.decision, deterministic: f.deterministic, materiality: f.materiality, qualifier_type: f.qualifier_type, verdict: f.verdict, kind: f.kind },
        };
      }),
  );
  return {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: { driver: { name: 'Xyntherium Verify Gate', version: GATE_VERSION, semanticVersion: GATE_VERSION, informationUri: 'https://xyntherium.com/docs/verify-gate', rules } },
        automationDetails: { id: 'xyntherium-verify-gate/' },
        invocations: [{ executionSuccessful: true }],
        results,
        properties: { assurance_scope: ASSURANCE_SCOPE, rules_version: l.run.engine.rules_version, policy_version: l.run.engine.policy_version, decision: l.decision.decision, ledger_chain_head: l.chain.head },
      },
    ],
  };
}

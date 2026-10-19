/**
 * The human report of a Gate run: the job summary and the PR comment (the same
 * Markdown, the comment marked so it is updated in place). Deterministic
 * findings are grouped apart from model-dependent ones, evidence and qualifier
 * checks sit in collapsible detail, and the assurance scope is always shown.
 */
import type { CaseTexts } from './gate-case';
import type { GateLedgerV1, LedgerCase, LedgerFinding } from './ledger';
import { ASSURANCE_SCOPE_SENTENCE, FRAMEWORK_DISCLAIMER } from './scope';
import { RULES } from './taxonomy';

export const COMMENT_MARKER = '<!-- xyntherium-verify-gate -->';

const ICON: Record<string, string> = { pass: '✅', warn: '⚠️', hold: '⏸️', block: '🛑' };

export function cell(s: string, max = 160): string {
  const t = s.replace(/\s+/g, ' ').trim();
  const cut = t.length > max ? `${t.slice(0, max - 1)}…` : t;
  return cut.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function caseKey(c: Pick<LedgerCase, 'suite' | 'case_id'>): string {
  return `${c.suite}/${c.case_id}`;
}

export interface ReportOptions {
  ledger_path: string;
  texts: Record<string, CaseTexts>;
  skipped_reason?: string | null;
  github_notes?: string[];
  draft?: boolean;
}

function findingRow(c: LedgerCase, f: LedgerFinding, texts: CaseTexts | undefined): string {
  const claim = f.claim_index !== null ? texts?.claims[f.claim_index] : null;
  const what = claim ? `"${cell(claim, 120)}"` : cell(f.kind.replace(/_/g, ' '));
  const extra = f.downgraded ? ` _(${cell(f.downgraded, 90)})_` : '';
  return `| ${cell(caseKey(c))} | ${what} | ${f.rule} ${RULES[f.rule].short} | ${ICON[f.decision]} ${f.decision}${extra} | ${cell(f.reason, 140)} |`;
}

function evidence(c: LedgerCase, texts: CaseTexts | undefined): string {
  const rows = c.claims.map((cl) => {
    const text = texts?.claims[cl.index] ?? `claim ${cl.index}`;
    const quals = cl.qualifier_checks.filter((q) => q.material).map((q) => `${q.type}: ${q.status}`).join(', ') || '—';
    return `| ${cl.index} | ${cell(text, 110)} | ${cl.present_in_answer ? (cl.verdict ?? '—') : 'missing from answer'} | ${cl.span_valid === null ? '—' : cl.span_valid ? 'yes' : 'no'} | ${cl.support_assessment} | ${cell(quals, 80)} | ${cl.resolved_by} | ${cl.review_required ? 'yes' : ''} |`;
  });
  const spans = c.claims.flatMap((cl) =>
    cl.spans
      .filter((s) => texts?.quotes[s.quote_hash])
      .map((s) => `- claim ${cl.index}, \`${s.source_id}\` [${s.start}–${s.end}] (${s.role}, ${s.match_type}${s.valid ? '' : ', **span no longer valid**'}): "${cell(texts!.quotes[s.quote_hash], 300)}"`),
  );
  return [
    `<details><summary>Claims, evidence and qualifier checks — ${cell(caseKey(c))}</summary>`,
    '',
    '| # | Claim | Verdict | span_valid | Support | Qualifier checks | Resolved by | Review |',
    '|---|---|---|---|---|---|---|---|',
    ...rows,
    '',
    ...(spans.length ? ['Evidence (offsets index the original source text):', '', ...spans, ''] : []),
    '</details>',
  ].join('\n');
}

export function renderReport(l: GateLedgerV1, o: ReportOptions): string {
  const d = l.decision;
  const headline = o.skipped_reason ? `⏭️ skipped: ${o.skipped_reason}` : d.override ? `${ICON.block} block — Overridden by @${d.override.actor}` : `${ICON[d.decision]} ${d.title}`;
  const cases = l.cases;
  const findings = cases.flatMap((c) => c.findings.filter((f) => f.decision !== 'pass').map((f) => ({ c, f })));
  const det = findings.filter((x) => x.f.deterministic);
  const model = findings.filter((x) => !x.f.deterministic);
  const s = l.summary;
  const sig = l.signing.alg === 'Ed25519' ? `cryptographically signed by the configured verifier key \`${l.signing.key_id}\`` : 'unsigned (no signing key configured)';
  const est = l.run.cost.estimated_monthly_units;
  const out: string[] = [
    COMMENT_MARKER,
    `## Verify Gate: ${headline}`,
    '',
    `**${s.cases_total} case(s)** · ${s.claims_total} claim(s) · ${s.material_failures} blocking · ${findings.filter((x) => x.f.decision === 'warn').length} warning(s) · ${l.run.mode} mode · rules ${l.run.engine.rules_version} · policy ${l.run.engine.policy_version}${l.run.policy.enforcement === 'report_only' ? ' · **report-only**' : ''}`,
    '',
    `> ${ASSURANCE_SCOPE_SENTENCE}`,
    '',
  ];
  if (o.draft) out.push('> **draft: review before trusting.** This golden set was drafted automatically and has not been approved; the Gate reports but does not enforce.', '');
  if (d.override) out.push(`**Override:** @${d.override.actor} at ${d.override.timestamp}: "${cell(d.override.reason, 300)}". Recorded in the signed ledger.`, '');
  if (!o.skipped_reason) {
    out.push('| Case | Decision | Claims | Findings |', '|---|---|---|---|');
    for (const c of cases) {
      const rules = [...new Set(c.findings.filter((f) => f.decision !== 'pass').map((f) => f.rule))];
      out.push(`| ${cell(caseKey(c))} | ${c.status === 'cached' ? `${ICON[c.decision]} ${c.decision} (cached)` : `${ICON[c.decision]} ${c.decision}`} | ${c.claims.length} | ${rules.join(', ') || '—'} |`);
    }
    out.push('');
    if (det.length) out.push('### Deterministic findings (reproduce identically)', '', '| Case | Claim | Rule | Decision | Detail |', '|---|---|---|---|---|', ...det.map((x) => findingRow(x.c, x.f, o.texts[caseKey(x.c)])), '');
    if (model.length) out.push('### Model-dependent findings', '', '| Case | Claim | Rule | Decision | Detail |', '|---|---|---|---|---|', ...model.map((x) => findingRow(x.c, x.f, o.texts[caseKey(x.c)])), '');
    for (const c of cases.filter((x) => x.claims.length)) out.push(evidence(c, o.texts[caseKey(c)]), '');
  }
  out.push(
    `**Cost:** ${l.run.cost.billable_units} unit(s) this run; ${l.run.cost.cached_cases} cached case(s) at 0 units.${est !== null ? ` Estimated monthly units: ${est.toLocaleString('en-US')}.` : ''}${l.run.sampling.full_run ? '' : ` Sampled ${l.run.sampling.selected_cases} of ${l.run.sampling.total_cases} case(s).`}`,
    '',
    `**Ledger:** \`${o.ledger_path}\` — ${sig}. Chain head \`${l.chain.head.slice(0, 16)}\`. Check it offline: \`npx @xyntherium/verify-cli ledger verify ${o.ledger_path}\`.`,
    '',
    ...(o.github_notes?.length ? [`<sub>${o.github_notes.map((n) => cell(n, 200)).join(' · ')}</sub>`, ''] : []),
    `<sub>${ASSURANCE_SCOPE_SENTENCE} Framework references are an ${FRAMEWORK_DISCLAIMER.charAt(0).toLowerCase()}${FRAMEWORK_DISCLAIMER.slice(1)}</sub>`,
  );
  return out.join('\n');
}

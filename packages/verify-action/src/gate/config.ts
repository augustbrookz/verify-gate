/**
 * verify-gate.yml, schema version 1 (JSON Schema: schemas/verify-gate.schema.json).
 *
 * Sources are files checked into the repository, each pinned by sha256 (and
 * optionally a version). The Gate never fetches a source from a URL. An
 * endpoint is the application under test; its header values may only
 * reference environment variables (`${env.NAME}`), so no secret is ever
 * written into the file. Cases carry questions, optional recorded answers,
 * the sources they may use, and material_claims, which double as the
 * expected atomic claims local mode checks.
 */
import { createHash } from 'node:crypto';
import { load } from 'js-yaml';
import { CONDITION_CLASSES, MATERIALITY, resolvePolicy, type ExpectedClaim, type GatePolicy, type Materiality, type RequiredCondition } from '../../../verify-policy/src/index';

export const CONFIG_SCHEMA_VERSION = '1';

export interface SourceSpec {
  id: string;
  path: string;
  version: string | null;
  sha256: string | null;
  effective_date?: string;
  supersedes?: string[];
}

export interface EndpointSpec {
  url: string;
  method: 'GET' | 'POST' | 'PUT';
  headers: Record<string, string>;
  /** Request body template: a string containing {{question}} (JSON-escaped when the body is JSON). */
  body: string | null;
  /** JSON pointer to the answer in the response ("" = the whole body is the answer text). */
  answer_path: string;
  timeout_ms: number;
  max_response_bytes: number;
  retries: number;
}

export interface CaseSpec {
  suite: string;
  id: string;
  question: string;
  answer: string | null;
  sources: string[];
  require_citations: boolean;
  material_claims: ExpectedClaim[];
  policy_overrides: Record<string, unknown> | null;
  line: number | null;
}

/** Document change mode: a question linked to sources, with the conditions its answer must keep. */
export interface TestSpec {
  id: string;
  source_ids: string[];
  question: string;
  answer: string | null;
  required_conditions: RequiredCondition[];
  line: number | null;
}

/** Files that look like policy or help content, for the "unprotected source change" warning. */
export const DEFAULT_POLICY_PATHS = ['kb/**', 'policies/**', 'policy/**', 'legal/**', 'help/**', 'support/**', 'terms/**', 'docs/**/*polic*', 'docs/**/*terms*', 'docs/**/*refund*', 'docs/**/*faq*', '**/*refund*.md', '**/*policy*.md', '**/*terms*.md', '**/*faq*.md'];

export interface SuiteSpec {
  name: string;
  endpoint: EndpointSpec | null;
  cases: CaseSpec[];
}

export interface GateConfig {
  version: string;
  draft: boolean;
  mode: 'local' | 'hosted' | null;
  network_mode: 'public' | 'local';
  sources: SourceSpec[];
  endpoint: EndpointSpec | null;
  policy: GatePolicy;
  paths: string[];
  cost: { max_cases_per_run: number | null; sample_rate: number | null; cache: boolean; expected_prs_per_day: number | null };
  ledger: { include_text: boolean };
  /** Document change mode: re-run the tests linked to a changed source (report-only by default). */
  policy_change: { enabled: boolean; enforcement: 'report_only' | 'enforce'; policy_paths: string[] };
  tests: TestSpec[];
  concurrency: number;
  suites: SuiteSpec[];
  sha256: string;
}

export class ConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`verify-gate.yml is not valid:\n- ${problems.join('\n- ')}`);
  }
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const ENV_REF = /\$\{env\.([A-Z_][A-Z0-9_]*)\}/g;

function str(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/** 1-based line of `id: <caseId>` inside the YAML text, for SARIF locations. */
export function caseLine(yamlText: string, caseId: string): number | null {
  const esc = caseId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^\\s*-?\\s*id:\\s*['"]?${esc}['"]?\\s*(?:#.*)?$`, 'm');
  const m = re.exec(yamlText);
  return m ? yamlText.slice(0, m.index).split('\n').length : null;
}

function endpointOf(raw: unknown, where: string, problems: string[]): EndpointSpec | null {
  if (raw === undefined || raw === null) return null;
  const e = raw as Record<string, unknown>;
  if (typeof e !== 'object') {
    problems.push(`${where} must be a mapping`);
    return null;
  }
  for (const k of Object.keys(e)) if (!['url', 'method', 'headers', 'body', 'answer_path', 'timeout_ms', 'max_response_bytes', 'retries'].includes(k)) problems.push(`${where}.${k} is not a known setting`);
  if (!str(e.url)) problems.push(`${where}.url is required`);
  const method = (typeof e.method === 'string' ? e.method.toUpperCase() : 'POST') as EndpointSpec['method'];
  if (!['GET', 'POST', 'PUT'].includes(method)) problems.push(`${where}.method must be GET, POST or PUT`);
  const headers: Record<string, string> = {};
  if (e.headers !== undefined) {
    if (!e.headers || typeof e.headers !== 'object') problems.push(`${where}.headers must be a mapping`);
    else
      for (const [k, v] of Object.entries(e.headers as Record<string, unknown>)) {
        if (typeof v !== 'string') {
          problems.push(`${where}.headers.${k} must be a string`);
          continue;
        }
        // A header that carries credentials must take its value from the environment.
        const sensitive = /^(authorization|proxy-authorization|cookie|x-api-key|api-key|x-auth-token)$/i.test(k) || /key|token|secret|auth/i.test(k);
        if (sensitive && v.replace(ENV_REF, '').replace(/^(Bearer|Basic|Token)\s+/i, '').trim()) {
          problems.push(`${where}.headers.${k} must reference an environment variable (\${env.NAME}); never write a credential into verify-gate.yml`);
        }
        headers[k] = v;
      }
  }
  let body: string | null = null;
  if (e.body !== undefined && e.body !== null) {
    if (typeof e.body === 'string') body = e.body;
    else if (typeof e.body === 'object') body = JSON.stringify(e.body);
    else problems.push(`${where}.body must be a string or a mapping`);
    if (body !== null && !body.includes('{{question}}')) problems.push(`${where}.body must contain {{question}}`);
  }
  if (method === 'GET' && body !== null) problems.push(`${where}: a GET endpoint takes no body; put {{question}} in the url`);
  if (method === 'GET' && typeof e.url === 'string' && !e.url.includes('{{question}}')) problems.push(`${where}.url must contain {{question}} for a GET endpoint`);
  const int = (k: 'timeout_ms' | 'max_response_bytes' | 'retries', def: number, min: number, max: number) => {
    const v = e[k];
    if (v === undefined) return def;
    if (!Number.isInteger(v) || (v as number) < min || (v as number) > max) {
      problems.push(`${where}.${k} must be an integer between ${min} and ${max}`);
      return def;
    }
    return v as number;
  };
  return {
    url: String(e.url ?? ''),
    method,
    headers,
    body,
    answer_path: typeof e.answer_path === 'string' ? e.answer_path : '/answer',
    timeout_ms: int('timeout_ms', 30_000, 1_000, 120_000),
    max_response_bytes: int('max_response_bytes', 262_144, 1_024, 4_194_304),
    retries: int('retries', 2, 0, 5),
  };
}

export function parseConfig(yamlText: string): GateConfig {
  const problems: string[] = [];
  let raw: unknown;
  try {
    raw = load(yamlText, { json: false });
  } catch (e) {
    throw new ConfigError([`not valid YAML: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`]);
  }
  const c = (raw ?? {}) as Record<string, unknown>;
  if (typeof c !== 'object' || Array.isArray(c)) throw new ConfigError(['the top level must be a mapping']);
  for (const k of Object.keys(c)) if (!['version', 'draft', 'mode', 'network_mode', 'sources', 'endpoint', 'policy', 'paths', 'cost', 'ledger', 'policy_change', 'tests', 'concurrency', 'suites'].includes(k)) problems.push(`${k} is not a known top-level setting`);
  if (String(c.version ?? '') !== CONFIG_SCHEMA_VERSION) problems.push(`version must be ${CONFIG_SCHEMA_VERSION}`);
  const mode = c.mode === undefined ? null : c.mode;
  if (mode !== null && mode !== 'local' && mode !== 'hosted') problems.push('mode must be local or hosted');
  const network_mode = c.network_mode === undefined ? 'public' : c.network_mode;
  if (network_mode !== 'public' && network_mode !== 'local') problems.push('network_mode must be public or local');

  const sources: SourceSpec[] = [];
  const ids = new Set<string>();
  if (!Array.isArray(c.sources) || !c.sources.length) problems.push('sources: list at least one checked-in source file');
  for (const [i, s] of (Array.isArray(c.sources) ? c.sources : []).entries()) {
    const x = s as Record<string, unknown>;
    if (!x || typeof x !== 'object') {
      problems.push(`sources[${i}] must be a mapping`);
      continue;
    }
    if (!str(x.id) || !ID.test(x.id)) problems.push(`sources[${i}].id must match ${ID.source}`);
    else if (ids.has(x.id)) problems.push(`sources[${i}].id "${x.id}" is a duplicate`);
    else ids.add(x.id);
    if (!str(x.path)) problems.push(`sources[${i}].path is required`);
    else if (/^[a-z][a-z0-9+.-]*:\/\//i.test(x.path)) problems.push(`sources[${i}].path is a URL; the Gate never fetches sources — check the file into the repository`);
    else if (x.path.startsWith('/') || x.path.split(/[\\/]/).includes('..')) problems.push(`sources[${i}].path must be relative to the repository and stay inside it`);
    if (x.sha256 === undefined || x.sha256 === null) problems.push(`sources[${i}].sha256 is required, so a changed source holds the run (fill it in with: npx @xyntherium/verify-cli pin)`);
    else if (typeof x.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(x.sha256)) problems.push(`sources[${i}].sha256 must be 64 lowercase hex characters`);
    sources.push({
      id: String(x.id ?? ''),
      path: String(x.path ?? ''),
      version: x.version === undefined || x.version === null ? null : String(x.version),
      sha256: typeof x.sha256 === 'string' ? x.sha256 : null,
      ...(typeof x.effective_date === 'string' ? { effective_date: x.effective_date } : {}),
      ...(Array.isArray(x.supersedes) ? { supersedes: x.supersedes.map(String) } : {}),
    });
  }

  const endpoint = endpointOf(c.endpoint, 'endpoint', problems);
  const { policy, errors } = resolvePolicy(c.policy);
  problems.push(...errors);

  const paths = Array.isArray(c.paths) ? c.paths.filter(str) : [];
  if (c.paths !== undefined && !Array.isArray(c.paths)) problems.push('paths must be a list of glob patterns');
  const cost = (c.cost ?? {}) as Record<string, unknown>;
  const maxCases = cost.max_cases_per_run === undefined || cost.max_cases_per_run === null ? null : cost.max_cases_per_run;
  if (maxCases !== null && (!Number.isInteger(maxCases) || (maxCases as number) < 1)) problems.push('cost.max_cases_per_run must be a positive integer');
  const sampleRate = cost.sample_rate === undefined || cost.sample_rate === null ? null : cost.sample_rate;
  if (sampleRate !== null && (typeof sampleRate !== 'number' || sampleRate <= 0 || sampleRate > 1)) problems.push('cost.sample_rate must be in (0, 1]');
  const prsPerDay = cost.expected_prs_per_day === undefined || cost.expected_prs_per_day === null ? null : cost.expected_prs_per_day;
  if (prsPerDay !== null && (typeof prsPerDay !== 'number' || prsPerDay < 0)) problems.push('cost.expected_prs_per_day must be a non-negative number');
  const pc = (c.policy_change ?? {}) as Record<string, unknown>;
  if (c.policy_change !== undefined && (typeof c.policy_change !== 'object' || c.policy_change === null || Array.isArray(c.policy_change))) problems.push('policy_change must be a mapping');
  for (const k of Object.keys(pc)) if (!['enabled', 'enforcement', 'policy_paths'].includes(k)) problems.push(`policy_change.${k} is not a known setting`);
  if (pc.policy_paths !== undefined && (!Array.isArray(pc.policy_paths) || pc.policy_paths.some((x) => !str(x)))) problems.push('policy_change.policy_paths must be a list of glob patterns');
  if (pc.enabled !== undefined && typeof pc.enabled !== 'boolean') problems.push('policy_change.enabled must be a boolean');
  if (pc.enforcement !== undefined && pc.enforcement !== 'report_only' && pc.enforcement !== 'enforce') problems.push('policy_change.enforcement must be report_only or enforce');
  const concurrency = c.concurrency === undefined ? 4 : c.concurrency;
  if (!Number.isInteger(concurrency) || (concurrency as number) < 1 || (concurrency as number) > 10) problems.push('concurrency must be an integer between 1 and 10');

  const tests: TestSpec[] = [];
  const testIds = new Set<string>();
  if (c.tests !== undefined && !Array.isArray(c.tests)) problems.push('tests must be a list');
  for (const [ti, t] of (Array.isArray(c.tests) ? c.tests : []).entries()) {
    const y = t as Record<string, unknown>;
    const where = `tests[${ti}]`;
    if (!y || typeof y !== 'object') {
      problems.push(`${where} must be a mapping`);
      continue;
    }
    for (const k of Object.keys(y)) if (!['id', 'source_ids', 'question', 'answer', 'required_conditions'].includes(k)) problems.push(`${where}.${k} is not a known setting`);
    if (!str(y.id) || !ID.test(y.id)) problems.push(`${where}.id must match ${ID.source}`);
    else if (testIds.has(y.id)) problems.push(`${where}.id "${y.id}" is a duplicate`);
    else testIds.add(y.id);
    if (!str(y.question)) problems.push(`${where}.question is required`);
    const sids = Array.isArray(y.source_ids) ? y.source_ids.map(String) : [];
    if (!sids.length) problems.push(`${where}.source_ids: link at least one source`);
    for (const sid of sids) if (!ids.has(sid)) problems.push(`${where}.source_ids: "${sid}" is not a declared source`);
    if (y.answer !== undefined && typeof y.answer !== 'string') problems.push(`${where}.answer must be a string`);
    const conds: RequiredCondition[] = [];
    if (y.required_conditions !== undefined && !Array.isArray(y.required_conditions)) problems.push(`${where}.required_conditions must be a list`);
    for (const [ri, rc] of (Array.isArray(y.required_conditions) ? y.required_conditions : []).entries()) {
      const z = rc as Record<string, unknown>;
      const w = `${where}.required_conditions[${ri}]`;
      if (!z || typeof z !== 'object') {
        problems.push(`${w} must be a mapping {class, text}`);
        continue;
      }
      if (!(CONDITION_CLASSES as readonly string[]).includes(String(z.class))) problems.push(`${w}.class must be one of ${CONDITION_CLASSES.join(', ')}`);
      if (!str(z.text)) problems.push(`${w}.text is required (the condition as the source states it)`);
      conds.push({ class: String(z.class) as RequiredCondition['class'], text: String(z.text ?? '') });
    }
    if (y.answer === undefined && !conds.length) problems.push(`${where}: give a saved answer, required_conditions, or both`);
    tests.push({ id: String(y.id ?? ''), source_ids: sids, question: String(y.question ?? ''), answer: typeof y.answer === 'string' ? y.answer : null, required_conditions: conds, line: str(y.id) ? caseLine(yamlText, y.id) : null });
  }

  const suites: SuiteSpec[] = [];
  const caseKeys = new Set<string>();
  if ((!Array.isArray(c.suites) || !c.suites.length) && !tests.length) problems.push('suites: define at least one suite with cases (or tests: for document change mode)');
  for (const [si, s] of (Array.isArray(c.suites) ? c.suites : []).entries()) {
    const x = s as Record<string, unknown>;
    const name = str(x?.name) ? x.name : `suite-${si + 1}`;
    if (!ID.test(name)) problems.push(`suites[${si}].name must match ${ID.source}`);
    const suiteEndpoint = endpointOf(x?.endpoint, `suites[${si}].endpoint`, problems);
    const cases: CaseSpec[] = [];
    if (!Array.isArray(x?.cases) || !x.cases.length) problems.push(`suites[${si}].cases: add at least one case`);
    for (const [ci, k] of (Array.isArray(x?.cases) ? x.cases : []).entries()) {
      const y = k as Record<string, unknown>;
      const where = `suites[${si}].cases[${ci}]`;
      if (!str(y?.id) || !ID.test(y.id)) problems.push(`${where}.id must match ${ID.source}`);
      else if (caseKeys.has(`${name}/${y.id}`)) problems.push(`${where}.id "${y.id}" is a duplicate in suite ${name}`);
      else caseKeys.add(`${name}/${y.id}`);
      if (!str(y?.question)) problems.push(`${where}.question is required`);
      const caseSources = Array.isArray(y?.sources) ? y.sources.map(String) : [...ids];
      for (const sid of caseSources) if (!ids.has(sid)) problems.push(`${where}.sources: "${sid}" is not a declared source`);
      if (y?.answer !== undefined && typeof y.answer !== 'string') problems.push(`${where}.answer must be a string`);
      if (y?.answer === undefined && !suiteEndpoint && !endpoint) problems.push(`${where}: give a recorded answer or an endpoint`);
      const claims: ExpectedClaim[] = [];
      for (const [mi, mc] of (Array.isArray(y?.material_claims) ? y.material_claims : []).entries()) {
        const z = (typeof mc === 'string' ? { claim: mc } : mc) as Record<string, unknown>;
        const w = `${where}.material_claims[${mi}]`;
        if (!str(z?.claim)) problems.push(`${w}.claim is required`);
        const materiality = (z?.materiality ?? 'high') as Materiality;
        if (!(MATERIALITY as readonly string[]).includes(materiality)) problems.push(`${w}.materiality must be one of ${MATERIALITY.join(', ')}`);
        if (z?.source !== undefined && !ids.has(String(z.source))) problems.push(`${w}.source "${String(z.source)}" is not a declared source`);
        claims.push({
          id: str(z?.id) ? z.id : `${String(y?.id ?? ci)}-claim-${mi + 1}`,
          claim: String(z?.claim ?? ''),
          materiality,
          quote: typeof z?.quote === 'string' ? z.quote : null,
          source: z?.source === undefined ? null : String(z.source),
          require_citation: z?.require_citation === true,
        });
      }
      const overrides = y?.policy === undefined ? null : (y.policy as Record<string, unknown>);
      if (overrides) problems.push(...resolvePolicy({ ...(c.policy as object), ...overrides }).errors.map((e) => `${where}.${e}`));
      cases.push({
        suite: name,
        id: String(y?.id ?? ''),
        question: String(y?.question ?? ''),
        answer: typeof y?.answer === 'string' ? y.answer : null,
        sources: caseSources,
        require_citations: y?.require_citations === true,
        material_claims: claims,
        policy_overrides: overrides,
        line: str(y?.id) ? caseLine(yamlText, y.id) : null,
      });
    }
    suites.push({ name, endpoint: suiteEndpoint, cases });
  }
  if (problems.length) throw new ConfigError(problems);
  return {
    version: CONFIG_SCHEMA_VERSION,
    draft: c.draft === true,
    mode: mode as GateConfig['mode'],
    network_mode: network_mode as GateConfig['network_mode'],
    sources,
    endpoint,
    policy,
    paths,
    cost: { max_cases_per_run: maxCases as number | null, sample_rate: sampleRate as number | null, cache: cost.cache !== false, expected_prs_per_day: prsPerDay as number | null },
    ledger: { include_text: (c.ledger as Record<string, unknown> | undefined)?.include_text === true },
    policy_change: { enabled: pc.enabled !== false, enforcement: pc.enforcement === 'enforce' ? 'enforce' : 'report_only', policy_paths: Array.isArray(pc.policy_paths) ? pc.policy_paths.map(String) : DEFAULT_POLICY_PATHS },
    tests,
    concurrency: concurrency as number,
    suites,
    sha256: createHash('sha256').update(yamlText).digest('hex'),
  };
}

/** The env vars an endpoint references, so their values can be masked before anything runs. */
export function envRefs(e: EndpointSpec | null): string[] {
  if (!e) return [];
  const out = new Set<string>();
  for (const v of [e.url, e.body ?? '', ...Object.values(e.headers)]) for (const m of v.matchAll(ENV_REF)) out.add(m[1]);
  return [...out];
}

export function expandEnv(v: string, env: Record<string, string | undefined>): string {
  return v.replace(ENV_REF, (_, name: string) => env[name] ?? '');
}

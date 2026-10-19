#!/usr/bin/env node
/**
 * Fetch the public source passages for verify-bench v1.1.
 *
 *   node packages/verify-bench/scripts/public/fetch-ecfr.mjs <cache-dir>
 *
 * Source: the Electronic Code of Federal Regulations (www.ecfr.gov), the
 * point-in-time edition of 2026-10-01. Regulatory text is a work of the U.S.
 * Government and in the public domain in the United States (17 U.S.C. § 105),
 * so it can be redistributed with the benchmark. The eCFR is an editorial
 * compilation and not an official legal edition of the CFR; nothing in the
 * benchmark depends on that, because labels describe the supplied passages,
 * never the law.
 *
 * Raw XML is cached in <cache-dir> (outside the repository); only the
 * extracted paragraphs, with their citation, URL, date and licence, are
 * written to data/public-sources/ecfr-2026-10-01.json. Re-running with the
 * same cache gives byte-identical output.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'data', 'public-sources', 'ecfr-2026-10-01.json');
export const VERSION_DATE = '2026-10-01';
export const LICENSE =
  'Public domain in the United States: a work of the U.S. Government (17 U.S.C. § 105). Text of the Code of Federal Regulations as compiled in the eCFR (www.ecfr.gov), point-in-time edition 2026-10-01. The eCFR is not an official legal edition of the CFR.';

/** Consumer-facing rules with concrete numbers, dates, conditions and scopes. */
export const TARGETS = [
  { title: 16, part: '429', agency: 'FTC', domain: 'consumer_sales' },
  { title: 16, part: '435', agency: 'FTC', domain: 'consumer_sales' },
  { title: 16, part: '310', agency: 'FTC', domain: 'telemarketing' },
  { title: 16, part: '314', agency: 'FTC', domain: 'data_security' },
  { title: 16, part: '433', agency: 'FTC', domain: 'consumer_credit' },
  { title: 16, part: '444', agency: 'FTC', domain: 'consumer_credit' },
  { title: 16, part: '453', agency: 'FTC', domain: 'consumer_services' },
  { title: 16, part: '455', agency: 'FTC', domain: 'consumer_sales' },
  { title: 16, part: '456', agency: 'FTC', domain: 'health_consumer' },
  { title: 16, part: '315', agency: 'FTC', domain: 'health_consumer' },
  { title: 16, part: '437', agency: 'FTC', domain: 'consumer_sales' },
  { title: 16, part: '423', agency: 'FTC', domain: 'consumer_products' },
  { title: 16, part: '306', agency: 'FTC', domain: 'consumer_products' },
  { title: 12, section: '1026.13', agency: 'CFPB', domain: 'consumer_credit' },
  { title: 12, section: '1026.12', agency: 'CFPB', domain: 'consumer_credit' },
  { title: 12, section: '1005.6', agency: 'CFPB', domain: 'electronic_payments' },
  { title: 12, section: '1005.11', agency: 'CFPB', domain: 'electronic_payments' },
  { title: 12, section: '1005.18', agency: 'CFPB', domain: 'electronic_payments' },
  { title: 12, section: '1024.35', agency: 'CFPB', domain: 'mortgage_servicing' },
  { title: 12, section: '1024.36', agency: 'CFPB', domain: 'mortgage_servicing' },
  { title: 12, section: '1024.41', agency: 'CFPB', domain: 'mortgage_servicing' },
  { title: 12, section: '1002.9', agency: 'CFPB', domain: 'consumer_credit' },
  { title: 14, part: '250', agency: 'DOT', domain: 'air_travel' },
  { title: 14, part: '260', agency: 'DOT', domain: 'air_travel' },
  { title: 14, part: '259', agency: 'DOT', domain: 'air_travel' },
  { title: 29, section: '825.110', agency: 'DOL', domain: 'employment_leave' },
  { title: 29, section: '825.200', agency: 'DOL', domain: 'employment_leave' },
  { title: 29, section: '825.300', agency: 'DOL', domain: 'employment_leave' },
  { title: 29, section: '825.302', agency: 'DOL', domain: 'employment_leave' },
  { title: 29, section: '825.303', agency: 'DOL', domain: 'employment_leave' },
  { title: 29, section: '825.305', agency: 'DOL', domain: 'employment_leave' },
  { title: 29, section: '825.313', agency: 'DOL', domain: 'employment_leave' },
  { title: 45, section: '164.524', agency: 'HHS', domain: 'health_privacy' },
  { title: 45, section: '164.526', agency: 'HHS', domain: 'health_privacy' },
  { title: 45, section: '164.404', agency: 'HHS', domain: 'health_privacy' },
  { title: 45, section: '164.408', agency: 'HHS', domain: 'health_privacy' },
  { title: 45, section: '164.410', agency: 'HHS', domain: 'health_privacy' },
  { title: 47, section: '64.1200', agency: 'FCC', domain: 'telemarketing' },
  { title: 49, part: '375', agency: 'DOT', domain: 'household_moving' },
  // Number-dense rules (added so the numeric category reaches its target size).
  ...['1005.7', '1005.8', '1005.9', '1005.10', '1005.13', '1005.14', '1005.15', '1005.17', '1005.19', '1005.20', '1005.31', '1005.32', '1005.33', '1005.34', '1005.35', '1005.36'].map((section) => ({ title: 12, section, agency: 'CFPB', domain: 'electronic_payments' })),
  ...['1026.5', '1026.7', '1026.9', '1026.10', '1026.11', '1026.15', '1026.16', '1026.19', '1026.20', '1026.23', '1026.31', '1026.36', '1026.41', '1026.51', '1026.52', '1026.53', '1026.54', '1026.55', '1026.56', '1026.57', '1026.58', '1026.59', '1026.60'].map((section) => ({ title: 12, section, agency: 'CFPB', domain: 'consumer_credit' })),
  ...['1024.17', '1024.20', '1024.21', '1024.33', '1024.37', '1024.38', '1024.39', '1024.40'].map((section) => ({ title: 12, section, agency: 'CFPB', domain: 'mortgage_servicing' })),
  ...['825.100', '825.102', '825.104', '825.105', '825.106', '825.111', '825.112', '825.113', '825.115', '825.120', '825.121', '825.122', '825.201', '825.202', '825.203', '825.204', '825.205', '825.206', '825.207', '825.208', '825.209', '825.210', '825.214', '825.215', '825.216', '825.217', '825.220', '825.301', '825.304', '825.306', '825.307', '825.308', '825.309', '825.310', '825.311', '825.312'].map((section) => ({ title: 29, section, agency: 'DOL', domain: 'employment_leave' })),
  { title: 29, section: '2560.503-1', agency: 'DOL', domain: 'benefit_claims' },
  { title: 29, part: '1904', agency: 'OSHA', domain: 'workplace_safety' },
  { title: 29, part: '516', agency: 'DOL', domain: 'employment_records' },
  { title: 49, part: '395', agency: 'FMCSA', domain: 'transport_safety' },
  { title: 14, part: '117', agency: 'FAA', domain: 'transport_safety' },
  ...['422.566', '422.568', '422.570', '422.572', '422.582', '422.584', '422.590', '422.618', '422.619'].map((section) => ({ title: 42, section, agency: 'CMS', domain: 'health_insurance' })),
  { title: 45, section: '147.136', agency: 'HHS', domain: 'health_insurance' },
  { title: 34, section: '668.22', agency: 'ED', domain: 'student_aid' },
];

export function urlOf(t) {
  const q = t.part ? `part=${t.part}` : `section=${t.section}`;
  return `https://www.ecfr.gov/api/versioner/v1/full/${VERSION_DATE}/title-${t.title}.xml?${q}`;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export function decode(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

/** Visible text of one element's inner XML: tags dropped, entities decoded, whitespace collapsed. */
export function textOf(inner) {
  return decode(
    inner
      .replace(/<FTREF[^>]*\/>|<FTREF[^>]*>[\s\S]*?<\/FTREF>/g, '')
      .replace(/<SU>[\s\S]*?<\/SU>/g, '')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

/** Sections (DIV8) with their heading and <P>/<FP> paragraphs. Tables, notes, citations and authority lines are skipped. */
export function sectionsOf(xml) {
  const out = [];
  const re = /<DIV8 N="([^"]+)" TYPE="SECTION"[^>]*>([\s\S]*?)<\/DIV8>/g;
  let m;
  while ((m = re.exec(xml))) {
    const body = m[2]
      .replace(/<GPOTABLE[\s\S]*?<\/GPOTABLE>/g, '')
      .replace(/<NOTE>[\s\S]*?<\/NOTE>/g, '')
      .replace(/<EDNOTE>[\s\S]*?<\/EDNOTE>/g, '')
      .replace(/<CITA[\s\S]*?<\/CITA>/g, '')
      .replace(/<SECAUTH[\s\S]*?<\/SECAUTH>/g, '')
      .replace(/<APPRO[\s\S]*?<\/APPRO>/g, '');
    const head = /<HEAD>([\s\S]*?)<\/HEAD>/.exec(body);
    const paragraphs = [];
    const pre = /<(P|FP)(?: [^>]*)?>([\s\S]*?)<\/\1>/g;
    let p;
    while ((p = pre.exec(body))) {
      const t = textOf(p[2]);
      if (t) paragraphs.push(t);
    }
    if (paragraphs.length) out.push({ number: m[1], heading: head ? textOf(head[1]) : `§ ${m[1]}`, paragraphs });
  }
  return out;
}

async function fetchCached(cacheDir, t) {
  const file = join(cacheDir, `t${t.title}-${t.part ? `p${t.part}` : `s${t.section}`}.xml`);
  if (existsSync(file)) return readFileSync(file, 'utf8');
  const res = await fetch(urlOf(t), { headers: { 'Accept-Encoding': 'gzip', 'User-Agent': 'xyntherium-verify-bench/1.1 (benchmark construction; contact via xyntherium.com)' } });
  if (res.status === 404) {
    // Reserved or removed section: nothing to extract.
    console.error(`skip (404): ${urlOf(t)}`);
    writeFileSync(file, '');
    return '';
  }
  if (!res.ok) throw new Error(`${urlOf(t)}: HTTP ${res.status}`);
  const xml = await res.text();
  writeFileSync(file, xml);
  return xml;
}

async function main() {
  const cacheDir = process.argv[2];
  if (!cacheDir) {
    console.error('usage: fetch-ecfr.mjs <cache-dir>');
    process.exit(2);
  }
  mkdirSync(cacheDir, { recursive: true });
  const sections = [];
  for (const t of TARGETS) {
    const xml = await fetchCached(cacheDir, t);
    for (const s of sectionsOf(xml)) {
      const citation = `${t.title} CFR ${s.number}`;
      sections.push({
        key: `${t.title}-${s.number}`.replace(/[^0-9a-z]+/gi, '-').toLowerCase(),
        citation,
        heading: s.heading,
        part: t.part ?? t.section.split('.')[0],
        agency: t.agency,
        domain: t.domain,
        url: `https://www.ecfr.gov/on/${VERSION_DATE}/title-${t.title}/section-${s.number}`,
        version_date: VERSION_DATE,
        paragraphs: s.paragraphs,
      });
    }
  }
  const doc = { source: 'eCFR', version_date: VERSION_DATE, license: LICENSE, fetched_with: 'packages/verify-bench/scripts/public/fetch-ecfr.mjs', sections };
  const text = `${JSON.stringify(doc, null, 1)}\n`;
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, text);
  const words = sections.reduce((n, s) => n + s.paragraphs.join(' ').split(/\s+/).length, 0);
  console.log(JSON.stringify({ sections: sections.length, words, sha256: createHash('sha256').update(text).digest('hex') }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();

// Polite, cached access to the eCFR versioner API (public domain U.S. regulations).
// At most one request every 700 ms; every response is cached under raw/, so a
// rebuild of the fixtures needs no network.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.join(HERE, 'raw');
const UA = 'xyntherium-verify-parity-fixtures/0.1 (test fixtures; contact via github.com/augustbrookz)';
let last = 0;
export let calls = 0;

export async function get(url, file) {
  const cache = path.join(RAW, file);
  if (fs.existsSync(cache)) return fs.readFileSync(cache, 'utf8');
  if (process.env.PARITY_OFFLINE === '1') throw new Error(`not cached: ${url}`);
  if (new URL(url).host !== 'www.ecfr.gov') throw new Error('host not allowed');
  for (let attempt = 0; attempt < 4; attempt++) {
    const wait = last + 700 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    calls++;
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }
    const body = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    fs.mkdirSync(path.dirname(cache), { recursive: true });
    fs.writeFileSync(cache, body);
    return body;
  }
  throw new Error(`gave up: ${url}`);
}

export const versionsUrl = (t, p) => `https://www.ecfr.gov/api/versioner/v1/versions/title-${t}.json?part=${p}`;
export const sectionUrl = (date, t, p, s) => `https://www.ecfr.gov/api/versioner/v1/full/${date}/title-${t}.xml?part=${p}&section=${s}`;

/** Section XML to plain text: one line per paragraph, headings kept. */
export function xmlToText(xml) {
  return xml
    .replace(/<\?xml[^>]*>/g, '')
    // eCFR metadata, not regulation text: pending-amendment links, source citations, editorial notes.
    .replace(/<(XREF|CITA|EDNOTE|EFFDNOT|SECAUTH|AUTH|SOURCE)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<(HEAD|P|FP|PSPACE|NOTE|EXTRACT|GPOTABLE|ROW)\b[^>]*>/gi, '\n')
    .replace(/<\/(HEAD|P|FP|PSPACE|ROW)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#x2014;/g, '—').replace(/&#x2013;/g, '–').replace(/&#x201C;/g, '“').replace(/&#x201D;/g, '”').replace(/&#x2019;/g, '’').replace(/&#xA7;/g, '§').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n');
}

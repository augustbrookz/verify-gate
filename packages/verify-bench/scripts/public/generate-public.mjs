#!/usr/bin/env node
/**
 * Construction-labelled items from public regulatory text (verify-bench v1.1).
 *
 *   node packages/verify-bench/scripts/public/generate-public.mjs
 *
 * Reads data/public-sources/ecfr-2026-10-01.json and writes
 * data/raw/public-shard-01.json in the CONSTRUCTION.md item shape.
 *
 * Labels come from construction only. No model is called and none of
 * verify-core's own extractors are used, so no label depends on the engine
 * being measured. Each family is one self-contained evidence sentence:
 *
 *   sup-verbatim   the sentence restated verbatim                 → supported
 *   sup-numeral    the same, with one small numeral written as a word → supported
 *   num-change     one number+unit (or $ amount) changed           → contradicted, number_mismatch (category numeric)
 *   con-date       one month-day date or clock time changed        → contradicted, date_mismatch
 *   con-negation   one modal negated or un-negated                 → contradicted, negation
 *   ql-condition   one condition / time window clause removed      → unsupported, qualifier_loss
 *   unsup          a sentence from a section of the same rule that
 *                  is NOT supplied, with no lexical support in the
 *                  supplied passages                               → unsupported, no_support
 *
 * An item that a mechanical check cannot make unambiguous is flagged
 * (ambiguity_flag) and goes to the review queue, excluded from scores.
 * Deterministic: choices come from SHA-256 of the family id, never from
 * Math.random, so the same sources always give byte-identical output.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = join(ROOT, 'data', 'public-sources', 'ecfr-2026-10-01.json');
const OUT = join(ROOT, 'data', 'raw', 'public-shard-01.json');

const sha = (s) => createHash('sha256').update(s).digest('hex');
const pick = (seed, n) => parseInt(sha(seed).slice(0, 8), 16) % n;

// ---------------------------------------------------------------------------
// Sentences
// ---------------------------------------------------------------------------

const ABBREV = /(?:\bU\.S\.C|\bU\.S|\be\.g|\bi\.e|\betc|\bNo|\bNos|\bInc|\bCo|\bCorp|\bMr|\bMs|\bDr|\bSt|\ba\.m|\bp\.m|\bv|\bSec|\bpar|\bvol|\bseq|\bet al|\bJan|\bFeb|\bMar|\bApr|\bAug|\bSept?|\bOct|\bNov|\bDec|\b[A-Z])$/;

/** Split a paragraph into sentences, keeping exact substrings (so a sentence is always verbatim in the paragraph). */
export function sentencesOf(p) {
  const out = [];
  let start = 0;
  const re = /[.?!](?=["”’)]?\s+[A-Z(“"])/g;
  let m;
  while ((m = re.exec(p))) {
    const before = p.slice(start, m.index);
    if (ABBREV.test(before)) continue;
    let end = m.index + 1;
    while (end < p.length && /["”’)]/.test(p[end])) end++;
    out.push({ start, end, text: p.slice(start, end) });
    start = end;
    while (start < p.length && /\s/.test(p[start])) start++;
  }
  if (start < p.length) out.push({ start, end: p.length, text: p.slice(start) });
  return out;
}

/** Leading enumerators and run-in headings: "(b)(1) Timing. " → removed. Returns the claim text and its offset inside the sentence. */
export function stripLead(s) {
  let t = s;
  let off = 0;
  for (;;) {
    const m = /^\((?:[a-z]{1,4}|\d{1,3}|[A-Z]|[ivxl]{1,6})\)\s*/.exec(t);
    if (!m) break;
    t = t.slice(m[0].length);
    off += m[0].length;
  }
  return { text: t, offset: off };
}

const ANAPHORA = /^(?:Yes|No(?=,)|This|These|That|Those|Such|It|Its|They|Their|Them|The foregoing|The preceding|The following|Each such|Any such|In such|In this|In that|Under this|For this|For these|For such|Except as|Notwithstanding|Paragraphs?|Subject to|Similarly|Likewise|Also|However|But|And|Or|Nor|Thus|Accordingly|Therefore|See|Examples?|For example|Note|In addition|Additionally|As used|As provided|As described|As set forth)\b/;
// List items and clause fragments are not standalone claims: no subject before the verb.
const FRAGMENT_START = /^(?:In which|Which|Who|Whom|Whose|Where|Wherein|Whereby|That|To|By|With respect to|Of|From|Upon which|Fail|Fails|Failing|Make|Makes|Making|Provide|Provides|Providing|Include|Includes|Including|Has|Have|Having|Is|Are|Was|Were|Does|Do|Did|Be|Being|Obtain|Obtains|Furnish|Furnishes|Use|Uses|Using|Misrepresent|Misrepresenting|Represent|Representing|Request|Requesting|Require|Requiring|Engage|Engaging|Cause|Causing|Permit|Permitting|Pay|Paying|Charge|Charging|Take|Taking|Accept|Accepting|Assist|Assisting|Sell|Selling|Offer|Offering|Disclose|Disclosing|Send|Sending|Deliver|Delivering|Receive|Receiving|Initiate|Initiating|Deny|Denying|Refuse|Refusing|Treat|Treating|Allow|Allowing|Collect|Collecting|Comply|Complying|Notify|Notifying|Give|Giving|Retain|Retaining|Keep|Keeping|Maintain|Maintaining|Contain|Contains|Containing|State|States|Stating|Identify|Identifies|Identifying|Describe|Describes|Describing|Specify|Specifies|Specifying|Indicate|Indicates|Indicating|Explain|Explains|Explaining|Show|Shows|Showing|Set|Sets|Setting|Inform|Informs|Informing|Print|Prints|Mail|Mails|Post|Posts|Place|Places|Display|Displays|Submit|Submits|Return|Returns|Issue|Issues|Fill|Arrange|Complete|Completes|Sign|Signs|Record|Records|Report|Reports|Determine|Determines|Consider|Considers|Apply|Applies|Meet|Meets|Satisfy|Satisfies|Exceed|Exceeds|Not)\b/;
const LIMITING_NEXT = /^(?:However|But|Except|Unless|Notwithstanding|This (?:paragraph|section|requirement|provision) does not|This does not|The (?:preceding|foregoing) (?:does|shall) not|Nothing in)/;

const SUBORDINATOR = new Set(['that', 'which', 'who', 'whom', 'whose', 'if', 'whether', 'when', 'where', 'while', 'unless', 'because', 'although', 'once', 'until', 'whenever', 'one']);
const VERB_G = /\b(?:shall|must|may|will|is|are|has|have|does|do|requires?|applies|apply|provides?|means|includes?)\b/g;
/** Index of the first verb not inside a subordinate clause (no subordinator in the four words before it), or -1. */
export function mainVerbIndex(claim) {
  VERB_G.lastIndex = 0;
  let m;
  while ((m = VERB_G.exec(claim))) {
    const before = claim.slice(0, m.index).toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean).slice(-4);
    if (before.length && !before.some((w) => SUBORDINATOR.has(w))) return m.index;
  }
  return -1;
}

export function selfContained(claim) {
  const words = claim.split(/\s+/).length;
  return (
    claim.length >= 50 &&
    claim.length <= 400 &&
    words >= 8 &&
    words <= 70 &&
    /^[A-Z]/.test(claim) &&
    /\.$/.test(claim) &&
    !ANAPHORA.test(claim) &&
    (!FRAGMENT_START.test(claim) || /^To [^,]{6,}, [^,]*\b(?:shall|must|may|will)\b/.test(claim)) &&
    !/[:;]\s*$/.test(claim) &&
    !/\b(?:paragraphs? \([a-z0-9]+\)[^.]*){2,}/.test(claim) &&
    !/“|”|"/.test(claim) &&
    !/\b(?:the following|as follows|below)\b/i.test(claim) &&
    mainVerbIndex(claim) >= 0
  );
}

// ---------------------------------------------------------------------------
// Independent lexical support check (not verify-core's)
// ---------------------------------------------------------------------------

const STOP = new Set('the a an of to in on for and or by with that this these those is are be been was were as at from any all such shall must may will its their his her not no under which who whom whose than then there other each per into upon also only within after before more less than'.split(' '));
const content = (s) => (s.toLowerCase().match(/[a-z][a-z'-]{3,}/g) ?? []).filter((w) => !STOP.has(w)).map((w) => w.replace(/(?:ing|ed|es|s)$/, ''));

function coverageIn(claim, text) {
  const c = content(claim);
  if (!c.length) return 0;
  const set = new Set(content(text));
  return c.filter((w) => set.has(w)).length / c.length;
}
function maxSentenceCoverage(claim, text) {
  return Math.max(0, ...text.split(/(?<=[.;])\s+/).map((s) => coverageIn(claim, s)));
}

// ---------------------------------------------------------------------------
// Transformations
// ---------------------------------------------------------------------------

const UNIT = '(?:\\s?(?:percent|%)|\\s(?:business|calendar|working)\\s(?:days?)|\\s(?:days?|months?|years?|hours?|minutes?|weeks?|miles?|employees?|feet|pounds|inches|cents?|dollars?|times|consecutive))';
const NUMBER_TOKEN = new RegExp(`(\\$\\s?\\d{1,3}(?:,\\d{3})*(?:\\.\\d+)?|\\b\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\b\\d+(?:\\.\\d+)?)(${UNIT})?`, 'g');
const CITATION_BEFORE = /(?:§§?\s*|\bparts?\s|\bsections?\s|\bparagraphs?\s\(|\bU\.S\.C\.\s|\bCFR\s|\bPub\.\s?L\.\s|\bNo\.\s|\bchapter\s|\bsubpart\s|\btitle\s|\(\s*)$/i;
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];

function numberTokens(s) {
  const out = [];
  NUMBER_TOKEN.lastIndex = 0;
  let m;
  while ((m = NUMBER_TOKEN.exec(s))) {
    const raw = m[0];
    const isMoney = raw.startsWith('$');
    const hasUnit = !!m[2];
    if (!isMoney && !hasUnit) continue;
    if (CITATION_BEFORE.test(s.slice(0, m.index))) continue;
    if (/^\d{4}$/.test(m[1]) && !hasUnit) continue;
    if (/[\d.,]$/.test(s.slice(0, m.index))) continue;
    out.push({ index: m.index, raw, num: m[1], unit: m[2] ?? '' });
  }
  return out;
}

function parseNum(t) {
  return Number(t.replace(/[$,\s]/g, ''));
}
function formatLike(original, value) {
  const money = original.trim().startsWith('$');
  const decimals = (/\.(\d+)$/.exec(original) ?? [])[1]?.length ?? 0;
  const grouped = /\d,\d{3}/.test(original) || (money && value >= 1000);
  let s = value.toFixed(decimals);
  if (grouped) s = Number(s).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return `${money ? '$' : ''}${s}`;
}

/** A clearly different value that appears nowhere in the supplied text (digits or words). */
function changedValue(tok, supplied, seed) {
  const v = parseNum(tok.num);
  if (!Number.isFinite(v) || v === 0) return null;
  const candidates = [v * 2, v * 3, v + 7, v * 5, v + 13, v * 4, v + 11, v * 7, v + 29, v * 9].map((x) => (Number.isInteger(v) ? Math.round(x) : Math.round(x * 100) / 100));
  const order = pick(seed, candidates.length);
  for (let i = 0; i < candidates.length; i++) {
    const nv = candidates[(order + i) % candidates.length];
    const num = formatLike(tok.num, nv);
    const raw = `${num}${tok.unit}`;
    const word = Number.isInteger(nv) && nv <= 20 ? `${WORDS[nv]}${tok.unit}` : null;
    if (supplied.includes(num) || (word && supplied.toLowerCase().includes(word.toLowerCase()))) continue;
    return { num, raw };
  }
  return null;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DATE_TOKEN = new RegExp(`\\b(${MONTHS.join('|')})\\s(\\d{1,2})(,\\s\\d{4})?\\b|\\b(\\d{1,2})(?::(\\d{2}))?\\s(a\\.m\\.|p\\.m\\.)`, 'g');

function dateTokens(s) {
  const out = [];
  DATE_TOKEN.lastIndex = 0;
  let m;
  while ((m = DATE_TOKEN.exec(s))) out.push({ index: m.index, raw: m[0], m: [...m] });
  return out;
}
function changedDate(tok, supplied, seed) {
  const m = tok.m;
  const tries = [];
  if (m[1]) {
    const mi = MONTHS.indexOf(m[1]);
    for (const shift of [3, 5, 7, 4]) tries.push(`${MONTHS[(mi + shift) % 12]} ${m[2]}${m[3] ?? ''}`);
  } else {
    const h = Number(m[4]);
    for (const shift of [1, 2, 3]) {
      const nh = ((h - 1 + shift) % 12) + 1;
      tries.push(`${nh}${m[5] ? `:${m[5]}` : ''} ${m[6]}`);
    }
  }
  const start = pick(seed, tries.length);
  for (let i = 0; i < tries.length; i++) {
    const t = tries[(start + i) % tries.length];
    if (!supplied.includes(t)) return t;
  }
  return null;
}

const NEGATIVE = /\b(?:not|no|never|neither|nor|none|nothing|without|unless|except|cannot|fail|fails|failure|failing|prohibit|prohibits|prohibited|unlawful|unfair|deceptive|refuse|refuses|deny|denies|only)\b/i;
const MODAL = /\b(shall|must|may|will|should)\b( not\b)?/g;

function negationFlip(claim) {
  const modals = [...claim.matchAll(MODAL)];
  if (modals.length !== 1) return null;
  const m = modals[0];
  // Negating a definition ("shall mean", "may include") makes an awkward item; skip it.
  if (/^\s*(?:not\s+)?(?:mean|means|include|includes|be deemed|be construed)\b/.test(claim.slice(m.index + m[0].length))) return null;
  const rest = claim.slice(0, m.index) + claim.slice(m.index + m[0].length);
  if (m[2]) {
    if (NEGATIVE.test(rest)) return null;
    return { answer: claim.slice(0, m.index) + m[1] + claim.slice(m.index + m[0].length), from: m[0], to: m[1] };
  }
  if (NEGATIVE.test(claim)) return null;
  return { answer: `${claim.slice(0, m.index)}${m[1]} not${claim.slice(m.index + m[0].length)}`, from: m[1], to: `${m[1]} not` };
}

const TRAILING_LEAD = /(,?\s+)((?:if|unless|provided that|only if|except that|except|within|no later than|not later than|before|after|until|during)\s(?:[^.;]){8,})\.$/i;
const LEADING = /^((?:If|Unless|Before|After|Within|Until|When|Upon|Once|During|In the event that|In the event)\s[^,]{8,}),\s(.{20,})$/;
const MODAL_ANY = /\b(?:shall|must|may|will|should)\b/i;
const DANGLING = /\b(?:and|or|of|to|the|a|an|for|by|from|with|that|which|in|on|at|as|be)\.$/i;

function dropQualifier(claim) {
  const lead = LEADING.exec(claim);
  if (lead && !MODAL_ANY.test(lead[1]) && lead[1].length <= 180) {
    const rest = lead[2];
    const answer = rest[0].toUpperCase() + rest.slice(1);
    if (mainVerbIndex(answer) >= 0 && MODAL_ANY.test(answer) && answer.split(/\s+/).length >= 6 && !DANGLING.test(answer)) {
      return { answer, dropped: lead[1], kind: 'leading_condition' };
    }
  }
  // The earliest qualifier lead that comes after the main verb.
  const vi = mainVerbIndex(claim);
  if (vi < 0) return null;
  const verb = { index: vi, 0: /^\S+/.exec(claim.slice(vi))[0] };
  const tail = claim.slice(verb.index + verb[0].length);
  const re = new RegExp(TRAILING_LEAD.source.replace(/\\\.\$$/, ''), 'ig');
  let best = null;
  let m;
  while ((m = re.exec(tail))) {
    const at = verb.index + verb[0].length + m.index;
    const before = claim.slice(0, at);
    if (before.split(/\s+/).length < 6) continue;
    best = { at, sep: m[1], phrase: claim.slice(at + m[1].length, claim.length - 1) };
    break;
  }
  if (!best) return null;
  const answer = `${claim.slice(0, best.at)}.`;
  if (DANGLING.test(answer) || mainVerbIndex(answer) < 0 || best.phrase.split(/\s+/).length < 3) return null;
  // The removed phrase must be a qualifier, never part of the main clause.
  if (MODAL_ANY.test(best.phrase) || best.phrase.length > 180 || /,\s(?:which|and the|but|so that)\b/.test(best.phrase)) return null;
  return { answer, dropped: best.phrase, kind: /^(?:within|no later than|not later than|before|after|until|during)/i.test(best.phrase) ? 'date_range' : 'condition' };
}

function toWordNumeral(claim, supplied) {
  const re = /\b([1-9]|1[0-9])\s(business days|calendar days|days|months|years|hours|weeks|minutes)\b/;
  const m = re.exec(claim);
  if (!m) return null;
  const word = WORDS[Number(m[1])];
  const answer = claim.slice(0, m.index) + word + claim.slice(m.index + m[1].length);
  if (supplied.includes(answer.slice(0, -1))) return null;
  return { answer, from: m[0], to: `${word} ${m[2]}` };
}

// ---------------------------------------------------------------------------
// Passages
// ---------------------------------------------------------------------------

const words = (s) => s.split(/\s+/).filter(Boolean).length;
const topic = (heading) => heading.replace(/^§+\s*[\d.a-z-]+\s*/i, '').replace(/\.$/, '').trim();

/** Evidence passage: the paragraph with the sentence, widened by neighbours up to ~400 words. */
function evidencePassage(section, pi) {
  const ps = section.paragraphs;
  let lo = pi;
  let hi = pi;
  const size = () => ps.slice(lo, hi + 1).reduce((n, p) => n + words(p), 0);
  while (size() < 160) {
    const canDown = lo > 0 && size() + words(ps[lo - 1]) <= 400;
    const canUp = hi < ps.length - 1 && size() + words(ps[hi + 1]) <= 400;
    if (canUp) hi++;
    else if (canDown) lo--;
    else break;
  }
  return ps.slice(lo, hi + 1).join('\n\n');
}

/** Distractor: the opening of another section of the same rule, ~120–220 words. */
function openingOf(section) {
  const out = [];
  let n = 0;
  for (const p of section.paragraphs) {
    if (n >= 120) break;
    const w = words(p);
    if (n + w <= 220) {
      out.push(p);
      n += w;
    } else {
      // Only the last paragraph is cut, at a word boundary, so every other paragraph stays verbatim.
      out.push(`${p.split(/\s+/).slice(0, Math.max(20, 220 - n)).join(' ').replace(/[,;:]$/, '')}…`);
      break;
    }
  }
  return out.join('\n\n');
}

const titleOf = (s) => `${s.citation} — ${topic(s.heading)}`;

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

function main() {
  const doc = JSON.parse(readFileSync(SRC, 'utf8'));
  const sections = doc.sections.filter((s) => s.paragraphs.join(' ').length > 400);
  const byPart = new Map();
  for (const s of sections) {
    const k = `${s.citation.split(' ')[0]}-${s.part}`;
    if (!byPart.has(k)) byPart.set(k, []);
    byPart.get(k).push(s);
  }
  const titleGroup = new Map();
  for (const s of sections) {
    const t = s.citation.split(' ')[0];
    if (!titleGroup.has(t)) titleGroup.set(t, []);
    titleGroup.get(t).push(s);
  }

  const families = [];
  const usedClaims = new Set();
  for (const section of sections) {
    const k = `${section.citation.split(' ')[0]}-${section.part}`;
    const siblings = (byPart.get(k).length > 2 ? byPart.get(k) : titleGroup.get(section.citation.split(' ')[0])).filter((x) => x.key !== section.key);
    if (siblings.length < 2) continue;
    for (let pi = 0; pi < section.paragraphs.length; pi++) {
      const para = section.paragraphs[pi];
      const sents = sentencesOf(para);
      for (let si = 0; si < sents.length; si++) {
        const lead = stripLead(sents[si].text);
        const claim = lead.text.trim();
        if (!selfContained(claim) || usedClaims.has(claim)) continue;
        usedClaims.add(claim);
        const fam = `pub-${section.key}-p${pi}-s${si}`;
        const evidence = evidencePassage(section, pi);
        if (!evidence.includes(claim)) continue;
        const distractor = siblings[pick(`${fam}:d`, siblings.length)];
        const distText = openingOf(distractor);
        const supplied = `${evidence}\n${distText}`;
        const flip = pick(`${fam}:order`, 2) === 0;
        const sources = flip
          ? [
              { id: 'S1', title: titleOf(section), text: evidence },
              { id: 'S2', title: titleOf(distractor), text: distText },
            ]
          : [
              { id: 'S1', title: titleOf(distractor), text: distText },
              { id: 'S2', title: titleOf(section), text: evidence },
            ];
        const evId = flip ? 'S1' : 'S2';
        const next = sents[si + 1]?.text ?? section.paragraphs[pi + 1] ?? '';
        const limitedNext = LIMITING_NEXT.test(stripLead(next).text);
        const question = `What does ${section.citation} say about ${topic(section.heading).replace(/^[A-Z](?=[a-z])/, (c) => c.toLowerCase())}?`;
        const provenance = { source: 'eCFR', citations: [section.citation, distractor.citation], urls: [section.url, distractor.url], version_date: doc.version_date, license: 'public-domain-us-government' };
        const base = { family_id: fam, domain: `us_regulation_${section.domain}`, question, sources, provenance };
        const goldSpan = [{ source_id: evId, quote: claim }];
        const items = [];

        items.push({
          ...base,
          id: `${fam}-sup-verbatim`,
          category: 'supported',
          subcategory: 'verbatim',
          answer: claim,
          gold: { verdict: 'supported', failure_reason: null, target_claim: claim, gold_spans: goldSpan, expected_release: 'allow' },
          construction: { method: 'minimal_pair', note: `verbatim restatement of a sentence in ${section.citation}` },
          ...(limitedNext ? { ambiguity_flag: true, ambiguity_note: 'the next sentence in the source may limit this one' } : {}),
        });

        const numeral = toWordNumeral(claim, supplied);
        if (numeral) {
          items.push({
            ...base,
            id: `${fam}-sup-numeral`,
            category: 'supported',
            subcategory: 'numeral_restatement',
            answer: numeral.answer,
            gold: { verdict: 'supported', failure_reason: null, target_claim: numeral.answer, gold_spans: goldSpan, expected_release: 'allow' },
            construction: { method: 'minimal_pair', base_item: `${fam}-sup-verbatim`, note: `"${numeral.from}" written as "${numeral.to}"; meaning unchanged` },
            ...(limitedNext ? { ambiguity_flag: true, ambiguity_note: 'the next sentence in the source may limit this one' } : {}),
          });
        }

        const nums = numberTokens(claim);
        for (let ni = 0; ni < nums.length; ni++) {
          const tok = nums[(pick(`${fam}:num`, nums.length) + ni) % nums.length];
          const occurrences = claim.split(tok.raw).length - 1;
          const nv = occurrences === 1 ? changedValue(tok, supplied, `${fam}:nv`) : null;
          if (nv) {
            const answer = claim.slice(0, tok.index) + nv.raw + claim.slice(tok.index + tok.raw.length);
            items.push({
              ...base,
              id: `${fam}-num-change`,
              category: 'numeric',
              subcategory: tok.raw.startsWith('$') ? 'amount' : 'number_unit',
              answer,
              gold: { verdict: 'contradicted', failure_reason: 'number_mismatch', target_claim: answer, gold_spans: goldSpan, planted_change: { from: tok.raw, to: nv.raw }, expected_release: 'revise' },
              construction: { method: 'minimal_pair', base_item: `${fam}-sup-verbatim`, note: `"${tok.raw}" changed to "${nv.raw}"; the new value appears nowhere in the supplied passages` },
            });
            break;
          }
        }

        const dates = dateTokens(claim);
        if (dates.length) {
          const tok = dates[pick(`${fam}:date`, dates.length)];
          const nd = claim.split(tok.raw).length === 2 ? changedDate(tok, supplied, `${fam}:nd`) : null;
          if (nd) {
            const answer = claim.slice(0, tok.index) + nd + claim.slice(tok.index + tok.raw.length);
            items.push({
              ...base,
              id: `${fam}-con-date`,
              category: 'contradicted',
              subcategory: 'date',
              answer,
              gold: { verdict: 'contradicted', failure_reason: 'date_mismatch', target_claim: answer, gold_spans: goldSpan, planted_change: { from: tok.raw, to: nd }, expected_release: 'revise' },
              construction: { method: 'minimal_pair', base_item: `${fam}-sup-verbatim`, note: `"${tok.raw}" changed to "${nd}"` },
            });
          }
        }

        const neg = negationFlip(claim);
        if (neg && !supplied.toLowerCase().includes(neg.answer.slice(0, -1).toLowerCase())) {
          items.push({
            ...base,
            id: `${fam}-con-negation`,
            category: 'contradicted',
            subcategory: 'negation',
            answer: neg.answer,
            gold: { verdict: 'contradicted', failure_reason: 'negation', target_claim: neg.answer, gold_spans: goldSpan, planted_change: { from: claim.slice(claim.indexOf(neg.from), claim.indexOf(neg.from) + neg.from.length), to: neg.to }, expected_release: 'revise' },
            construction: { method: 'minimal_pair', base_item: `${fam}-sup-verbatim`, note: `polarity inverted: "${neg.from}" → "${neg.to}"` },
          });
        }

        const ql = dropQualifier(claim);
        // The shortened claim must not be stated, as a whole sentence, anywhere in the supplied passages.
        const statedElsewhere = (a) =>
          supplied
            .split(/\n+/)
            .flatMap((p) => sentencesOf(p).map((x) => stripLead(x.text).text.trim().toLowerCase()))
            .includes(a.toLowerCase());
        if (ql && !statedElsewhere(ql.answer) && !ql.answer.toLowerCase().includes(ql.dropped.toLowerCase())) {
          const subtle = /^(?:before|after|during)\b/i.test(ql.dropped);
          items.push({
            ...base,
            id: `${fam}-ql-${ql.kind === 'date_range' ? 'date-range' : 'condition'}`,
            category: 'qualifier_loss',
            subcategory: ql.kind === 'date_range' ? 'date_range' : 'condition',
            answer: ql.answer,
            gold: { verdict: 'unsupported', failure_reason: 'qualifier_loss', target_claim: ql.answer, gold_spans: goldSpan, dropped_qualifier: ql.dropped, expected_release: 'revise' },
            construction: { method: 'minimal_pair', base_item: `${fam}-sup-verbatim`, note: `qualifier removed: "${ql.dropped}"` },
            ...(subtle ? { ambiguity_flag: true, ambiguity_note: 'removed clause opens with before/after/during and may be descriptive rather than limiting' } : {}),
          });
        }

        // Unsupported: a claim from a section of the same rule that is not supplied.
        const others = siblings.filter((x) => x.key !== distractor.key);
        if (others.length) {
          const other = others[pick(`${fam}:u`, others.length)];
          const cands = other.paragraphs.flatMap((p) => sentencesOf(p).map((x) => stripLead(x.text).text.trim())).filter((c) => selfContained(c) && !usedClaims.has(c));
          for (let ci = 0; ci < cands.length; ci++) {
            const c = cands[(pick(`${fam}:uc`, cands.length) + ci) % cands.length];
            const sentCov = maxSentenceCoverage(c, supplied);
            const passCov = coverageIn(c, supplied);
            const numsInSupplied = numberTokens(c).some((t) => supplied.includes(t.num));
            if (sentCov >= 0.4 || passCov >= 0.6 || numsInSupplied) continue;
            items.push({
              ...base,
              id: `${fam}-unsup`,
              category: 'unsupported',
              subcategory: 'unaddressed_provision',
              answer: c,
              gold: { verdict: 'unsupported', failure_reason: 'no_support', target_claim: c, gold_spans: [], expected_release: 'revise' },
              construction: { method: 'minimal_pair', note: `a sentence from ${other.citation}, which is not supplied; best sentence coverage ${sentCov.toFixed(2)}` },
              provenance: { ...provenance, claim_from: other.citation },
              ...(sentCov >= 0.3 ? { ambiguity_flag: true, ambiguity_note: `claim shares ${Math.round(sentCov * 100)}% of its content words with one supplied sentence` } : {}),
            });
            break;
          }
        }
        families.push({ family_id: fam, items });
      }
    }
  }

  // Balance: every category is capped at the size of the smallest one (numeric),
  // keeping items in SHA-256(id) order. Rarer subtypes inside a category are kept
  // first so the category is not all one construction. Selection never looks at
  // what any method predicts.
  const generated = {};
  for (const f of families) for (const it of f.items) generated[`${it.category}/${it.subcategory}`] = (generated[`${it.category}/${it.subcategory}`] ?? 0) + 1;
  // The quota counts scorable (unflagged) items only. Every flagged item is kept:
  // it goes to the review queue, never into scores.
  const byCat = new Map();
  const keep = new Set();
  for (const f of families) for (const it of f.items) {
    if (it.ambiguity_flag) {
      keep.add(it.id);
      continue;
    }
    if (!byCat.has(it.category)) byCat.set(it.category, []);
    byCat.get(it.category).push(it);
  }
  const quota = Math.min(...[...byCat.values()].map((v) => v.length));
  for (const [, list] of byCat) {
    // Round-robin across subcategories, each in SHA-256(id) order, so no single construction fills the quota.
    const subs = new Map();
    for (const it of [...list].sort((a, b) => (sha(a.id) < sha(b.id) ? -1 : 1))) {
      if (!subs.has(it.subcategory)) subs.set(it.subcategory, []);
      subs.get(it.subcategory).push(it);
    }
    const queues = [...subs.keys()].sort().map((k) => subs.get(k));
    let taken = 0;
    while (taken < quota && queues.some((q) => q.length)) {
      for (const q of queues) {
        if (taken >= quota) break;
        const it = q.shift();
        if (it) {
          keep.add(it.id);
          taken++;
        }
      }
    }
  }
  for (const f of families) f.items = f.items.filter((it) => keep.has(it.id));
  const kept = families.filter((f) => f.items.length);
  families.length = 0;
  families.push(...kept);

  const shard = {
    shard: 'public-shard-01',
    balancing: { quota_per_category: quota, generated },
    built_with: 'packages/verify-bench/scripts/public/generate-public.mjs',
    source: { name: 'eCFR', version_date: doc.version_date, license: doc.license, file: 'data/public-sources/ecfr-2026-10-01.json' },
    families,
  };
  writeFileSync(OUT, `${JSON.stringify(shard, null, 1)}\n`);
  const counts = {};
  for (const f of families) for (const it of f.items) counts[`${it.category}/${it.subcategory}`] = (counts[`${it.category}/${it.subcategory}`] ?? 0) + 1;
  console.log(JSON.stringify({ families: families.length, items: families.reduce((n, f) => n + f.items.length, 0), counts }, null, 1));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();

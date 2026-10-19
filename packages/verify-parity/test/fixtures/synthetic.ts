/**
 * Labelled synthetic edits of real eCFR text, for the detector's two promises that
 * amendment history alone exercises too rarely:
 *
 *   cosmetic  formatting and drafting edits of the kind correcting amendments make
 *             (line wrapping, quotes, dashes, "shall" / "must", "thirty (30)", "§" /
 *             "section", hyphenation, non-breaking spaces, capitals, "per cent",
 *             sentence punctuation). Must NOT flag.
 *   real      one change to what the text says (an amount, a period, a negation, a
 *             modal, an exception, a citation, a removed sentence, a one-letter
 *             party swap). Must flag, with the change named.
 *
 * Every transform is deterministic; one that finds nothing to change returns null and
 * the case is not counted.
 */
export type Named = 'amount' | 'period' | 'negation' | 'modality' | 'exception_removed' | 'citation' | 'removed' | 'wording';

export interface Transform {
  id: string;
  kind: 'cosmetic' | 'real';
  /** For a real edit: what must be named, and (amount) the before / after figures. */
  expect?: Named;
  apply(text: string): { text: string; figures?: [string, string] } | null;
}

const WORDS: Record<number, string> = {
  1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten',
  12: 'twelve', 14: 'fourteen', 15: 'fifteen', 18: 'eighteen', 20: 'twenty', 24: 'twenty-four', 30: 'thirty',
  45: 'forty-five', 60: 'sixty', 90: 'ninety', 120: 'one hundred twenty', 180: 'one hundred eighty',
};

/** Replace the n-th (0-based) match only. */
function nth(text: string, re: RegExp, n: number, f: (m: RegExpExecArray) => string): string | null {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  let k = 0;
  for (let m = g.exec(text); m; m = g.exec(text)) {
    if (k++ === n) return text.slice(0, m.index) + f(m) + text.slice(m.index + m[0].length);
    if (m[0] === '') g.lastIndex++;
  }
  return null;
}
const changed = (before: string, after: string | null) => (after !== null && after !== before ? { text: after } : null);

export const COSMETIC: Transform[] = [
  {
    id: 'rewrap',
    kind: 'cosmetic',
    apply: (t) => {
      let k = 0;
      return changed(t, t.replace(/ /g, () => (++k % 9 === 0 ? '\n' : k % 13 === 0 ? '   ' : ' ')));
    },
  },
  { id: 'quotes', kind: 'cosmetic', apply: (t) => changed(t, t.replace(/[“”]/g, '"').replace(/[‘’]/g, "'")) },
  { id: 'dashes', kind: 'cosmetic', apply: (t) => changed(t, t.replace(/—/g, ' -- ')) },
  { id: 'shall_must', kind: 'cosmetic', apply: (t) => changed(t, t.replace(/\bshall\b/g, 'must').replace(/\bShall\b/g, 'Must')) },
  {
    id: 'spelled_numbers',
    kind: 'cosmetic',
    apply: (t) => changed(t, t.replace(/\b(\d{1,3}) (calendar days|business days|days|months|years)\b/g, (m, n: string, u: string) => (WORDS[Number(n)] ? `${WORDS[Number(n)]} (${n}) ${u}` : m))),
  },
  { id: 'section_sign', kind: 'cosmetic', apply: (t) => changed(t, t.replace(/§§\s*(?=\d)/g, 'sections ').replace(/§\s*(?=\d)/g, 'section ')) },
  {
    id: 'hyphenation',
    kind: 'cosmetic',
    apply: (t) => {
      let k = 0;
      return changed(t, t.replace(/\b([a-z]{5})([a-z]{5,})\b/g, (m, a: string, b: string) => (k++ < 8 ? `${a}-\n${b}` : m)));
    },
  },
  { id: 'nbsp', kind: 'cosmetic', apply: (t) => changed(t, t.replace(/ (?=\d)/g, ' ').replace(/(?<=\d) /g, ' ')) },
  { id: 'capitals', kind: 'cosmetic', apply: (t) => changed(t, t.replace(/\b(Secretary|Commission|State|Department|Bureau|Board)\b/g, (w) => w.toLowerCase())) },
  { id: 'per_cent_email', kind: 'cosmetic', apply: (t) => changed(t, t.replace(/\bpercent\b/g, 'per cent').replace(/\bemail\b/g, 'e-mail').replace(/\bonline\b/g, 'on-line')) },
  {
    id: 'sentence_punctuation',
    kind: 'cosmetic',
    // Two sentences joined with a semicolon: the same words, split differently.
    apply: (t) => {
      let k = 0;
      return changed(t, t.replace(/([a-z]{3})\. (The|An?|Each|This|If|Any) /g, (m, w: string, n: string) => (++k % 3 === 0 ? `${w}; ${n.toLowerCase()} ` : m)));
    },
  },
];

/**
 * Meaning-preserving edits the detector flags by design: a typo fix changes letters, and a
 * one-letter change can be a real one ("employer" / "employee"), so it is reported as a
 * wording change rather than tolerated.
 */
export const CONSERVATIVE: Transform[] = [
  {
    id: 'typo',
    kind: 'cosmetic',
    // A transposed pair of letters inside two long words (what a correcting amendment fixes).
    apply: (t) => {
      let k = 0;
      return changed(t, t.replace(/\b([a-z]{4})([a-z])([a-z])([a-z]{5,})\b/g, (m, a: string, x: string, y: string, b: string) => (x !== y && k++ < 2 ? `${a}${y}${x}${b}` : m)));
    },
  },
];

/** Every cosmetic transform at once. */
export const ALL_COSMETIC: Transform = {
  id: 'all_cosmetic',
  kind: 'cosmetic',
  apply: (t) => changed(t, COSMETIC.reduce((s, f) => f.apply(s)?.text ?? s, t)),
};

export const REAL: Transform[] = [
  {
    id: 'amount',
    kind: 'real',
    expect: 'amount',
    apply: (t) => {
      const m = /\$(\d[\d,]*)(\.\d+)?/.exec(t);
      if (!m) return null;
      const n = Number(m[1].replace(/,/g, ''));
      const next = (n + 7).toLocaleString('en-US');
      return { text: t.slice(0, m.index) + `$${next}${m[2] ?? ''}` + t.slice(m.index + m[0].length), figures: [String(n), String(n + 7)] };
    },
  },
  {
    id: 'period',
    kind: 'real',
    expect: 'period',
    apply: (t) => {
      const m = /\b(\d{1,3}) (calendar days|business days|days|months|years)\b/.exec(t);
      if (!m) return null;
      return { text: t.slice(0, m.index) + `${Number(m[1]) + 5} ${m[2]}` + t.slice(m.index + m[0].length), figures: [m[1], String(Number(m[1]) + 5)] };
    },
  },
  { id: 'negation', kind: 'real', expect: 'negation', apply: (t) => changed(t, nth(t, /\b(must|shall|may) (?!not\b|only\b|also\b)/, 0, (m) => `${m[1]} not `)) },
  { id: 'modality', kind: 'real', expect: 'modality', apply: (t) => changed(t, nth(t, /\b(must|shall)\b(?! not\b)/, 0, () => 'may')) },
  { id: 'exception_removed', kind: 'real', expect: 'exception_removed', apply: (t) => changed(t, nth(t, /,? (?:unless|except) [^,;.:]{4,}/, 0, () => '')) },
  { id: 'citation', kind: 'real', expect: 'citation', apply: (t) => changed(t, nth(t, /§ (\d+)\.(\d+)/, 1, (m) => `§ ${m[1]}.${Number(m[2]) + 1}`)) },
  {
    id: 'party_swap',
    kind: 'real',
    expect: 'wording',
    // One letter, a different party: why spelling is not tolerated.
    apply: (t) =>
      changed(
        t,
        nth(t, /\b(employer|employee|lessor|lessee|payor|payee|insurer|insured|licensor|licensee|transferor|transferee|grantor|grantee)\b/, 0, (m) => {
          const swap: Record<string, string> = { employer: 'employee', employee: 'employer', lessor: 'lessee', lessee: 'lessor', payor: 'payee', payee: 'payor', insurer: 'insured', insured: 'insurer', licensor: 'licensee', licensee: 'licensor', transferor: 'transferee', transferee: 'transferor', grantor: 'grantee', grantee: 'grantor' };
          return swap[m[1]];
        }),
      ),
  },
  {
    id: 'sentence_removed',
    kind: 'real',
    expect: 'removed',
    // The middle sentence (to a full stop) cut out, the rest of the text (its line breaks included) untouched.
    apply: (t) => {
      const ends = [...t.matchAll(/(?<=\.)\s+(?=[(A-Z§])/g)].map((m) => ({ at: m.index ?? 0, len: m[0].length }));
      if (ends.length < 3) return null;
      const k = Math.floor(ends.length / 2);
      const start = ends[k - 1].at + ends[k - 1].len;
      const end = ends[k].at + ends[k].len;
      if (t.slice(start, end).trim().split(/\s+/).length < 6) return null;
      return { text: t.slice(0, start) + t.slice(end) };
    },
  },
];

/**
 * Tokenisation helpers shared by qualifier comparison, retrieval and claim
 * checks. Deliberately simple and deterministic: lowercase word tokens, a
 * light suffix stemmer, a fixed stopword list.
 */
import { normalize } from './normalize';

export const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'of', 'in', 'on', 'at', 'to', 'for', 'from', 'by', 'with', 'as',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am', 'it', 'its', 'this', 'that', 'these', 'those',
  'there', 'here', 'their', 'they', 'them', 'you', 'your', 'yours', 'we', 'our', 'us', 'i', 'my', 'me',
  'he', 'she', 'his', 'her', 'him', 'which', 'who', 'whom', 'whose', 'what', 'will', 'would', 'shall',
  'should', 'can', 'could', 'may', 'might', 'must', 'do', 'does', 'did', 'have', 'has', 'had', 'so', 'than',
  'then', 'also', 'into', 'onto', 'about', 'per', 'via', 'any', 'all', 'each', 'every', 'such', 'other',
  'more', 'most', 'some', 'only', 'just', 'very', 'up', 'out', 'over', 'under', 'within', 'if', 'when',
  'while', 'after', 'before', 'until', 'unless', 'not', 'no', 'yes', 'get', 'gets', 'got', 'one', 'both',
  'either', 'neither', 'nor', 'own', 'same', 'too', 'how', 'where', 'why', 'because', 'during', 'through',
  'between', 'against', 'above', 'below', 'again', 'further', 'once', 'any', 'well', 'even', 'still',
]);

export function words(text: string): string[] {
  return (normalize(text).toLowerCase().match(/[a-z0-9]+(?:'[a-z]+)?/g) ?? []).map((w) => w.replace(/'s$/, ''));
}

/** A light, deterministic suffix stemmer (enough to match enrolled/enrollment/enrolls). */
export function stem(word: string): string {
  let w = word.toLowerCase();
  if (w.length <= 3 || /^\d/.test(w)) return w;
  for (const [suffix, min] of [
    ['ations', 5], ['ation', 5], ['ments', 5], ['ment', 5], ['ingly', 5], ['ing', 4], ['edly', 5],
    ['ies', 4], ['ied', 4], ['ed', 4], ['es', 4], ['ly', 4], ['s', 3],
  ] as const) {
    if (w.endsWith(suffix) && w.length - suffix.length >= min - 1) {
      w = w.slice(0, -suffix.length);
      if (suffix === 'ies' || suffix === 'ied') w += 'y';
      break;
    }
  }
  // enroll / enrol, cancell / cancel
  return w.replace(/(.)\1$/, '$1');
}

/**
 * A deliberately small synonym table for policy and product-doc vocabulary.
 * Only near-exact equivalents: "purchase"/"buy", never "fee"/"price".
 */
const SYNONYMS: Record<string, string> = {
  buy: 'purchas', bought: 'purchas', purchas: 'purchas', purchase: 'purchas',
  terminat: 'cancel', terminate: 'cancel', cancel: 'cancel',
  reimburs: 'refund', reimburse: 'refund', refund: 'refund',
  client: 'customer', subscriber: 'customer', customer: 'customer',
  obtain: 'receiv', receiv: 'receiv', receive: 'receiv',
  ask: 'request', request: 'request',
  begin: 'start', commenc: 'start', commence: 'start', start: 'start',
  cost: 'price', pric: 'price', price: 'price',
  staff: 'employee', staf: 'employee', worker: 'employee', employe: 'employee', employee: 'employee',
  complimentary: 'free', free: 'free',
  permit: 'allow', allow: 'allow',
  need: 'requir', requir: 'requir', require: 'requir',
  yearly: 'annual', annual: 'annual',
  monthly: 'month', month: 'month',
};

export function canonical(stemmed: string): string {
  return SYNONYMS[stemmed] ?? stemmed;
}

export function contentStems(text: string): string[] {
  return words(text)
    .filter((w) => !STOPWORDS.has(w) && w.length > 1)
    .map((w) => canonical(stem(w)));
}

/** Share of `needle`'s content stems that also occur in `hay`. 1 when needle has none. */
export function coverage(needle: string | string[], hay: string | string[]): number {
  const n = Array.isArray(needle) ? needle : contentStems(needle);
  if (n.length === 0) return 1;
  const h = new Set(Array.isArray(hay) ? hay : contentStems(hay));
  let hit = 0;
  for (const w of n) if (h.has(w)) hit++;
  return hit / n.length;
}

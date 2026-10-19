/**
 * Claim handling in code: Stage 2 of extraction, the deterministic fallback
 * extractor, and the coverage net.
 *
 * Stage 1 (a model) proposes candidate atomic claims. Stage 2 is this file: it
 * rejects text that is not checkable (questions, sign-offs, meta commentary),
 * splits compound claims at clause boundaries, removes duplicates, records a
 * reason for every rejection or split, and classifies each claim.
 *
 * The coverage net closes the gap a model leaves when it skips a sentence:
 * any answer sentence carrying checkable content that no accepted claim
 * covers becomes a claim of its own. A skipped sentence would otherwise be
 * released unchecked.
 */
import type { ClaimType } from './contract';
import { extractDates, extractQuantities } from './numbers';
import { negationCount } from './qualifiers';
import { locateQuote } from './spans';
import { splitSentences, type TextRange } from './sentences';
import { contentStems, words } from './text';
import { normalize } from './normalize';

export interface CandidateClaim {
  text: string;
  /** Verbatim text in the answer the claim was taken from, if the extractor gave one. */
  answer_quote?: string | null;
  claim_type?: ClaimType;
  material?: boolean;
}

export interface AcceptedClaim {
  text: string;
  claim_type: ClaimType;
  material: boolean;
  answer_start: number | null;
  answer_end: number | null;
  origin: 'model' | 'model_split' | 'fallback' | 'coverage';
}

export interface RejectedClaim {
  text: string;
  reason: 'question' | 'not_checkable' | 'too_short' | 'duplicate' | 'empty';
}

const NON_CHECKABLE =
  /^(?:hope (?:this|that) helps|let me know|feel free|i hope|thanks?(?: you)?|great question|happy to help|good luck|sure[,!.]?$|certainly[,!.]?$|of course[,!.]?$|here(?:'s| is) (?:what|a summary|an overview|the answer)|in summary[,:]?$|to summari[sz]e[,:]?$|please (?:note|contact|reach out|let)|if you have (?:any )?(?:other |more |further )?questions)/i;

const EXTERNAL_COMPARATIVE =
  /\b(?:than (?:most|many|other|others|competitors?|any other|the industry|average|similar|comparable|rival)|industry[- ](?:standard|average|leading|best)|market[- ]leading|best[- ]in[- ]class|(?:the )?(?:best|leading|top|fastest|cheapest|most popular|most reliable|most generous|most affordable)\b(?! plan| tier| option available| available)|compared (?:to|with) (?:competitors?|others?|other providers)|outperforms?|unmatched|unrivall?ed)\b/i;

const OUT_OF_SCOPE =
  /\b(?:will (?:always|never|continue to|remain)|forever|guarantee[sd]?\b(?! period)|is (?:the )?(?:best|right|ideal|perfect) (?:choice|option|fit)|great (?:for|value|choice)|worth (?:it|the)|easy to use|user-friendly|(?:you|customers) (?:will|would) (?:love|enjoy|prefer)|recommended for everyone|should (?:definitely|always))\b/i;

const SUBJECTS =
  /^(?:the|a|an|this|that|these|those|it|they|you|your|we|our|each|every|all|customers?|users?|members?|employees?|subscribers?|refunds?|orders?|returns?|plans?|accounts?|requests?|[A-Z][a-z]+)\b/;
const VERBISH =
  /\b(?:is|are|was|were|has|have|had|can|cannot|can't|may|must|will|won't|does|do|did|doesn't|don't|costs?|includes?|offers?|requires?|allows?|provides?|supports?|takes?|gets?|charges?|applies|apply|expires?|renews?|covers?|excludes?|receives?|qualif(?:y|ies)|accepts?|ships?|processes|processed|refunds?|lasts?|starts?|ends?|begins?|needs?|owe|owes|pays?|earns?|limits?|resets?)\b/i;

export function classifyClaim(text: string): ClaimType {
  if (EXTERNAL_COMPARATIVE.test(text)) return 'comparative';
  if (OUT_OF_SCOPE.test(text)) return 'opinion';
  if (/^(?:to |go to|click|tap|open|select|navigate|visit|contact|call|email|enter|choose|sign in|log in)\b/i.test(text.trim())) return 'procedural';
  if (extractDates(text).length) return 'temporal';
  if (extractQuantities(text).some((q) => q.dimension !== 'plain')) return 'numeric';
  return 'factual';
}

/** Does this text carry something a passage could support or contradict? */
export function hasCheckableContent(text: string): boolean {
  if (NON_CHECKABLE.test(text.trim())) return false;
  if (text.trim().endsWith('?')) return false;
  if (extractQuantities(text).length || extractDates(text).length) return true;
  if (negationCount(text) > 0) return true;
  // Any sentence with three or more content words is treated as checkable:
  // rejecting a real claim would release it unchecked, keeping filler only
  // costs a check that comes back unverifiable.
  return contentStems(text).length >= 3;
}

/** Split a compound claim at clause boundaries when each side stands alone. */
export function splitCompound(text: string): string[] {
  const t = text.trim().replace(/[.!]+$/, '');
  const parts = t.split(/;\s+|,\s+(?:and|but|while|whereas)\s+|\s+(?:and also|as well as that)\s+/i);
  if (parts.length > 1 && parts.every((p) => words(p).length >= 3 && VERBISH.test(p))) {
    return parts.map((p, i) => finishSentence(i === 0 ? p : capitalise(p)));
  }
  // "X costs $10 and includes 5 GB": a shared subject with two predicates.
  const m = t.match(/^(.+?)\s+((?:is|are|costs?|includes?|offers?|requires?|allows?|provides?|supports?|takes?|charges?|covers?|has|have)\b.+?)\s+and\s+((?:is|are|costs?|includes?|offers?|requires?|allows?|provides?|supports?|takes?|charges?|covers?|has|have)\b.+)$/i);
  if (m && words(m[1]).length <= 6 && SUBJECTS.test(m[1])) {
    return [finishSentence(`${m[1]} ${m[2]}`), finishSentence(`${m[1]} ${m[3]}`)];
  }
  return [finishSentence(t)];
}

function capitalise(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function finishSentence(s: string): string {
  const t = s.trim();
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

function locateInAnswer(answer: string, text: string, quote?: string | null): { start: number; end: number } | null {
  for (const q of [quote, text.replace(/\.$/, '')]) {
    if (!q) continue;
    const r = locateQuote(answer, q);
    if (r.ok) return { start: r.span.start, end: r.span.end };
  }
  // Best-overlapping answer sentence.
  const stems = new Set(contentStems(text));
  let best: TextRange | null = null;
  let bestScore = 0;
  for (const s of splitSentences(answer)) {
    const sStems = contentStems(s.text);
    const hit = sStems.filter((w) => stems.has(w)).length;
    const score = hit / Math.max(1, stems.size);
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return best && bestScore >= 0.5 ? { start: best.start, end: best.end } : null;
}

export interface Stage2Result {
  accepted: AcceptedClaim[];
  rejected: RejectedClaim[];
  splits: number;
}

export function stage2(answer: string, candidates: CandidateClaim[], origin: 'model' | 'fallback' = 'model', maxClaims = 60): Stage2Result {
  const accepted: AcceptedClaim[] = [];
  const rejected: RejectedClaim[] = [];
  const seen = new Set<string>();
  let splits = 0;
  for (const c of candidates) {
    const raw = (c.text ?? '').trim();
    if (!raw) {
      rejected.push({ text: raw, reason: 'empty' });
      continue;
    }
    if (raw.endsWith('?')) {
      rejected.push({ text: raw, reason: 'question' });
      continue;
    }
    if (!hasCheckableContent(raw)) {
      rejected.push({ text: raw, reason: words(raw).length < 3 ? 'too_short' : 'not_checkable' });
      continue;
    }
    const parts = splitCompound(raw);
    if (parts.length > 1) splits += parts.length - 1;
    for (const part of parts) {
      const key = normalize(part).toLowerCase().replace(/[^a-z0-9%$ ]/g, '');
      if (seen.has(key)) {
        rejected.push({ text: part, reason: 'duplicate' });
        continue;
      }
      if (!hasCheckableContent(part)) {
        rejected.push({ text: part, reason: 'not_checkable' });
        continue;
      }
      seen.add(key);
      const loc = locateInAnswer(answer, part, parts.length === 1 ? c.answer_quote : null);
      const type = classifyClaim(part);
      accepted.push({
        text: part,
        claim_type: type,
        material: c.material === false && type === 'opinion' ? false : true,
        answer_start: loc?.start ?? null,
        answer_end: loc?.end ?? null,
        origin: parts.length > 1 ? 'model_split' : origin,
      });
      if (accepted.length >= maxClaims) return { accepted, rejected, splits };
    }
  }
  return { accepted, rejected, splits };
}

/** Deterministic fallback extractor: one candidate per answer sentence. */
export function fallbackCandidates(answer: string): CandidateClaim[] {
  return splitSentences(answer).map((s) => ({ text: s.text, answer_quote: s.text }));
}

/**
 * Add a claim for every answer sentence with checkable content that no
 * accepted claim covers.
 */
export function coverageNet(answer: string, accepted: AcceptedClaim[]): AcceptedClaim[] {
  const added: AcceptedClaim[] = [];
  for (const s of splitSentences(answer)) {
    if (!hasCheckableContent(s.text)) continue;
    const covered = accepted.some((c) => c.answer_start !== null && c.answer_end !== null && c.answer_start < s.end && c.answer_end > s.start);
    if (covered) continue;
    for (const part of splitCompound(s.text)) {
      if (!hasCheckableContent(part)) continue;
      const loc = locateQuote(answer, part.replace(/\.$/, ''));
      added.push({
        text: part,
        claim_type: classifyClaim(part),
        material: true,
        answer_start: loc.ok ? loc.span.start : s.start,
        answer_end: loc.ok ? loc.span.end : s.end,
        origin: 'coverage',
      });
    }
  }
  return added;
}

export { EXTERNAL_COMPARATIVE, OUT_OF_SCOPE };

/**
 * Deterministic checks that run before (and after) any model judgement:
 * arithmetic stated inside a claim, arithmetic a model says a claim relies on,
 * date math, and which of two conflicting passages is newer.
 *
 * Every check reports pass / fail / inconclusive with a one-line detail. A
 * check never upgrades a verdict on its own; rules.ts decides what a result
 * means.
 */
import type { DeterministicCheck, SourceInput } from './contract';
import { dayNumber, extractDates, extractQuantities, foldSpaces, type Quantity } from './numbers';

const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.01, Math.abs(b) * 0.005);

function check(kind: DeterministicCheck['kind'], result: DeterministicCheck['result'], detail: string): DeterministicCheck {
  return { kind, result, detail };
}

/** A computation stated inside a claim: the check, the figure it states as the result, and its operands as written. */
export interface ClaimComputation {
  check: DeterministicCheck;
  result: number;
  operands: number[];
}

// A stated total: the cue sits right before the figure ("…, for a total of 20 days").
const TOTAL_CUE = /\b(?:a total of|totals?|totaling|totalling|totalled|totaled|combined total of|adds? up to|comes? to)\s*(?:of\s*)?$/i;
// "so … 240,000 more requests": a stated difference, cue before, comparative after.
const DIFFERENCE_LEAD = /\b(?:so|which means|meaning|that is|thus|therefore)\b/i;
const DIFFERENCE_TAIL = /^\s*(?:more|fewer|less|extra|additional)\b\s*([a-z]+)?/i;
// "$49 per month, so a full year … $588".
const YEAR_CUE = /\b(?:a full year|a year|per year|each year|every year|annually|yearly|12 months|twelve months)\b/i;

const sameUnit = (a: Quantity, b: Quantity) => a.dimension === b.dimension && a.unit === b.unit && a.rate === b.rate;
const singular = (w: string | undefined) => (w ?? '').toLowerCase().replace(/s$/, '');

/**
 * Arithmetic stated inside the claim itself: "20% off $50 is $40", "3 seats at
 * $12 each is $36", "a 25% increase from $40 to $50", and (1.3.0) a stated
 * total ("15 days … and 5 days …, for a total of 20 days"), a stated
 * difference ("10,000 … and 250,000 requests, so … 240,000 more requests") and
 * a monthly price over a year ("$49 per month, so a full year costs $588").
 * Returns null when the claim contains no recognisable computation.
 */
export function claimComputation(raw: string): ClaimComputation | null {
  const claim = foldSpaces(raw);
  const qs = extractQuantities(claim);
  const money = qs.filter((q) => q.dimension === 'currency');
  const pct = qs.filter((q) => q.dimension === 'percent');
  const lower = claim.toLowerCase().replace(/\s+/g, ' ');
  // The words between two figures, whitespace collapsed (cue phrases span spaces).
  const gap = (from: number, to: number) => claim.slice(from, to).replace(/\s+/g, ' ');

  // Percent change between two amounts.
  if (pct.length === 1 && money.length === 2 && /\b(?:increase|rise|raise|grow|growth|up|higher|decrease|drop|fall|cut|down|lower|reduction|reduce)\b/.test(lower) && /\bfrom\b/.test(lower)) {
    const [a, b] = money;
    const p = pct[0].value / 100;
    const up = b.value >= a.value;
    const expected = up ? a.value * (1 + p) : a.value * (1 - p);
    const ops = [a.written, pct[0].written];
    return near(expected, b.value)
      ? { check: check('arithmetic', 'pass', `${a.raw} ${up ? '+' : '-'} ${pct[0].raw} = ${b.raw}`), result: b.written, operands: ops }
      : { check: check('arithmetic', 'fail', `${a.raw} ${up ? '+' : '-'} ${pct[0].raw} is ${expected.toFixed(2)}, not ${b.raw}`), result: b.written, operands: ops };
  }
  // Discount: "20% off $50 ... $40" or "save $10".
  if (pct.length === 1 && money.length === 2 && /\b(?:off|discount|discounted|savings?|save)\b/.test(lower)) {
    const [a, b] = money[0].value >= money[1].value ? [money[0], money[1]] : [money[1], money[0]];
    const p = pct[0].value / 100;
    const ops = [a.written, pct[0].written];
    if (near(a.value * (1 - p), b.value)) return { check: check('arithmetic', 'pass', `${pct[0].raw} off ${a.raw} = ${b.raw}`), result: b.written, operands: ops };
    if (near(a.value * p, b.value)) return { check: check('arithmetic', 'pass', `${pct[0].raw} of ${a.raw} = ${b.raw} saved`), result: b.written, operands: ops };
    return { check: check('arithmetic', 'fail', `${pct[0].raw} off ${a.raw} is ${(a.value * (1 - p)).toFixed(2)}, not ${b.raw}`), result: b.written, operands: ops };
  }
  // Unit price times count equals total.
  const counts = qs.filter((q) => q.dimension === 'count' && q.unit !== 'times');
  if (counts.length === 1 && money.length === 2 && /\b(?:each|per|apiece|a seat|a user)\b/.test(lower) && /\b(?:total|totals|totaling|totalling|comes to|for a total|in total|altogether|combined|=)\b/.test(lower)) {
    const n = counts[0].value;
    const [unit, total] = money[0].start < money[1].start ? [money[0], money[1]] : [money[1], money[0]];
    const ops = [n, unit.written];
    return near(n * unit.value, total.value)
      ? { check: check('arithmetic', 'pass', `${n} × ${unit.raw} = ${total.raw}`), result: total.written, operands: ops }
      : { check: check('arithmetic', 'fail', `${n} × ${unit.raw} is ${(n * unit.value).toFixed(2)}, not ${total.raw}`), result: total.written, operands: ops };
  }
  // A stated total of two or more figures in the same unit, the total last.
  const valued = qs.filter((q) => q.dimension !== 'plain');
  if (valued.length >= 3) {
    const last = valued[valued.length - 1];
    const prev = valued[valued.length - 2];
    const ops = valued.slice(0, -1);
    const joined = gap(ops[0].end, prev.start);
    if (ops.every((q) => sameUnit(q, last)) && /\b(?:and|plus)\b/i.test(joined) && !/\bor\b/i.test(joined) && TOTAL_CUE.test(gap(prev.end, last.start))) {
      const sum = ops.reduce((a, q) => a + q.value, 0);
      const detail = ops.map((q) => q.raw).join(' + ');
      return near(sum, last.value)
        ? { check: check('arithmetic', 'pass', `${detail} = ${last.raw}`), result: last.written, operands: ops.map((q) => q.written) }
        : { check: check('arithmetic', 'fail', `${detail} is ${round(sum / (last.value / last.written || 1))}, not ${last.raw}`), result: last.written, operands: ops.map((q) => q.written) };
    }
  }
  // A stated difference of two figures in the same unit: "… so … 240,000 more requests".
  if (valued.length === 2 && sameUnit(valued[0], valued[1])) {
    const [a, b] = valued;
    const result = qs.find((q) => q.start > b.end && (q.dimension === 'plain' || sameUnit(q, a)));
    if (result) {
      const tail = DIFFERENCE_TAIL.exec(gap(result.end, claim.length));
      const unitWord = tail?.[1];
      const unitOk = result.dimension !== 'plain' || (unitWord !== undefined && a.unit !== null && singular(unitWord) === singular(a.unit));
      if (tail && unitOk && DIFFERENCE_LEAD.test(gap(b.end, result.start))) {
        const diff = Math.abs(a.written - b.written);
        return near(diff, result.written)
          ? { check: check('arithmetic', 'pass', `${b.raw} - ${a.raw} = ${result.raw}`), result: result.written, operands: [a.written, b.written] }
          : { check: check('arithmetic', 'fail', `the difference between ${a.raw} and ${b.raw} is ${round(diff)}, not ${result.raw}`), result: result.written, operands: [a.written, b.written] };
      }
    }
  }
  // A monthly price over a year: "$49 per month, so a full year … $588".
  const between = money.length === 2 ? gap(money[0].end, money[1].start) : '';
  if (money.length === 2 && money[0].rate === 'per month' && money[1].rate === null && YEAR_CUE.test(between) && DIFFERENCE_LEAD.test(between) && !/\b(?:discount|discounted|off|save|saving|savings|annual billing|prepay|prepaid)\b/i.test(lower)) {
    const [m, y] = money;
    return near(m.value * 12, y.value)
      ? { check: check('arithmetic', 'pass', `${m.raw} per month × 12 months = ${y.raw}`), result: y.written, operands: [m.written] }
      : { check: check('arithmetic', 'fail', `${m.raw} per month × 12 months is ${(m.value * 12).toFixed(2)}, not ${y.raw}`), result: y.written, operands: [m.written] };
  }
  return null;
}

/** The check part of claimComputation. */
export function claimArithmetic(claim: string): DeterministicCheck | null {
  return claimComputation(claim)?.check ?? null;
}

export type Operation = 'sum' | 'difference' | 'product' | 'ratio' | 'percent_of' | 'percent_change';

/**
 * Recompute arithmetic a model says the claim relies on. Every operand must
 * appear as a value in the verified evidence spans; the result must equal a
 * value stated in the claim.
 */
export function recomputeArithmetic(
  proposal: { operation: Operation; operands: number[]; result: number },
  evidenceText: string,
  claimText: string,
): DeterministicCheck {
  const evidenceValues = extractQuantities(evidenceText).map((q) => q.written);
  const missing = proposal.operands.filter((o) => !evidenceValues.some((v) => near(v, o)));
  if (missing.length) return check('arithmetic', 'fail', `operand(s) ${missing.join(', ')} not found in the cited evidence`);
  const ops = proposal.operands;
  let value: number | null = null;
  switch (proposal.operation) {
    case 'sum':
      value = ops.reduce((a, b) => a + b, 0);
      break;
    case 'difference':
      value = ops.length === 2 ? ops[0] - ops[1] : null;
      break;
    case 'product':
      value = ops.reduce((a, b) => a * b, 1);
      break;
    case 'ratio':
      value = ops.length === 2 && ops[1] !== 0 ? ops[0] / ops[1] : null;
      break;
    case 'percent_of':
      value = ops.length === 2 ? (ops[0] / 100) * ops[1] : null;
      break;
    case 'percent_change':
      value = ops.length === 2 && ops[0] !== 0 ? ((ops[1] - ops[0]) / ops[0]) * 100 : null;
      break;
  }
  if (value === null) return check('arithmetic', 'fail', `cannot compute ${proposal.operation} of ${ops.length} operand(s)`);
  if (!near(value, proposal.result)) return check('arithmetic', 'fail', `${proposal.operation}(${ops.join(', ')}) = ${round(value)}, not ${proposal.result}`);
  const claimValues = extractQuantities(claimText).map((q) => q.written);
  if (!claimValues.some((v) => near(v, value as number) || near(Math.abs(v), Math.abs(value as number)))) {
    return check('arithmetic', 'fail', `recomputed ${round(value)} does not appear in the claim`);
  }
  return check('arithmetic', 'pass', `${proposal.operation}(${ops.join(', ')}) = ${round(value)}`);
}

function round(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

/**
 * Date math: a claim date that equals an anchor date in the evidence plus a
 * duration in the evidence ("a 14-day trial starting March 1" → "ends March
 * 15"). Off by exactly one day is inconclusive (inclusive vs exclusive).
 */
export function dateMath(claim: string, evidence: string): DeterministicCheck | null {
  const claimDates = extractDates(claim).filter((d) => d.precision === 'day' && d.year !== null);
  if (!claimDates.length) return null;
  const evDates = extractDates(evidence).filter((d) => d.precision === 'day' && d.year !== null);
  const durations = extractQuantities(evidence).filter((q) => q.dimension === 'duration_fixed' && q.value % 86_400 === 0);
  if (!evDates.length || !durations.length) return null;
  for (const cd of claimDates) {
    const target = dayNumber({ year: cd.year!, month: cd.month!, day: cd.day! });
    for (const ad of evDates) {
      const anchor = dayNumber({ year: ad.year!, month: ad.month!, day: ad.day! });
      for (const dur of durations) {
        const days = dur.value / 86_400;
        for (const sign of [1, -1]) {
          const diff = Math.abs(anchor + sign * days - target);
          if (diff === 0) return check('date_math', 'pass', `${ad.raw} ${sign > 0 ? '+' : '-'} ${dur.raw} = ${cd.raw}`);
          if (diff === 1) return check('date_math', 'inconclusive', `${ad.raw} ${sign > 0 ? '+' : '-'} ${dur.raw} is one day from ${cd.raw} (inclusive vs exclusive counting)`);
        }
      }
    }
  }
  return null;
}

const SUPERSEDING_RE =
  /\b(?:replaces|replaced|supersedes|superseded|no longer|previously|formerly|has been updated|have been updated|has changed|have changed|was changed|now (?:costs?|is|are|includes?|requires?|allows?)|effective immediately|as of (?:today|now)|updated (?:policy|terms|pricing))\b/i;
const DATED_RE =
  /\b(?:last updated|updated|effective(?: date)?|revised|as of|published|valid from|in effect from)\s*:?\s*/gi;

export interface Recency {
  source_id: string;
  /** Day number of the newest date the passage claims for itself, or null. */
  day: number | null;
  superseding: boolean;
}

/**
 * How recent a passage says it is. A date the passage declares for itself
 * ("Last updated 4 November 2025", "Effective 1 March 2026") wins; the
 * caller's retrieved_at is only a fallback, because it records when the page
 * was fetched, not when its content was written.
 */
export function sourceRecency(source: SourceInput): Recency {
  let declared: number | null = null;
  for (const m of source.text.matchAll(DATED_RE)) {
    const after = source.text.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 40);
    const d = extractDates(after)[0];
    if (d && d.start === 0 && d.year && d.month) {
      const n = dayNumber({ year: d.year, month: d.month, day: d.day ?? 1 });
      declared = declared === null ? n : Math.max(declared, n);
    }
  }
  let day = declared;
  if (day === null && source.retrieved_at) {
    const t = Date.parse(source.retrieved_at);
    if (Number.isFinite(t)) day = Math.floor(t / 86_400_000);
  }
  return { source_id: source.id, day, superseding: SUPERSEDING_RE.test(source.text) };
}

/**
 * Given passages that conflict on a fact, which one governs? The newer dated
 * passage; failing dates, the only passage that announces it supersedes
 * something; otherwise none (the conflict is real and unresolvable).
 */
export function governingSource(recencies: Recency[]): { source_id: string | null; check: DeterministicCheck } {
  const dated = recencies.filter((r) => r.day !== null);
  if (dated.length === recencies.length && dated.length >= 2) {
    const sorted = [...dated].sort((a, b) => (b.day as number) - (a.day as number));
    if (sorted[0].day !== sorted[1].day) {
      return { source_id: sorted[0].source_id, check: check('recency', 'pass', `${sorted[0].source_id} is the newer passage`) };
    }
  }
  const superseding = recencies.filter((r) => r.superseding);
  if (superseding.length === 1) {
    return { source_id: superseding[0].source_id, check: check('recency', 'pass', `${superseding[0].source_id} states that it supersedes earlier terms`) };
  }
  return { source_id: null, check: check('recency', 'inconclusive', 'no passage is identifiably newer') };
}

export function quantitiesOf(text: string): Quantity[] {
  return extractQuantities(text);
}

import { describe, expect, it } from 'vitest';
import { canonicalCitations, canonicalQuantities, foldDrafting, modalsOf, stripDesignator, toleranceText, toleranceTokens } from '../src/index';

describe('tolerance: formatting and drafting conventions only', () => {
  it('removes formatting', () => {
    const a = toleranceText('Refunds are issued “within\n5 business days” — see § 4.');
    const b = toleranceText('refunds  are issued "within 5 business days" -- see §4');
    expect(a).toBe(b);
    expect(toleranceText('telecommunica-\ntions carrier')).toBe(toleranceText('telecommunications carrier'));
    expect(toleranceText('telecommunica- tions carrier')).toBe(toleranceText('telecommunications carrier'));
    expect(toleranceText('a fee of 1,000 dollars')).toBe(toleranceText('a fee of 1000 dollars'));
  });

  it('folds drafting equivalences', () => {
    expect(toleranceText('The seller shall refund within thirty (30) days')).toBe(toleranceText('The seller must refund within 30 days'));
    expect(toleranceText('ten per cent by e-mail under section 5')).toBe(toleranceText('10 percent by email under § 5').replace('10', 'ten'));
    expect(toleranceTokens('15 percent')).toEqual(['15', '%']);
  });

  it('does not tolerate spelling: a one-letter edit can be a real one', () => {
    expect(toleranceText('The employer must notify')).not.toBe(toleranceText('The employee must notify'));
    expect(toleranceText('the lessor pays')).not.toBe(toleranceText('the lessee pays'));
    expect(toleranceText('the principal amount')).not.toBe(toleranceText('the principle amount'));
  });
});

describe('foldDrafting', () => {
  it('writes dashes one way: a range between figures, a spaced dash elsewhere', () => {
    expect(foldDrafting('§§ 825.202—825.205')).toBe(foldDrafting('§§ 825.202 -- 825.205'));
    expect(foldDrafting('§§ 825.202 – 825.205')).toBe('§§ 825.202-825.205');
    expect(foldDrafting('other information—e.g., x')).toBe(foldDrafting('other information - e.g., x'));
    expect(foldDrafting('self-employed e-mail')).toBe('self-employed e-mail');
  });
});

describe('exact canonical forms', () => {
  it('citations: one notation, every occurrence counted', () => {
    expect(canonicalCitations('section 3.2, § 3.2 and 16 C.F.R. 310.4(a)')).toEqual(['16 cfr 310.4(a)', '§3.2', '§3.2']);
    expect(canonicalCitations('under § 668.13 or § 668.14')).not.toEqual(canonicalCitations('under § 668.14 or § 668.14'));
    expect(canonicalCitations('heading 0101.21 of the HTSUS; Pub. L. 117-58')).toEqual(['heading 0101.21', 'pl 117-58']);
  });

  it('quantities: value in the base unit, spelled numbers folded', () => {
    expect(canonicalQuantities('within thirty (30) days')).toEqual(canonicalQuantities('within 30 days'));
    expect(canonicalQuantities('$1,000 fee')).toEqual(['currency:1000:exact']);
    expect(canonicalQuantities('18 months')).not.toEqual(canonicalQuantities('540 days'));
  });

  it('modal classes, lower case only ("May" is usually the month)', () => {
    expect(modalsOf('The carrier must notify; it may not bill and shall keep records.')).toEqual(['obligation', 'obligation', 'prohibition']);
    expect(modalsOf('Effective May 1, 2026.')).toEqual([]);
  });

  it('paragraph designators are layout', () => {
    expect(stripDesignator('(a)(1)(ii) The seller')).toEqual({ designator: '(a)(1)(ii)', text: 'The seller' });
    expect(stripDesignator('(A) Are bona fide')).toEqual({ designator: '(A)', text: 'Are bona fide' });
    expect(stripDesignator('The seller (a) x')).toEqual({ designator: null, text: 'The seller (a) x' });
  });
});

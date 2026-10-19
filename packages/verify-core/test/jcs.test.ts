import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonicalJson, jcs, JcsError, sha256Hex } from '../src/index';

/** IEEE-754 bit pattern (hex) → number, for RFC 8785 Appendix B. */
function f64(hex: string): number {
  const b = Buffer.from(hex, 'hex');
  return b.readDoubleBE(0);
}

describe('JCS (RFC 8785)', () => {
  it('serialises numbers exactly as RFC 8785 Appendix B', () => {
    const vectors: [string, string][] = [
      ['0000000000000000', '0'],
      ['8000000000000000', '0'],
      ['0000000000000001', '5e-324'],
      ['8000000000000001', '-5e-324'],
      ['7fefffffffffffff', '1.7976931348623157e+308'],
      ['ffefffffffffffff', '-1.7976931348623157e+308'],
      ['4340000000000000', '9007199254740992'],
      ['c340000000000000', '-9007199254740992'],
      ['4430000000000000', '295147905179352830000'],
      ['44b52d02c7e14af5', '9.999999999999997e+22'],
      ['44b52d02c7e14af6', '1e+23'],
      ['44b52d02c7e14af7', '1.0000000000000001e+23'],
      ['444b1ae4d6e2ef4e', '999999999999999700000'],
      ['444b1ae4d6e2ef4f', '999999999999999900000'],
      ['444b1ae4d6e2ef50', '1e+21'],
      ['3eb0c6f7a0b5ed8c', '9.999999999999997e-7'],
      ['3eb0c6f7a0b5ed8d', '0.000001'],
      ['41b3de4355555553', '333333333.3333332'],
      ['41b3de4355555554', '333333333.33333325'],
      ['41b3de4355555555', '333333333.3333333'],
      ['41b3de4355555556', '333333333.3333334'],
      ['41b3de4355555557', '333333333.33333343'],
      ['becbf647612f3696', '-0.0000033333333333333333'],
      ['43143ff3c1cb0959', '1424953923781206.2'],
    ];
    for (const [hex, want] of vectors) expect(jcs(f64(hex)), hex).toBe(want);
  });

  it('rejects NaN and Infinity', () => {
    expect(() => jcs(Number.NaN)).toThrow(JcsError);
    expect(() => jcs({ a: Number.POSITIVE_INFINITY })).toThrow(JcsError);
  });

  it('matches the RFC 8785 §3.2.2 example', () => {
    const input = JSON.parse(
      '{"numbers": [333333333.33333329, 1E30, 4.50, 2e-3, 0.000000000000000000000000001], "string": "\\u20ac$\\u000F\\u000aA\'\\u0042\\u0022\\u005c\\\\\\"\\/", "literals": [null, true, false]}',
    );
    expect(jcs(input)).toBe('{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],"string":"€$\\u000f\\nA\'B\\"\\\\\\\\\\"/"}');
  });

  it('sorts members by UTF-16 code units (RFC 8785 §3.2.3)', () => {
    const input = JSON.parse(
      '{"\\u20ac": "Euro Sign", "\\r": "Carriage Return", "\\ufb33": "Hebrew Letter Dalet With Dagesh", "1": "One", "\\ud83d\\ude00": "Emoji: Grinning Face", "\\u0080": "Control", "\\u00f6": "Latin Small Letter O With Diaeresis"}',
    );
    // Read the order from the text: JSON.parse would hoist the integer-like key "1".
    const order = [...jcs(input).matchAll(/:"([^"]+)"/g)].map((m) => m[1]);
    expect(order).toEqual(['Carriage Return', 'One', 'Control', 'Latin Small Letter O With Diaeresis', 'Euro Sign', 'Emoji: Grinning Face', 'Hebrew Letter Dalet With Dagesh']);
  });

  it('rejects lone surrogates (input must be I-JSON)', () => {
    expect(() => jcs('\uD800')).toThrow(JcsError);
    expect(() => jcs({ ['\uDC00']: 1 })).toThrow(JcsError);
    expect(jcs('😀')).toBe('"😀"');
  });

  it('omits undefined members, nulls undefined array slots, and rejects BigInt', () => {
    expect(jcs({ b: 1, a: undefined, c: [undefined, 2] })).toBe('{"b":1,"c":[null,2]}');
    expect(() => jcs({ n: BigInt(1) })).toThrow(JcsError);
  });

  it('equals canonicalJson on JSON data, so existing ledger hashes are JCS hashes', () => {
    const samples = [
      { schema_version: '2026-10-15', claims: [{ index: 0, spans: [{ start: 3, end: 9 }], verdict: 'supported' }], z: null, a: [true, false, 1.5, -0, 1e21] },
      JSON.parse('{"€":1,"\\r":2,"ö":[{"y":2,"x":1}]}'),
    ];
    for (const s of samples) {
      expect(jcs(s)).toBe(canonicalJson(s));
      expect(sha256Hex(jcs(s))).toBe(createHash('sha256').update(jcs(s), 'utf8').digest('hex'));
    }
  });
});

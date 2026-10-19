/**
 * JSON Canonicalization Scheme, RFC 8785.
 *
 * The bytes that get hashed and signed (Gate ledger v1, Evidence Passport).
 * RFC 8785 builds on ECMAScript's own JSON serialisation, so in JavaScript it
 * reduces to three rules on top of JSON.stringify:
 *
 *   - object members sorted by their names as arrays of UTF-16 code units
 *     (JavaScript's default string comparison), recursively;
 *   - numbers in ECMAScript Number.prototype.toString form (what
 *     JSON.stringify emits); NaN and ±Infinity are not representable, and -0
 *     serialises as 0;
 *   - strings escaped exactly as JSON.stringify does; input must be I-JSON,
 *     so a lone surrogate is an error rather than an escape.
 *
 * Members whose value is `undefined` are omitted (they do not exist in JSON);
 * `undefined` inside an array becomes null, as in JSON.stringify. On data
 * that came from JSON the output equals canonicalJson() in hash.ts; the tests
 * check both against the RFC's vectors.
 */

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

export class JcsError extends Error {}

function str(s: string): string {
  if (LONE_SURROGATE.test(s)) throw new JcsError('JCS: string contains a lone surrogate (not I-JSON)');
  return JSON.stringify(s);
}

export function jcs(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value)) throw new JcsError('JCS: NaN and Infinity are not representable');
      return JSON.stringify(value);
    case 'string':
      return str(value);
    case 'object': {
      if (Array.isArray(value)) return `[${value.map((v) => (v === undefined || typeof v === 'function' || typeof v === 'symbol' ? 'null' : jcs(v))).join(',')}]`;
      const toJSON = (value as { toJSON?: () => unknown }).toJSON;
      if (typeof toJSON === 'function') return jcs(toJSON.call(value));
      const keys = Object.keys(value as object)
        .filter((k) => {
          const v = (value as Record<string, unknown>)[k];
          return v !== undefined && typeof v !== 'function' && typeof v !== 'symbol';
        })
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      return `{${keys.map((k) => `${str(k)}:${jcs((value as Record<string, unknown>)[k])}`).join(',')}}`;
    }
    case 'bigint':
      throw new JcsError('JCS: BigInt is not representable');
    default:
      throw new JcsError(`JCS: ${typeof value} is not representable`);
  }
}

/** UTF-8 bytes of the canonical form: what gets hashed and signed. */
export function jcsBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(jcs(value));
}

"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/main.ts
var import_node_fs6 = require("node:fs");
var import_node_path4 = require("node:path");

// src/gate/github.ts
var import_node_fs = require("node:fs");
var import_node_zlib = require("node:zlib");

// ../verify-policy/src/scope.ts
var ASSURANCE_SCOPE = "evidence support for supplied sources only; not a compliance certification, legal assessment, or determination of real-world truth.";
var ASSURANCE_SCOPE_SENTENCE = "Assurance scope: evidence support for supplied sources only; not a compliance certification, legal assessment, or determination of real-world truth.";
var FRAMEWORK_DISCLAIMER = "Informational mapping; not a certification or compliance determination.";
var SIGNATURE_WORDING = "cryptographically signed by the configured verifier key";

// ../verify-policy/src/taxonomy.ts
var RULE_IDS = ["XYN-001", "XYN-002", "XYN-003", "XYN-004", "XYN-005", "XYN-006"];
var NIST_SOURCES = {
  framework: "NIST AI 600-1 (Generative AI Profile)",
  reference: "MS-2.5-003",
  title: "Review and verify sources and citations in GAI system outputs during pre-deployment risk measurement and ongoing monitoring activities",
  disclaimer: FRAMEWORK_DISCLAIMER
};
var OWASP_MISINFO = {
  framework: "OWASP Top 10 for LLM Applications (2025)",
  reference: "LLM09:2025",
  title: "Misinformation",
  disclaimer: FRAMEWORK_DISCLAIMER
};
var RULES = {
  "XYN-001": {
    id: "XYN-001",
    name: "contradicted-claim",
    short: "Contradicted claim",
    description: `A confirmed span of a supplied source conflicts with the claim: a different number, unit, date, entity or polarity, broken arithmetic, or a newer passage that supersedes it. ${ASSURANCE_SCOPE_SENTENCE}`,
    help: "Restate the value the source gives, or update the source if it is out of date. The finding shows the exact source passage.",
    default_decision: "block when the claim is material",
    frameworks: [NIST_SOURCES, OWASP_MISINFO]
  },
  "XYN-002": {
    id: "XYN-002",
    name: "dropped-or-conflicting-qualifier",
    short: "Dropped or conflicting qualifier",
    description: `A material condition, exception, time window, scope or modality that the source attaches to the claim is missing from the claim or conflicts with it ("may" restated as "will"). ${ASSURANCE_SCOPE_SENTENCE}`,
    help: 'Keep the condition the source states ("for annual plans", "within 30 days", "may"). The finding names the qualifier and its source passage.',
    default_decision: "block when the claim is material",
    frameworks: [NIST_SOURCES, OWASP_MISINFO]
  },
  "XYN-003": {
    id: "XYN-003",
    name: "unsupported-claim",
    short: "Unsupported claim",
    description: `No supplied source adequately supports the claim, including when a model-proposed quote does not exist in the source, or when the answer no longer makes an expected material claim. ${ASSURANCE_SCOPE_SENTENCE}`,
    help: "Remove the claim, add the passage that supports it to the approved sources, or update the golden set if the expected claim changed on purpose.",
    default_decision: "block when critical or high; otherwise warn",
    frameworks: [NIST_SOURCES, OWASP_MISINFO]
  },
  "XYN-004": {
    id: "XYN-004",
    name: "citation-problem",
    short: "Missing or wrong citation",
    description: `Citations are required and a material claim has none, or cites a passage that does not support it. ${ASSURANCE_SCOPE_SENTENCE}`,
    help: "Cite the passage that supports the claim.",
    default_decision: "block when citations are required and the claim is material",
    frameworks: [NIST_SOURCES]
  },
  "XYN-005": {
    id: "XYN-005",
    name: "unresolved-claim",
    short: "Unresolved claim",
    description: `The supplied sources cannot resolve the claim under the rules (a comparison with things the sources do not describe, a prediction, conflicting sources), or the claim split was low-confidence. ${ASSURANCE_SCOPE_SENTENCE}`,
    help: "Supply a source that settles the claim, or soften it. Treated as treat_unverifiable_as (warn by default).",
    default_decision: "warn (treat_unverifiable_as)",
    frameworks: [OWASP_MISINFO]
  },
  "XYN-006": {
    id: "XYN-006",
    name: "run-integrity",
    short: "Check could not complete",
    description: `The check could not complete: a source file changed or is missing, the application endpoint timed out or failed past the retry policy, the verifier failed, the quota was exhausted, or too many claims stayed unresolved. A hold is never treated as a pass. ${ASSURANCE_SCOPE_SENTENCE}`,
    help: "Fix the cause and re-run. Holds cannot be overridden.",
    default_decision: "hold",
    frameworks: []
  }
};

// ../verify-policy/src/defaults.ts
var MATERIALITY = ["critical", "high", "medium", "low"];
function isMaterial(m) {
  return m !== "low";
}
var DEFAULT_POLICY = Object.freeze({
  max_contradicted: { critical: 0, high: 0, medium: 0 },
  max_unsupported: { critical: 0, high: 0 },
  min_material_supported_ratio: null,
  require_citations: false,
  treat_unverifiable_as: "warn",
  fail_on_material_qualifier_loss: true,
  model_findings: "warn",
  missing_expected_claim: "warn",
  max_unresolved_ratio: 0.5,
  enforcement: "report_only",
  overrides: { enabled: true, label: "verify-gate:override", require_team: null }
});
var KEYS = new Set(Object.keys(DEFAULT_POLICY));
function resolvePolicy(input2) {
  const errors = [];
  const p = input2 ?? {};
  if (typeof p !== "object" || Array.isArray(p)) return { policy: clone(DEFAULT_POLICY), errors: ["policy must be a mapping"] };
  for (const k of Object.keys(p)) if (!KEYS.has(k)) errors.push(`policy.${k} is not a known setting`);
  const out = clone(DEFAULT_POLICY);
  const counts = (key) => {
    const v = p[key];
    if (v === void 0) return;
    if (!v || typeof v !== "object" || Array.isArray(v)) {
      errors.push(`policy.${key} must map materiality to a count`);
      return;
    }
    const next = {};
    for (const [m, n] of Object.entries(v)) {
      if (!MATERIALITY.includes(m)) errors.push(`policy.${key}.${m}: materiality is one of ${MATERIALITY.join(", ")}`);
      else if (n === null) continue;
      else if (!Number.isInteger(n) || n < 0) errors.push(`policy.${key}.${m} must be a non-negative integer or null`);
      else next[m] = n;
    }
    out[key] = next;
  };
  counts("max_contradicted");
  counts("max_unsupported");
  if (p.min_material_supported_ratio !== void 0) {
    const v = p.min_material_supported_ratio;
    if (v !== null && (typeof v !== "number" || v < 0 || v > 1)) errors.push("policy.min_material_supported_ratio must be between 0 and 1, or null");
    else out.min_material_supported_ratio = v;
  }
  const bool2 = (k) => {
    if (p[k] === void 0) return;
    if (typeof p[k] !== "boolean") errors.push(`policy.${k} must be true or false`);
    else out[k] = p[k];
  };
  bool2("require_citations");
  bool2("fail_on_material_qualifier_loss");
  const oneOf = (k, allowed) => {
    if (p[k] === void 0) return;
    if (!allowed.includes(p[k])) errors.push(`policy.${k} must be one of ${allowed.join(", ")}`);
    else out[k] = p[k];
  };
  oneOf("treat_unverifiable_as", ["warn", "block", "hold", "pass"]);
  oneOf("model_findings", ["warn", "block"]);
  oneOf("missing_expected_claim", ["warn", "block"]);
  oneOf("enforcement", ["report_only", "enforce"]);
  if (p.max_unresolved_ratio !== void 0) {
    const v = p.max_unresolved_ratio;
    if (typeof v !== "number" || v < 0 || v > 1) errors.push("policy.max_unresolved_ratio must be between 0 and 1");
    else out.max_unresolved_ratio = v;
  }
  if (p.overrides !== void 0) {
    const o = p.overrides;
    if (!o || typeof o !== "object") errors.push("policy.overrides must be a mapping");
    else {
      for (const k of Object.keys(o)) if (!["enabled", "label", "require_team"].includes(k)) errors.push(`policy.overrides.${k} is not a known setting`);
      if (o.enabled !== void 0) {
        if (typeof o.enabled !== "boolean") errors.push("policy.overrides.enabled must be true or false");
        else out.overrides.enabled = o.enabled;
      }
      if (o.label !== void 0) {
        if (typeof o.label !== "string" || !o.label.trim()) errors.push("policy.overrides.label must be a label name");
        else out.overrides.label = o.label.trim();
      }
      if (o.require_team !== void 0) {
        if (o.require_team !== null && (typeof o.require_team !== "string" || !/^[\w.-]+\/[\w.-]+$/.test(o.require_team))) errors.push('policy.overrides.require_team must be "org/team-slug" or null');
        else out.overrides.require_team = o.require_team;
      }
    }
  }
  return { policy: out, errors };
}
function clone(p) {
  return { ...p, max_contradicted: { ...p.max_contradicted }, max_unsupported: { ...p.max_unsupported }, overrides: { ...p.overrides } };
}

// ../verify-policy/src/version.ts
var POLICY_VERSION = "0.2.0";

// ../verify-core/src/rules-version.ts
var RULES_VERSION = "2.1.0";

// ../verify-core/src/contract.ts
var SCHEMA_VERSION = "2026-10-15";
var CORE_VERSION = "1.0.0";

// ../verify-core/src/hash.ts
var K = new Uint32Array([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]);
function utf8(input2) {
  return new TextEncoder().encode(input2);
}
function sha256Hex(input2) {
  const bytes = typeof input2 === "string" ? utf8(input2) : input2;
  const bitLen = bytes.length * 8;
  const padded = new Uint8Array(bytes.length + 9 + 63 >> 6 << 6);
  padded.set(bytes);
  padded[bytes.length] = 128;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bitLen / 4294967296));
  view.setUint32(padded.length - 4, bitLen >>> 0);
  const h3 = new Uint32Array([
    1779033703,
    3144134277,
    1013904242,
    2773480762,
    1359893119,
    2600822924,
    528734635,
    1541459225
  ]);
  const w = new Uint32Array(64);
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const a2 = w[i - 15];
      const b2 = w[i - 2];
      const s0 = (a2 >>> 7 | a2 << 25) ^ (a2 >>> 18 | a2 << 14) ^ a2 >>> 3;
      const s1 = (b2 >>> 17 | b2 << 15) ^ (b2 >>> 19 | b2 << 13) ^ b2 >>> 10;
      w[i] = w[i - 16] + s0 + w[i - 7] + s1 >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h3;
    for (let i = 0; i < 64; i++) {
      const S1 = (e >>> 6 | e << 26) ^ (e >>> 11 | e << 21) ^ (e >>> 25 | e << 7);
      const ch = e & f ^ ~e & g;
      const t1 = hh + S1 + ch + K[i] + w[i] >>> 0;
      const S0 = (a >>> 2 | a << 30) ^ (a >>> 13 | a << 19) ^ (a >>> 22 | a << 10);
      const maj = a & b ^ a & c ^ b & c;
      const t2 = S0 + maj >>> 0;
      hh = g;
      g = f;
      f = e;
      e = d + t1 >>> 0;
      d = c;
      c = b;
      b = a;
      a = t1 + t2 >>> 0;
    }
    h3[0] = h3[0] + a >>> 0;
    h3[1] = h3[1] + b >>> 0;
    h3[2] = h3[2] + c >>> 0;
    h3[3] = h3[3] + d >>> 0;
    h3[4] = h3[4] + e >>> 0;
    h3[5] = h3[5] + f >>> 0;
    h3[6] = h3[6] + g >>> 0;
    h3[7] = h3[7] + hh >>> 0;
  }
  let out = "";
  for (const word of h3) out += word.toString(16).padStart(8, "0");
  return out;
}

// ../verify-core/src/jcs.ts
var LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
var JcsError = class extends Error {
};
function str(s) {
  if (LONE_SURROGATE.test(s)) throw new JcsError("JCS: string contains a lone surrogate (not I-JSON)");
  return JSON.stringify(s);
}
function jcs(value) {
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) throw new JcsError("JCS: NaN and Infinity are not representable");
      return JSON.stringify(value);
    case "string":
      return str(value);
    case "object": {
      if (Array.isArray(value)) return `[${value.map((v) => v === void 0 || typeof v === "function" || typeof v === "symbol" ? "null" : jcs(v)).join(",")}]`;
      const toJSON = value.toJSON;
      if (typeof toJSON === "function") return jcs(toJSON.call(value));
      const keys = Object.keys(value).filter((k) => {
        const v = value[k];
        return v !== void 0 && typeof v !== "function" && typeof v !== "symbol";
      }).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
      return `{${keys.map((k) => `${str(k)}:${jcs(value[k])}`).join(",")}}`;
    }
    case "bigint":
      throw new JcsError("JCS: BigInt is not representable");
    default:
      throw new JcsError(`JCS: ${typeof value} is not representable`);
  }
}
function jcsBytes(value) {
  return new TextEncoder().encode(jcs(value));
}

// ../verify-core/src/normalize.ts
var SINGLE_QUOTES = /* @__PURE__ */ new Set(["\u2018", "\u2019", "\u201A", "\u201B", "\u2032", "`", "\xB4"]);
var DOUBLE_QUOTES = /* @__PURE__ */ new Set(["\u201C", "\u201D", "\u201E", "\u201F", "\u2033", "\xAB", "\xBB"]);
var DASHES = /* @__PURE__ */ new Set(["\u2010", "\u2011", "\u2012", "\u2013", "\u2014", "\u2015", "\u2212", "\uFE58", "\uFE63", "\uFF0D"]);
var REMOVED = /* @__PURE__ */ new Set(["\u200B", "\u200C", "\u200D", "\u2060", "\uFEFF", "\xAD"]);
function keepUnfolded(cp) {
  return cp === 178 || cp === 179 || cp === 185 || // superscript two, three, one
  cp >= 188 && cp <= 190 || // vulgar fractions ¼ ½ ¾
  cp >= 8304 && cp <= 8351 || // superscripts and subscripts
  cp >= 8528 && cp <= 8587 || // number forms (fractions, roman numerals)
  cp === 8260 || // fraction slash
  cp >= 9312 && cp <= 9471 || // enclosed alphanumerics (①, ⑴, ⒈ …)
  cp >= 10102 && cp <= 10131 || // dingbat circled digits
  cp >= 12881 && cp <= 12895 || cp >= 12977 && cp <= 12991 || // circled numbers 21–50
  cp >= 127232 && cp <= 127244;
}
var COMBINING = new RegExp("\\p{M}", "u");
function isSpace(ch) {
  return /\s/.test(ch) || ch === " " || ch === " " || ch === " ";
}
function graphemes(input2) {
  const out = [];
  let i = 0;
  while (i < input2.length) {
    const start = i;
    const cp = input2.codePointAt(i);
    i += cp > 65535 ? 2 : 1;
    while (i < input2.length) {
      const next = input2.codePointAt(i);
      const ch = String.fromCodePoint(next);
      if (!COMBINING.test(ch)) break;
      i += next > 65535 ? 2 : 1;
    }
    out.push({ text: input2.slice(start, i), start, end: i });
  }
  return out;
}
function fold(g) {
  const cp = g.codePointAt(0);
  if (keepUnfolded(cp)) return g;
  const n = g.normalize("NFKC");
  return n;
}
function normalizeWithMap(input2) {
  const out = [];
  const map = [];
  const ends = [];
  let pendingSpace = -1;
  let pendingEnd = -1;
  const push = (ch, start, end) => {
    out.push(ch);
    map.push(start);
    ends.push(end);
  };
  for (const g of graphemes(input2)) {
    const folded = fold(g.text);
    for (const ch of folded.length ? [...folded] : []) {
      if (REMOVED.has(ch)) continue;
      if (isSpace(ch)) {
        if (pendingSpace < 0) pendingSpace = g.start;
        pendingEnd = g.end;
        continue;
      }
      if (pendingSpace >= 0) {
        if (out.length > 0) push(" ", pendingSpace, pendingEnd);
        pendingSpace = -1;
      }
      if (SINGLE_QUOTES.has(ch)) push("'", g.start, g.end);
      else if (DOUBLE_QUOTES.has(ch)) push('"', g.start, g.end);
      else if (DASHES.has(ch)) push("-", g.start, g.end);
      else if (ch === "\u2026") {
        push(".", g.start, g.end);
        push(".", g.start, g.end);
        push(".", g.start, g.end);
      } else push(ch, g.start, g.end);
    }
  }
  return { text: out.join(""), map, ends };
}
function normalize(input2) {
  return normalizeWithMap(input2).text;
}
var STRIPPABLE = /* @__PURE__ */ new Set([",", ".", ";", ":", "!", "?", "'", '"', "(", ")", "[", "]", "{", "}", "-", "/", "*", "_"]);
function isDigit(ch) {
  return ch !== void 0 && ch >= "0" && ch <= "9";
}
function stripPunctuation(norm2) {
  const out = [];
  const map = [];
  const ends = [];
  const t = norm2.text;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (STRIPPABLE.has(ch) && !(isDigit(t[i - 1]) && isDigit(t[i + 1]))) continue;
    if (ch === " " && (out.length === 0 || out[out.length - 1] === " ")) continue;
    out.push(ch);
    map.push(norm2.map[i]);
    ends.push(norm2.ends[i]);
  }
  while (out.length > 0 && out[out.length - 1] === " ") {
    out.pop();
    map.pop();
    ends.pop();
  }
  return { text: out.join(""), map, ends };
}

// ../verify-core/src/spans.ts
var MIN_QUOTE_CHARS = 8;
var MIN_QUOTE_WORDS = 2;
var MAX_QUOTE_CHARS = 2e3;
function editCap(n) {
  return Math.min(6, Math.max(2, Math.floor(n * 0.04)));
}
function editDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array(b.length + 1);
  let cur = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}
function countOccurrences(hay, needle) {
  let n = 0;
  let i = hay.indexOf(needle);
  while (i >= 0) {
    n++;
    i = hay.indexOf(needle, i + 1);
  }
  return n;
}
function toOriginal(norm2, from, to) {
  return { start: norm2.map[from], end: norm2.ends[to - 1] };
}
function swapFirstCase(s) {
  const first = s[0];
  const lower = first.toLowerCase();
  const upper = first.toUpperCase();
  if (lower === upper) return null;
  return (first === lower ? upper : lower) + s.slice(1);
}
function wordCount(s) {
  return s.split(/\s+/).filter(Boolean).length;
}
function locateQuote(source, rawQuote) {
  const quote = (rawQuote ?? "").trim();
  if (!quote) return { ok: false, reason: "empty" };
  if (quote.length > MAX_QUOTE_CHARS) return { ok: false, reason: "too_long" };
  if (quote.length < MIN_QUOTE_CHARS || wordCount(quote) < MIN_QUOTE_WORDS) return { ok: false, reason: "too_short" };
  const exactAt = source.indexOf(quote);
  if (exactAt >= 0) {
    return {
      ok: true,
      span: {
        start: exactAt,
        end: exactAt + quote.length,
        quote,
        match_type: "exact",
        edit_distance: 0,
        occurrences: countOccurrences(source, quote)
      }
    };
  }
  const ns = normalizeWithMap(source);
  const nq = normalizeWithMap(quote);
  if (!nq.text) return { ok: false, reason: "empty" };
  const candidates = [nq.text, swapFirstCase(nq.text)].filter((c) => c !== null);
  for (const cand of candidates) {
    const at = ns.text.indexOf(cand);
    if (at >= 0) {
      const { start, end } = toOriginal(ns, at, at + cand.length);
      return {
        ok: true,
        span: {
          start,
          end,
          quote: source.slice(start, end),
          match_type: "normalized",
          edit_distance: cand === nq.text ? 0 : 1,
          occurrences: countOccurrences(ns.text, cand)
        }
      };
    }
  }
  const ps = stripPunctuation(ns);
  for (const cand of candidates) {
    const pq = stripPunctuation(normalizeWithMap(cand));
    if (pq.text.length < MIN_QUOTE_CHARS) continue;
    const at = ps.text.indexOf(pq.text);
    if (at < 0) continue;
    const { start, end } = toOriginal(ps, at, at + pq.text.length);
    const matchedNorm = normalizeWithMap(source.slice(start, end)).text;
    const quoteNorm = normalizeWithMap(cand).text.replace(/[.,;:!?'")\]]+$/, "");
    const distance = editDistance(quoteNorm, matchedNorm) + (cand === nq.text ? 0 : 1);
    if (distance > editCap(quoteNorm.length)) return { ok: false, reason: "over_edit_cap" };
    return {
      ok: true,
      span: {
        start,
        end,
        quote: source.slice(start, end),
        match_type: "punctuation_tolerant",
        edit_distance: distance,
        occurrences: countOccurrences(ps.text, pq.text)
      }
    };
  }
  return { ok: false, reason: "not_found" };
}
function spanIsExact(source, span) {
  return Number.isInteger(span.start) && Number.isInteger(span.end) && span.start >= 0 && span.end <= source.length && span.start < span.end && source.slice(span.start, span.end) === span.quote;
}

// ../verify-core/src/sentences.ts
var ABBREVIATIONS = /* @__PURE__ */ new Set([
  "e.g",
  "i.e",
  "etc",
  "vs",
  "mr",
  "mrs",
  "ms",
  "dr",
  "prof",
  "inc",
  "ltd",
  "co",
  "corp",
  "st",
  "no",
  "nos",
  "approx",
  "est",
  "dept",
  "fig",
  "jan",
  "feb",
  "mar",
  "apr",
  "jun",
  "jul",
  "aug",
  "sep",
  "sept",
  "oct",
  "nov",
  "dec",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
  "u.s",
  "u.k",
  "a.m",
  "p.m",
  "min",
  "max",
  "incl",
  "excl",
  "ref",
  "vol",
  "pp",
  "ed",
  "jr",
  "sr",
  "llc",
  "plc"
]);
function isUpperStart(ch) {
  return ch !== void 0 && /[A-Z0-9"'(\[“‘•*\-]/.test(ch);
}
var WS = /[\s\u200b\u200c\u200d\u2060\ufeff]/;
var SP = "[\\s\\u200b\\u200c\\u200d\\u2060\\ufeff]";
function trimRange(text, start, end) {
  while (start < end && WS.test(text[start])) start++;
  while (end > start && WS.test(text[end - 1])) end--;
  if (end <= start) return null;
  return { start, end, text: text.slice(start, end) };
}
function wordBefore(text, i) {
  let j = i - 1;
  while (j >= 0 && /[A-Za-z.]/.test(text[j])) j--;
  return text.slice(j + 1, i).toLowerCase().replace(/\.$/, "");
}
function splitSentences(text) {
  const out = [];
  let start = 0;
  const push = (end) => {
    const r = trimRange(text, start, end);
    if (r) out.push(r);
    start = end;
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\n") {
      const rest = text.slice(i + 1);
      if (/^\s*\n/.test(rest) || /^\s*(?:[-*•]\s|\d+[.)]\s)/.test(rest)) {
        push(i);
        continue;
      }
      const before = text.slice(start, i).trim();
      if (before && !/[.!?:;,]$/.test(before) && /^\s*[A-Z]/.test(rest)) {
        push(i);
      }
      continue;
    }
    if (ch !== "." && ch !== "!" && ch !== "?") continue;
    if (ch === "." && /\d/.test(text[i - 1] ?? "") && /\d/.test(text[i + 1] ?? "")) continue;
    if (ch === "." && text[i + 1] === ".") continue;
    let j = i + 1;
    while (j < text.length && /["')\]”’]/.test(text[j])) j++;
    if (j < text.length && !WS.test(text[j])) continue;
    let k = j;
    while (k < text.length && WS.test(text[k])) k++;
    if (k < text.length && !isUpperStart(text[k])) continue;
    if (ch === ".") {
      const w = wordBefore(text, i);
      if (ABBREVIATIONS.has(w)) continue;
      if (/^[a-z]$/.test(w) && /[A-Z]/.test(text[i - 1] ?? "")) continue;
    }
    push(j);
  }
  push(text.length);
  return out;
}
function sentenceAround(text, start, end, sentences = splitSentences(text)) {
  const hit = sentences.filter((s2) => s2.end > start && s2.start < end);
  if (hit.length === 0) return { start, end, text: text.slice(start, end) };
  const s = hit[0].start;
  const e = hit[hit.length - 1].end;
  return { start: s, end: e, text: text.slice(s, e) };
}
var CLAUSE_BREAK = new RegExp(`;${SP}+|,${SP}+(?:and|but|while|whereas|so|or|yet)${SP}+|${SP}+(?:-|\u2014|\u2013)${SP}+`, "g");
function splitClauses(sentence2) {
  const out = [];
  let last = 0;
  const t = sentence2.text;
  for (const m of t.matchAll(CLAUSE_BREAK)) {
    const idx = m.index ?? 0;
    const r2 = trimRange(t, last, idx);
    if (r2) out.push({ start: sentence2.start + r2.start, end: sentence2.start + r2.end, text: r2.text });
    last = idx + m[0].length;
  }
  const r = trimRange(t, last, t.length);
  if (r) out.push({ start: sentence2.start + r.start, end: sentence2.start + r.end, text: r.text });
  return out.length ? out : [sentence2];
}
var ATTACHING_NEXT = /^(?:this|these|that|the above|such|the offer|the discount|the benefit|the policy|the limit|the fee|the coverage|the credit|the refund)\b[^.]{0,40}\b(?:only|applies|apply|does not apply|do not apply|is limited|are limited|excludes?|is subject|are subject|expires?|ends?)\b|^(?:only|except|exceptions?|excluding|however|note|but)\b/i;
var TRAILING_EXCEPTION_CLAUSE = /^(?:(?:[^\s,;:]+\s+){1,7}(?:are\s+|is\s+)?(?:excluded|not\s+included|not\s+eligible|ineligible)\b|(?:with\s+the\s+exception\s+of|other\s+than|except|excluding|(?:this|it|that)\s+(?:does|do)\s+not\s+apply\s+to|(?:does|do)\s+not\s+apply\s+to|not\s+applicable\s+to)\b)/i;
function clauseContext(text, start, end) {
  const sentences = splitSentences(text);
  const sentence2 = sentenceAround(text, start, end, sentences);
  const clauses = splitClauses(sentence2);
  const hit = clauses.filter((c) => c.end > start && c.start < end);
  let s = hit.length ? hit[0].start : start;
  let e = hit.length ? hit[hit.length - 1].end : end;
  const first = clauses[0];
  if (first && first.start < s && /^(?:if|when|unless|provided|for|only|after|before|during|within|once|as long as|except|subject to|upon|beginning|starting|effective|until|between|while|as of|from)\b/i.test(first.text)) {
    s = first.start;
  }
  if (/\b(?:but|and|or|nor|yet|except|unless|provided)\s*$/i.test(text.slice(start, end))) {
    const next = clauses.find((c) => c.start >= e);
    if (next) e = next.end;
  }
  const nextClause = clauses.find((c) => c.start >= e);
  if (nextClause && TRAILING_EXCEPTION_CLAUSE.test(nextClause.text)) e = nextClause.end;
  const idx = sentences.findIndex((x) => x.start >= sentence2.end);
  if (idx >= 0 && ATTACHING_NEXT.test(sentences[idx].text)) e = sentences[idx].end;
  return { start: s, end: e, text: text.slice(s, e) };
}

// ../verify-core/src/numbers.ts
var MONTHS = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12
};
var MONTH_RE = "Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?";
var SMALL = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  a: 1,
  an: 1,
  single: 1,
  dozen: 12,
  couple: 2
};
var SPELLED_RE = "(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|a|an|single|a dozen|a couple of)(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?(?:\\s+hundred)?";
var SPELLED_COUNT_RE = SPELLED_RE.replace("|a|an|single", "");
function spelledValue(raw) {
  const s = raw.toLowerCase().replace(/^a couple of$/, "couple").replace(/^a dozen$/, "dozen");
  let total = 0;
  let any = false;
  for (const part of s.split(/[- ]+/)) {
    if (part === "hundred") {
      total = (total || 1) * 100;
      any = true;
    } else if (part in SMALL) {
      total += SMALL[part];
      any = true;
    } else if (part !== "of") {
      return null;
    }
  }
  return any ? total : null;
}
var UNIT_TABLE = [
  [/^(?:business|working)[- ]days?$/i, { dimension: "business_days", unit: "business_day", factor: 1 }],
  [/^(?:business|working)[- ]weeks?$/i, { dimension: "business_days", unit: "business_day", factor: 5 }],
  [/^(?:seconds?|secs?)$/i, { dimension: "duration_fixed", unit: "second", factor: 1 }],
  [/^(?:minutes?|mins?)$/i, { dimension: "duration_fixed", unit: "minute", factor: 60 }],
  [/^(?:hours?|hrs?)$/i, { dimension: "duration_fixed", unit: "hour", factor: 3600 }],
  [/^(?:calendar[- ])?days?$/i, { dimension: "duration_fixed", unit: "day", factor: 86400 }],
  [/^weeks?$/i, { dimension: "duration_fixed", unit: "week", factor: 604800 }],
  [/^fortnights?$/i, { dimension: "duration_fixed", unit: "fortnight", factor: 1209600 }],
  [/^months?$/i, { dimension: "duration_calendar", unit: "month", factor: 1 }],
  [/^quarters?$/i, { dimension: "duration_calendar", unit: "quarter", factor: 3 }],
  [/^(?:years?|yrs?)$/i, { dimension: "duration_calendar", unit: "year", factor: 12 }],
  [/^decades?$/i, { dimension: "duration_calendar", unit: "decade", factor: 120 }],
  [/^(?:kb|kilobytes?)$/i, { dimension: "data", unit: "KB", factor: 1 }],
  [/^(?:mb|megabytes?)$/i, { dimension: "data", unit: "MB", factor: 1 }],
  [/^(?:gb|gigabytes?)$/i, { dimension: "data", unit: "GB", factor: 1 }],
  [/^(?:tb|terabytes?)$/i, { dimension: "data", unit: "TB", factor: 1 }]
];
var COUNT_NOUNS = "users?|seats?|members?|licen[cs]es?|devices?|accounts?|projects?|workspaces?|requests?|calls?|messages?|emails?|items?|orders?|days? off|employees?|dependents?|visits?|sessions?|attempts?|transfers?|withdrawals?|transactions?|bags?|pieces?|checks?|credits?|points?|minutes? of|tickets?|times|x|people|persons?|children|adults?|pets?|vehicles?|locations?|stores?|admins?|guests?|invites?|domains?|api keys?|keys?|tokens?|records?|files?|photos?|videos?|cameras?|sensors?|hubs?|rooms?|lines?|numbers?|cards?|payments?|installments?|refills?|prescriptions?|appointments?|copies|copy|reports?|exports?|integrations?|seats? per|webhooks?|endpoints?|regions?|zones?";
function singular(noun) {
  const n = noun.toLowerCase().trim();
  if (n === "people" || n === "persons") return "person";
  if (n === "children") return "child";
  if (n === "times" || n === "x") return "times";
  if (n === "copies") return "copy";
  if (n.endsWith("ies")) return `${n.slice(0, -3)}y`;
  if (n.endsWith("ses") || n.endsWith("xes")) return n.slice(0, -2);
  if (n.endsWith("s") && !n.endsWith("ss")) return n.slice(0, -1);
  return n;
}
function parseNumber(raw) {
  const m = raw.replace(/,/g, "").match(/^(\d+(?:\.\d+)?)\s*(k|m|bn|b|thousand|million|billion)?$/i);
  if (!m) return spelledValue(raw);
  const base2 = Number(m[1]);
  const mult = (m[2] ?? "").toLowerCase();
  const factor = mult === "k" || mult === "thousand" ? 1e3 : mult === "m" || mult === "million" ? 1e6 : mult === "b" || mult === "bn" || mult === "billion" ? 1e9 : 1;
  return base2 * factor;
}
function boundBefore(text, start) {
  const before = text.slice(Math.max(0, start - 28), start).toLowerCase();
  if (/(?:up to|at most|no more than|not more than|a maximum of|maximum of|max(?:imum)?\.?|not to exceed|not exceeding|no later than|within|under|below|less than|fewer than|no longer than)\s*$/.test(before)) return "max";
  if (/(?:at least|no fewer than|no less than|a minimum of|minimum of|min(?:imum)?\.?|more than|over|above|after|exceeding|no sooner than|beyond)\s*$/.test(before)) return "min";
  if (/(?:about|approximately|approx\.?|around|roughly|nearly|almost|~|some)\s*$/.test(before)) return "approx";
  return null;
}
function boundAfter(text, end) {
  const after = text.slice(end, end + 20).toLowerCase();
  if (/^\s*(?:or less|or fewer|or under|max(?:imum)?\b|at most)/.test(after)) return "max";
  if (/^\s*(?:or more|or longer|or greater|or above|\+|minimum\b|at least)/.test(after)) return "min";
  return null;
}
function rateAfter(text, end) {
  const after = text.slice(end, end + 40).toLowerCase();
  const m = after.match(
    /^\s*(?:\/\s*|per\s+|a\s+|an\s+|each\s+|every\s+)(month|mo|year|yr|annum|week|day|hour|user|seat|member|person|device|order|account|employee|transaction|transfer|bag|visit|night|license|unit|item|call|request|gb|mb|tb)\b/
  );
  if (m) {
    const map = { mo: "month", yr: "year", annum: "year" };
    return `per ${map[m[1]] ?? m[1]}`;
  }
  if (/^\s*(?:monthly|a month|\/mo\b)/.test(after)) return "per month";
  if (/^\s*(?:annually|yearly|a year|per year)/.test(after)) return "per year";
  return null;
}
function foldSpaces(text) {
  return text.replace(/[\u00a0\u1680\u2000-\u200d\u2028\u2029\u202f\u205f\u2060\u3000\ufeff]/g, " ");
}
function extractDates(raw) {
  const text = foldSpaces(raw);
  const out = [];
  const taken = [];
  const free = (s, e) => taken.every(([a, b]) => e <= a || s >= b);
  const add = (d) => {
    if (!free(d.start, d.end)) return;
    taken.push([d.start, d.end]);
    out.push(d);
  };
  const month = (s) => MONTHS[s.toLowerCase().replace(/\.$/, "")] ?? MONTHS[s.toLowerCase().slice(0, 3)] ?? null;
  for (const m of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
    add({ raw: m[0], start: m.index, end: m.index + m[0].length, year: +m[1], month: +m[2], day: +m[3], quarter: null, precision: "day", ambiguousOrder: false });
  }
  for (const m of text.matchAll(new RegExp(`\\b(${MONTH_RE})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, "gi"))) {
    add({ raw: m[0], start: m.index, end: m.index + m[0].length, year: m[3] ? +m[3] : null, month: month(m[1]), day: +m[2], quarter: null, precision: "day", ambiguousOrder: false });
  }
  for (const m of text.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_RE})\\.?(?:,?\\s+(\\d{4}))?\\b`, "gi"))) {
    add({ raw: m[0], start: m.index, end: m.index + m[0].length, year: m[3] ? +m[3] : null, month: month(m[2]), day: +m[1], quarter: null, precision: "day", ambiguousOrder: false });
  }
  for (const m of text.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})\b/g)) {
    const a = +m[1];
    const b = +m[2];
    const year = m[3].length === 2 ? 2e3 + +m[3] : +m[3];
    const dayFirst = a > 12;
    add({
      raw: m[0],
      start: m.index,
      end: m.index + m[0].length,
      year,
      month: dayFirst ? b : a,
      day: dayFirst ? a : b,
      quarter: null,
      precision: "day",
      ambiguousOrder: a <= 12 && b <= 12 && a !== b
    });
  }
  for (const m of text.matchAll(new RegExp(`\\b(${MONTH_RE})\\.?,?\\s+(\\d{4})\\b`, "gi"))) {
    add({ raw: m[0], start: m.index, end: m.index + m[0].length, year: +m[2], month: month(m[1]), day: null, quarter: null, precision: "month", ambiguousOrder: false });
  }
  for (const m of text.matchAll(/\b(?:Q([1-4])|(first|second|third|fourth) quarter of)\s*(?:of\s+)?(?:FY\s?)?(\d{4})\b/gi)) {
    const q = m[1] ? +m[1] : ["first", "second", "third", "fourth"].indexOf(m[2].toLowerCase()) + 1;
    add({ raw: m[0], start: m.index, end: m.index + m[0].length, year: +m[3], month: null, day: null, quarter: q, precision: "quarter", ambiguousOrder: false });
  }
  for (const m of text.matchAll(/\b(?:in|since|until|before|after|from|by|of|through|during|throughout|for|year|fiscal|calendar|FY|end of|start of|beginning of)\s+(?:year\s+)?((?:19|20)\d{2})\b/gi)) {
    const yStart = m.index + m[0].length - 4;
    add({ raw: m[1], start: yStart, end: yStart + 4, year: +m[1], month: null, day: null, quarter: null, precision: "year", ambiguousOrder: false });
  }
  return out.sort((a, b) => a.start - b.start);
}
var UNIT_WORDS = "(?:business|working)(?:-|\\s+)days?|(?:business|working)(?:-|\\s+)weeks?|calendar(?:-|\\s+)days?|seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?|fortnights?|months?|quarters?|years?|yrs?|decades?|kb|mb|gb|tb|kilobytes?|megabytes?|gigabytes?|terabytes?";
function extractQuantities(raw, dates = extractDates(raw)) {
  const text = foldSpaces(raw);
  const out = [];
  const taken = dates.map((d) => [d.start, d.end]);
  const free = (s, e) => taken.every(([a, b]) => e <= a || s >= b);
  const add = (q) => {
    if (!free(q.start, q.end)) return;
    taken.push([q.start, q.end]);
    out.push(q);
  };
  const NUM = "\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?";
  for (const m of text.matchAll(new RegExp(`(?:(US\\$|\\$|\u20AC|\xA3|USD|EUR|GBP|CAD|AUD)\\s?(${NUM})(\\s?(?:k|m|bn|thousand|million|billion)\\b)?)|(?:\\b(${NUM})\\s?(dollars?|euros?|pounds?|cents?|USD|EUR|GBP)\\b)`, "gi"))) {
    const sym = (m[1] ?? m[5] ?? "").toUpperCase();
    const unit = sym.startsWith("\u20AC") || sym.startsWith("EUR") ? "EUR" : sym.startsWith("\xA3") || sym.startsWith("POUND") || sym === "GBP" ? "GBP" : sym === "CAD" ? "CAD" : sym === "AUD" ? "AUD" : "USD";
    const written = parseNumber(`${m[2] ?? m[4]}${(m[3] ?? "").trim()}`);
    if (written === null) continue;
    const value = /^cents?$/i.test(m[5] ?? "") ? written / 100 : written;
    const start = m.index;
    const end = start + m[0].length;
    add({ raw: m[0], start, end, value, written, dimension: "currency", unit, bound: boundBefore(text, start) ?? boundAfter(text, end) ?? "exact", rate: rateAfter(text, end) });
  }
  for (const m of text.matchAll(new RegExp(`\\b(${NUM})\\s?(%|percent\\b|per cent\\b|pct\\b)`, "gi"))) {
    const written = parseNumber(m[1]);
    if (written === null) continue;
    const start = m.index;
    const end = start + m[0].length;
    add({ raw: m[0], start, end, value: written, written, dimension: "percent", unit: "%", bound: boundBefore(text, start) ?? boundAfter(text, end) ?? "exact", rate: rateAfter(text, end) });
  }
  for (const m of text.matchAll(new RegExp(`\\b(?:between\\s+)?(${NUM}|${SPELLED_RE})\\s*(?:-|\u2013|\u2014|to|and|through)\\s*(${NUM}|${SPELLED_RE})[\\s-]*(${UNIT_WORDS})\\b`, "gi"))) {
    const def = UNIT_TABLE.find(([re]) => re.test(m[3].replace(/\s+/g, " ")))?.[1];
    const lo = parseNumber(m[1]);
    const hi = parseNumber(m[2]);
    if (!def || lo === null || hi === null) continue;
    const start = m.index;
    const end = start + m[0].length;
    if (!free(start, end)) continue;
    const rate = rateAfter(text, end);
    taken.push([start, end]);
    out.push({ raw: m[0], start, end, value: lo * def.factor, written: lo, dimension: def.dimension, unit: def.unit, bound: "range_low", rate });
    out.push({ raw: m[0], start, end, value: hi * def.factor, written: hi, dimension: def.dimension, unit: def.unit, bound: "range_high", rate });
  }
  for (const m of text.matchAll(new RegExp(`\\b(${NUM}|${SPELLED_RE})[\\s-]*(${UNIT_WORDS})\\b`, "gi"))) {
    const def = UNIT_TABLE.find(([re]) => re.test(m[2].replace(/\s+/g, " ")))?.[1];
    const written = parseNumber(m[1]);
    if (!def || written === null) continue;
    const start = m.index;
    const end = start + m[0].length;
    add({ raw: m[0], start, end, value: written * def.factor, written, dimension: def.dimension, unit: def.unit, bound: boundBefore(text, start) ?? boundAfter(text, end) ?? "exact", rate: rateAfter(text, end) });
  }
  for (const m of text.matchAll(/\b(\d{1,2})(?::(\d{2}))?\s?(a\.?m\.?|p\.?m\.?)(?=\W|$)|\b([01]?\d|2[0-3]):([0-5]\d)\b/gi)) {
    let h3 = Number(m[1] ?? m[4]);
    const min = Number(m[2] ?? m[5] ?? 0);
    const ap = (m[3] ?? "").toLowerCase();
    if (ap.startsWith("p") && h3 < 12) h3 += 12;
    if (ap.startsWith("a") && h3 === 12) h3 = 0;
    const start = m.index;
    const end = start + m[0].length;
    add({ raw: m[0], start, end, value: h3 * 60 + min, written: h3 * 60 + min, dimension: "clock", unit: "minute_of_day", bound: boundBefore(text, start) ?? "exact", rate: null });
  }
  for (const m of text.matchAll(new RegExp(`\\b(${NUM}|${SPELLED_COUNT_RE})\\s*(?:additional\\s+|extra\\s+|free\\s+|concurrent\\s+|active\\s+|checked\\s+|carry-on\\s+|standard\\s+|paid\\s+)?(${COUNT_NOUNS})\\b`, "gi"))) {
    const written = parseNumber(m[1]);
    if (written === null) continue;
    const start = m.index;
    const end = start + m[0].length;
    add({ raw: m[0], start, end, value: written, written, dimension: "count", unit: singular(m[2]), bound: boundBefore(text, start) ?? boundAfter(text, end) ?? "exact", rate: rateAfter(text, end) });
  }
  for (const m of text.matchAll(new RegExp(`(?<![\\w.])(${NUM})(?![\\w%])`, "g"))) {
    const written = parseNumber(m[1]);
    if (written === null) continue;
    const start = m.index;
    const end = start + m[0].length;
    add({ raw: m[0], start, end, value: written, written, dimension: "plain", unit: null, bound: boundBefore(text, start) ?? boundAfter(text, end) ?? "exact", rate: rateAfter(text, end) });
  }
  return out.sort((a, b) => a.start - b.start || (a.bound === "range_low" ? -1 : 1));
}
function compareQuantities(a, b) {
  if (a.dimension !== b.dimension) return "incomparable";
  if (a.dimension === "data" && a.unit !== b.unit) return "incomparable";
  if (a.dimension === "currency" && a.unit !== b.unit) return "incomparable";
  if (a.dimension === "count" && a.unit !== b.unit) return "incomparable";
  return Math.abs(a.value - b.value) <= 1e-9 * Math.max(1, Math.abs(a.value)) ? "equal" : "conflict";
}
function compareDates(claim, source) {
  const fields = ["year", "quarter", "month", "day"];
  const qOf = (d) => d.quarter ?? (d.month ? Math.ceil(d.month / 3) : null);
  let claimExtra = false;
  let sourceExtra = false;
  for (const f of fields) {
    const a = f === "quarter" ? qOf(claim) : claim[f];
    const b = f === "quarter" ? qOf(source) : source[f];
    if (a !== null && b !== null && a !== b) return "conflict";
    if (a !== null && b === null) claimExtra = true;
    if (a === null && b !== null) sourceExtra = true;
  }
  if (claimExtra && !sourceExtra) return "claim_more_precise";
  if (sourceExtra && !claimExtra) return "claim_less_precise";
  if (claimExtra && sourceExtra) return "claim_more_precise";
  return "equal";
}
function dayNumber(d) {
  return Math.floor(Date.UTC(d.year, d.month - 1, d.day) / 864e5);
}

// ../verify-core/src/text.ts
var STOPWORDS = /* @__PURE__ */ new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "of",
  "in",
  "on",
  "at",
  "to",
  "for",
  "from",
  "by",
  "with",
  "as",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "am",
  "it",
  "its",
  "this",
  "that",
  "these",
  "those",
  "there",
  "here",
  "their",
  "they",
  "them",
  "you",
  "your",
  "yours",
  "we",
  "our",
  "us",
  "i",
  "my",
  "me",
  "he",
  "she",
  "his",
  "her",
  "him",
  "which",
  "who",
  "whom",
  "whose",
  "what",
  "will",
  "would",
  "shall",
  "should",
  "can",
  "could",
  "may",
  "might",
  "must",
  "do",
  "does",
  "did",
  "have",
  "has",
  "had",
  "so",
  "than",
  "then",
  "also",
  "into",
  "onto",
  "about",
  "per",
  "via",
  "any",
  "all",
  "each",
  "every",
  "such",
  "other",
  "more",
  "most",
  "some",
  "only",
  "just",
  "very",
  "up",
  "out",
  "over",
  "under",
  "within",
  "if",
  "when",
  "while",
  "after",
  "before",
  "until",
  "unless",
  "not",
  "no",
  "yes",
  "get",
  "gets",
  "got",
  "one",
  "both",
  "either",
  "neither",
  "nor",
  "own",
  "same",
  "too",
  "how",
  "where",
  "why",
  "because",
  "during",
  "through",
  "between",
  "against",
  "above",
  "below",
  "again",
  "further",
  "once",
  "any",
  "well",
  "even",
  "still"
]);
function words(text) {
  return (normalize(text).toLowerCase().match(/[a-z0-9]+(?:'[a-z]+)?/g) ?? []).map((w) => w.replace(/'s$/, ""));
}
function stem(word) {
  let w = word.toLowerCase();
  if (w.length <= 3 || /^\d/.test(w)) return w;
  for (const [suffix, min] of [
    ["ations", 5],
    ["ation", 5],
    ["ments", 5],
    ["ment", 5],
    ["ingly", 5],
    ["ing", 4],
    ["edly", 5],
    ["ies", 4],
    ["ied", 4],
    ["ed", 4],
    ["es", 4],
    ["ly", 4],
    ["s", 3]
  ]) {
    if (w.endsWith(suffix) && w.length - suffix.length >= min - 1) {
      w = w.slice(0, -suffix.length);
      if (suffix === "ies" || suffix === "ied") w += "y";
      break;
    }
  }
  return w.replace(/(.)\1$/, "$1");
}
var SYNONYMS = {
  buy: "purchas",
  bought: "purchas",
  purchas: "purchas",
  purchase: "purchas",
  terminat: "cancel",
  terminate: "cancel",
  cancel: "cancel",
  reimburs: "refund",
  reimburse: "refund",
  refund: "refund",
  client: "customer",
  subscriber: "customer",
  customer: "customer",
  obtain: "receiv",
  receiv: "receiv",
  receive: "receiv",
  ask: "request",
  request: "request",
  begin: "start",
  commenc: "start",
  commence: "start",
  start: "start",
  cost: "price",
  pric: "price",
  price: "price",
  staff: "employee",
  staf: "employee",
  worker: "employee",
  employe: "employee",
  employee: "employee",
  complimentary: "free",
  free: "free",
  permit: "allow",
  allow: "allow",
  need: "requir",
  requir: "requir",
  require: "requir",
  yearly: "annual",
  annual: "annual",
  monthly: "month",
  month: "month"
};
function canonical(stemmed) {
  return SYNONYMS[stemmed] ?? stemmed;
}
function contentStems(text) {
  return words(text).filter((w) => !STOPWORDS.has(w) && w.length > 1).map((w) => canonical(stem(w)));
}
function coverage(needle, hay) {
  const n = Array.isArray(needle) ? needle : contentStems(needle);
  if (n.length === 0) return 1;
  const h3 = new Set(Array.isArray(hay) ? hay : contentStems(hay));
  let hit = 0;
  for (const w of n) if (h3.has(w)) hit++;
  return hit / n.length;
}

// ../verify-core/src/qualifiers.ts
var BOUNDARY = /[,;.:!?()]|\s(?:and|but|or|which|so)\s/i;
function phraseFrom(text, start, max = 110, protectedRanges = []) {
  const rest = text.slice(start, start + max);
  let cut = rest.length;
  const re = new RegExp(BOUNDARY.source, "gi");
  for (const m of rest.matchAll(re)) {
    const i = m.index ?? 0;
    if (i < 3) continue;
    if (/[,.]/.test(m[0]) && /\d/.test(rest[i - 1] ?? "") && /\d/.test(rest[i + 1] ?? "")) continue;
    const abs = start + i;
    if (protectedRanges.some(([a, b]) => abs > a && abs < b)) continue;
    cut = i;
    break;
  }
  const phrase = rest.slice(0, cut).trimEnd();
  return { end: start + phrase.length, text: phrase };
}
var CONDITION_TRIGGERS = [
  "if and only if",
  "only if",
  "only when",
  "only after",
  "only before",
  "only for",
  "only to",
  "only on",
  "only in",
  "only with",
  "only during",
  "only within",
  "only once",
  "provided that",
  "providing that",
  "as long as",
  "so long as",
  "on condition that",
  "in the event that",
  "in case of",
  "subject to",
  "except for",
  "except when",
  "except if",
  "except",
  "excluding",
  "other than",
  "but not",
  "unless",
  "with the exception of",
  "does not apply to",
  "do not apply to",
  "doesn't apply to",
  "don't apply to",
  "not applicable to",
  "exclusively for",
  "limited to",
  "restricted to",
  "reserved for",
  "available to",
  "available only to",
  "eligible for",
  "if",
  "when",
  "whenever",
  "upon",
  "requires",
  "require",
  "required",
  "assuming"
];
var CONDITION_RE = new RegExp(
  `\\b(?:${CONDITION_TRIGGERS.map((t) => t.replace(/ /g, "\\s+")).join("|")})\\b|\\bprovided\\b(?!\\s+by\\b)|\\bproviding\\b(?!\\s+(?:a|an|the|you)\\b)|\\bwith\\s+[^,;.]{2,60}?\\s+(?:switched on|switched off|turned on|turned off|enabled|disabled|activated|installed|connected|selected|on file|in place|active)\\b|\\bwith\\s+(?:a|an)\\s+(?:valid|active|paid|verified|current|eligible|qualifying)\\b|\\bwho\\s+(?:have|has|are|is|were|was|enrolled|enroll|joined|signed|purchased|bought|hold|holds|use|uses|live|lives|reside|resides|work|works|subscribe|subscribed|upgraded|registered)\\b|\\bfor\\s+(?:members|customers|users|employees|subscribers|accounts|orders|purchases|plans|those|anyone|people|businesses|teams|students|residents|new|existing|eligible|annual|monthly|yearly|enterprise|business|premium|pro|paid|free|first-time|full-time|part-time|domestic|international|qualifying|verified|active|returning|individual|family|corporate|personal|standard|basic|plus)\\b`,
  "gi"
);
var TRAILING_EXCEPTION_RE = /(?:^|[,;:(]|[.!?]\s|\n)\s*((?:(?!\b(?:and|or|but|which|that|except|unless|if|when)\b)[^\s,;:()!?\n.]+\s+){1,7}(?:are\s+|is\s+)?(?:excluded|not\s+included|not\s+eligible|ineligible)\b[^,;:()!?\n]{0,60})/gi;
var TIME_TRIGGERS = [
  "within",
  "between",
  "during",
  "until",
  "till",
  "through",
  "by",
  "before",
  "after",
  "no later than",
  "not later than",
  "in no event later than",
  "no earlier than",
  "not earlier than",
  "starting",
  "beginning",
  "effective",
  "as of",
  "since",
  "for the first",
  "for the last",
  "for up to",
  "from",
  "prior to",
  "following",
  "ending",
  "expires",
  "expiring"
];
var TIME_RE = new RegExp(`\\b(?:${TIME_TRIGGERS.map((t) => t.replace(/ /g, "\\s+")).join("|")})\\b`, "gi");
var DEADLINE_LEAD = /^(?:no|not|in\s+no\s+event)\s+(?:later|earlier)\s+than\b/i;
var TIME_ANCHOR = /\b(?:\d+(?:st|nd|rd|th)|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|[a-z]+teenth|twentieth|thirtieth|fortieth|fiftieth|sixtieth|ninetieth)\s+(?:business\s+|calendar\s+|banking\s+)?day\b|\b(?:business|calendar|banking)\s+days?\b|\bbilling\s+cycles?\b/i;
var PERIODIC_RE = /\b(?:(?:per|each|every|a|once a|twice a)\s+(?:month|year|billing cycle|calendar year|plan year|week|day|quarter)|annually|monthly|weekly|daily|quarterly|yearly|on weekdays|on weekends|during business hours|business hours|(?:monday|mon)\s*(?:through|to|-|–)\s*(?:friday|fri|saturday|sat))\b/gi;
var SUBJECT_SCOPE_RE = /\b(?:(?:annual|monthly|yearly|enterprise|business|premium|pro|paid|free|basic|standard|team|family|individual|starter|growth|plus)[- ](?:plan|tier)\s+(?:customers|subscribers|members|users|accounts|account holders|holders)|(?:customers|subscribers|members|users|accounts|account holders)\s+(?:on|with|under|in)\s+(?:an?\s+|the\s+)?(?:annual|monthly|yearly|enterprise|business|premium|pro|paid|free|basic|standard|team|family|individual|starter|growth|plus)\s+(?:plans?|tiers?|subscriptions?|accounts?|memberships?)|(?:on|with|under)\s+(?:an?\s+|the\s+)?(?:annual|monthly|yearly|enterprise|business|premium|pro|paid|free|basic|standard|team|family|individual|starter|growth|plus)\s+(?:plans?|tiers?|subscriptions?|memberships?)|(?:new|existing|returning|first-time|business|enterprise|premium|eligible|verified|domestic|international|EU|US|UK|student|nonprofit|non-profit|education|government|full-time|part-time|salaried|hourly|in-network)\s+(?:customers|subscribers|members|users|accounts|account holders|employees|students|patients|travell?ers|passengers|cardholders|staff))\b/gi;
var SCOPE_RE = /\b(?:in|within|across|outside)\s+(?:the\s+)?(?:US|U\.S\.|USA|United States|EU|European Union|EEA|UK|United Kingdom|Canada|Australia|California|New York|Texas|[A-Z][a-z]+ (?:region|state|province|country))\b|\b(?:domestic(?:ally)?|international(?:ly)?|worldwide|nationwide|globally|in-network|out-of-network|in network|out of network|on-site|remote(?:ly)?|in-store|online only|in person)\b|\b(?:most|some|certain|select|selected|many|several|few|eligible|qualifying|participating)\b|\bper\s+(?:user|seat|member|person|device|account|employee|household|order|location|transaction|vehicle|bag|passenger|traveler|dependent)\b/gi;
var UNIVERSAL_SCOPE = /* @__PURE__ */ new Set(["all", "every", "each", "any", "only", "always", "never", "entire", "whole"]);
var NEGATION_RE = /\b(?:not|never|no|none|neither|nor|without|cannot|can't|won't|don't|doesn't|didn't|isn't|aren't|wasn't|weren't|shouldn't|mustn't|hasn't|haven't|hadn't|couldn't|wouldn't|ineligible|unavailable|excluded|prohibited|non-refundable|nonrefundable|non-transferable)\b/gi;
var NOT_NEGATION_RE = /\b(?:no\s+(?:later|earlier|more|fewer|less|sooner|longer)\s+than|not\s+(?:only|exceeding|to\s+exceed|more\s+than|less\s+than|later\s+than)|no\s+longer\s+than)\b/gi;
var MODAL_RE = /\b(?:must|shall|is required to|are required to|required to|have to|has to|need to|needs to|mandatory|may|can|could|might|is allowed to|are allowed to|is permitted to|are permitted to|is eligible to|are eligible to|optional|will|is going to|are going to|should|is recommended|are recommended|recommended)\b/gi;
function modalClass(m) {
  const s = m.toLowerCase();
  if (/must|shall|required|have to|has to|need|mandatory/.test(s)) return "obligation";
  if (/should|recommend/.test(s)) return "recommendation";
  if (/will|going to/.test(s)) return "future";
  return "permission";
}
var ENTITY_RE = /\b(?:[A-Z][a-zA-Z0-9&'-]*(?:\s+(?:of|and|&|for|the)?\s*[A-Z][a-zA-Z0-9&'-]*)*(?:\s+(?:plan|tier|edition|package|subscription|account|card|membership|program|programme|policy|team|portal|app|API|SDK))?|[A-Z]{2,}[a-z]?s?)\b/g;
var ENTITY_STOP = /* @__PURE__ */ new Set([
  "The",
  "A",
  "An",
  "If",
  "When",
  "You",
  "Your",
  "We",
  "Our",
  "It",
  "This",
  "That",
  "These",
  "Those",
  "For",
  "In",
  "On",
  "At",
  "To",
  "From",
  "By",
  "With",
  "Yes",
  "No",
  "Not",
  "All",
  "Any",
  "Each",
  "Every",
  "Some",
  "Most",
  "Only",
  "After",
  "Before",
  "During",
  "Within",
  "Once",
  "Unless",
  "Customers",
  "Users",
  "Members",
  "Employees",
  "Refunds",
  "Orders",
  "Note",
  "However",
  "Also",
  "There",
  "They",
  "Please",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
  "Updated",
  "Effective",
  "As",
  "I",
  "OK",
  "AM",
  "PM",
  "USD",
  "EUR",
  "GBP"
]);
function masked(text) {
  return text.replace(NOT_NEGATION_RE, (m) => " ".repeat(m.length));
}
function negationCount(text) {
  return (masked(text).match(NEGATION_RE) ?? []).length;
}
function extractQualifiers(text) {
  const out = [];
  const dates = extractDates(text);
  const quantities = extractQuantities(text, dates);
  for (const d of dates) out.push({ type: "date", text: d.raw, start: d.start, end: d.end, material: true, date: d });
  for (const q of quantities) {
    if (q.bound === "range_high") continue;
    out.push({ type: "quantity", text: q.raw, start: q.start, end: q.end, material: true, quantity: q });
  }
  const covered = [];
  const overlaps2 = (s, e) => covered.some(([a, b]) => s < b && e > a);
  const valueRanges = [...dates.map((d) => [d.start, d.end]), ...quantities.map((x) => [x.start, x.end])];
  for (const m of text.matchAll(CONDITION_RE)) {
    const start = m.index ?? 0;
    if (overlaps2(start, start + 1)) continue;
    const { end, text: phrase } = phraseFrom(text, start, 110, valueRanges);
    if (words(phrase).length < 2) continue;
    const hasTime = dates.some((d) => d.start >= start && d.end <= end) || quantities.some((q) => q.start >= start && q.end <= end && /duration|business/.test(q.dimension));
    out.push({ type: hasTime && /^(?:within|after|before|until|by)\b/i.test(phrase) ? "time_range" : "condition", text: phrase, start, end, material: true });
    covered.push([start, end]);
  }
  for (const m of text.matchAll(TRAILING_EXCEPTION_RE)) {
    const phrase = (m[1] ?? "").replace(/[.\s]+$/, "");
    const start = (m.index ?? 0) + m[0].indexOf(m[1]);
    const end = start + phrase.length;
    if (overlaps2(start, end) || words(phrase).length < 2) continue;
    out.push({ type: "condition", text: phrase, start, end, material: true });
    covered.push([start, end]);
  }
  for (const m of text.matchAll(/(?:^|[.!?]\s+|\n)((?:With|Under|Using|On|For|In|During|After|Before|Within|Once|Until|From|Between|As of|Starting|Beginning|Effective|Except|Unless|If|When|Provided)\s+[^,.;:\n]{2,90}),/g)) {
    const start = (m.index ?? 0) + m[0].indexOf(m[1]);
    const end = start + m[1].length;
    if (overlaps2(start, end)) continue;
    const hasTime = dates.some((d) => d.start >= start && d.end <= end) || quantities.some((q) => q.start >= start && q.end <= end && /duration|business/.test(q.dimension));
    out.push({ type: hasTime ? "time_range" : "condition", text: m[1], start, end, material: true });
    covered.push([start, end]);
  }
  for (const m of text.matchAll(TIME_RE)) {
    const start = m.index ?? 0;
    if (overlaps2(start, start + 1)) continue;
    const { end, text: phrase } = phraseFrom(text, start, 80, valueRanges);
    const inside = dates.some((d) => d.start >= start && d.end <= end) || quantities.some((q) => q.start >= start && q.end <= end && q.dimension !== "plain") || DEADLINE_LEAD.test(phrase) || TIME_ANCHOR.test(phrase);
    if (!inside) continue;
    out.push({ type: "time_range", text: phrase, start, end, material: true });
    covered.push([start, end]);
  }
  for (const m of text.matchAll(PERIODIC_RE)) {
    const start = m.index ?? 0;
    if (overlaps2(start, start + m[0].length)) continue;
    out.push({ type: "time_range", text: m[0], start, end: start + m[0].length, material: true });
    covered.push([start, start + m[0].length]);
  }
  for (const m of text.matchAll(SUBJECT_SCOPE_RE)) {
    const start = m.index ?? 0;
    if (overlaps2(start, start + m[0].length)) continue;
    out.push({ type: "scope", text: m[0], start, end: start + m[0].length, material: true });
    covered.push([start, start + m[0].length]);
  }
  for (const m of text.matchAll(SCOPE_RE)) {
    const start = m.index ?? 0;
    if (overlaps2(start, start + m[0].length)) continue;
    out.push({ type: "scope", text: m[0], start, end: start + m[0].length, material: true });
  }
  for (const w of words(text)) {
    if (UNIVERSAL_SCOPE.has(w)) {
      const idx = text.toLowerCase().search(new RegExp(`\\b${w}\\b`));
      if (idx >= 0 && !overlaps2(idx, idx + w.length) && !out.some((q) => q.type === "scope" && q.start === idx)) {
        out.push({ type: "scope", text: text.slice(idx, idx + w.length), start: idx, end: idx + w.length, material: false });
      }
    }
  }
  const maskedText = masked(text);
  for (const m of maskedText.matchAll(NEGATION_RE)) {
    const start = m.index ?? 0;
    out.push({ type: "negation", text: text.slice(start, start + m[0].length), start, end: start + m[0].length, material: true });
  }
  for (const m of text.matchAll(MODAL_RE)) {
    const start = m.index ?? 0;
    out.push({ type: "modality", text: m[0], start, end: start + m[0].length, material: true, modality: modalClass(m[0]) });
  }
  for (const m of text.matchAll(ENTITY_RE)) {
    const raw = m[0].trim();
    const first = raw.split(/\s+/)[0];
    if (ENTITY_STOP.has(first) && !raw.includes(" ")) continue;
    const start = m.index ?? 0;
    const sentenceInitial = start === 0 || /[.!?:\n]\s*$/.test(text.slice(Math.max(0, start - 3), start));
    if (sentenceInitial && !raw.includes(" ") && !/^[A-Z]{2,}/.test(raw)) continue;
    const cleaned = ENTITY_STOP.has(first) ? raw.slice(first.length).trim() : raw;
    if (!cleaned || cleaned.length < 2 || /^\d/.test(cleaned)) continue;
    if (dates.some((d) => start < d.end && start + raw.length > d.start)) continue;
    const cStart = start + raw.indexOf(cleaned);
    out.push({ type: "entity", text: cleaned, start: cStart, end: cStart + cleaned.length, material: true });
  }
  return out.sort((a, b) => a.start - b.start);
}
var TRIGGER_WORDS = new Set(
  [...CONDITION_TRIGGERS, ...TIME_TRIGGERS, "with", "who", "for", "valid", "active", "paid"].flatMap((t) => t.split(" ")).concat(["only", "available", "eligible", "apply", "applies"])
);
function phraseStems(text) {
  const dates = extractDates(text);
  const spans = [...dates.map((d) => [d.start, d.end]), ...extractQuantities(text, dates).map((q) => [q.start, q.end])].sort((a, b) => b[0] - a[0]);
  let bare = text;
  for (const [a, b] of spans) bare = bare.slice(0, a) + " " + bare.slice(b);
  return contentStems(bare).filter((s) => !TRIGGER_WORDS.has(s));
}
function row(type, claim, source, status, note, material = true, proposedBy = "code") {
  return { type, claim_text: claim, source_text: source, status, material, note, proposed_by: proposedBy };
}
function valuesIn(text) {
  const dates = extractDates(text);
  return { dates, quantities: extractQuantities(text, dates) };
}
function compareQualifiers(claimText, context, proposed = []) {
  const claimQ = extractQualifiers(claimText);
  const srcQ = extractQualifiers(context);
  const claimVals = valuesIn(claimText);
  const srcVals = valuesIn(context);
  const claimStems = new Set(contentStems(claimText));
  const rows = [];
  let matchedValues = 0;
  let unmatchedValues = 0;
  for (const cq of claimVals.quantities) {
    if (cq.bound === "range_high") continue;
    const same = srcVals.quantities.filter((sq) => compareQuantities(cq, sq) !== "incomparable" || cq.dimension === sq.dimension && cq.unit === sq.unit);
    const equal = same.find((sq) => compareQuantities(cq, sq) === "equal");
    if (equal) {
      matchedValues++;
      const boundNote = boundDrift(cq, equal);
      if (boundNote) rows.push(boundNote);
      const srcRates = ratesAfter(context, equal.end);
      const claimRates = ratesAfter(claimText, cq.end);
      const missingRates = srcRates.filter((r) => !claimRates.includes(r));
      const extraRates = claimRates.filter((r) => !srcRates.includes(r));
      const claimSide = `${cq.raw} ${claimRates.join(" ")}`.trim();
      const sourceSide = `${equal.raw} ${srcRates.join(" ")}`.trim();
      if (extraRates.length && missingRates.length) rows.push(row("quantity", claimSide, sourceSide, "contradicted", "same amount, different rate"));
      else if (extraRates.length) rows.push(row("quantity", claimSide, sourceSide, "ambiguous", "claim adds a rate the source does not state"));
      else if (missingRates.length) rows.push(row("scope", null, missingRates.join(" "), "dropped", "rate in source omitted"));
      else rows.push(row("quantity", cq.raw, equal.raw, "preserved", "same value"));
      continue;
    }
    unmatchedValues++;
    const conflicting = same.find((sq) => compareQuantities(cq, sq) === "conflict");
    if (conflicting && cq.dimension !== "plain") {
      rows.push(row("quantity", cq.raw, conflicting.raw, "contradicted", "different value, same unit"));
    } else {
      rows.push(row("quantity", cq.raw, null, "ambiguous", "value not in source context"));
    }
  }
  for (const cd of claimVals.dates) {
    let best = null;
    for (const sd of srcVals.dates) {
      const c = compareDates(cd, sd);
      if (c === "equal" || c === "claim_less_precise") {
        best = { d: sd, c };
        break;
      }
      if (!best || best.c === "conflict" && c === "claim_more_precise") best = { d: sd, c };
    }
    if (!best) {
      unmatchedValues++;
      rows.push(row("date", cd.raw, null, "ambiguous", "date not in source context"));
    } else if (best.c === "equal" || best.c === "claim_less_precise") {
      matchedValues++;
      rows.push(row("date", cd.raw, best.d.raw, "preserved", best.c === "equal" ? "same date" : "claim is less specific"));
    } else if (best.c === "conflict") {
      unmatchedValues++;
      rows.push(row("date", cd.raw, best.d.raw, "contradicted", "different date"));
    } else {
      unmatchedValues++;
      rows.push(row("date", cd.raw, best.d.raw, "ambiguous", "claim is more specific than source"));
    }
  }
  const sourcePhrases = srcQ.filter((q) => (q.type === "condition" || q.type === "time_range" || q.type === "scope") && q.material).filter((q) => !(q.type === "scope" && /^per\s/i.test(q.text))).map((q) => ({ type: q.type, text: q.text, by: "code" }));
  for (const p of proposed) {
    if (!["condition", "time_range", "scope", "date"].includes(p.type)) continue;
    if (!p.text || !context.includes(p.text)) continue;
    if (sourcePhrases.some((s) => s.text.includes(p.text) || p.text.includes(s.text))) continue;
    sourcePhrases.push({ type: p.type, text: p.text, by: "model" });
  }
  for (const sp of sourcePhrases) {
    const stems = phraseStems(sp.text);
    const vals = valuesIn(sp.text);
    let valueState = "none";
    for (const q of vals.quantities) {
      const cmp = claimVals.quantities.map((cq) => compareQuantities(cq, q));
      if (cmp.includes("equal")) valueState = valueState === "conflict" ? "conflict" : "match";
      else if (cmp.includes("conflict")) valueState = "conflict";
      else if (valueState !== "conflict") valueState = "missing";
    }
    for (const d of vals.dates) {
      const cmp = claimVals.dates.map((cd) => compareDates(cd, d));
      if (cmp.some((c) => c === "equal" || c === "claim_less_precise" || c === "claim_more_precise")) valueState = valueState === "conflict" ? "conflict" : "match";
      else if (cmp.includes("conflict")) valueState = "conflict";
      else if (valueState !== "conflict") valueState = "missing";
    }
    const cov = stems.length ? stems.filter((s) => claimStems.has(s)).length / stems.length : valueState === "match" ? 1 : 0;
    const scopeWord = sp.type === "scope" ? sp.text.toLowerCase() : "";
    if (valueState === "conflict") {
      rows.push(row(sp.type, null, sp.text, "contradicted", "value inside the source qualifier differs", true, sp.by));
    } else if (cov >= 0.7 && valueState !== "missing") {
      rows.push(row(sp.type, sp.text, sp.text, "preserved", "restated in claim", true, sp.by));
    } else if (sp.type === "scope" && /^(?:most|some|certain|select|selected|many|several|few)$/.test(scopeWord) && claimStems.size > 0) {
      rows.push(row("scope", null, sp.text, "dropped", "source limits the scope; claim does not", true, sp.by));
    } else if ((cov >= 0.34 || valueState === "match") && valueState !== "missing") {
      rows.push(row(sp.type, null, sp.text, "ambiguous", valueState === "match" ? "values restated, wording differs" : "partly restated", true, sp.by));
    } else {
      rows.push(row(sp.type, null, sp.text, "dropped", "material qualifier in source, absent from claim", true, sp.by));
    }
  }
  const srcStems = new Set(contentStems(context));
  for (const q of claimQ) {
    if (q.type !== "condition" && q.type !== "time_range" && q.type !== "scope") continue;
    if (!q.material) {
      const w = q.text.toLowerCase();
      if (!words(context).includes(w) && (w === "only" || w === "all" || w === "every" || w === "always" || w === "never")) {
        rows.push(row("scope", q.text, null, "ambiguous", "claim generalises; source does not say this", true));
      }
      continue;
    }
    if (rows.some((r) => r.claim_text === q.text || r.source_text && coverage(q.text, r.source_text) >= 0.7)) continue;
    const stems = phraseStems(q.text);
    const cov = stems.length ? stems.filter((s) => srcStems.has(s)).length / stems.length : 1;
    if (cov < 0.7) rows.push(row(q.type, q.text, null, "ambiguous", "claim adds a qualifier the source context does not state"));
  }
  const cNeg = negationCount(claimText) % 2 === 1;
  const sNeg = negationCount(context) % 2 === 1;
  if (cNeg !== sNeg) {
    rows.push(row("negation", cNeg ? "negated" : "affirmative", sNeg ? "negated" : "affirmative", "ambiguous", "polarity differs from source context"));
  }
  const cMod = claimQ.filter((q) => q.type === "modality").map((q) => q.modality);
  const sMod = srcQ.filter((q) => q.type === "modality").map((q) => q.modality);
  for (const m of new Set(cMod)) {
    if (sMod.length && !sMod.includes(m)) {
      rows.push(row("modality", m ?? null, sMod.join("/"), "ambiguous", "different modality"));
    }
  }
  const ctxLower = context.toLowerCase();
  for (const q of claimQ.filter((x) => x.type === "entity")) {
    if (!ctxLower.includes(q.text.toLowerCase())) {
      rows.push(row("entity", q.text, null, "ambiguous", "entity not in source context"));
    }
  }
  return {
    rows,
    dropped: rows.filter((r) => r.status === "dropped" && r.material),
    contradicted: rows.filter((r) => r.status === "contradicted" && r.material),
    ambiguous: rows.filter((r) => r.status === "ambiguous" && r.material),
    matchedValues,
    unmatchedValues
  };
}
function boundDrift(claim, source) {
  if (claim.bound === source.bound) return null;
  const durational = claim.dimension === "duration_fixed" || claim.dimension === "duration_calendar" || claim.dimension === "business_days";
  const opposite = claim.bound === "max" && source.bound === "min" || claim.bound === "min" && source.bound === "max";
  if (opposite) return row("scope", boundWord(claim), boundWord(source), "contradicted", "opposite bound on the same value");
  if (claim.bound === "exact" && (source.bound === "max" || source.bound === "min" || source.bound === "approx")) {
    return durational ? row("scope", null, boundWord(source), "ambiguous", "source bounds the period; claim states it flat") : row("scope", null, boundWord(source), "dropped", "source bounds the value; claim states it flat");
  }
  return row("scope", boundWord(claim), boundWord(source), "ambiguous", "different bound on the same value");
}
function boundWord(q) {
  return q.bound === "max" ? "at most" : q.bound === "min" ? "at least" : q.bound === "approx" ? "about" : "exactly";
}
function ratesAfter(text, end) {
  const after = text.slice(end, end + 48).toLowerCase();
  const out = [];
  const re = /^\s*(?:\/\s*|per\s+|a\s+|an\s+|each\s+|every\s+)(month|mo|year|yr|annum|week|day|hour|user|seat|member|person|device|order|account|employee|transaction|transfer|bag|visit|night|license|unit|item|call|request)\b/;
  let rest = after;
  for (let i = 0; i < 2; i++) {
    const m = rest.match(re);
    if (!m) break;
    const map = { mo: "month", yr: "year", annum: "year" };
    out.push(`per ${map[m[1]] ?? m[1]}`);
    rest = rest.slice(m[0].length);
  }
  if (!out.length && /^\s*(?:monthly|a month)\b/.test(after)) out.push("per month");
  if (!out.length && /^\s*(?:annually|yearly|a year)\b/.test(after)) out.push("per year");
  return out;
}

// ../verify-core/src/checks.ts
var near = (a, b) => Math.abs(a - b) <= Math.max(0.01, Math.abs(b) * 5e-3);
function check(kind, result, detail) {
  return { kind, result, detail };
}
var TOTAL_CUE = /\b(?:a total of|totals?|totaling|totalling|totalled|totaled|combined total of|adds? up to|comes? to)\s*(?:of\s*)?$/i;
var DIFFERENCE_LEAD = /\b(?:so|which means|meaning|that is|thus|therefore)\b/i;
var DIFFERENCE_TAIL = /^\s*(?:more|fewer|less|extra|additional)\b\s*([a-z]+)?/i;
var YEAR_CUE = /\b(?:a full year|a year|per year|each year|every year|annually|yearly|12 months|twelve months)\b/i;
var sameUnit = (a, b) => a.dimension === b.dimension && a.unit === b.unit && a.rate === b.rate;
var singular2 = (w) => (w ?? "").toLowerCase().replace(/s$/, "");
function claimComputation(raw) {
  const claim = foldSpaces(raw);
  const qs = extractQuantities(claim);
  const money = qs.filter((q) => q.dimension === "currency");
  const pct = qs.filter((q) => q.dimension === "percent");
  const lower = claim.toLowerCase().replace(/\s+/g, " ");
  const gap = (from, to) => claim.slice(from, to).replace(/\s+/g, " ");
  if (pct.length === 1 && money.length === 2 && /\b(?:increase|rise|raise|grow|growth|up|higher|decrease|drop|fall|cut|down|lower|reduction|reduce)\b/.test(lower) && /\bfrom\b/.test(lower)) {
    const [a, b] = money;
    const p = pct[0].value / 100;
    const up = b.value >= a.value;
    const expected = up ? a.value * (1 + p) : a.value * (1 - p);
    const ops = [a.written, pct[0].written];
    return near(expected, b.value) ? { check: check("arithmetic", "pass", `${a.raw} ${up ? "+" : "-"} ${pct[0].raw} = ${b.raw}`), result: b.written, operands: ops } : { check: check("arithmetic", "fail", `${a.raw} ${up ? "+" : "-"} ${pct[0].raw} is ${expected.toFixed(2)}, not ${b.raw}`), result: b.written, operands: ops };
  }
  if (pct.length === 1 && money.length === 2 && /\b(?:off|discount|discounted|savings?|save)\b/.test(lower)) {
    const [a, b] = money[0].value >= money[1].value ? [money[0], money[1]] : [money[1], money[0]];
    const p = pct[0].value / 100;
    const ops = [a.written, pct[0].written];
    if (near(a.value * (1 - p), b.value)) return { check: check("arithmetic", "pass", `${pct[0].raw} off ${a.raw} = ${b.raw}`), result: b.written, operands: ops };
    if (near(a.value * p, b.value)) return { check: check("arithmetic", "pass", `${pct[0].raw} of ${a.raw} = ${b.raw} saved`), result: b.written, operands: ops };
    return { check: check("arithmetic", "fail", `${pct[0].raw} off ${a.raw} is ${(a.value * (1 - p)).toFixed(2)}, not ${b.raw}`), result: b.written, operands: ops };
  }
  const counts = qs.filter((q) => q.dimension === "count" && q.unit !== "times");
  if (counts.length === 1 && money.length === 2 && /\b(?:each|per|apiece|a seat|a user)\b/.test(lower) && /\b(?:total|totals|totaling|totalling|comes to|for a total|in total|altogether|combined|=)\b/.test(lower)) {
    const n = counts[0].value;
    const [unit, total] = money[0].start < money[1].start ? [money[0], money[1]] : [money[1], money[0]];
    const ops = [n, unit.written];
    return near(n * unit.value, total.value) ? { check: check("arithmetic", "pass", `${n} \xD7 ${unit.raw} = ${total.raw}`), result: total.written, operands: ops } : { check: check("arithmetic", "fail", `${n} \xD7 ${unit.raw} is ${(n * unit.value).toFixed(2)}, not ${total.raw}`), result: total.written, operands: ops };
  }
  const valued = qs.filter((q) => q.dimension !== "plain");
  if (valued.length >= 3) {
    const last = valued[valued.length - 1];
    const prev = valued[valued.length - 2];
    const ops = valued.slice(0, -1);
    const joined2 = gap(ops[0].end, prev.start);
    if (ops.every((q) => sameUnit(q, last)) && /\b(?:and|plus)\b/i.test(joined2) && !/\bor\b/i.test(joined2) && TOTAL_CUE.test(gap(prev.end, last.start))) {
      const sum = ops.reduce((a, q) => a + q.value, 0);
      const detail = ops.map((q) => q.raw).join(" + ");
      return near(sum, last.value) ? { check: check("arithmetic", "pass", `${detail} = ${last.raw}`), result: last.written, operands: ops.map((q) => q.written) } : { check: check("arithmetic", "fail", `${detail} is ${round(sum / (last.value / last.written || 1))}, not ${last.raw}`), result: last.written, operands: ops.map((q) => q.written) };
    }
  }
  if (valued.length === 2 && sameUnit(valued[0], valued[1])) {
    const [a, b] = valued;
    const result = qs.find((q) => q.start > b.end && (q.dimension === "plain" || sameUnit(q, a)));
    if (result) {
      const tail = DIFFERENCE_TAIL.exec(gap(result.end, claim.length));
      const unitWord = tail?.[1];
      const unitOk = result.dimension !== "plain" || unitWord !== void 0 && a.unit !== null && singular2(unitWord) === singular2(a.unit);
      if (tail && unitOk && DIFFERENCE_LEAD.test(gap(b.end, result.start))) {
        const diff = Math.abs(a.written - b.written);
        return near(diff, result.written) ? { check: check("arithmetic", "pass", `${b.raw} - ${a.raw} = ${result.raw}`), result: result.written, operands: [a.written, b.written] } : { check: check("arithmetic", "fail", `the difference between ${a.raw} and ${b.raw} is ${round(diff)}, not ${result.raw}`), result: result.written, operands: [a.written, b.written] };
      }
    }
  }
  const between = money.length === 2 ? gap(money[0].end, money[1].start) : "";
  if (money.length === 2 && money[0].rate === "per month" && money[1].rate === null && YEAR_CUE.test(between) && DIFFERENCE_LEAD.test(between) && !/\b(?:discount|discounted|off|save|saving|savings|annual billing|prepay|prepaid)\b/i.test(lower)) {
    const [m, y] = money;
    return near(m.value * 12, y.value) ? { check: check("arithmetic", "pass", `${m.raw} per month \xD7 12 months = ${y.raw}`), result: y.written, operands: [m.written] } : { check: check("arithmetic", "fail", `${m.raw} per month \xD7 12 months is ${(m.value * 12).toFixed(2)}, not ${y.raw}`), result: y.written, operands: [m.written] };
  }
  return null;
}
function claimArithmetic(claim) {
  return claimComputation(claim)?.check ?? null;
}
function recomputeArithmetic(proposal, evidenceText, claimText) {
  const evidenceValues = extractQuantities(evidenceText).map((q) => q.written);
  const missing = proposal.operands.filter((o) => !evidenceValues.some((v) => near(v, o)));
  if (missing.length) return check("arithmetic", "fail", `operand(s) ${missing.join(", ")} not found in the cited evidence`);
  const ops = proposal.operands;
  let value = null;
  switch (proposal.operation) {
    case "sum":
      value = ops.reduce((a, b) => a + b, 0);
      break;
    case "difference":
      value = ops.length === 2 ? ops[0] - ops[1] : null;
      break;
    case "product":
      value = ops.reduce((a, b) => a * b, 1);
      break;
    case "ratio":
      value = ops.length === 2 && ops[1] !== 0 ? ops[0] / ops[1] : null;
      break;
    case "percent_of":
      value = ops.length === 2 ? ops[0] / 100 * ops[1] : null;
      break;
    case "percent_change":
      value = ops.length === 2 && ops[0] !== 0 ? (ops[1] - ops[0]) / ops[0] * 100 : null;
      break;
  }
  if (value === null) return check("arithmetic", "fail", `cannot compute ${proposal.operation} of ${ops.length} operand(s)`);
  if (!near(value, proposal.result)) return check("arithmetic", "fail", `${proposal.operation}(${ops.join(", ")}) = ${round(value)}, not ${proposal.result}`);
  const claimValues = extractQuantities(claimText).map((q) => q.written);
  if (!claimValues.some((v) => near(v, value) || near(Math.abs(v), Math.abs(value)))) {
    return check("arithmetic", "fail", `recomputed ${round(value)} does not appear in the claim`);
  }
  return check("arithmetic", "pass", `${proposal.operation}(${ops.join(", ")}) = ${round(value)}`);
}
function round(v) {
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}
function dateMath(claim, evidence2) {
  const claimDates = extractDates(claim).filter((d) => d.precision === "day" && d.year !== null);
  if (!claimDates.length) return null;
  const evDates = extractDates(evidence2).filter((d) => d.precision === "day" && d.year !== null);
  const durations = extractQuantities(evidence2).filter((q) => q.dimension === "duration_fixed" && q.value % 86400 === 0);
  if (!evDates.length || !durations.length) return null;
  for (const cd of claimDates) {
    const target = dayNumber({ year: cd.year, month: cd.month, day: cd.day });
    for (const ad of evDates) {
      const anchor = dayNumber({ year: ad.year, month: ad.month, day: ad.day });
      for (const dur of durations) {
        const days = dur.value / 86400;
        for (const sign2 of [1, -1]) {
          const diff = Math.abs(anchor + sign2 * days - target);
          if (diff === 0) return check("date_math", "pass", `${ad.raw} ${sign2 > 0 ? "+" : "-"} ${dur.raw} = ${cd.raw}`);
          if (diff === 1) return check("date_math", "inconclusive", `${ad.raw} ${sign2 > 0 ? "+" : "-"} ${dur.raw} is one day from ${cd.raw} (inclusive vs exclusive counting)`);
        }
      }
    }
  }
  return null;
}
var SUPERSEDING_RE = /\b(?:replaces|replaced|supersedes|superseded|no longer|previously|formerly|has been updated|have been updated|has changed|have changed|was changed|now (?:costs?|is|are|includes?|requires?|allows?)|effective immediately|as of (?:today|now)|updated (?:policy|terms|pricing))\b/i;
var DATED_RE = /\b(?:last updated|updated|effective(?: date)?|revised|as of|published|valid from|in effect from)\s*:?\s*/gi;
function sourceRecency(source) {
  let declared = null;
  for (const m of source.text.matchAll(DATED_RE)) {
    const after = source.text.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 40);
    const d = extractDates(after)[0];
    if (d && d.start === 0 && d.year && d.month) {
      const n = dayNumber({ year: d.year, month: d.month, day: d.day ?? 1 });
      declared = declared === null ? n : Math.max(declared, n);
    }
  }
  let day2 = declared;
  if (day2 === null && source.retrieved_at) {
    const t = Date.parse(source.retrieved_at);
    if (Number.isFinite(t)) day2 = Math.floor(t / 864e5);
  }
  return { source_id: source.id, day: day2, superseding: SUPERSEDING_RE.test(source.text) };
}
function governingSource(recencies) {
  const dated2 = recencies.filter((r) => r.day !== null);
  if (dated2.length === recencies.length && dated2.length >= 2) {
    const sorted = [...dated2].sort((a, b) => b.day - a.day);
    if (sorted[0].day !== sorted[1].day) {
      return { source_id: sorted[0].source_id, check: check("recency", "pass", `${sorted[0].source_id} is the newer passage`) };
    }
  }
  const superseding = recencies.filter((r) => r.superseding);
  if (superseding.length === 1) {
    return { source_id: superseding[0].source_id, check: check("recency", "pass", `${superseding[0].source_id} states that it supersedes earlier terms`) };
  }
  return { source_id: null, check: check("recency", "inconclusive", "no passage is identifiably newer") };
}

// ../verify-core/src/templates.ts
var MODALS = {
  may: "possibility",
  might: "possibility",
  can: "possibility",
  could: "possibility",
  will: "certainty",
  shall: "obligation",
  must: "obligation",
  should: "recommendation",
  would: "conditional"
};
function modalOverstates(source, claim) {
  if (source === "possibility") return claim === "certainty" || claim === "obligation";
  if (source === "recommendation") return claim === "obligation";
  return false;
}
var NEGATION_WORDS = /* @__PURE__ */ new Set([
  "not",
  "never",
  "no",
  "cannot",
  "can't",
  "won't",
  "don't",
  "doesn't",
  "didn't",
  "isn't",
  "aren't",
  "wasn't",
  "weren't",
  "shouldn't",
  "mustn't",
  "hasn't",
  "haven't",
  "hadn't",
  "couldn't",
  "wouldn't"
]);
var CONTRACTION_BASE = {
  "can't": "can",
  cannot: "can",
  "won't": "will",
  "don't": "do",
  "doesn't": "does",
  "didn't": "did",
  "isn't": "is",
  "aren't": "are",
  "wasn't": "was",
  "weren't": "were",
  "shouldn't": "should",
  "mustn't": "must",
  "hasn't": "has",
  "haven't": "have",
  "hadn't": "had",
  "couldn't": "could",
  "wouldn't": "would"
};
var DO_SUPPORT = /* @__PURE__ */ new Set(["do", "does", "did"]);
function tokenise(text) {
  const dates = extractDates(text);
  const quantities = extractQuantities(text, dates).filter((q) => q.bound !== "range_high");
  const values = [
    ...dates.map((d) => ({ kind: "value", key: "#date", start: d.start, end: d.end, date: d })),
    ...quantities.map((q) => ({ kind: "value", key: `#${q.dimension}:${q.unit ?? ""}`, start: q.start, end: q.end, quantity: q }))
  ].sort((a, b) => a.start - b.start);
  const tokens = [];
  const negations = [];
  let vi = 0;
  const wordRe = /[A-Za-z0-9]+(?:['’][A-Za-z]+)?/g;
  for (const m of text.matchAll(wordRe)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    while (vi < values.length && values[vi].end <= start) {
      tokens.push(values[vi]);
      vi++;
    }
    if (vi < values.length && start < values[vi].end && end > values[vi].start) continue;
    let w = m[0].toLowerCase().replace("\u2019", "'");
    if (w === "non" && text[end] === "-") {
      negations.push(start);
      continue;
    }
    if (NEGATION_WORDS.has(w)) {
      negations.push(start);
      if (CONTRACTION_BASE[w]) {
        w = CONTRACTION_BASE[w];
      } else {
        continue;
      }
    }
    if (MODALS[w]) {
      tokens.push({ kind: "modal", key: "#modal", start, end, modal: MODALS[w], raw: m[0] });
      continue;
    }
    tokens.push({ kind: "word", key: w, start, end });
  }
  while (vi < values.length) tokens.push(values[vi++]);
  const filtered = tokens.filter((t, i) => !(t.kind === "word" && DO_SUPPORT.has(t.key) && tokens[i + 1]?.kind === "word"));
  return { tokens: filtered.map((t) => t.kind === "word" ? { ...t, key: lightStem(t.key) } : t), negations };
}
function lightStem(w) {
  if (w.length > 4 && w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && /(?:s|x|z|ch|sh)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}
function templateMatches(claim, sources, minTokens = 5) {
  const c = tokenise(claim.replace(/\[[^\]]*\]/g, ""));
  if (c.tokens.length < minTokens) return [];
  const keys = c.tokens.map((t) => t.key);
  const out = [];
  for (const source of sources) {
    for (const sentence2 of splitSentences(source.text)) {
      const s = tokenise(sentence2.text);
      const sk = s.tokens.map((t) => t.key);
      for (let i = 0; i + keys.length <= sk.length; i++) {
        let ok = true;
        for (let j = 0; j < keys.length; j++) {
          if (sk[i + j] !== keys[j]) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
        const window = s.tokens.slice(i, i + keys.length);
        const start = sentence2.start + window[0].start;
        const end = sentence2.start + window[window.length - 1].end;
        const conflicts = [];
        let modalMismatch = false;
        window.forEach((st, j) => {
          const ct = c.tokens[j];
          if (st.kind === "modal" && ct.kind === "modal" && st.modal !== ct.modal) {
            if (modalOverstates(st.modal, ct.modal)) {
              conflicts.push({ source_id: source.id, start, end, kind: "modality", detail: `claim says "${ct.raw}", source says "${st.raw}"`, claim_text: ct.raw, source_text: st.raw });
            } else modalMismatch = true;
            return;
          }
          if (st.kind !== "value") return;
          if (st.quantity && ct.quantity && compareQuantities(ct.quantity, st.quantity) === "conflict") {
            conflicts.push({ source_id: source.id, start, end, kind: "number", detail: `claim says ${ct.quantity.raw.trim()}, source says ${st.quantity.raw.trim()}` });
          }
          if (st.date && ct.date && compareDates(ct.date, st.date) === "conflict") {
            conflicts.push({ source_id: source.id, start, end, kind: "date", detail: `claim says ${ct.date.raw}, source says ${st.date.raw}` });
          }
        });
        const windowStart = window[0].start;
        const windowEnd = window[window.length - 1].end;
        const srcNeg = s.negations.filter((o) => o >= Math.max(0, windowStart - 12) && o < windowEnd).length;
        const claimNeg = c.negations.length;
        if (srcNeg % 2 !== claimNeg % 2) {
          conflicts.push({ source_id: source.id, start, end, kind: "negation", detail: claimNeg % 2 ? "claim is negated, source is not" : "source is negated, claim is not" });
        }
        out.push({ source_id: source.id, start, end, conflicts, ...modalMismatch ? { modal_mismatch: true } : {} });
      }
    }
  }
  return out;
}

// ../verify-core/src/retrieve.ts
function valueTokens(text) {
  const out = /* @__PURE__ */ new Set();
  for (const q of extractQuantities(text)) out.add(`q:${q.dimension}:${q.value}`);
  for (const d of extractDates(text)) out.add(`d:${d.year}:${d.month}:${d.day}`);
  return out;
}
function scoreSentences(claim, sources) {
  const stems = contentStems(claim);
  const stemSet = new Set(stems);
  const vals = valueTokens(claim);
  const out = [];
  for (const s of sources) {
    for (const range of splitSentences(s.text)) {
      const sStems = new Set(contentStems(range.text));
      let score = 0;
      for (const st of stemSet) if (sStems.has(st)) score += 1;
      if (vals.size) {
        for (const v of valueTokens(range.text)) if (vals.has(v)) score += 2;
      }
      if (score > 0) out.push({ source_id: s.id, range, score: score / Math.sqrt(Math.max(4, sStems.size)) });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}
function selectExcerpts(claim, sources, opts = {}) {
  const maxChars = opts.maxChars ?? 6e3;
  const top = opts.topSentences ?? 6;
  const neighbours = opts.neighbours ?? 1;
  const scored = scoreSentences(claim, sources).slice(0, top);
  const bySource = /* @__PURE__ */ new Map();
  const sentencesBySource = /* @__PURE__ */ new Map();
  for (const s of sources) sentencesBySource.set(s.id, splitSentences(s.text));
  for (const hit of scored) {
    const list = sentencesBySource.get(hit.source_id) ?? [];
    const idx = list.findIndex((r) => r.start === hit.range.start);
    const set = bySource.get(hit.source_id) ?? /* @__PURE__ */ new Set();
    for (let i = Math.max(0, idx - neighbours); i <= Math.min(list.length - 1, idx + neighbours); i++) set.add(i);
    bySource.set(hit.source_id, set);
  }
  let used = 0;
  const out = [];
  for (const s of sources) {
    const idxs = bySource.get(s.id);
    if (!idxs) continue;
    const list = sentencesBySource.get(s.id) ?? [];
    const ranges = [];
    for (const i of [...idxs].sort((a, b) => a - b)) {
      const r = list[i];
      if (used + r.text.length > maxChars) break;
      const prev = ranges[ranges.length - 1];
      if (prev && list[i - 1] && prev.end === list[i - 1].end) {
        ranges[ranges.length - 1] = { start: prev.start, end: r.end, text: s.text.slice(prev.start, r.end) };
      } else {
        ranges.push(r);
      }
      used += r.text.length;
    }
    if (ranges.length) out.push({ source_id: s.id, title: s.title ?? null, retrieved_at: s.retrieved_at ?? null, ranges });
  }
  return out;
}

// ../verify-core/src/claims.ts
var NON_CHECKABLE = /^(?:hope (?:this|that) helps|let me know|feel free|i hope|thanks?(?: you)?|great question|happy to help|good luck|sure[,!.]?$|certainly[,!.]?$|of course[,!.]?$|here(?:'s| is) (?:what|a summary|an overview|the answer)|in summary[,:]?$|to summari[sz]e[,:]?$|please (?:note|contact|reach out|let)|if you have (?:any )?(?:other |more |further )?questions)/i;
var EXTERNAL_COMPARATIVE = /\b(?:than (?:most|many|other|others|competitors?|any other|the industry|average|similar|comparable|rival)|industry[- ](?:standard|average|leading|best)|market[- ]leading|best[- ]in[- ]class|(?:the )?(?:best|leading|top|fastest|cheapest|most popular|most reliable|most generous|most affordable)\b(?! plan| tier| option available| available)|compared (?:to|with) (?:competitors?|others?|other providers)|outperforms?|unmatched|unrivall?ed)\b/i;
var OUT_OF_SCOPE = /\b(?:will (?:always|never|continue to|remain)|forever|guarantee[sd]?\b(?! period)|is (?:the )?(?:best|right|ideal|perfect) (?:choice|option|fit)|great (?:for|value|choice)|worth (?:it|the)|easy to use|user-friendly|(?:you|customers) (?:will|would) (?:love|enjoy|prefer)|recommended for everyone|should (?:definitely|always))\b/i;
var SUBJECTS = /^(?:the|a|an|this|that|these|those|it|they|you|your|we|our|each|every|all|customers?|users?|members?|employees?|subscribers?|refunds?|orders?|returns?|plans?|accounts?|requests?|[A-Z][a-z]+)\b/;
var VERBISH = /\b(?:is|are|was|were|has|have|had|can|cannot|can't|may|must|will|won't|does|do|did|doesn't|don't|costs?|includes?|offers?|requires?|allows?|provides?|supports?|takes?|gets?|charges?|applies|apply|expires?|renews?|covers?|excludes?|receives?|qualif(?:y|ies)|accepts?|ships?|processes|processed|refunds?|lasts?|starts?|ends?|begins?|needs?|owe|owes|pays?|earns?|limits?|resets?)\b/i;
function classifyClaim(text) {
  if (EXTERNAL_COMPARATIVE.test(text)) return "comparative";
  if (OUT_OF_SCOPE.test(text)) return "opinion";
  if (/^(?:to |go to|click|tap|open|select|navigate|visit|contact|call|email|enter|choose|sign in|log in)\b/i.test(text.trim())) return "procedural";
  if (extractDates(text).length) return "temporal";
  if (extractQuantities(text).some((q) => q.dimension !== "plain")) return "numeric";
  return "factual";
}
function hasCheckableContent(text) {
  if (NON_CHECKABLE.test(text.trim())) return false;
  if (text.trim().endsWith("?")) return false;
  if (extractQuantities(text).length || extractDates(text).length) return true;
  if (negationCount(text) > 0) return true;
  return contentStems(text).length >= 3;
}
function splitCompound(text) {
  const t = text.trim().replace(/[.!]+$/, "");
  const parts = t.split(/;\s+|,\s+(?:and|but|while|whereas)\s+|\s+(?:and also|as well as that)\s+/i);
  if (parts.length > 1 && parts.every((p) => words(p).length >= 3 && VERBISH.test(p))) {
    return parts.map((p, i) => finishSentence(i === 0 ? p : capitalise(p)));
  }
  const m = t.match(/^(.+?)\s+((?:is|are|costs?|includes?|offers?|requires?|allows?|provides?|supports?|takes?|charges?|covers?|has|have)\b.+?)\s+and\s+((?:is|are|costs?|includes?|offers?|requires?|allows?|provides?|supports?|takes?|charges?|covers?|has|have)\b.+)$/i);
  if (m && words(m[1]).length <= 6 && SUBJECTS.test(m[1])) {
    return [finishSentence(`${m[1]} ${m[2]}`), finishSentence(`${m[1]} ${m[3]}`)];
  }
  return [finishSentence(t)];
}
function capitalise(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
function finishSentence(s) {
  const t = s.trim();
  return /[.!?]$/.test(t) ? t : `${t}.`;
}
function locateInAnswer(answer, text, quote) {
  for (const q of [quote, text.replace(/\.$/, "")]) {
    if (!q) continue;
    const r = locateQuote(answer, q);
    if (r.ok) return { start: r.span.start, end: r.span.end };
  }
  const stems = new Set(contentStems(text));
  let best = null;
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
function stage2(answer, candidates, origin = "model", maxClaims = 60) {
  const accepted = [];
  const rejected = [];
  const seen = /* @__PURE__ */ new Set();
  let splits = 0;
  for (const c of candidates) {
    const raw = (c.text ?? "").trim();
    if (!raw) {
      rejected.push({ text: raw, reason: "empty" });
      continue;
    }
    if (raw.endsWith("?")) {
      rejected.push({ text: raw, reason: "question" });
      continue;
    }
    if (!hasCheckableContent(raw)) {
      rejected.push({ text: raw, reason: words(raw).length < 3 ? "too_short" : "not_checkable" });
      continue;
    }
    const parts = splitCompound(raw);
    if (parts.length > 1) splits += parts.length - 1;
    for (const part of parts) {
      const key = normalize(part).toLowerCase().replace(/[^a-z0-9%$ ]/g, "");
      if (seen.has(key)) {
        rejected.push({ text: part, reason: "duplicate" });
        continue;
      }
      if (!hasCheckableContent(part)) {
        rejected.push({ text: part, reason: "not_checkable" });
        continue;
      }
      seen.add(key);
      const loc = locateInAnswer(answer, part, parts.length === 1 ? c.answer_quote : null);
      const type = classifyClaim(part);
      accepted.push({
        text: part,
        claim_type: type,
        material: c.material === false && type === "opinion" ? false : true,
        answer_start: loc?.start ?? null,
        answer_end: loc?.end ?? null,
        origin: parts.length > 1 ? "model_split" : origin
      });
      if (accepted.length >= maxClaims) return { accepted, rejected, splits };
    }
  }
  return { accepted, rejected, splits };
}
function fallbackCandidates(answer) {
  return splitSentences(answer).map((s) => ({ text: s.text, answer_quote: s.text }));
}
function coverageNet(answer, accepted) {
  const added = [];
  for (const s of splitSentences(answer)) {
    if (!hasCheckableContent(s.text)) continue;
    const covered = accepted.some((c) => c.answer_start !== null && c.answer_end !== null && c.answer_start < s.end && c.answer_end > s.start);
    if (covered) continue;
    for (const part of splitCompound(s.text)) {
      if (!hasCheckableContent(part)) continue;
      const loc = locateQuote(answer, part.replace(/\.$/, ""));
      added.push({
        text: part,
        claim_type: classifyClaim(part),
        material: true,
        answer_start: loc.ok ? loc.span.start : s.start,
        answer_end: loc.ok ? loc.span.end : s.end,
        origin: "coverage"
      });
    }
  }
  return added;
}

// ../verify-core/src/citations.ts
var MARKER_RE = /\[(?:\^|source:\s*|src:\s*)?([A-Za-z0-9_.-]+(?:\s*,\s*[A-Za-z0-9_.-]+)*)\]|【([0-9]+)】/g;
function parseCitations(answer, sources) {
  const byId = new Map(sources.map((s) => [s.id.toLowerCase(), s.id]));
  const out = [];
  for (const m of answer.matchAll(MARKER_RE)) {
    const tokens = (m[1] ?? m[2] ?? "").split(/\s*,\s*/).filter(Boolean);
    const ids = [];
    for (const t of tokens) {
      const direct = byId.get(t.toLowerCase());
      if (direct) ids.push(direct);
      else if (/^\d+$/.test(t) && sources[Number(t) - 1]) ids.push(sources[Number(t) - 1].id);
    }
    if (ids.length) out.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, ids });
  }
  return out;
}
function citedFor(answer, markers, claimStart, claimEnd) {
  if (claimStart === null || claimEnd === null) return [];
  const sentence2 = sentenceAround(answer, claimStart, claimEnd);
  const tailEnd = Math.min(answer.length, sentence2.end + 12);
  return [...new Set(markers.filter((m) => m.start >= sentence2.start && m.start < tailEnd).flatMap((m) => m.ids))];
}
function citationStatus(required, cited, supportingSourceIds) {
  if (!required) return "not_required";
  if (cited.length === 0) return "missing";
  return cited.some((c) => supportingSourceIds.includes(c)) ? "ok" : "mismatch";
}

// ../verify-core/src/rules.ts
function hashSources(sources) {
  return sources.map((s) => ({ ...s, hash: sha256Hex(s.text) }));
}
function stripMarkers(claim) {
  return claim.replace(/\s*\[[^\]]*\]/g, "").trim();
}
function asSpan(source, start, end, role, match = "exact", distance = 0) {
  return { source_id: source.id, start, end, quote: source.text.slice(start, end), match_type: match, edit_distance: distance, role, source_hash: source.hash };
}
function contextOf(source, span) {
  const c = clauseContext(source.text, span.start, span.end);
  return { source_id: source.id, start: c.start, end: c.end, text: c.text };
}
var VALUE_TYPES = /* @__PURE__ */ new Set(["quantity", "date"]);
var closeTo = (a, b) => Math.abs(a - b) <= Math.max(0.01, Math.abs(b) * 5e-3);
var DERIVATION_CUE = /\b(?:total|totals|totaling|totalling|combined|altogether|in all|sum|difference|more|fewer|less|so|therefore|which (?:brings|makes|means|comes)|works out|comes to|adds up)\b/i;
function isValueRow(r) {
  return VALUE_TYPES.has(r.type) || r.type === "scope" && /bound|rate/.test(r.note) || /value inside/.test(r.note);
}
function codeFacts(claimRaw, sources) {
  const claim = stripMarkers(claimRaw);
  const bare = claim.replace(/[.!]+$/, "");
  let whole = null;
  for (const s of sources) {
    const r = locateQuote(s.text, bare);
    if (r.ok) {
      whole = { source: s, start: r.span.start, end: r.span.end, match: r.span.match_type, distance: r.span.edit_distance };
      break;
    }
  }
  const templateConflicts = [];
  const templateSupports = [];
  for (const m of templateMatches(claim, sources)) {
    const source = sources.find((s) => s.id === m.source_id);
    if (m.conflicts.length === 0 && !m.modal_mismatch) templateSupports.push({ source, start: m.start, end: m.end });
    for (const c of m.conflicts) templateConflicts.push({ source, start: c.start, end: c.end, kind: c.kind, detail: c.detail, claim_text: c.claim_text, source_text: c.source_text });
  }
  templateConflicts.sort((a, b) => Number(a.kind === "modality") - Number(b.kind === "modality"));
  const allText = sources.map((s) => s.text).join("\n").toLowerCase();
  const comp = claim.match(EXTERNAL_COMPARATIVE);
  const oos = claim.match(OUT_OF_SCOPE);
  const stems = contentStems(claim);
  let bestCoverage = 0;
  for (const s of sources) {
    for (const piece of s.text.split(/(?<=[.!?;])\s+/)) {
      bestCoverage = Math.max(bestCoverage, coverage(stems, piece));
    }
  }
  return {
    whole,
    templateConflicts,
    templateSupports,
    arithmetic: claimArithmetic(claim),
    comparative: !!comp && !allText.includes(comp[0].toLowerCase()),
    outOfScope: !!oos && !allText.includes(oos[0].toLowerCase()),
    bestCoverage
  };
}
var QUALIFIER_LEAD = /^\s*(?:in|for|on|only|if|when|whenever|unless|provided|providing|except|excluding|until|after|before|within|during|between|from|by|as long as|so long as|subject to|while|where|once|without|with|starting|beginning|effective|through|up to|at least|no later than|not later than|in no event later than|no earlier than|not earlier than|prior to|following|in any event|per)\b/i;
var COMMA_QUALIFIER_LEAD = /^\s*[,;]\s*(?:provided|providing|unless|except|excluding|only|as long as|so long as|subject to|if|but only|on condition)\b/i;
var COMMA_TIME_LEAD = /^\s*[,;]\s*(?:within|no later than|not later than|in no event later than|no earlier than|not earlier than|prior to|before|until|by)\b/i;
var TEMPORAL_WORD = /\d|\b(?:days?|weeks?|months?|years?|hours?|minutes?|business|calendar|billing cycles?|date|time|deadline|period|january|february|march|april|may|june|july|august|september|october|november|december)\b/i;
var NON_QUALIFIER_STEMS = /* @__PURE__ */ new Set(["available", "to", "eligible", "apply", "applies", "only", "for", "in", "on", "with", "who", "that"]);
var EXPLICIT_EXCEPTION = /\b(?:except|excluding|excludes?|excluded|other\s+than|with\s+the\s+exception\s+of|(?:does|do)\s+not\s+apply\s+to|doesn't\s+apply\s+to|not\s+applicable\s+to|not\s+included|not\s+eligible|ineligible)\b/i;
function verbatimQualifiers(claim, ctx, span) {
  const base2 = compareQualifiers(claim, ctx.text);
  const s0 = span.start - ctx.start;
  const s1 = span.end - ctx.start;
  const rows = base2.rows.filter((r) => !(r.claim_text === null && r.source_text !== null && ["condition", "time_range", "scope"].includes(r.type)));
  const dropped = [];
  const claimStems = new Set(contentStems(claim));
  const sentenceEnd = (() => {
    const m = /[.!?](\s|$)/.exec(ctx.text.slice(s1 - 1));
    return m ? s1 - 1 + m.index + 1 : ctx.text.length;
  })();
  const claimNorm = normalize(claim).toLowerCase();
  for (const q of extractQualifiers(ctx.text)) {
    if (!q.material || !["condition", "time_range", "scope"].includes(q.type)) continue;
    const outsideText = ctx.text.slice(q.start, Math.max(q.start, Math.min(q.end, s0))) + " " + ctx.text.slice(Math.max(q.start, s1), Math.max(q.end, s1));
    const wholeOutside = q.end <= s0 || q.start >= s1;
    const missing = wholeOutside ? claimNorm.includes(normalize(q.text).toLowerCase()) ? [] : contentStems(q.text).filter((st) => !NON_QUALIFIER_STEMS.has(st)).concat(["(outside the quoted span)"]) : contentStems(outsideText).filter((st) => !NON_QUALIFIER_STEMS.has(st) && !claimStems.has(st));
    const inNextSentence = q.start >= sentenceEnd;
    const nextException = inNextSentence && EXPLICIT_EXCEPTION.test(q.text);
    const row2 = {
      type: q.type,
      claim_text: missing.length ? null : q.text,
      source_text: q.text,
      status: !missing.length ? "preserved" : inNextSentence && !nextException ? "ambiguous" : "dropped",
      material: true,
      note: !missing.length ? "inside the quoted span" : nextException ? "an exception in the following sentence, which limits this one" : inNextSentence ? "in the following sentence; may limit the claim" : "part of the source sentence the claim stops short of",
      proposed_by: "code"
    };
    rows.push(row2);
    if (row2.status === "dropped") dropped.push(row2);
  }
  const rest = ctx.text.slice(s1, sentenceEnd).replace(/^[\s.!?]+$/, "");
  const timeLead = COMMA_TIME_LEAD.test(rest) && TEMPORAL_WORD.test(rest.split(/[.;!?]/)[0]);
  const restLead = COMMA_QUALIFIER_LEAD.test(rest) || timeLead || !/^\s*[,;]/.test(rest) && QUALIFIER_LEAD.test(rest);
  if (rest.trim() && restLead && !dropped.some((d) => d.source_text && rest.includes(d.source_text.slice(-12)))) {
    const phrase = rest.replace(/^[,;]?\s*/, "").split(/[.;!?]|,\s+(?:and|but|while|so)\s/)[0].trim();
    if (contentStems(phrase).some((st) => !NON_QUALIFIER_STEMS.has(st) && !claimStems.has(st))) {
      const row2 = { type: "scope", claim_text: null, source_text: phrase, status: "dropped", material: true, note: "rest of the source clause, cut off by the claim", proposed_by: "code" };
      rows.push(row2);
      dropped.push(row2);
    }
  }
  return {
    rows,
    dropped,
    contradicted: base2.contradicted,
    ambiguous: rows.filter((r) => r.status === "ambiguous" && r.material),
    matchedValues: base2.matchedValues,
    unmatchedValues: base2.unmatchedValues
  };
}
function checkKind(kind) {
  return kind === "modality" ? "qualifiers" : kind;
}
function conflictReason(kind) {
  if (kind === "modality") return "qualifier_loss";
  return kind === "number" ? "number_mismatch" : kind === "date" ? "date_mismatch" : "negation";
}
function decideByCode(claimRaw, sources, facts = codeFacts(claimRaw, sources)) {
  const claim = stripMarkers(claimRaw);
  const checks = [];
  if (facts.arithmetic) checks.push(facts.arithmetic);
  if (facts.arithmetic?.result === "fail") {
    const operandSpan = sources.map((s) => ({ s, q: extractQuantities(claim).find((q) => q.dimension !== "plain" && s.text.includes(q.raw.trim())) })).find((x) => x.q);
    if (operandSpan?.q) {
      const at = operandSpan.s.text.indexOf(operandSpan.q.raw.trim());
      const ctx = contextOf(operandSpan.s, { start: at, end: at + operandSpan.q.raw.trim().length });
      return {
        verdict: "contradicted",
        failure_reason: "arithmetic_error",
        rule_id: "R-ARITH-CONTRADICTED",
        resolved_by: "code",
        spans: [asSpan(operandSpan.s, ctx.start, ctx.end, "conflicts")],
        context: { source_id: ctx.source_id, start: ctx.start, end: ctx.end },
        qualifiers: [],
        checks,
        discarded_quotes: 0,
        internal_score: 0.93
      };
    }
  }
  const supportSources = /* @__PURE__ */ new Set([
    ...facts.whole ? [facts.whole.source.id] : [],
    ...facts.templateSupports.map((t) => t.source.id)
  ]);
  const conflictSources = new Set(facts.templateConflicts.filter((t) => t.kind !== "modality").map((t) => t.source.id));
  if (supportSources.size && conflictSources.size) {
    const involved = sources.filter((s) => supportSources.has(s.id) || conflictSources.has(s.id));
    const gov = governingSource(involved.map(sourceRecency));
    checks.push(gov.check);
    if (gov.source_id && conflictSources.has(gov.source_id) && !supportSources.has(gov.source_id)) {
      const c = facts.templateConflicts.find((t) => t.source.id === gov.source_id);
      const ctx = contextOf(c.source, c);
      return {
        verdict: "contradicted",
        failure_reason: "superseded",
        rule_id: "R-SUPERSEDED",
        resolved_by: "code",
        spans: [asSpan(c.source, c.start, c.end, "conflicts")],
        context: { source_id: ctx.source_id, start: ctx.start, end: ctx.end },
        qualifiers: [],
        checks: [...checks, { kind: checkKind(c.kind), result: "fail", detail: c.detail }],
        discarded_quotes: 0,
        internal_score: 0.88
      };
    }
    if (!gov.source_id) {
      const c = facts.templateConflicts[0];
      const sup = facts.whole ?? { source: facts.templateSupports[0].source, start: facts.templateSupports[0].start, end: facts.templateSupports[0].end };
      return {
        verdict: "unverifiable",
        failure_reason: "conflicting_sources",
        rule_id: "R-CONFLICTING-SOURCES",
        resolved_by: "code",
        spans: [asSpan(sup.source, sup.start, sup.end, "supports"), asSpan(c.source, c.start, c.end, "conflicts")],
        context: null,
        qualifiers: [],
        checks,
        discarded_quotes: 0,
        internal_score: 0.8
      };
    }
  }
  const supersededRisk = (supporting) => {
    const mine = sourceRecency(supporting);
    const claimStems = contentStems(claim);
    return sources.some((s) => {
      if (s.id === supporting.id) return false;
      const r = sourceRecency(s);
      const newer = r.day !== null && (mine.day === null || r.day > mine.day) || r.superseding && !mine.superseding;
      return newer && coverage(claimStems, s.text) >= 0.5;
    });
  };
  const valuesElsewhere = (exclude) => {
    const values = extractQuantities(claim).filter((q) => q.dimension !== "plain");
    if (!values.length) return false;
    const claimStems = contentStems(claim);
    return sources.some(
      (s) => s.id !== exclude && s.text.split(/(?<=[.!?;])\s+/).some((sent) => {
        const qs = extractQuantities(sent);
        return values.every((v) => qs.some((q) => compareQuantities(v, q) === "equal")) && coverage(claimStems, sent) >= 0.5;
      })
    );
  };
  if (facts.whole && !(conflictSources.size && !supportSources.has(facts.whole.source.id)) && !supersededRisk(facts.whole.source)) {
    const w = facts.whole;
    const ctx = contextOf(w.source, w);
    const cmp = verbatimQualifiers(claim, ctx, w);
    const span = asSpan(w.source, w.start, w.end, "supports", w.match, w.distance);
    checks.push({ kind: "span_match", result: "pass", detail: `claim found ${w.match === "exact" ? "verbatim" : `(${w.match})`} in ${w.source.id}` });
    checks.push({ kind: "qualifiers", result: cmp.dropped.length ? "fail" : "pass", detail: cmp.dropped.length ? `dropped: ${cmp.dropped.map((d) => d.source_text).join("; ")}` : "no material qualifier dropped" });
    if (cmp.dropped.length) {
      return {
        verdict: "unsupported",
        failure_reason: "qualifier_loss",
        rule_id: "R-VERBATIM-QUALIFIER-LOSS",
        resolved_by: "code",
        spans: [span, ...cmp.dropped.map(() => asSpan(w.source, ctx.start, ctx.end, "qualifies"))].slice(0, 2),
        context: { source_id: w.source.id, start: ctx.start, end: ctx.end },
        qualifiers: cmp.rows,
        checks,
        discarded_quotes: 0,
        internal_score: 0.92
      };
    }
    const deferred = cmp.rows.some((r) => r.status === "ambiguous" && r.claim_text === null && r.source_text !== null);
    if (cmp.contradicted.length === 0 && !deferred) {
      return {
        verdict: "supported",
        failure_reason: null,
        rule_id: "R-VERBATIM-SUPPORTED",
        resolved_by: "code",
        spans: [span],
        context: { source_id: w.source.id, start: ctx.start, end: ctx.end },
        qualifiers: cmp.rows.map((r) => r.status === "ambiguous" ? { ...r, status: "preserved", note: `${r.note}; claim is verbatim source text` } : r),
        checks,
        discarded_quotes: 0,
        internal_score: w.match === "exact" ? 0.97 : w.match === "normalized" ? 0.95 : 0.92
      };
    }
  }
  const first = facts.templateConflicts[0];
  if (first?.kind === "modality" && !supportSources.size && !supersededRisk(first.source)) {
    const ctx = contextOf(first.source, first);
    return {
      verdict: "unsupported",
      failure_reason: "qualifier_loss",
      rule_id: "R-TEMPLATE-MODALITY",
      resolved_by: "code",
      spans: [asSpan(first.source, first.start, first.end, "qualifies")],
      context: { source_id: first.source.id, start: ctx.start, end: ctx.end },
      qualifiers: [
        { type: "modality", claim_text: first.claim_text ?? null, source_text: first.source_text ?? null, status: "contradicted", material: true, note: "claim states as firm what the source states as possible or advised", proposed_by: "code" }
      ],
      checks: [...checks, { kind: "qualifiers", result: "fail", detail: first.detail }],
      discarded_quotes: 0,
      internal_score: 0.93
    };
  }
  if (facts.templateConflicts.length && first.kind !== "modality" && !supportSources.size && !valuesElsewhere(facts.templateConflicts[0].source.id) && !supersededRisk(facts.templateConflicts[0].source)) {
    const c = facts.templateConflicts[0];
    const ctx = contextOf(c.source, c);
    return {
      verdict: "contradicted",
      failure_reason: conflictReason(c.kind),
      rule_id: c.kind === "negation" ? "R-TEMPLATE-NEGATION" : "R-TEMPLATE-VALUE",
      resolved_by: "code",
      spans: [asSpan(c.source, c.start, c.end, "conflicts")],
      context: { source_id: c.source.id, start: ctx.start, end: ctx.end },
      qualifiers: [],
      checks: [...checks, { kind: checkKind(c.kind), result: "fail", detail: c.detail }],
      discarded_quotes: 0,
      internal_score: 0.95
    };
  }
  if (facts.comparative || facts.outOfScope) {
    return {
      verdict: "unverifiable",
      failure_reason: facts.comparative ? "comparative" : "out_of_scope",
      rule_id: facts.comparative ? "R-EXTERNAL-COMPARATIVE" : "R-OUT-OF-SCOPE",
      resolved_by: "code",
      spans: [],
      context: null,
      qualifiers: [],
      checks,
      discarded_quotes: 0,
      internal_score: 0.85
    };
  }
  return null;
}
function locateEvidence(adj, sources) {
  const located = [];
  let discarded = 0;
  for (const e of adj.evidence ?? []) {
    const named2 = sources.find((s) => s.id === e.source_id);
    const order = named2 ? [named2, ...sources.filter((s) => s !== named2)] : sources;
    let found = null;
    for (const s of order) {
      const r = locateQuote(s.text, e.quote);
      if (r.ok) {
        found = { source: s, span: asSpan(s, r.span.start, r.span.end, e.role, r.span.match_type, r.span.edit_distance) };
        break;
      }
    }
    if (found) located.push(found);
    else discarded++;
  }
  return { located, discarded };
}
function contextsText(located) {
  const parts = [];
  let first = null;
  const seen = /* @__PURE__ */ new Set();
  for (const l of located) {
    const ctx = contextOf(l.source, l.span);
    const key = `${ctx.source_id}:${ctx.start}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!first) first = { source_id: ctx.source_id, start: ctx.start, end: ctx.end };
    parts.push(ctx.text);
  }
  return { text: parts.join("\n"), first };
}
function matchPenalty(spans) {
  return spans.reduce((p, s) => p + (s.match_type === "punctuation_tolerant" ? 0.05 : s.match_type === "normalized" ? 0.02 : 0), 0);
}
function base(verdict, reason, rule, score, extra = {}) {
  return {
    verdict,
    failure_reason: reason,
    rule_id: rule,
    resolved_by: "model",
    spans: [],
    context: null,
    qualifiers: [],
    checks: [],
    discarded_quotes: 0,
    internal_score: score,
    ...extra
  };
}
function decideWithModel(claimRaw, sources, adj, tier, facts = codeFacts(claimRaw, sources)) {
  const claim = stripMarkers(claimRaw);
  const { located, discarded } = locateEvidence(adj, sources);
  const checks = [];
  if (facts.arithmetic) checks.push(facts.arithmetic);
  if (discarded) checks.push({ kind: "span_match", result: "fail", detail: `${discarded} model-proposed quote(s) not found in the source and discarded` });
  const strong = tier === "strong";
  const penalty = (strong ? 0.12 : 0) + Math.min(0.15, discarded * 0.05);
  const escalateOr = (reason, final) => strong ? final : { ...final, escalate: reason };
  const proposed = (adj.source_qualifiers ?? []).map((q) => ({ type: q.type, text: q.text }));
  if (adj.verdict === "supported") {
    const supports = located.filter((l) => l.span.role !== "conflicts");
    if (!supports.length) {
      return escalateOr("model cited support that is not in the source", base("unsupported", "no_supporting_span", "R-SUPPORT-QUOTE-UNVERIFIED", 0.7 - penalty, { checks, discarded_quotes: discarded }));
    }
    const conflicts = located.filter((l) => l.span.role === "conflicts");
    const { text: ctx, first } = contextsText(supports);
    const cmp = compareQualifiers(claim, ctx, proposed);
    const spans = [...supports, ...conflicts].map((l) => l.span);
    checks.push({ kind: "span_match", result: "pass", detail: `${supports.length} supporting quote(s) located in source` });
    if (facts.templateConflicts.length && !facts.templateSupports.length && !facts.whole) {
      const c = facts.templateConflicts[0];
      const modal = c.kind === "modality";
      return escalateOr(modal ? "code found the claim firmer than its source" : "code found a passage that contradicts the claim", {
        ...modal ? base("unsupported", "qualifier_loss", "R-TEMPLATE-MODALITY-OVERRIDES-MODEL", 0.85 - penalty) : base("contradicted", conflictReason(c.kind), "R-TEMPLATE-OVERRIDES-MODEL", 0.85 - penalty),
        resolved_by: "model",
        spans: [...spans, asSpan(c.source, c.start, c.end, "conflicts")],
        context: first,
        qualifiers: cmp.rows,
        checks: [...checks, { kind: checkKind(c.kind), result: "fail", detail: c.detail }],
        discarded_quotes: discarded
      });
    }
    return finishSupport(claim, sources, adj, cmp, spans, first, checks, discarded, tier, penalty, located);
  }
  if (adj.verdict === "contradicted") {
    const conflicts = located.filter((l) => l.span.role === "conflicts" || l.span.role === "supports");
    if (!conflicts.length) {
      return escalateOr("model cited a contradiction that is not in the source", base("unsupported", "unverified_contradiction", "R-CONTRADICTION-QUOTE-UNVERIFIED", 0.68 - penalty, { checks, discarded_quotes: discarded }));
    }
    const spans = conflicts.map((l) => ({ ...l.span, role: "conflicts" }));
    const { text: ctx, first } = contextsText(conflicts);
    const cmp = compareQualifiers(claim, ctx, proposed);
    const valueConflict = cmp.contradicted.find((r) => isValueRow(r));
    const template = facts.templateConflicts[0];
    if (adj.conflict_type === "superseded" || conflicts.length && located.some((l) => l.span.role === "supports")) {
      const involved = [...new Set(located.map((l) => l.source))];
      if (involved.length >= 2) {
        const gov = governingSource(involved.map(sourceRecency));
        checks.push(gov.check);
        if (gov.source_id && conflicts.some((c) => c.source.id === gov.source_id && c.span.role === "conflicts")) {
          return { ...base("contradicted", "superseded", "R-MODEL-SUPERSEDED", 0.82 - penalty), spans, context: first, qualifiers: cmp.rows, checks, discarded_quotes: discarded };
        }
        if (!gov.source_id) {
          return { ...base("unverifiable", "conflicting_sources", "R-MODEL-CONFLICTING-SOURCES", 0.72 - penalty), spans: located.map((l) => l.span), context: first, qualifiers: cmp.rows, checks, discarded_quotes: discarded };
        }
      }
    }
    if (template) {
      checks.push({ kind: template.kind === "date" ? "date" : template.kind === "number" ? "number" : "negation", result: "fail", detail: template.detail });
      return { ...base("contradicted", conflictReason(template.kind), "R-MODEL-CONTRADICTED-CODE-CONFIRMED", 0.9 - penalty), spans, context: first, qualifiers: cmp.rows, checks, discarded_quotes: discarded };
    }
    if (valueConflict) {
      checks.push({ kind: valueConflict.type === "date" ? "date" : "number", result: "fail", detail: `claim ${valueConflict.claim_text ?? ""} vs source ${valueConflict.source_text ?? ""}`.trim() });
      return {
        ...base("contradicted", valueConflict.type === "date" ? "date_mismatch" : "number_mismatch", "R-MODEL-CONTRADICTED-CODE-CONFIRMED", 0.86 - penalty - matchPenalty(spans)),
        spans,
        context: first,
        qualifiers: cmp.rows,
        checks,
        discarded_quotes: discarded
      };
    }
    const valuesAllMatch = cmp.unmatchedValues === 0 && cmp.matchedValues > 0 && !cmp.dropped.length && !cmp.ambiguous.length;
    if (valuesAllMatch && !strong) {
      return { ...base("contradicted", "condition_mismatch", "R-MODEL-CONTRADICTED", 0.7 - penalty), spans, context: first, qualifiers: cmp.rows, checks, discarded_quotes: discarded, escalate: "code finds the cited span consistent with the claim" };
    }
    const reason = adj.conflict_type === "entity" ? "entity_mismatch" : adj.conflict_type === "negation" ? "negation" : adj.conflict_type === "date" ? "date_mismatch" : adj.conflict_type === "number" ? "number_mismatch" : "condition_mismatch";
    return { ...base("contradicted", reason, "R-MODEL-CONTRADICTED-SPAN-VERIFIED", 0.78 - penalty - matchPenalty(spans)), spans, context: first, qualifiers: cmp.rows, checks, discarded_quotes: discarded };
  }
  if (adj.verdict === "unverifiable") {
    if (adj.unverifiable_reason === "comparative" || adj.unverifiable_reason === "out_of_scope") {
      return { ...base("unverifiable", adj.unverifiable_reason, "R-MODEL-UNVERIFIABLE-SCOPE", 0.72 - penalty), checks, discarded_quotes: discarded };
    }
    if (adj.unverifiable_reason === "conflicting_sources") {
      const bySource = new Set(located.map((l) => l.source.id));
      if (bySource.size >= 2) {
        const involved = sources.filter((s) => bySource.has(s.id));
        const gov = governingSource(involved.map(sourceRecency));
        checks.push(gov.check);
        if (gov.source_id) {
          const governing = located.filter((l) => l.source.id === gov.source_id);
          const { text: ctx, first } = contextsText(governing);
          const cmp = compareQualifiers(claim, ctx, proposed);
          const conflictRow = cmp.contradicted.find((r) => isValueRow(r));
          if (conflictRow) {
            return { ...base("contradicted", "superseded", "R-GOVERNING-SOURCE-CONTRADICTS", 0.8 - penalty), spans: located.map((l) => l.span), context: first, qualifiers: cmp.rows, checks, discarded_quotes: discarded };
          }
          return escalateOr("passages conflict; the governing passage needs a fresh judgement", { ...base("unverifiable", "conflicting_sources", "R-MODEL-CONFLICTING-SOURCES", 0.7 - penalty), spans: located.map((l) => l.span), context: first, qualifiers: cmp.rows, checks, discarded_quotes: discarded });
        }
        return { ...base("unverifiable", "conflicting_sources", "R-MODEL-CONFLICTING-SOURCES", 0.75 - penalty), spans: located.map((l) => l.span), checks, discarded_quotes: discarded };
      }
      return escalateOr("model reported conflicting passages that could not be located", base("unverifiable", "model_abstained", "R-MODEL-ABSTAINED", 0.6 - penalty, { checks, discarded_quotes: discarded }));
    }
    return escalateOr("model could not decide", base("unverifiable", "model_abstained", "R-MODEL-ABSTAINED", 0.6 - penalty, { checks, discarded_quotes: discarded }));
  }
  const qualifying = located.filter((l) => l.span.role !== "conflicts");
  if (qualifying.length) {
    const { text: ctx, first } = contextsText(qualifying);
    const cmp = compareQualifiers(claim, ctx, proposed);
    if (cmp.dropped.length && cmp.unmatchedValues === 0) {
      return { ...base("unsupported", "qualifier_loss", "R-MODEL-QUALIFIER-LOSS", 0.84 - penalty - matchPenalty(qualifying.map((q) => q.span))), spans: qualifying.map((l) => l.span), context: first, qualifiers: cmp.rows, checks: [...checks, { kind: "qualifiers", result: "fail", detail: `dropped: ${cmp.dropped.map((d) => d.source_text).join("; ")}` }], discarded_quotes: discarded };
    }
  }
  if (!strong && (facts.templateSupports.length || facts.bestCoverage >= 0.85)) {
    return { ...base("unsupported", "no_supporting_span", "R-MODEL-UNSUPPORTED", 0.6 - penalty), checks, discarded_quotes: discarded, escalate: "a passage closely matches the claim" };
  }
  return { ...base("unsupported", "no_supporting_span", "R-MODEL-UNSUPPORTED", 0.8 - penalty), spans: located.map((l) => l.span), checks, discarded_quotes: discarded };
}
function finishSupport(claim, sources, adj, cmp, spans, first, checks, discarded, tier, penalty, located) {
  const strong = tier === "strong";
  const rows = [...cmp.rows];
  const score = 0.88 - penalty - matchPenalty(spans);
  const claimStemsForPolarity = contentStems(claim);
  const flipped = located.filter((l) => l.span.role !== "conflicts").find((l) => negationCount(l.span.quote) % 2 !== negationCount(claim) % 2 && coverage(claimStemsForPolarity, contentStems(l.span.quote)) >= 0.8);
  if (flipped) {
    checks.push({ kind: "negation", result: "fail", detail: "the quoted support negates the claim (or the claim negates it); a model cannot confirm support across that" });
    return { ...base("unsupported", "unverified_contradiction", "R-SUPPORT-POLARITY-CONFLICT", score), spans, context: first, qualifiers: rows, checks, discarded_quotes: discarded };
  }
  const supportText = located.filter((l) => l.span.role !== "conflicts").map((l) => contextOf(l.source, l.span).text).join("\n");
  const relevance = coverage(contentStems(claim), contentStems(supportText));
  if (relevance < (strong ? 0.2 : 0.3)) {
    checks.push({ kind: "span_match", result: "fail", detail: `cited support shares ${Math.round(relevance * 100)}% of the claim's content words` });
    return strong ? { ...base("unsupported", "no_supporting_span", "R-SUPPORT-NOT-RELEVANT", score), spans, context: first, qualifiers: rows, checks, discarded_quotes: discarded } : { ...base("unsupported", "no_supporting_span", "R-SUPPORT-NOT-RELEVANT", score), spans, context: first, qualifiers: rows, checks, discarded_quotes: discarded, escalate: "cited support does not appear to be about the claim" };
  }
  if (cmp.dropped.length) {
    checks.push({ kind: "qualifiers", result: "fail", detail: `dropped: ${cmp.dropped.map((d) => d.source_text).join("; ")}` });
    return { ...base("unsupported", "qualifier_loss", "R-QUALIFIER-LOSS", score - 0.02), spans, context: first, qualifiers: rows, checks, discarded_quotes: discarded };
  }
  const evidenceText = located.map((l) => contextOf(l.source, l.span).text).join("\n");
  const arith = adj.arithmetic ? recomputeArithmetic(adj.arithmetic, evidenceText, claim) : null;
  const evidenceValues = extractQuantities(evidenceText).map((q) => q.written);
  const inEvidence = (v) => evidenceValues.some((e) => closeTo(e, v));
  const comp = claimComputation(claim);
  const compDerives = comp?.check.result === "pass" && comp.operands.every(inEvidence) ? comp : null;
  const derivedValues = [
    ...compDerives ? [compDerives.result] : [],
    ...arith?.result === "pass" && DERIVATION_CUE.test(claim) ? [adj.arithmetic.result] : []
  ];
  for (const r of rows.filter((x) => (x.status === "ambiguous" || x.status === "contradicted") && VALUE_TYPES.has(x.type))) {
    if (r.claim_text === null || !extractQuantities(r.claim_text).some((q) => derivedValues.some((v) => closeTo(q.written, v)))) continue;
    r.status = "preserved";
    r.note = `${r.note}; derived from cited evidence by recomputation`;
    const ck = compDerives ? compDerives.check : arith;
    if (!checks.includes(ck)) checks.push(ck);
  }
  const unresolvedValueRows = rows.filter((r) => r.status === "ambiguous" && VALUE_TYPES.has(r.type));
  if (unresolvedValueRows.length) {
    const wider = compareQualifiers(claim, evidenceText, []);
    let resolved = wider.unmatchedValues === 0 && wider.matchedValues > 0;
    if (!resolved && arith) {
      if (!checks.includes(arith)) checks.push(arith);
      resolved = arith.result === "pass";
    }
    if (!resolved) {
      const dm = dateMath(claim, evidenceText);
      if (dm) {
        checks.push(dm);
        resolved = dm.result === "pass";
      }
    }
    if (resolved) {
      for (const r of unresolvedValueRows) {
        r.status = "preserved";
        r.note = `${r.note}; established from cited evidence by recomputation`;
      }
    } else {
      checks.push({ kind: "number", result: "fail", detail: `claim value(s) not found in cited evidence: ${unresolvedValueRows.map((r) => r.claim_text).join(", ")}` });
      return strong ? { ...base("unsupported", "unsupported_detail", "R-UNSUPPORTED-DETAIL", score), spans, context: first, qualifiers: rows, checks, discarded_quotes: discarded } : { ...base("unsupported", "unsupported_detail", "R-UNSUPPORTED-DETAIL", score), spans, context: first, qualifiers: rows, checks, discarded_quotes: discarded, escalate: "claim states a value the cited evidence does not" };
    }
  }
  const valueConflicts = cmp.contradicted.filter((r) => isValueRow(r) && r.status === "contradicted");
  if (valueConflicts.length) {
    checks.push({ kind: "number", result: "fail", detail: valueConflicts.map((r) => `claim ${r.claim_text ?? "\u2014"} vs source ${r.source_text ?? "\u2014"}`).join("; ") });
    if (!strong) {
      return { ...base("unsupported", "unsupported_detail", "R-VALUE-CONFLICT-IN-SUPPORT", score), spans, context: first, qualifiers: rows, checks, discarded_quotes: discarded, escalate: "cited support states a different value" };
    }
    const aligned = coverage(contentStems(claim), contentStems(evidenceText)) >= 0.8;
    const r0 = valueConflicts[0];
    return aligned ? { ...base("contradicted", r0.type === "date" ? "date_mismatch" : "number_mismatch", "R-VALUE-CONFLICT-IN-SUPPORT", score), spans: spans.map((s) => ({ ...s, role: "conflicts" })), context: first, qualifiers: rows, checks, discarded_quotes: discarded } : { ...base("unsupported", "unsupported_detail", "R-VALUE-CONFLICT-IN-SUPPORT", score), spans, context: first, qualifiers: rows, checks, discarded_quotes: discarded };
  }
  const otherConflicts = cmp.contradicted.filter((r) => !isValueRow(r));
  if (otherConflicts.length) {
    return strong ? { ...base("unsupported", "qualifier_loss", "R-QUALIFIER-CONFLICT", score), spans, context: first, qualifiers: rows, checks, discarded_quotes: discarded } : { ...base("unsupported", "qualifier_loss", "R-QUALIFIER-CONFLICT", score), spans, context: first, qualifiers: rows, checks, discarded_quotes: discarded, escalate: "a qualifier in the cited support differs from the claim" };
  }
  const softAmbiguous = rows.filter((r) => r.status === "ambiguous" && r.material);
  if (softAmbiguous.length && !strong) {
    return { ...base("supported", null, "R-MODEL-SUPPORTED-PENDING", score - 0.1), spans, context: first, qualifiers: rows, checks, discarded_quotes: discarded, escalate: `code could not confirm: ${softAmbiguous.map((r) => r.type).join(", ")}` };
  }
  for (const r of softAmbiguous) {
    r.status = "preserved";
    r.note = `${r.note}; judged preserved by the strong-tier model (code could not decide)`;
  }
  checks.push({ kind: "qualifiers", result: "pass", detail: "no material qualifier dropped or contradicted" });
  return {
    ...base("supported", null, softAmbiguous.length ? "R-MODEL-SUPPORTED-STRONG-CONFIRMED" : "R-MODEL-SUPPORTED-VERIFIED", score - softAmbiguous.length * 0.04),
    spans,
    context: first,
    qualifiers: rows,
    checks,
    discarded_quotes: discarded
  };
}
function unresolved(reason, facts) {
  return {
    verdict: "unverifiable",
    failure_reason: reason,
    rule_id: reason === "cost_ceiling" ? "R-COST-CEILING" : reason === "deadline" ? "R-DEADLINE" : "R-PROVIDER-ERROR",
    resolved_by: "code",
    spans: [],
    context: null,
    qualifiers: [],
    checks: facts?.arithmetic ? [facts.arithmetic] : [],
    discarded_quotes: 0,
    internal_score: 0.5
  };
}

// ../verify-core/src/release.ts
function countVerdicts(claims) {
  const counts = { supported: 0, contradicted: 0, unsupported: 0, unverifiable: 0, total: claims.length };
  for (const c of claims) counts[c.verdict]++;
  return counts;
}
function decideRelease(input2) {
  const maxUnsupported = Math.max(0, input2.thresholds?.max_unsupported ?? 0);
  const maxUnverifiable = Math.max(0, input2.thresholds?.max_unverifiable ?? 0);
  const material = input2.claims.filter((c) => c.material);
  const counts = countVerdicts(input2.claims);
  const contradicted = material.filter((c) => c.verdict === "contradicted");
  const qualifierLoss = material.filter((c) => c.verdict === "unsupported" && c.failure_reason === "qualifier_loss");
  const unsupported = material.filter((c) => c.verdict === "unsupported" && c.failure_reason !== "qualifier_loss");
  const unverifiable = material.filter((c) => c.verdict === "unverifiable");
  const citationProblems = material.filter(
    (c) => c.verdict === "supported" && (c.citation.status === "missing" || c.citation.status === "mismatch")
  );
  const reasons = [];
  let rec = "allow";
  if (contradicted.length) reasons.push(`${contradicted.length} claim(s) contradicted by the supplied passages`);
  if (qualifierLoss.length) reasons.push(`${qualifierLoss.length} claim(s) drop a material qualifier stated in the passages`);
  if (unsupported.length > maxUnsupported) reasons.push(`${unsupported.length} claim(s) not supported by the supplied passages`);
  if (reasons.length) {
    rec = "revise";
  } else if (input2.partial || unverifiable.length > maxUnverifiable) {
    rec = "human_review";
    if (input2.partial) reasons.push("results are partial; some claims could not be checked");
    if (unverifiable.length > maxUnverifiable) reasons.push(`${unverifiable.length} claim(s) cannot be resolved from the supplied passages`);
  } else if (input2.requireCitations && citationProblems.length) {
    rec = "cite_required";
    reasons.push(`${citationProblems.length} supported claim(s) lack a citation to the passage that supports them`);
  } else if (material.length === 0) {
    rec = "human_review";
    reasons.push("the answer contains no checkable claims");
  } else if (unsupported.length || unverifiable.length) {
    reasons.push(
      `within thresholds: ${unsupported.length} unsupported and ${unverifiable.length} unverifiable claim(s) tolerated (max_unsupported ${maxUnsupported}, max_unverifiable ${maxUnverifiable})`
    );
  } else {
    reasons.push("every material claim is supported by the supplied passages");
  }
  if (input2.partial && rec === "revise") reasons.push("results are partial; some claims could not be checked");
  let overall;
  if (input2.partial) overall = "partial";
  else if (contradicted.length || qualifierLoss.length || unsupported.length || unverifiable.length) {
    const anySupport = material.some((c) => c.verdict === "supported" || c.verdict === "contradicted" || c.failure_reason === "qualifier_loss");
    overall = input2.noSources || !anySupport && material.length > 0 ? "insufficient_sources" : "issues_found";
  } else if (material.length === 0) overall = "issues_found";
  else overall = "all_supported";
  return {
    release_recommendation: rec,
    release_reasons: reasons,
    overall_status: overall,
    counts,
    material_unsupported_claims: material.filter((c) => c.verdict === "unsupported").map((c) => c.index),
    qualifier_loss_detected: qualifierLoss.length > 0
  };
}

// ../verify-core/src/ledger.ts
var GENESIS = "GENESIS";
function entryHash(prevHash, payloadHashHex, seq, requestId) {
  return sha256Hex(`${prevHash ?? GENESIS}|${payloadHashHex}|${seq}|${requestId}`);
}

// ../verify-core/src/calibration.ts
var SCORE_BIN_EDGES = [0, 0.6, 0.7, 0.8, 0.9, 0.95];
function scoreBin(score) {
  let bin = 0;
  for (let i = 0; i < SCORE_BIN_EDGES.length; i++) if (score >= SCORE_BIN_EDGES[i]) bin = i;
  return bin;
}
var MIN_BIN_N = 10;
function calibratedConfidence(table, verdict, score) {
  if (!table || !table.validated) return null;
  const bin = table.bins.find((b) => b.verdict === verdict && b.bin === scoreBin(score));
  if (!bin || bin.heldout_n < MIN_BIN_N || bin.heldout_precision === null || bin.consistent === false) return null;
  return { value: Math.round(bin.heldout_precision * 1e3) / 1e3, label: `calibrated on benchmark ${table.version}` };
}

// ../verify-core/src/freshness.ts
function day(s) {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s.trim());
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(t) ? t : null;
}
function versionParts(v) {
  if (!v) return null;
  const m = /^v?(\d+(?:\.\d+)*)$/.exec(v.trim());
  return m ? m[1].split(".").map(Number) : null;
}
function newerThan(a, b) {
  const da = day(a.effective_date) ?? day(a.published_at);
  const db = day(b.effective_date) ?? day(b.published_at);
  if (da !== null && db !== null) return da > db ? 1 : da < db ? -1 : 0;
  const va = versionParts(a.version);
  const vb = versionParts(b.version);
  if (va && vb) {
    for (let i = 0; i < Math.max(va.length, vb.length); i++) {
      const x = va[i] ?? 0;
      const y = vb[i] ?? 0;
      if (x !== y) return x > y ? 1 : -1;
    }
    return 0;
  }
  return null;
}
function dated(s) {
  return day(s.effective_date) !== null || day(s.published_at) !== null || versionParts(s.version) !== null || !!s.version?.trim();
}
function controls(newer, cited) {
  if ((newer.supersedes ?? []).includes(cited.id)) return true;
  return newer.authority_rank === "primary" && cited.authority_rank === "secondary" && newerThan(newer, cited) === 1;
}
function conflictWith(claim, s) {
  for (const m of templateMatches(claim, [s])) {
    const c = m.conflicts[0];
    if (c) return c.kind;
  }
  return null;
}
function agreesWith(claim, s) {
  return templateMatches(claim, [s]).some((m) => m.conflicts.length === 0 && !m.modal_mismatch);
}
function claimFreshness(c, sources) {
  const span = c.provenance.spans.find((s) => s.role === "supports") ?? c.provenance.spans.find((s) => s.role === "qualifies") ?? c.provenance.spans[0];
  const base2 = { claim_index: c.index, newer_source_id: null, conflict_type: null };
  if (!span) return { ...base2, status: "unknown", cited_source_id: null, explanation: "the claim relies on no supplied source, so there is nothing to date" };
  const cited = sources.find((s) => s.id === span.source_id);
  if (!cited) return { ...base2, status: "unknown", cited_source_id: span.source_id, explanation: "the cited source was not supplied" };
  const others = sources.filter((s) => s.id !== cited.id);
  for (const s of others.filter((o) => controls(o, cited))) {
    const kind = conflictWith(c.text, s);
    if (kind) {
      const how = (s.supersedes ?? []).includes(cited.id) ? `lists ${cited.id} in supersedes` : `is a newer primary source than the secondary source ${cited.id}`;
      return { claim_index: c.index, status: "conflicted_by_newer_source", cited_source_id: cited.id, newer_source_id: s.id, conflict_type: kind, explanation: `${s.id} ${how} and states a different ${kind === "number" ? "value" : kind} for this statement` };
    }
    if (!agreesWith(c.text, s)) {
      return { claim_index: c.index, status: "unknown", cited_source_id: cited.id, newer_source_id: s.id, conflict_type: null, explanation: `${s.id} replaces ${cited.id}; code could not confirm that it says the same thing` };
    }
  }
  for (const s of others) {
    if (newerThan(s, cited) !== 1) continue;
    const kind = conflictWith(c.text, s);
    if (kind) {
      return { claim_index: c.index, status: "unknown", cited_source_id: cited.id, newer_source_id: s.id, conflict_type: kind, explanation: `${s.id} is dated later and states a different ${kind === "number" ? "value" : kind}, but nothing says it replaces ${cited.id}` };
    }
  }
  if (!dated(cited)) return { ...base2, status: "unknown", cited_source_id: cited.id, explanation: `${cited.id} carries no effective date, publication date or version` };
  return { ...base2, status: "established", cited_source_id: cited.id, explanation: `${cited.id} is dated or versioned and no controlling newer source states otherwise` };
}

// ../verify-core/src/engine.ts
var DEFAULT_ESTIMATES = { extract: 0.2, fast: 0.15, strong: 1.6, deliberate: 12 };
function mergeCost(lines) {
  const by = /* @__PURE__ */ new Map();
  for (const l of lines) {
    const key = `${l.provider}|${l.model}`;
    const cur = by.get(key);
    if (cur) {
      cur.calls += l.calls;
      cur.input_tokens += l.input_tokens;
      cur.output_tokens += l.output_tokens;
      cur.cost_cents += l.cost_cents;
    } else by.set(key, { ...l });
  }
  return [...by.values()].map((l) => ({ ...l, cost_cents: Math.round(l.cost_cents * 1e4) / 1e4 }));
}
async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(n, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}
async function runEngine(input2, opts = {}) {
  const now = opts.now ?? Date.now;
  const deadlineAt = opts.deadlineAt ?? now() + 6e4;
  const ceiling = opts.costCeilingCents ?? 25;
  const est = opts.estimates ?? DEFAULT_ESTIMATES;
  const allowStrong = opts.allowStrong ?? true;
  const deliberation = opts.deliberation ?? "off";
  const costs = [];
  let spent = 0;
  const partialReasons = /* @__PURE__ */ new Set();
  const telemetry = {
    extraction: "fallback",
    claims: 0,
    rejected: 0,
    splits: 0,
    coverage_added: 0,
    resolved_by: { code: 0, model: 0, deliberation: 0 },
    escalations: 0,
    deliberations: 0,
    discarded_quotes: 0,
    model_calls: 0,
    failures: {}
  };
  const fail = (k) => telemetry.failures[k] = (telemetry.failures[k] ?? 0) + 1;
  const charge = (lines) => {
    for (const l of lines) {
      if (!l) continue;
      costs.push(l);
      spent += l.cost_cents;
      telemetry.model_calls += l.calls;
    }
  };
  const canSpend = (estimate) => spent + estimate <= ceiling;
  const timeLeft = () => deadlineAt - now();
  const sources = hashSources(input2.sources ?? []);
  const question = input2.question ?? "";
  const answer = input2.answer ?? "";
  const requireCitations = !!input2.options?.require_citations;
  const models = /* @__PURE__ */ new Set();
  const promptVersions = /* @__PURE__ */ new Set();
  let candidates = null;
  let origin = "fallback";
  if (opts.extract) {
    if (!canSpend(est.extract)) {
      partialReasons.add("cost ceiling reached before claim extraction; used sentence-level claims");
    } else if (timeLeft() < 2e3) {
      partialReasons.add("deadline reached before claim extraction; used sentence-level claims");
    } else {
      const r = await opts.extract({ question, answer, deadlineAt });
      charge(r.cost);
      if (r.ok) {
        candidates = r.candidates;
        origin = "model";
        telemetry.extraction = r.cached ? "cached" : "model";
        models.add(r.model);
        promptVersions.add(r.prompt_version);
      } else {
        fail(`extract:${r.error}`);
        partialReasons.add("claim extraction model unavailable; used sentence-level claims");
      }
    }
  }
  const s2 = stage2(answer, candidates ?? fallbackCandidates(answer), origin, opts.maxClaims ?? 60);
  const net = coverageNet(answer, s2.accepted);
  const accepted = [...s2.accepted, ...net].slice(0, opts.maxClaims ?? 60);
  if (s2.accepted.length + net.length > accepted.length) partialReasons.add(`answer has more than ${opts.maxClaims ?? 60} claims; the rest were not checked`);
  telemetry.claims = accepted.length;
  telemetry.rejected = s2.rejected.length;
  telemetry.splits = s2.splits;
  telemetry.coverage_added = net.length;
  const decideClaim = async (claim) => {
    const facts = codeFacts(claim.text, sources);
    const byCode = sources.length ? decideByCode(claim.text, sources, facts) : null;
    if (byCode) return byCode;
    if (!sources.length) {
      return { ...unresolved("provider_error", facts), verdict: "unsupported", failure_reason: "no_supporting_span", rule_id: "R-NO-SOURCES", internal_score: 0.9 };
    }
    if (!opts.adjudicate) return { ...unresolved("provider_error", facts), failure_reason: "not_adjudicated", rule_id: "R-NOT-ADJUDICATED" };
    const excerpts = selectExcerpts(claim.text, sources);
    const call = async (tier2, hint) => {
      const r = await opts.adjudicate({ claim: claim.text, question, excerpts, sources, tier: tier2, hint, deadlineAt });
      charge([r.cost]);
      if (r.ok) {
        models.add(r.model);
        promptVersions.add(r.prompt_version);
      } else fail(`${tier2}:${r.error}`);
      return r;
    };
    if (!canSpend(est.fast)) return unresolved("cost_ceiling", facts);
    if (timeLeft() < 3e3) return unresolved("deadline", facts);
    let tier = "fast";
    let res = await call("fast", null);
    if (!res.ok) {
      if (allowStrong && canSpend(est.strong) && timeLeft() > 5e3) {
        tier = "strong";
        res = await call("strong", "the fast adjudicator failed");
      }
      if (!res.ok) return unresolved(timeLeft() < 1e3 ? "deadline" : "provider_error", facts);
    }
    let decision = decideWithModel(claim.text, sources, res.adjudication, tier, facts);
    if (decision.escalate && tier === "fast") {
      if (allowStrong && canSpend(est.strong) && timeLeft() > 5e3) {
        telemetry.escalations++;
        const strong = await call("strong", decision.escalate);
        if (strong.ok) {
          decision = decideWithModel(claim.text, sources, strong.adjudication, "strong", facts);
        } else {
          decision = finalizeWithoutStrong(decision);
        }
      } else {
        if (allowStrong && !canSpend(est.strong)) partialReasons.add("cost ceiling reached; some claims were not escalated");
        decision = finalizeWithoutStrong(decision);
      }
    }
    delete decision.escalate;
    const wantsPanel = opts.deliberate && (deliberation === "all" || deliberation === "escalation" && (tier === "strong" || decision.internal_score < 0.75 || decision.rule_id.includes("STRONG")));
    if (wantsPanel && canSpend(est.deliberate) && timeLeft() > 2e4) {
      const d = await opts.deliberate({ claim: claim.text, question, excerpts, sources, tier: "strong", hint: null, deadlineAt, base: decision });
      charge(d.cost);
      telemetry.deliberations++;
      if (d.ok) {
        models.add(d.model);
        decision = reconcileDeliberation(decision, d);
      } else fail(`deliberate:${d.error}`);
    }
    return decision;
  };
  const answerClauseCheck = async (claim, d) => {
    if (d.verdict !== "unsupported" || d.failure_reason !== "qualifier_loss" || claim.answer_start === null || claim.answer_end === null) return d;
    const dropped = d.qualifiers.filter((q) => q.status === "dropped" && q.source_text);
    if (!dropped.length) return d;
    const lower = (t) => normalize(t).toLowerCase().replace(/[.!?]+$/, "").trim();
    const clause = clauseContext(answer, claim.answer_start, claim.answer_end).text.trim();
    if (!clause || lower(clause) === lower(claim.text)) return d;
    if (!dropped.every((q) => lower(clause).includes(lower(q.source_text)))) return d;
    const redo = await decideClaim({ text: clause });
    return {
      ...redo,
      rule_id: `R-ANSWER-CLAUSE:${redo.rule_id}`,
      checks: [...redo.checks, { kind: "qualifiers", result: "pass", detail: `the answer clause states ${dropped.map((q) => `"${q.source_text}"`).join(", ")}, which the extracted claim lacked; decided on the clause` }]
    };
  };
  const decisions = await pool(accepted, opts.concurrency ?? 6, async (claim) => answerClauseCheck(claim, await decideClaim(claim)));
  const markers = parseCitations(answer, sources);
  const claims = accepted.map((c, i) => {
    const d = decisions[i];
    if (d.failure_reason === "cost_ceiling") partialReasons.add("cost ceiling reached; some claims were not checked");
    if (d.failure_reason === "deadline") partialReasons.add("time limit reached; some claims were not checked");
    if (d.failure_reason === "provider_error") partialReasons.add("a model provider failed; some claims were not checked");
    telemetry.resolved_by[d.resolved_by]++;
    telemetry.discarded_quotes += d.discarded_quotes;
    const cited = citedFor(answer, markers, c.answer_start, c.answer_end);
    const supportIds = d.spans.filter((s) => s.role === "supports").map((s) => s.source_id);
    const cal = calibratedConfidence(opts.calibration ?? null, d.verdict, d.internal_score);
    return {
      index: i,
      text: c.text,
      claim_type: c.claim_type,
      material: c.material,
      answer_start: c.answer_start,
      answer_end: c.answer_end,
      verdict: d.verdict,
      failure_reason: d.failure_reason,
      resolved_by: d.resolved_by,
      calibrated_confidence: cal?.value ?? null,
      calibration_label: cal?.label ?? null,
      citation: { cited, status: d.verdict === "supported" ? citationStatus(requireCitations, cited, supportIds) : requireCitations ? cited.length ? "mismatch" : "missing" : "not_required" },
      provenance: {
        spans: d.spans,
        context: d.context,
        qualifiers: d.qualifiers,
        checks: d.checks,
        rule_id: d.rule_id,
        model_used: d.resolved_by !== "code",
        models: d.resolved_by === "code" ? [] : [...models],
        prompt_versions: d.resolved_by === "code" ? [] : [...promptVersions],
        discarded_quotes: d.discarded_quotes
      }
    };
  });
  const partial = partialReasons.size > 0;
  const release = decideRelease({
    claims,
    partial,
    requireCitations,
    thresholds: input2.options?.thresholds,
    noSources: sources.length === 0 || sources.every((s) => !s.text.trim())
  });
  const costLines = mergeCost(costs);
  return {
    claims,
    rejected_claims: s2.rejected,
    partial,
    partial_reasons: [...partialReasons],
    overall_status: release.overall_status,
    release_recommendation: release.release_recommendation,
    release_reasons: release.release_reasons,
    counts: { ...release.counts, resolved_by_code: claims.filter((c) => c.resolved_by === "code").length },
    material_unsupported_claims: release.material_unsupported_claims,
    qualifier_loss_detected: release.qualifier_loss_detected,
    cost_lines: costLines,
    cost_cents: Math.round(spent * 1e4) / 1e4,
    versions: {
      schema: SCHEMA_VERSION,
      core: CORE_VERSION,
      extraction_prompt: opts.promptVersions?.extraction ?? "none",
      adjudication_prompt: opts.promptVersions?.adjudication ?? "none",
      rules: RULES_VERSION,
      calibration: opts.calibration?.validated ? opts.calibration.version : null
    },
    sources,
    internal_scores: decisions.map((d) => d.internal_score),
    telemetry
  };
}
function finalizeWithoutStrong(d) {
  const out = { ...d, qualifiers: d.qualifiers.map((r) => ({ ...r })), internal_score: d.internal_score - 0.05 };
  delete out.escalate;
  if (d.rule_id === "R-MODEL-SUPPORTED-PENDING") {
    out.rule_id = "R-MODEL-SUPPORTED-FAST-CONFIRMED";
    for (const r of out.qualifiers) {
      if (r.status === "ambiguous" && r.material) {
        r.status = "preserved";
        r.note = `${r.note}; judged preserved by the model (code could not decide)`;
      }
    }
  }
  return out;
}
function reconcileDeliberation(base2, d) {
  const check2 = { kind: "qualifiers", result: "inconclusive", detail: `deliberation panel: ${d.votes.map((v) => `${v.provider}=${v.verdict}`).join(", ")}` };
  if ((base2.verdict === "supported" || base2.verdict === "contradicted") && d.verdict !== base2.verdict) {
    return {
      ...base2,
      verdict: "unverifiable",
      failure_reason: "deliberation_disagreement",
      rule_id: "R-DELIBERATION-DOWNGRADE",
      resolved_by: "deliberation",
      checks: [...base2.checks, check2],
      internal_score: Math.min(base2.internal_score, 0.55)
    };
  }
  return { ...base2, checks: [...base2.checks, check2] };
}

// ../verify-policy/src/claims.ts
var STATUS = { preserved: "preserved", dropped: "missing", contradicted: "conflicting", ambiguous: "ambiguous" };
var h = (s) => s === null || s === void 0 ? null : sha256Hex(s);
function supportAssessment(c) {
  if (c.verdict === "supported") return "supported";
  if (c.verdict === "contradicted") return "contradicted";
  if (c.verdict === "unsupported" && c.failure_reason === "qualifier_loss") return "supported";
  return "unresolved";
}
function toGateClaim(c, o) {
  const byId = new Map(o.sources.map((s) => [s.id, s]));
  const spans = c.provenance.spans.map((s) => {
    const src = byId.get(s.source_id);
    const valid = !!src && sha256Hex(src.text) === s.source_hash && spanIsExact(src.text, s);
    return {
      source_id: s.source_id,
      start: s.start,
      end: s.end,
      role: s.role,
      match_type: s.match_type,
      source_hash: s.source_hash,
      quote_hash: sha256Hex(s.quote),
      valid,
      ...o.include_text ? { quote: s.quote } : {}
    };
  });
  const span_valid = spans.length ? spans.every((s) => s.valid) : c.provenance.discarded_quotes > 0 ? false : null;
  const qualifier_checks = c.provenance.qualifiers.map((q) => ({
    type: q.type,
    status: STATUS[q.status] ?? "ambiguous",
    material: q.material,
    proposed_by: q.proposed_by,
    note: q.note,
    claim_text_hash: h(q.claim_text),
    source_text_hash: h(q.source_text),
    ...o.include_text ? { claim_text: q.claim_text, source_text: q.source_text } : {}
  }));
  const deterministic = c.resolved_by === "code" && span_valid !== false && qualifier_checks.every((q) => q.proposed_by === "code") && c.failure_reason !== "not_adjudicated";
  const assessment = supportAssessment(c);
  const ambiguousMaterial = qualifier_checks.some((q) => q.material && q.status === "ambiguous");
  const failing = c.verdict === "contradicted" || c.verdict === "unsupported";
  const review_required = span_valid === false || c.verdict === "unverifiable" && (o.materiality === "critical" || o.materiality === "high") || ambiguousMaterial && c.verdict !== "supported" || failing && !deterministic;
  const required = !!o.require_citation;
  return {
    index: o.index ?? c.index,
    origin: o.origin,
    expected_id: o.expected_id ?? null,
    materiality: o.materiality,
    claim_hash: sha256Hex(c.text),
    ...o.include_text ? { text: c.text } : {},
    present_in_answer: true,
    answer_span: c.answer_start === null || c.answer_end === null ? null : { start: c.answer_start, end: c.answer_end },
    verdict: c.verdict,
    failure_reason: c.failure_reason,
    verify_rule_id: c.provenance.rule_id,
    span_valid,
    support_assessment: assessment,
    qualifier_checks,
    resolved_by: c.resolved_by,
    review_required,
    deterministic,
    citation: { required, status: required ? c.citation.status === "not_required" ? "missing" : c.citation.status : "not_required" },
    spans,
    discarded_quotes: c.provenance.discarded_quotes,
    calibrated_confidence: c.calibrated_confidence
  };
}
function missingExpectedClaim(o) {
  return {
    index: o.index,
    origin: "expected",
    expected_id: o.expected_id,
    materiality: o.materiality,
    claim_hash: sha256Hex(o.text),
    ...o.include_text ? { text: o.text } : {},
    present_in_answer: false,
    answer_span: null,
    verdict: null,
    failure_reason: "expected_claim_missing",
    verify_rule_id: null,
    span_valid: null,
    support_assessment: "unresolved",
    qualifier_checks: [],
    resolved_by: "code",
    review_required: o.materiality === "critical" || o.materiality === "high",
    deterministic: true,
    citation: { required: false, status: "not_required" },
    spans: [],
    discarded_quotes: 0,
    calibrated_confidence: null
  };
}

// ../verify-policy/src/policy.ts
var DECISION_RANK = { pass: 0, warn: 1, block: 2, hold: 3 };
function worst(decisions) {
  return decisions.reduce((a, b) => DECISION_RANK[b] > DECISION_RANK[a] ? b : a, "pass");
}
function firstQualifier(c, statuses) {
  const q = c.qualifier_checks.find((x) => x.material && statuses.includes(x.status));
  return q?.type ?? null;
}
function rawFindings(c) {
  const base2 = { level: "claim", claim_index: c.index, materiality: c.materiality, verdict: c.verdict };
  const out = [];
  if (!c.present_in_answer) {
    out.push({ ...base2, rule: "XYN-003", kind: "expected_claim_missing", deterministic: true, reason: "the answer no longer makes this expected claim", qualifier_type: null });
    return out;
  }
  switch (c.verdict) {
    case "contradicted":
      if (c.failure_reason === "condition_mismatch") {
        out.push({ ...base2, rule: "XYN-002", kind: "conflicting_qualifier", deterministic: c.deterministic, reason: "a condition in the claim conflicts with the source", qualifier_type: firstQualifier(c, ["conflicting"]) ?? "condition" });
      } else {
        out.push({ ...base2, rule: "XYN-001", kind: c.failure_reason ?? "contradicted", deterministic: c.deterministic, reason: `contradicted by a source passage (${c.failure_reason ?? "conflict"})`, qualifier_type: null });
      }
      break;
    case "unsupported":
      if (c.failure_reason === "qualifier_loss") {
        const conflicting = c.qualifier_checks.some((q) => q.material && q.status === "conflicting");
        out.push({
          ...base2,
          rule: "XYN-002",
          kind: conflicting ? "conflicting_qualifier" : "dropped_qualifier",
          deterministic: c.deterministic,
          reason: conflicting ? "the claim conflicts with a qualifier the source states" : "the claim drops a material qualifier the source states",
          qualifier_type: firstQualifier(c, ["missing", "conflicting"])
        });
      } else {
        const invented = c.discarded_quotes > 0;
        out.push({
          ...base2,
          rule: "XYN-003",
          kind: invented ? "invented_quote" : c.failure_reason ?? "unsupported",
          deterministic: c.deterministic,
          reason: invented ? "no supporting span; a model-proposed quote was not in the source and was discarded" : "no supplied source supports the claim",
          qualifier_type: null
        });
      }
      break;
    case "unverifiable": {
      const infra = c.failure_reason === "cost_ceiling" || c.failure_reason === "deadline" || c.failure_reason === "provider_error";
      out.push({
        ...base2,
        rule: infra ? "XYN-006" : "XYN-005",
        kind: c.failure_reason ?? "unverifiable",
        deterministic: c.deterministic,
        reason: infra ? `the verifier could not check this claim (${c.failure_reason})` : c.failure_reason === "not_adjudicated" ? "code could not settle this claim and no verifier model was used (local mode)" : `the sources cannot resolve this claim (${c.failure_reason ?? "unverifiable"})`,
        qualifier_type: null
      });
      break;
    }
    default:
      break;
  }
  const wrongCitation = c.citation.status === "mismatch" && c.verdict !== "unverifiable";
  if (c.citation.required && (c.citation.status === "missing" || wrongCitation)) {
    out.push({
      ...base2,
      rule: "XYN-004",
      kind: c.citation.status === "missing" ? "missing_citation" : "wrong_citation",
      deterministic: c.citation.status === "missing" ? true : c.deterministic,
      reason: c.citation.status === "missing" ? "citations are required and this claim has none" : "the claim cites a passage that does not support it",
      qualifier_type: null
    });
  }
  return out;
}
var INTEGRITY_REASON = {
  source_hash_mismatch: "a source file no longer matches its recorded sha256",
  source_missing: "a source file named in the golden set is missing or empty",
  endpoint_timeout: "the application endpoint timed out past the retry policy",
  endpoint_error: "the application endpoint failed past the retry policy",
  verifier_error: "the verifier returned an error",
  verifier_unavailable: "the verifier was unavailable",
  quota_exhausted: "the Verify quota is exhausted",
  excessive_unresolved: "too many material claims stayed unresolved",
  answer_missing: "no answer to check"
};
function decide(f, counts, c, p) {
  const m = f.materiality;
  let d;
  switch (f.rule) {
    case "XYN-006":
      return { decision: "hold", downgraded: null };
    case "XYN-001": {
      const limit = m ? p.max_contradicted[m] : void 0;
      d = limit !== void 0 && (counts.get(`001:${m}`) ?? 0) > limit ? "block" : "warn";
      break;
    }
    case "XYN-002":
      d = p.fail_on_material_qualifier_loss && m !== null && isMaterial(m) ? "block" : "warn";
      break;
    case "XYN-003": {
      if (f.kind === "material_supported_ratio") {
        d = "block";
        break;
      }
      if (f.kind === "expected_claim_missing") {
        d = p.missing_expected_claim === "block" && m !== null && isMaterial(m) ? "block" : "warn";
        break;
      }
      const limit = m ? p.max_unsupported[m] : void 0;
      d = limit !== void 0 && (counts.get(`003:${m}`) ?? 0) > limit ? "block" : "warn";
      break;
    }
    case "XYN-004":
      d = (p.require_citations || !!c?.citation.required) && m !== null && isMaterial(m) ? "block" : "warn";
      break;
    case "XYN-005":
      d = p.treat_unverifiable_as;
      if (d === "hold") return { decision: "hold", downgraded: null };
      break;
    default:
      d = "warn";
  }
  if (d === "block" && !f.deterministic && p.model_findings === "warn") {
    return { decision: "warn", downgraded: "depends on a model judgement; blocks only with policy.model_findings: block" };
  }
  return { decision: d, downgraded: null };
}
function sortKey(f) {
  return `${String(f.claim_index ?? -1).padStart(5, "0")}|${f.rule}|${f.kind}|${f.qualifier_type ?? ""}`;
}
var CLASSIFIED_UNVERIFIABLE = ["comparative", "out_of_scope", "conflicting_sources"];
function evaluateCase(input2) {
  const { claims, integrity, policy: p, mode } = input2;
  const raws = [];
  for (const c of claims) for (const f of rawFindings(c)) raws.push({ f, c });
  for (const i of integrity) {
    raws.push({
      f: { rule: "XYN-006", level: "case", claim_index: null, materiality: null, deterministic: true, kind: i.kind, reason: `${INTEGRITY_REASON[i.kind]}${i.detail ? `: ${i.detail}` : ""}`, qualifier_type: null, verdict: null },
      c: null
    });
  }
  const material = claims.filter((c) => isMaterial(c.materiality));
  const supportedMaterial = material.filter((c) => c.present_in_answer && c.verdict === "supported");
  if (p.min_material_supported_ratio !== null && material.length > 0 && supportedMaterial.length / material.length < p.min_material_supported_ratio) {
    raws.push({
      f: {
        rule: "XYN-003",
        level: "case",
        claim_index: null,
        materiality: "high",
        deterministic: material.every((c) => c.deterministic),
        kind: "material_supported_ratio",
        reason: `${supportedMaterial.length} of ${material.length} material claims supported, below min_material_supported_ratio ${p.min_material_supported_ratio}`,
        qualifier_type: null,
        verdict: null
      },
      c: null
    });
  }
  if (mode === "hosted" && material.length > 0) {
    const tried = material.filter((c) => c.verdict === "unverifiable" && c.resolved_by !== "code" && !["not_adjudicated", ...CLASSIFIED_UNVERIFIABLE].includes(c.failure_reason ?? ""));
    if (tried.length / material.length > p.max_unresolved_ratio) {
      raws.push({
        f: { rule: "XYN-006", level: "case", claim_index: null, materiality: null, deterministic: false, kind: "excessive_unresolved", reason: `${INTEGRITY_REASON.excessive_unresolved}: ${tried.length} of ${material.length} (max_unresolved_ratio ${p.max_unresolved_ratio})`, qualifier_type: null, verdict: null },
        c: null
      });
    }
  }
  const counts = /* @__PURE__ */ new Map();
  for (const { f } of raws) {
    if (f.level !== "claim" || !f.materiality) continue;
    if (f.rule === "XYN-001") counts.set(`001:${f.materiality}`, (counts.get(`001:${f.materiality}`) ?? 0) + 1);
    if (f.rule === "XYN-003") counts.set(`003:${f.materiality}`, (counts.get(`003:${f.materiality}`) ?? 0) + 1);
  }
  const findings = raws.map(({ f, c }) => ({ ...f, ...decide(f, counts, c, p) })).sort((a, b) => sortKey(a) < sortKey(b) ? -1 : sortKey(a) > sortKey(b) ? 1 : 0);
  const decision = worst(findings.map((f) => f.decision));
  const reasons = [];
  const by = (d) => findings.filter((f) => f.decision === d);
  if (by("hold").length) reasons.push(`hold: ${[...new Set(by("hold").map((f) => f.reason))].join("; ")}`);
  if (by("block").length) reasons.push(`block: ${by("block").length} finding(s) \u2014 ${[...new Set(by("block").map((f) => f.rule))].join(", ")}`);
  if (by("warn").length) reasons.push(`warn: ${by("warn").length} finding(s)`);
  if (!reasons.length) reasons.push("every material claim is supported by the supplied sources and no threshold is exceeded");
  return {
    decision,
    findings,
    reasons,
    counts: {
      claims: claims.length,
      material: material.length,
      supported_material: supportedMaterial.length,
      deterministic_findings: findings.filter((f) => f.deterministic).length,
      model_findings: findings.filter((f) => !f.deterministic).length
    }
  };
}
function runOutcome(decision, o) {
  if (decision === "block" && o.override) {
    return { decision, exit_code: 0, conclusion: "neutral", title: `Overridden by ${o.override.actor}` };
  }
  if (o.enforcement === "report_only") {
    const title = decision === "block" ? "report-only: would block" : decision === "hold" ? "hold: the check could not complete (report-only)" : decision;
    return { decision, exit_code: 0, conclusion: decision === "pass" || decision === "warn" ? "success" : "neutral", title };
  }
  if (decision === "block") return o.fail_on.includes("block") ? { decision, exit_code: 1, conclusion: "failure", title: "block" } : { decision, exit_code: 0, conclusion: "neutral", title: "block (fail-on excludes block)" };
  if (decision === "hold") return o.fail_on.includes("hold") ? { decision, exit_code: 1, conclusion: "failure", title: "hold: the check could not complete" } : { decision, exit_code: 0, conclusion: "neutral", title: "hold: the check could not complete" };
  if (decision === "warn") return o.fail_on.includes("warn") ? { decision, exit_code: 1, conclusion: "failure", title: "warn" } : { decision, exit_code: 0, conclusion: "success", title: "warn" };
  return { decision, exit_code: 0, conclusion: "success", title: "pass" };
}
function checkOverride(o) {
  if (o.decision === "hold") return { ok: false, error: "a hold cannot be overridden; fix the cause and re-run" };
  if (o.decision !== "block") return { ok: false, error: `nothing to override (decision is ${o.decision})` };
  if (!o.policy.overrides.enabled) return { ok: false, error: "overrides are disabled for this repository (policy.overrides.enabled: false)" };
  const writes = (p) => p === "admin" || p === "maintain" || p === "write";
  if (!o.label_applied_by || !writes(o.label_applier_permission)) return { ok: false, error: `the "${o.policy.overrides.label}" label must be applied by someone with write access` };
  if (!o.comment_author || !writes(o.comment_author_permission)) return { ok: false, error: "the /verify-override comment must come from someone with write access" };
  if (!o.reason || o.reason.trim().length < 10) return { ok: false, error: 'an override needs a reason: comment "/verify-override <reason>" (at least 10 characters)' };
  if (o.policy.overrides.require_team && !o.author_teams.includes(o.policy.overrides.require_team)) {
    return { ok: false, error: `overrides require membership of ${o.policy.overrides.require_team}` };
  }
  return { ok: true };
}
function parseOverrideComment(body) {
  const m = /^\s*\/verify-override\s+(.+?)\s*$/m.exec(body ?? "");
  return m ? m[1].slice(0, 2e3) : null;
}

// ../verify-policy/src/fingerprint.ts
function normalizedClaim(text) {
  return normalize(text).toLowerCase();
}
function findingFingerprint(o) {
  return sha256Hex([o.suite, o.case_id, normalizedClaim(o.claim_text), o.verdict ?? "", o.source_hash ?? "", o.qualifier_type ?? ""].join("|"));
}
function caseCacheKey(o) {
  return sha256Hex([sha256Hex(o.question), sha256Hex(o.answer), [...o.source_hashes].sort().join(","), o.config_hash, o.rules_version].join("|"));
}

// ../verify-policy/src/ed25519.ts
var PKCS8_PREFIX = new Uint8Array([48, 46, 2, 1, 0, 48, 5, 6, 3, 43, 101, 112, 4, 34, 4, 32]);
var SPKI_PREFIX = new Uint8Array([48, 42, 48, 5, 6, 3, 43, 101, 112, 3, 33, 0]);
var KeyFormatError = class extends Error {
};
function b64urlEncode(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64Decode(s) {
  const t = s.trim().replace(/-/g, "+").replace(/_/g, "/");
  const padded = t + "=".repeat((4 - t.length % 4) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function hexDecode(s) {
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function ab(u) {
  const out = new Uint8Array(new ArrayBuffer(u.length));
  out.set(u);
  return out;
}
function concat(a, b) {
  const out = new Uint8Array(new ArrayBuffer(a.length + b.length));
  out.set(a);
  out.set(b, a.length);
  return out;
}
function pemBody(pem, label) {
  const m = new RegExp(`-----BEGIN ${label}-----([\\s\\S]+?)-----END ${label}-----`).exec(pem);
  return m ? b64Decode(m[1].replace(/\s+/g, "")) : null;
}
function rawish(s) {
  const t = s.trim();
  if (/^[0-9a-f]{64}$/i.test(t)) return hexDecode(t);
  return b64Decode(t);
}
function privateSeed(key) {
  const der = pemBody(key, "PRIVATE KEY");
  if (der) {
    if (der.length !== 48 || !PKCS8_PREFIX.every((b, i) => der[i] === b)) throw new KeyFormatError("not an Ed25519 PKCS#8 private key");
    return der.slice(16);
  }
  const raw = rawish(key);
  if (raw.length !== 32) throw new KeyFormatError("an Ed25519 private key is a 32-byte seed (or a PKCS#8 PEM)");
  return raw;
}
function keyIdOf(publicKeyRaw) {
  return sha256Hex(publicKeyRaw).slice(0, 16);
}
function subtle() {
  return globalThis.crypto?.subtle ?? null;
}
async function nodeCrypto() {
  try {
    return await import("node:crypto");
  } catch {
    return null;
  }
}
async function publicFromSeed(seed) {
  const s = subtle();
  if (s) {
    try {
      const priv2 = await s.importKey("pkcs8", concat(PKCS8_PREFIX, seed), { name: "Ed25519" }, true, ["sign"]);
      const jwk = await s.exportKey("jwk", priv2);
      if (jwk.x) return b64Decode(jwk.x);
    } catch {
    }
  }
  const nc = await nodeCrypto();
  if (!nc) throw new Error("no Ed25519 implementation available");
  const priv = nc.createPrivateKey({ key: Buffer.from(concat(PKCS8_PREFIX, seed)), format: "der", type: "pkcs8" });
  const spki = nc.createPublicKey(priv).export({ format: "der", type: "spki" });
  return new Uint8Array(spki.subarray(12));
}
async function sign(message, privateKey) {
  const seed = privateSeed(privateKey);
  const pub = await publicFromSeed(seed);
  const s = subtle();
  let sig = null;
  if (s) {
    try {
      const k = await s.importKey("pkcs8", concat(PKCS8_PREFIX, seed), { name: "Ed25519" }, false, ["sign"]);
      sig = new Uint8Array(await s.sign({ name: "Ed25519" }, k, ab(message)));
    } catch {
      sig = null;
    }
  }
  if (!sig) {
    const nc = await nodeCrypto();
    if (!nc) throw new Error("no Ed25519 implementation available");
    const k = nc.createPrivateKey({ key: Buffer.from(concat(PKCS8_PREFIX, seed)), format: "der", type: "pkcs8" });
    sig = new Uint8Array(nc.sign(null, Buffer.from(message), k));
  }
  return { signature: b64urlEncode(sig), public_key: b64urlEncode(pub), key_id: keyIdOf(pub) };
}

// ../verify-policy/src/ledger.ts
var LEDGER_VERSION = "1.0.0";
var LEDGER_VERSION_PARITY = "1.1.0";
var GATE_VERSION = "0.1.0";
var FORMULA = "entry_hash = sha256(prev_hash_or_GENESIS | payload_hash | seq | run_id); payload_hash = sha256(JCS(payload))";
function engineInfo() {
  return { core_version: CORE_VERSION, rules_version: RULES_VERSION, policy_version: POLICY_VERSION, verify_schema: SCHEMA_VERSION };
}
function summarize(cases) {
  const claims = cases.flatMap((c) => c.claims);
  const findings = cases.flatMap((c) => c.findings);
  const byVerdict = {};
  for (const c of claims) {
    const k = c.present_in_answer ? c.verdict ?? "none" : "missing";
    byVerdict[k] = (byVerdict[k] ?? 0) + 1;
  }
  const byRule = { "XYN-001": 0, "XYN-002": 0, "XYN-003": 0, "XYN-004": 0, "XYN-005": 0, "XYN-006": 0 };
  for (const f of findings) byRule[f.rule]++;
  const decisions = { pass: 0, warn: 0, hold: 0, block: 0 };
  for (const c of cases) if (c.status !== "skipped") decisions[c.decision]++;
  return {
    cases_total: cases.length,
    cases_checked: cases.filter((c) => c.status === "checked").length,
    cases_cached: cases.filter((c) => c.status === "cached").length,
    cases_errored: cases.filter((c) => c.status === "error").length,
    cases_skipped: cases.filter((c) => c.status === "skipped").length,
    claims_total: claims.length,
    claims_by_verdict: Object.fromEntries(Object.entries(byVerdict).sort()),
    material_failures: findings.filter((f) => f.decision === "block").length,
    findings_by_rule: byRule,
    deterministic_findings: findings.filter((f) => f.deterministic).length,
    model_findings: findings.filter((f) => !f.deterministic).length,
    decisions
  };
}
function chainOf(run, cases, parity, tail, prevRunHash) {
  const parts = [
    { kind: "run", payload: run },
    ...cases.map((c) => ({ kind: "case", payload: c })),
    ...parity.map((p) => ({ kind: "parity", payload: p })),
    { kind: "decision", payload: tail }
  ];
  const entries = [];
  let prev = prevRunHash;
  parts.forEach((p, i) => {
    const payload_hash = sha256Hex(jcs(p.payload));
    const seq = i + 1;
    const entry_hash = entryHash(prev, payload_hash, seq, run.run_id);
    entries.push({ seq, kind: p.kind, payload_hash, prev_hash: prev, entry_hash });
    prev = entry_hash;
  });
  return { algorithm: "sha256", formula: FORMULA, prev_run_hash: prevRunHash, entries, head: entries[entries.length - 1].entry_hash };
}
function buildLedger(o) {
  const summary = summarize(o.cases);
  const parity = o.parity ?? [];
  return {
    ledger_version: parity.length ? LEDGER_VERSION_PARITY : LEDGER_VERSION,
    kind: "verify-gate-run",
    assurance_scope: ASSURANCE_SCOPE,
    run: o.run,
    cases: o.cases,
    summary,
    decision: o.decision,
    ...parity.length ? { parity } : {},
    chain: chainOf(o.run, o.cases, parity, { summary, decision: o.decision }, o.prev_run_hash ?? null),
    signing: { alg: "none", key_id: null, key_source: "none", wording: SIGNATURE_WORDING, note: "unsigned: no signing key was configured" },
    signature: null
  };
}
function signedBytes(ledger) {
  const { signature: _drop, ...rest } = ledger;
  return jcsBytes(rest);
}
async function signLedger(ledger, privateKey, keySource) {
  const { public_key, key_id } = await sign(new Uint8Array(0), privateKey);
  const withSigning = {
    ...ledger,
    signing: { alg: "Ed25519", key_id, key_source: keySource, wording: SIGNATURE_WORDING, note: `${SIGNATURE_WORDING} (${keySource === "repository-secret" ? "a key from this repository\u2019s secrets" : "a Xyntherium-managed key; public keys at https://xyntherium.com/v1/gate/keys"})` },
    signature: null
  };
  const s = await sign(signedBytes(withSigning), privateKey);
  return { ...withSigning, signature: { value: s.signature, public_key } };
}

// ../verify-policy/src/evaluate.ts
function golden(quote, sourceId) {
  return {
    verdict: "supported",
    reason: "support declared by the golden set",
    evidence: [{ source_id: sourceId, quote, role: "supports" }],
    source_qualifiers: [],
    conflict_type: "none",
    unverifiable_reason: "none",
    arithmetic: null
  };
}
function notAdjudicated() {
  return { verdict: "unverifiable", failure_reason: "not_adjudicated", rule_id: "R-NOT-ADJUDICATED", resolved_by: "code", spans: [], context: null, qualifiers: [], checks: [], discarded_quotes: 0, internal_score: 0.5 };
}
function asClaimResult(d, o) {
  const supportIds = d.spans.filter((s) => s.role === "supports").map((s) => s.source_id);
  const status = d.verdict === "supported" ? citationStatus(o.requireCitations, o.cited, supportIds) : o.requireCitations ? o.cited.length ? "mismatch" : "missing" : "not_required";
  return {
    index: o.index,
    text: o.text,
    claim_type: classifyClaim(o.text),
    material: true,
    answer_start: o.start,
    answer_end: o.end,
    verdict: d.verdict,
    failure_reason: d.failure_reason,
    resolved_by: d.resolved_by,
    calibrated_confidence: null,
    calibration_label: null,
    citation: { cited: o.cited, status },
    provenance: {
      spans: d.spans,
      context: d.context,
      qualifiers: d.qualifiers,
      checks: d.checks,
      rule_id: d.rule_id,
      model_used: d.resolved_by !== "code",
      models: [],
      prompt_versions: [],
      discarded_quotes: d.discarded_quotes
    }
  };
}
function quoteSource(quote, preferred, sources) {
  const ordered = preferred ? [...sources.filter((s) => s.id === preferred), ...sources.filter((s) => s.id !== preferred)] : sources;
  for (const s of ordered) if (locateQuote(s.text, quote).ok) return s.id;
  return null;
}
function overlaps(a, b) {
  const inter = Math.min(a[1], b[1]) - Math.max(a[0], b[0]);
  return inter > 0 && inter >= 0.5 * Math.min(a[1] - a[0], b[1] - b[0]);
}
async function evaluateAnswer(input2) {
  const { question, answer, policy } = input2;
  const hashed = hashSources(input2.sources);
  const requireCitations = policy.require_citations || input2.expected.some((e) => e.require_citation);
  const markers = parseCitations(answer, input2.sources);
  const claims = [];
  const covered = [];
  let partial = false;
  const partialReasons = /* @__PURE__ */ new Set();
  let cost = 0;
  let modelCalls = 0;
  let index = 0;
  for (const e of input2.expected) {
    const loc = locateQuote(answer, e.claim.trim().replace(/[.!]+$/, ""));
    if (!loc.ok) {
      claims.push(missingExpectedClaim({ index: index++, expected_id: e.id, text: e.claim, materiality: e.materiality, include_text: input2.include_text }));
      continue;
    }
    const sentence2 = splitSentences(answer).find((x) => x.start <= loc.span.start && x.end >= loc.span.end);
    const start = sentence2 ? sentence2.start : loc.span.start;
    const end = sentence2 ? sentence2.end : loc.span.end;
    const text = answer.slice(start, end).trim();
    covered.push([start, end]);
    const facts = codeFacts(text, hashed);
    let d = hashed.length ? decideByCode(text, hashed, facts) : null;
    if (!d && e.quote) {
      const sid = quoteSource(e.quote, e.source, hashed);
      if (sid) {
        const g = decideWithModel(text, hashed, golden(e.quote, sid), "strong", facts);
        d = {
          ...g,
          resolved_by: "code",
          rule_id: `R-GOLDEN:${g.rule_id}`,
          qualifiers: g.qualifiers.map((q) => ({ ...q, note: q.note.replace("judged preserved by the strong-tier model (code could not decide)", "accepted on the golden set's declared support (code could not decide)") }))
        };
      }
    }
    if (!d && input2.engine?.adjudicate) {
      const r2 = await runEngine({ question, answer: text, sources: input2.sources, options: { require_citations: false } }, { ...input2.engine, extract: void 0 });
      cost += r2.cost_cents;
      modelCalls += r2.telemetry.model_calls;
      if (r2.partial) {
        partial = true;
        for (const pr of r2.partial_reasons) partialReasons.add(pr);
      }
      if (r2.claims.length) {
        const lead = start + (answer.slice(start, end).length - answer.slice(start, end).trimStart().length);
        for (const c of r2.claims) {
          const cs = c.answer_start === null ? start : lead + c.answer_start;
          const ce = c.answer_end === null ? end : lead + c.answer_end;
          const cited = citedFor(answer, markers, cs, ce);
          const res2 = { ...c, index, answer_start: cs, answer_end: ce, citation: { cited, status: c.verdict === "supported" ? citationStatus(requireCitations, cited, c.provenance.spans.filter((s) => s.role === "supports").map((s) => s.source_id)) : requireCitations ? cited.length ? "mismatch" : "missing" : "not_required" } };
          claims.push(toGateClaim(res2, { sources: input2.sources, materiality: e.materiality, origin: "expected", expected_id: e.id, require_citation: policy.require_citations || !!e.require_citation, include_text: input2.include_text, index: index++ }));
        }
        continue;
      }
    }
    const decision = d ?? notAdjudicated();
    const res = asClaimResult(decision, { index, text, start, end, requireCitations, cited: citedFor(answer, markers, start, end) });
    claims.push(toGateClaim(res, { sources: input2.sources, materiality: e.materiality, origin: "expected", expected_id: e.id, require_citation: policy.require_citations || !!e.require_citation, include_text: input2.include_text, index: index++ }));
  }
  const r = await runEngine({ question, answer, sources: input2.sources, options: { require_citations: requireCitations } }, input2.engine ?? {});
  cost += r.cost_cents;
  modelCalls += r.telemetry.model_calls;
  if (r.partial) {
    partial = true;
    for (const pr of r.partial_reasons) partialReasons.add(pr);
  }
  for (const c of r.claims) {
    if (c.answer_start !== null && c.answer_end !== null && covered.some((s) => overlaps(s, [c.answer_start, c.answer_end]))) continue;
    claims.push(toGateClaim(c, { sources: input2.sources, materiality: c.material ? "medium" : "low", origin: "answer", require_citation: policy.require_citations, include_text: input2.include_text, index: index++ }));
  }
  return { claims, partial, partial_reasons: [...partialReasons], cost_cents: Math.round(cost * 1e4) / 1e4, model_calls: modelCalls, extraction: r.telemetry.extraction };
}

// ../verify-policy/src/gate-case.ts
function stripText(c) {
  const { text: _t, ...rest } = c;
  return {
    ...rest,
    spans: c.spans.map(({ quote: _q, ...s }) => s),
    qualifier_checks: c.qualifier_checks.map(({ claim_text: _a, source_text: _b, ...q }) => q)
  };
}
function effectivePolicy(base2, overrides) {
  if (!overrides) return base2;
  return resolvePolicy({ ...base2, ...overrides }).policy;
}
async function runGateCase(i) {
  const policy = effectivePolicy({ ...i.policy, require_citations: i.policy.require_citations || i.require_citations }, i.policy_overrides);
  const texts = { claims: {}, quotes: {} };
  let claims = [];
  let cost = 0;
  let partial = [];
  const integrity = [...i.integrity];
  const blocked = integrity.some((x) => x.kind === "source_hash_mismatch" || x.kind === "source_missing");
  if (i.answer !== null && !blocked) {
    const ev = await evaluateAnswer({ question: i.question, answer: i.answer, sources: i.sources, expected: i.expected, policy, include_text: true, engine: i.engine });
    cost = ev.cost_cents;
    partial = ev.partial_reasons;
    claims = ev.claims;
    if (ev.partial && i.mode === "hosted") integrity.push({ kind: "verifier_error", detail: ev.partial_reasons.join("; ") || "partial result" });
  } else if (i.answer === null && !integrity.length) {
    integrity.push({ kind: "answer_missing", detail: "no recorded answer and no endpoint response" });
  }
  for (const c of claims) {
    if (c.text) texts.claims[c.index] = c.text;
    for (const s of c.spans) if (s.quote) texts.quotes[s.quote_hash] = s.quote;
  }
  const d = evaluateCase({ claims, integrity, policy, mode: i.mode });
  const findings = d.findings.map((f) => {
    const c = f.claim_index === null ? null : claims.find((x) => x.index === f.claim_index) ?? null;
    return {
      ...f,
      fingerprint: findingFingerprint({ suite: i.suite, case_id: i.case_id, claim_text: c?.text ?? f.kind, verdict: f.verdict, source_hash: c?.spans[0]?.source_hash ?? null, qualifier_type: f.qualifier_type })
    };
  });
  const units = i.mode === "hosted" ? claims.filter((c) => c.present_in_answer).length : 0;
  const ledger = {
    suite: i.suite,
    case_id: i.case_id,
    location: i.location,
    status: integrity.some((x) => x.kind === "answer_missing" || x.kind === "endpoint_error" || x.kind === "endpoint_timeout") ? "error" : "checked",
    cache_key: i.cache_key,
    question_hash: sha256Hex(i.question),
    answer_hash: i.answer === null ? null : sha256Hex(i.answer),
    request_hash: i.request_hash,
    response_hash: i.response_hash,
    source_ids: i.sources.map((s) => s.id),
    claims: i.include_text ? claims : claims.map(stripText),
    findings,
    decision: d.decision,
    reasons: partial.length ? [...d.reasons, `partial: ${partial.join("; ")}`] : d.reasons,
    counts: d.counts,
    billable_units: units,
    error: integrity.find((x) => x.kind === "endpoint_error" || x.kind === "endpoint_timeout" || x.kind === "answer_missing") ? { code: integrity.find((x) => x.kind.startsWith("endpoint") || x.kind === "answer_missing").kind, message: integrity[0].detail } : null
  };
  return { ledger, texts, billable_units: units, cost_cents: cost };
}
function cachedCase(prior, now) {
  return { ...prior, status: "cached", location: now.location, request_hash: now.request_hash, response_hash: now.response_hash, billable_units: 0 };
}

// ../verify-policy/src/report.ts
var COMMENT_MARKER = "<!-- xyntherium-verify-gate -->";
var ICON = { pass: "\u2705", warn: "\u26A0\uFE0F", hold: "\u23F8\uFE0F", block: "\u{1F6D1}" };
function cell(s, max = 160) {
  const t = s.replace(/\s+/g, " ").trim();
  const cut = t.length > max ? `${t.slice(0, max - 1)}\u2026` : t;
  return cut.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function caseKey(c) {
  return `${c.suite}/${c.case_id}`;
}
function findingRow(c, f, texts) {
  const claim = f.claim_index !== null ? texts?.claims[f.claim_index] : null;
  const what = claim ? `"${cell(claim, 120)}"` : cell(f.kind.replace(/_/g, " "));
  const extra = f.downgraded ? ` _(${cell(f.downgraded, 90)})_` : "";
  return `| ${cell(caseKey(c))} | ${what} | ${f.rule} ${RULES[f.rule].short} | ${ICON[f.decision]} ${f.decision}${extra} | ${cell(f.reason, 140)} |`;
}
function evidence(c, texts) {
  const rows = c.claims.map((cl) => {
    const text = texts?.claims[cl.index] ?? `claim ${cl.index}`;
    const quals = cl.qualifier_checks.filter((q) => q.material).map((q) => `${q.type}: ${q.status}`).join(", ") || "\u2014";
    return `| ${cl.index} | ${cell(text, 110)} | ${cl.present_in_answer ? cl.verdict ?? "\u2014" : "missing from answer"} | ${cl.span_valid === null ? "\u2014" : cl.span_valid ? "yes" : "no"} | ${cl.support_assessment} | ${cell(quals, 80)} | ${cl.resolved_by} | ${cl.review_required ? "yes" : ""} |`;
  });
  const spans = c.claims.flatMap(
    (cl) => cl.spans.filter((s) => texts?.quotes[s.quote_hash]).map((s) => `- claim ${cl.index}, \`${s.source_id}\` [${s.start}\u2013${s.end}] (${s.role}, ${s.match_type}${s.valid ? "" : ", **span no longer valid**"}): "${cell(texts.quotes[s.quote_hash], 300)}"`)
  );
  return [
    `<details><summary>Claims, evidence and qualifier checks \u2014 ${cell(caseKey(c))}</summary>`,
    "",
    "| # | Claim | Verdict | span_valid | Support | Qualifier checks | Resolved by | Review |",
    "|---|---|---|---|---|---|---|---|",
    ...rows,
    "",
    ...spans.length ? ["Evidence (offsets index the original source text):", "", ...spans, ""] : [],
    "</details>"
  ].join("\n");
}
function renderReport(l, o) {
  const d = l.decision;
  const headline = o.skipped_reason ? `\u23ED\uFE0F skipped: ${o.skipped_reason}` : d.override ? `${ICON.block} block \u2014 Overridden by @${d.override.actor}` : `${ICON[d.decision]} ${d.title}`;
  const cases = l.cases;
  const findings = cases.flatMap((c) => c.findings.filter((f) => f.decision !== "pass").map((f) => ({ c, f })));
  const det = findings.filter((x) => x.f.deterministic);
  const model = findings.filter((x) => !x.f.deterministic);
  const s = l.summary;
  const sig = l.signing.alg === "Ed25519" ? `cryptographically signed by the configured verifier key \`${l.signing.key_id}\`` : "unsigned (no signing key configured)";
  const est = l.run.cost.estimated_monthly_units;
  const out = [
    COMMENT_MARKER,
    `## Verify Gate: ${headline}`,
    "",
    `**${s.cases_total} case(s)** \xB7 ${s.claims_total} claim(s) \xB7 ${s.material_failures} blocking \xB7 ${findings.filter((x) => x.f.decision === "warn").length} warning(s) \xB7 ${l.run.mode} mode \xB7 rules ${l.run.engine.rules_version} \xB7 policy ${l.run.engine.policy_version}${l.run.policy.enforcement === "report_only" ? " \xB7 **report-only**" : ""}`,
    "",
    `> ${ASSURANCE_SCOPE_SENTENCE}`,
    ""
  ];
  if (o.draft) out.push("> **draft: review before trusting.** This golden set was drafted automatically and has not been approved; the Gate reports but does not enforce.", "");
  if (d.override) out.push(`**Override:** @${d.override.actor} at ${d.override.timestamp}: "${cell(d.override.reason, 300)}". Recorded in the signed ledger.`, "");
  if (!o.skipped_reason) {
    out.push("| Case | Decision | Claims | Findings |", "|---|---|---|---|");
    for (const c of cases) {
      const rules = [...new Set(c.findings.filter((f) => f.decision !== "pass").map((f) => f.rule))];
      out.push(`| ${cell(caseKey(c))} | ${c.status === "cached" ? `${ICON[c.decision]} ${c.decision} (cached)` : `${ICON[c.decision]} ${c.decision}`} | ${c.claims.length} | ${rules.join(", ") || "\u2014"} |`);
    }
    out.push("");
    if (det.length) out.push("### Deterministic findings (reproduce identically)", "", "| Case | Claim | Rule | Decision | Detail |", "|---|---|---|---|---|", ...det.map((x) => findingRow(x.c, x.f, o.texts[caseKey(x.c)])), "");
    if (model.length) out.push("### Model-dependent findings", "", "| Case | Claim | Rule | Decision | Detail |", "|---|---|---|---|---|", ...model.map((x) => findingRow(x.c, x.f, o.texts[caseKey(x.c)])), "");
    for (const c of cases.filter((x) => x.claims.length)) out.push(evidence(c, o.texts[caseKey(c)]), "");
  }
  out.push(
    `**Cost:** ${l.run.cost.billable_units} unit(s) this run; ${l.run.cost.cached_cases} cached case(s) at 0 units.${est !== null ? ` Estimated monthly units: ${est.toLocaleString("en-US")}.` : ""}${l.run.sampling.full_run ? "" : ` Sampled ${l.run.sampling.selected_cases} of ${l.run.sampling.total_cases} case(s).`}`,
    "",
    `**Ledger:** \`${o.ledger_path}\` \u2014 ${sig}. Chain head \`${l.chain.head.slice(0, 16)}\`. Check it offline: \`npx @xyntherium/verify-cli ledger verify ${o.ledger_path}\`.`,
    "",
    ...o.github_notes?.length ? [`<sub>${o.github_notes.map((n) => cell(n, 200)).join(" \xB7 ")}</sub>`, ""] : [],
    `<sub>${ASSURANCE_SCOPE_SENTENCE} Framework references are an ${FRAMEWORK_DISCLAIMER.charAt(0).toLowerCase()}${FRAMEWORK_DISCLAIMER.slice(1)}</sub>`
  );
  return out.join("\n");
}

// ../verify-policy/src/sarif.ts
function buildSarif(l, o) {
  const rules = RULE_IDS.map((id) => {
    const r = RULES[id];
    return {
      id,
      name: r.name,
      shortDescription: { text: r.short },
      fullDescription: { text: r.description },
      help: { text: `${r.help}

${ASSURANCE_SCOPE_SENTENCE}`, markdown: `${r.help}

_${ASSURANCE_SCOPE_SENTENCE}_` },
      defaultConfiguration: { level: id === "XYN-005" ? "warning" : "error" },
      properties: {
        tags: ["ai", "rag", "grounding", "verify-gate"],
        default_decision: r.default_decision,
        frameworks: r.frameworks.map((f) => ({ framework: f.framework, reference: f.reference, title: f.title, note: FRAMEWORK_DISCLAIMER })),
        assurance_scope: ASSURANCE_SCOPE
      }
    };
  });
  const results = l.cases.flatMap(
    (c) => c.findings.filter((f) => f.decision !== "pass").map((f) => {
      const claim = f.claim_index !== null ? o.texts[`${c.suite}/${c.case_id}`]?.claims[f.claim_index] : null;
      const text = `${RULES[f.rule].short}: ${claim ? `"${claim.length > 200 ? `${claim.slice(0, 199)}\u2026` : claim}" \u2014 ` : ""}${f.reason}. Decision: ${f.decision}${f.deterministic ? " (deterministic)" : " (model-dependent)"}${f.downgraded ? `; ${f.downgraded}` : ""}. Case ${c.suite}/${c.case_id}.`;
      return {
        ruleId: f.rule,
        ruleIndex: RULE_IDS.indexOf(f.rule),
        level: f.decision === "warn" ? "warning" : "error",
        message: { text },
        locations: [{ physicalLocation: { artifactLocation: { uri: o.config_path }, region: { startLine: c.location.line ?? 1 } } }],
        partialFingerprints: { "xyntheriumFinding/v1": f.fingerprint },
        properties: { suite: c.suite, case: c.case_id, decision: f.decision, deterministic: f.deterministic, materiality: f.materiality, qualifier_type: f.qualifier_type, verdict: f.verdict, kind: f.kind }
      };
    })
  );
  return {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: { driver: { name: "Xyntherium Verify Gate", version: GATE_VERSION, semanticVersion: GATE_VERSION, informationUri: "https://xyntherium.com/docs/verify-gate", rules } },
        automationDetails: { id: "xyntherium-verify-gate/" },
        invocations: [{ executionSuccessful: true }],
        results,
        properties: { assurance_scope: ASSURANCE_SCOPE, rules_version: l.run.engine.rules_version, policy_version: l.run.engine.policy_version, decision: l.decision.decision, ledger_chain_head: l.chain.head }
      }
    ]
  };
}

// ../verify-parity/src/version.ts
var PARITY_VERSION = "0.1.0";

// ../verify-parity/src/canonical.ts
var SPELLED = "zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand";
var SPELLED_WITH_NUMERAL = new RegExp(`\\b(?:(?:${SPELLED})[\\s-]*)+\\((\\d[\\d,.]*)\\)`, "gi");
var EQUIVALENT = {
  shall: "must",
  "e-mail": "email",
  "e-mails": "emails",
  "on-line": "online",
  percent: "%",
  sections: "\xA7\xA7",
  section: "\xA7",
  utilize: "use",
  utilizes: "uses",
  utilized: "used",
  thru: "through"
};
function foldDrafting(s) {
  return s.replace(new RegExp("(\\p{L})-\\s+(\\p{Ll})", "gu"), "$1$2").replace(/(\d)(?:\s*(?:-{2,3}|[‒-―−])\s*|\s+-\s+)(?=\d)/g, "$1-").replace(/\s*(?:-{2,3}|[–-―])\s*|\s+-\s+/g, " \u2014 ").replace(SPELLED_WITH_NUMERAL, "$1").replace(/\bper\s+cent\b/gi, "percent");
}
function toleranceTokens(s) {
  const t = normalize(foldDrafting(s)).toLowerCase();
  return t.replace(/(\d),(\d{3})\b/g, "$1$2").replace(/§\s*/g, "\xA7 ").split(/[^\p{L}\p{N}%$§'.-]+/u).map((w) => w.replace(/^[.'-]+|[.'-]+$/g, "")).filter(Boolean).map((w) => EQUIVALENT[w] ?? EQUIVALENT[w.replace(/-/g, "")] ?? w.replace(new RegExp("(\\p{L})-(\\p{L})", "gu"), "$1$2"));
}
function toleranceText(s) {
  return toleranceTokens(s).join(" ");
}
function tokenSimilarity(a, b) {
  if (!a.length && !b.length) return 1;
  const B = new Set(b);
  const A = new Set(a);
  const inter = [...A].filter((t) => B.has(t)).length;
  return inter / Math.max(A.size, B.size);
}
function quantityValues(s) {
  return extractQuantities(foldDrafting(s)).filter((q) => q.dimension !== "plain" || q.written >= 10).map((q) => ({ canon: `${q.dimension}:${Math.round(q.value * 1e3) / 1e3}:${q.bound}${q.rate ? `:${q.rate}` : ""}`, raw: q.raw.trim() }));
}
function canonicalQuantities(s) {
  return quantityValues(s).map((q) => q.canon).sort();
}
function dateValues(s) {
  return extractDates(s).map((d) => ({ canon: [d.year ?? "????", d.month ? String(d.month).padStart(2, "0") : null, d.day ? String(d.day).padStart(2, "0") : null].filter((x) => x !== null).join("-"), raw: d.raw.trim() }));
}
function canonicalDates(s) {
  return dateValues(s).map((d) => d.canon).sort();
}
var CITATION_PATTERNS = [
  [/§§?\s*(\d+[\w.-]*(?:\([\w]+\))*)/g, (m) => `\xA7${m[1].replace(/[.]$/, "")}`],
  [/\bsections?\s+(\d+[\w.-]*(?:\([\w]+\))*)/gi, (m) => `\xA7${m[1].replace(/[.]$/, "")}`],
  [/\b(\d+)\s+(?:CFR|C\.\s?F\.\s?R\.)\s+(?:parts?\s+)?(\d+[\w.-]*(?:\([\w]+\))*)/gi, (m) => `${m[1]} cfr ${m[2].replace(/[.]$/, "")}`],
  [/\b(\d+)\s+U\.?\s?S\.?\s?C\.?\s+(\d+[\w-]*(?:\([\w]+\))*)/gi, (m) => `${m[1]} usc ${m[2]}`],
  [/\bparagraphs?\s+((?:\([\w]+\))+)/gi, (m) => `para ${m[1].toLowerCase()}`],
  [/\bchapter\s+(\d+)\b/gi, (m) => `chapter ${m[1]}`],
  [/\b(?:heading|subheading)s?\s+(\d{4}(?:\.\d{2}){0,3})\b/gi, (m) => `heading ${m[1]}`],
  [/\b(?:Pub\.\s*L\.|Public Law)\s+(\d+-\d+)/gi, (m) => `pl ${m[1]}`]
];
function citationMatches(s) {
  const out = [];
  for (const [re, f] of CITATION_PATTERNS) {
    re.lastIndex = 0;
    for (let m = re.exec(s); m; m = re.exec(s)) {
      const start = m.index;
      const end = m.index + m[0].length;
      if (!out.some((o) => start < o.end && end > o.start)) out.push({ start, end, canon: f(m) });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}
function canonicalCitations(s) {
  return citationMatches(normalize(s)).map((m) => m.canon).sort();
}
var MODALS2 = /\b(?:shall not|must not|may not|cannot|can not|shall|must|may|can|should|will|is required to|are required to)\b/g;
function modalsOf(s) {
  return [...s.matchAll(MODALS2)].map((m) => modalClass2(m[0])).sort();
}
function modalClass2(word) {
  const w = word.trim().toLowerCase();
  if (/^(?:shall not|must not|may not|cannot|can not)$/.test(w)) return "prohibition";
  if (/^(?:shall|must|required|is required to|are required to|need to|needs to)$/.test(w)) return "obligation";
  if (/^(?:may|can)$/.test(w)) return "permission";
  if (/^should$/.test(w)) return "recommendation";
  return "future";
}
var DESIGNATOR = "\\((?:[a-z]{1,3}|[A-Z]{1,2}|[0-9]{1,3}|[ivxlc]{1,6})\\)";
function stripDesignator(s) {
  const m = new RegExp(`^\\s*((?:${DESIGNATOR}\\s*)+|\\d{1,3}\\.\\s+(?=\\p{Lu}))`, "u").exec(s);
  return m ? { designator: m[1].trim(), text: s.slice(m[0].length) } : { designator: null, text: s };
}

// ../verify-parity/src/conditions.ts
var CONDITION_CLASSES = ["eligibility", "deadline", "exception", "scope", "modality", "negation", "quantity"];
var normText = (s) => normalize(foldDrafting(s)).toLowerCase().replace(/\s+/g, " ").replace(/[.;,:]+$/, "").trim();
var containsText = (hay, needle) => normText(hay).includes(normText(needle));
var norm = normText;
var MODAL_CONDITION = /^(?:may|must|shall|should|will|required|is required to|are required to|need to|needs to)$/i;
function conditionClass(phrase, hint) {
  const p = phrase.trim().toLowerCase();
  if (/^(?:except|unless|other than|excluding|but not|save for|apart from)\b/.test(p)) return "exception";
  if (hint === "negation" || /^(?:not|no|never|non-)\b/.test(p)) return "negation";
  if (hint === "modality") return "modality";
  if (hint === "time_range" || hint === "date" || /^(?:within|before|after|until|by|no later than|not later than)\b/.test(p)) return "deadline";
  if (/^(?:when|once|as soon as)\b.*\b(?:period|days?|weeks?|months?|years?|date|ends?|expires?|renews?)\b/.test(p)) return "deadline";
  if (/\bonly\b/.test(p) && !/\bonly if\b/.test(p)) return "scope";
  if (/^(?:for|in|on|under)\s+(?:the\s+)?(?:[a-z]+\s+){0,3}(?:customers?|accounts?|plans?|members?|users?|residents?|regions?|countries|orders?)\b/.test(p)) return "scope";
  if (hint === "quantity") return "quantity";
  return "eligibility";
}
function widenOnly(sentence2, start) {
  const paren = /\(([^()]{0,60}\bonly\b[^()]{0,40})\)/i.exec(sentence2);
  if (paren && paren.index <= start && start <= paren.index + paren[0].length) return { text: paren[1].trim(), start: paren.index + 1, end: paren.index + 1 + paren[1].length };
  const before = /(?:[A-Za-z0-9'-]+\s){1,3}only$/i.exec(sentence2.slice(0, start + 4));
  if (before && /^only\s*[).,;:]?\s*$/i.test(sentence2.slice(start, start + 6))) return { text: before[0].trim(), start: start + 4 - before[0].length, end: start + 4 };
  const after = /^only\s+(?:(?:for|to|on|in|with|when)\s+)?(?:the\s+)?(?:[A-Za-z0-9'-]+\s?){1,4}/i.exec(sentence2.slice(start));
  if (after) return { text: after[0].trim().replace(/[.,;:]$/, ""), start, end: start + after[0].length };
  return null;
}
function conditionPhrases(sentence2) {
  const raw = [];
  for (const q of extractQualifiers(sentence2)) {
    if (q.type === "entity") continue;
    if (q.type === "modality" && !MODAL_CONDITION.test(q.text.trim())) continue;
    if (q.type === "scope" && /^only$/i.test(q.text.trim())) {
      const w = widenOnly(sentence2, q.start);
      if (w) raw.push({ cls: "scope", ...w });
      continue;
    }
    if (q.type === "scope" && !q.material) continue;
    if (q.type === "time_range" && !/\d|\b(?:days?|weeks?|months?|years?|before|after|until|end of)\b/i.test(q.text)) continue;
    const cut = /\.\s+(?=[A-Z(])/.exec(q.text);
    const text = (cut ? q.text.slice(0, cut.index) : q.text).trim();
    raw.push({ cls: conditionClass(text, q.type), text, start: q.start, end: q.start + text.length });
  }
  for (const m of sentence2.matchAll(/\b(?:until|before|after|by|at)\s+the\s+(?:end|start|beginning)\s+of\s+(?:the\s+|your\s+|each\s+)?[a-z-]+(?:\s[a-z-]+){0,2}/gi)) raw.push({ cls: "deadline", text: m[0].trim(), start: m.index ?? 0, end: (m.index ?? 0) + m[0].trim().length });
  for (const m of sentence2.matchAll(/\b(?:when|once)\s+(?:the|your)\s+[a-z-]+(?:\s[a-z-]+){0,2}\s+(?:ends|expires|renews|is renewed)\b/gi)) raw.push({ cls: "deadline", text: m[0].trim(), start: m.index ?? 0, end: (m.index ?? 0) + m[0].trim().length });
  raw.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);
  const kept = [];
  for (const r of raw) if (!kept.some((k) => r.start < k.end && r.end > k.start)) kept.push(r);
  return kept.sort((a, b) => a.start - b.start).map((r) => ({ class: r.cls, text: r.text }));
}
function sentenceDiff(before, after) {
  const a = splitSentences(before).map((s) => s.text.trim());
  const b = splitSentences(after).map((s) => s.text.trim());
  const na = a.map(norm);
  const nb = b.map(norm);
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i2 = a.length - 1; i2 >= 0; i2--) for (let j2 = b.length - 1; j2 >= 0; j2--) dp[i2][j2] = na[i2] === nb[j2] ? dp[i2 + 1][j2 + 1] + 1 : Math.max(dp[i2 + 1][j2], dp[i2][j2 + 1]);
  const hunks = [];
  const flush = (olds2, news2) => {
    const used = /* @__PURE__ */ new Set();
    for (const o of olds2) {
      let best = -1;
      let score = 0.5;
      news2.forEach((n, k) => {
        if (used.has(k)) return;
        const s = Math.min(coverage(contentStems(o), contentStems(n)), coverage(contentStems(n), contentStems(o)));
        if (s >= score) {
          score = s;
          best = k;
        }
      });
      if (best >= 0) {
        used.add(best);
        hunks.push({ before: o, after: news2[best] });
      } else hunks.push({ before: o, after: null });
    }
    news2.forEach((n, k) => {
      if (!used.has(k)) hunks.push({ before: null, after: n });
    });
  };
  let i = 0;
  let j = 0;
  let olds = [];
  let news = [];
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && na[i] === nb[j]) {
      flush(olds, news);
      olds = [];
      news = [];
      i++;
      j++;
    } else if (j < b.length && (i >= a.length || dp[i][j + 1] >= dp[i + 1][j])) news.push(b[j++]);
    else olds.push(a[i++]);
  }
  flush(olds, news);
  return hunks;
}

// ../verify-parity/src/snapshot.ts
var ParityInputError = class extends Error {
};
function canonicalExact(kind, v, field) {
  switch (kind) {
    case "number": {
      const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[,\s$€£%]/g, "")) : NaN;
      if (!Number.isFinite(n)) throw new ParityInputError(`${field}: not a number`);
      return Math.round(n * 1e6) / 1e6;
    }
    case "date": {
      if (typeof v !== "string") throw new ParityInputError(`${field}: a date must be a string`);
      const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.trim());
      if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
      const d = canonicalDates(v);
      if (!d.length) throw new ParityInputError(`${field}: no date found`);
      return d.join(",");
    }
    case "deadline":
      return (Array.isArray(v) ? v.map(String) : [String(v ?? "")]).flatMap((x) => canonicalQuantities(x)).sort();
    case "citation":
      return (Array.isArray(v) ? v.map(String) : [String(v ?? "")]).flatMap((x) => canonicalCitations(x)).sort();
    case "condition":
      return (Array.isArray(v) ? v : [v]).filter((x) => x !== null && x !== void 0 && x !== "").map((x) => typeof x === "string" ? x : `${x.class}:${x.text}`).map((x) => {
        const at = x.indexOf(":");
        return at > 0 ? `${x.slice(0, at)}:${toleranceText(x.slice(at + 1))}` : toleranceText(x);
      }).sort();
    case "text":
      return toleranceText(String(v ?? ""));
    default:
      return JSON.parse(jcs(v));
  }
}
function captureSnapshot(schema, values, ctx) {
  if (typeof ctx?.captured_at !== "string" || !ctx.captured_at) throw new ParityInputError("captured_at is required (snapshots never read the clock)");
  const known = new Set(schema.fields.map((f) => f.name));
  for (const k of Object.keys(values)) if (!known.has(k)) throw new ParityInputError(`${k} is not a field of ${schema.id}@${schema.version}`);
  const exact = {};
  const tolerance = {};
  const excluded = {};
  for (const f of schema.fields) {
    if (!(f.name in values)) throw new ParityInputError(`${f.name} is required by ${schema.id}@${schema.version} (pass null for none)`);
    const v = values[f.name];
    if (f.mode === "excluded") excluded[f.name] = v === void 0 ? null : JSON.parse(jcs(v));
    else if (f.mode === "tolerance") tolerance[f.name] = v === null ? "" : toleranceText(String(v));
    else exact[f.name] = v === null ? null : canonicalExact(f.kind ?? "json", v, f.name);
  }
  const core = { parity_version: PARITY_VERSION, schema: { id: schema.id, version: schema.version }, exact, tolerance };
  const parity_sha256 = sha256Hex(jcs(core));
  const body = { ...core, captured_at: ctx.captured_at, label: ctx.label ?? null, excluded, parity_sha256 };
  return { ...body, sha256: sha256Hex(jcs(body)) };
}
function compareSnapshots(a, b, schema) {
  const base2 = { before_parity_sha256: a.parity_sha256, after_parity_sha256: b.parity_sha256 };
  if (a.schema.id !== b.schema.id || a.schema.version !== b.schema.version || a.schema.id !== schema.id) return { status: "incomparable", fields: [], ...base2 };
  const fields = schema.fields.map((f) => {
    if (f.mode === "excluded") return { field: f.name, mode: f.mode, status: "excluded" };
    if (f.mode === "exact") {
      const x2 = a.exact[f.name] ?? null;
      const y2 = b.exact[f.name] ?? null;
      return jcs(x2) === jcs(y2) ? { field: f.name, mode: f.mode, status: "equal" } : { field: f.name, mode: f.mode, status: "changed", before: x2, after: y2 };
    }
    const x = a.tolerance[f.name] ?? "";
    const y = b.tolerance[f.name] ?? "";
    return x === y ? { field: f.name, mode: f.mode, status: "equal" } : { field: f.name, mode: f.mode, status: "changed", before: x, after: y };
  });
  return { status: fields.some((f) => f.status === "changed") ? "different" : "identical", fields, ...base2 };
}

// ../verify-parity/src/source-change.ts
var SOURCE_SENTENCE_SCHEMA = {
  id: "source-sentence",
  version: "1",
  fields: [
    { name: "conditions", mode: "exact", kind: "condition" },
    { name: "quantities", mode: "exact" },
    { name: "dates", mode: "exact" },
    { name: "negations", mode: "exact", kind: "number" },
    { name: "modality", mode: "exact" },
    { name: "citations", mode: "exact" },
    { name: "text", mode: "tolerance" },
    { name: "designator", mode: "excluded" },
    { name: "position", mode: "excluded" }
  ]
};
var SOURCE_DOCUMENT_SCHEMA = {
  id: "source-document",
  version: "1",
  fields: [
    { name: "sentences", mode: "exact" },
    { name: "source_id", mode: "excluded" },
    { name: "retrieved_at", mode: "excluded" }
  ]
};
var EXCEPTION = /\b(?:unless|except|other than|excluding|provided,? (?:however,? )?that)\b(?:[^,;:.]|\.(?=\S))*/gi;
function exceptionPhrases(text) {
  return [...text.matchAll(EXCEPTION)].map((m) => m[0].trim()).filter((p) => p.split(" ").length >= 3);
}
function exactForm(s) {
  return foldDrafting(s).replace(/\s+/g, " ").replace(/\bshall\b/g, "must").replace(/\bShall\b/g, "Must").replace(/\b[Ss]ections\s+(?=\d)/g, "\xA7\xA7 ").replace(/\b[Ss]ection\s+(?=\d)/g, "\xA7 ").trim();
}
function sentence(raw, position, captured_at) {
  const { designator, text: rawText } = stripDesignator(raw.trim());
  const text = exactForm(rawText);
  const found = conditionPhrases(text).filter((c) => c.class !== "modality" && c.class !== "negation");
  for (const e of exceptionPhrases(text)) if (!found.some((c) => c.class === "exception" && (c.text.includes(e) || e.includes(c.text)))) found.push({ class: "exception", text: e });
  const conds = found.map((c) => ({ canon: `${c.class}:${toleranceText(c.text)}`, class: c.class, text: c.text }));
  const cites = citationMatches(text);
  const uncited = cites.reduceRight((t, m) => t.slice(0, m.start) + " ".repeat(m.end - m.start) + t.slice(m.end), text);
  const quantities = quantityValues(uncited);
  const dates = dateValues(text);
  const citations = cites.map((m) => ({ canon: m.canon, raw: text.slice(m.start, m.end) }));
  const modals = modalsOf(text);
  const sorted = (vs) => vs.map((v) => v.canon).sort();
  const snap = captureSnapshot(
    SOURCE_SENTENCE_SCHEMA,
    {
      conditions: conds.map((c) => `${c.class}:${c.text}`),
      quantities: sorted(quantities),
      dates: sorted(dates),
      negations: negationCount(text),
      modality: modals,
      citations: sorted(citations),
      text,
      designator,
      position
    },
    { captured_at }
  );
  const tokens = toleranceTokens(text);
  return { raw: raw.trim(), tokens, tol: tokens.join(" "), conds, quantities, dates, citations, modals, snap };
}
var LIST_ITEM = new RegExp(`(?<=(?:[;:\\u2013\\u2014]|--|\\s-)(?:\\s+(?:and|or))?)\\s*(?=${DESIGNATOR}(?:\\s|$))`);
function unwrap(text) {
  const lines = text.split(/\r?\n/);
  let out = lines[0] ?? "";
  for (let k = 1; k < lines.length; k++) {
    const prev = lines[k - 1].trim();
    const next = lines[k].trim();
    const soft = prev !== "" && next !== "" && !/^#/.test(prev) && !/[.;:!?\u2014]["”'’)]*$/.test(prev) && !/^(?:[-*+•](?!-)\s|[#>|]|\d{1,3}[.)]\s)/.test(next);
    out += soft ? ` ${lines[k].replace(/^[ \t]+/, "")}` : `
${lines[k]}`;
  }
  return out;
}
function sentencesOf(text, captured_at) {
  const out = [];
  let carry = "";
  for (const s of splitSentences(unwrap(text)).flatMap((x) => x.text.split(LIST_ITEM))) {
    if (!toleranceTokens(stripDesignator(s).text).length) carry += `${s.trim()} `;
    else {
      out.push(carry + s);
      carry = "";
    }
  }
  return out.map((s, i) => sentence(s, i, captured_at));
}
function difference(a, b) {
  const came = [...b];
  const gone = [];
  for (const x of a) {
    const k = came.findIndex((y) => y.canon === x.canon);
    if (k >= 0) came.splice(k, 1);
    else gone.push(x);
  }
  return { gone, came };
}
var words2 = (vs) => vs.length ? vs.map((v) => v.raw).join("; ") : null;
function named(a, b, fields) {
  const out = [];
  const changed = new Set(fields.filter((f) => f.status === "changed").map((f) => f.field));
  if (changed.has("conditions")) {
    const { gone, came } = difference(a.conds, b.conds);
    const used = /* @__PURE__ */ new Set();
    for (const c of gone) {
      const k = came.findIndex((d, i) => !used.has(i) && d.class === c.class);
      if (k >= 0) {
        used.add(k);
        out.push({ type: "condition_changed", class: c.class, before: c.text, after: came[k].text });
      } else out.push({ type: "condition_removed", class: c.class, before: c.text, after: null });
    }
    came.forEach((d, i) => {
      if (!used.has(i)) out.push({ type: "condition_added", class: d.class, before: null, after: d.text });
    });
  }
  const inConditions = out.map((c) => `${c.before ?? ""} ${c.after ?? ""}`).join(" ");
  const values = (type, cls, x, y) => {
    const { gone, came } = difference(x, y);
    if (!gone.length && !came.length) return;
    if ([...gone, ...came].every((v) => inConditions.includes(v.raw))) return;
    out.push({ type, class: cls, before: words2(gone), after: words2(came) });
  };
  if (changed.has("quantities")) values("value_changed", "quantity", a.quantities, b.quantities);
  if (changed.has("dates")) values("date_changed", "deadline", a.dates, b.dates);
  const field = (n) => fields.find((f) => f.field === n);
  if (changed.has("negations")) out.push({ type: "negation_changed", class: "negation", before: String(field("negations")?.before ?? 0), after: String(field("negations")?.after ?? 0) });
  if (changed.has("modality")) {
    const { gone, came } = difference(
      a.modals.map((m) => ({ canon: m, raw: m })),
      b.modals.map((m) => ({ canon: m, raw: m }))
    );
    out.push({ type: "modality_changed", class: "modality", before: words2(gone), after: words2(came) });
  }
  if (changed.has("citations")) {
    const { gone, came } = difference(a.citations, b.citations);
    out.push({ type: "citation_changed", class: null, before: words2(gone), after: words2(came) });
  }
  if (!out.length && changed.has("text")) out.push({ type: "wording_changed", class: null, before: a.raw, after: b.raw });
  return out;
}
function compare(a, b) {
  const cmp = compareSnapshots(a.snap, b.snap, SOURCE_SENTENCE_SCHEMA);
  if (cmp.status === "identical" && a.raw === b.raw) return null;
  const real = cmp.status === "different";
  return { status: real ? "real" : "cosmetic", before: a.raw, after: b.raw, before_parity_sha256: a.snap.parity_sha256, after_parity_sha256: b.snap.parity_sha256, changes: real ? named(a, b, cmp.fields) : [] };
}
function addedOrRemoved(s, side) {
  const changes = s.conds.map((c) => side === "added" ? { type: "condition_added", class: c.class, before: null, after: c.text } : { type: "condition_removed", class: c.class, before: c.text, after: null });
  if (!changes.length) changes.push(side === "added" ? { type: "sentence_added", class: null, before: null, after: s.raw } : { type: "sentence_removed", class: null, before: s.raw, after: null });
  return { status: side, before: side === "removed" ? s.raw : null, after: side === "added" ? s.raw : null, before_parity_sha256: side === "removed" ? s.snap.parity_sha256 : null, after_parity_sha256: side === "added" ? s.snap.parity_sha256 : null, changes };
}
function joined(ss, captured_at) {
  return sentence([ss[0].raw, ...ss.slice(1).map((s) => stripDesignator(s.raw).text)].join(" "), -1, captured_at);
}
function detectSourceChange(input2) {
  const at = input2.captured_at;
  const A = sentencesOf(input2.before, at);
  const B = sentencesOf(input2.after, at);
  const dp = Array.from({ length: A.length + 1 }, () => new Array(B.length + 1).fill(0));
  for (let i2 = A.length - 1; i2 >= 0; i2--) for (let j2 = B.length - 1; j2 >= 0; j2--) dp[i2][j2] = A[i2].tol === B[j2].tol ? dp[i2 + 1][j2 + 1] + 1 : Math.max(dp[i2 + 1][j2], dp[i2][j2 + 1]);
  const out = [];
  let unchanged = 0;
  const flush = (olds2, news2) => {
    if (!olds2.length && !news2.length) return;
    const doneOld = /* @__PURE__ */ new Set();
    const doneNew = /* @__PURE__ */ new Set();
    const pairUp = (x, y) => {
      const c = compare(x, y);
      if (c) out.push(c);
      else unchanged++;
    };
    const run = (ss, from, n, done) => {
      const r = ss.slice(from, from + n);
      return r.length === n && r.every((_, k) => !done.has(from + k)) ? r : null;
    };
    for (let p = 0; p < olds2.length; p++)
      for (let q = 0; q < news2.length; q++)
        for (let n = 1; n <= 3; n++)
          for (let m = 1; m <= 3; m++) {
            if (n === 1 && m === 1) continue;
            const x = run(olds2, p, n, doneOld);
            const y = run(news2, q, m, doneNew);
            if (!x || !y || x.map((s) => s.tol).join(" ") !== y.map((s) => s.tol).join(" ")) continue;
            x.forEach((_, k) => doneOld.add(p + k));
            y.forEach((_, k) => doneNew.add(q + k));
            pairUp(joined(x, at), joined(y, at));
          }
    olds2.forEach((o, p) => {
      if (doneOld.has(p)) return;
      let best = -1;
      let score = 0.5;
      news2.forEach((n, k) => {
        if (doneNew.has(k)) return;
        const s = tokenSimilarity(o.tokens, n.tokens);
        if (s >= score) {
          score = s;
          best = k;
        }
      });
      if (best >= 0) {
        doneNew.add(best);
        pairUp(o, news2[best]);
      } else out.push(addedOrRemoved(o, "removed"));
    });
    news2.forEach((n, k) => {
      if (!doneNew.has(k)) out.push(addedOrRemoved(n, "added"));
    });
  };
  let i = 0;
  let j = 0;
  let olds = [];
  let news = [];
  while (i < A.length || j < B.length) {
    if (i < A.length && j < B.length && A[i].tol === B[j].tol) {
      flush(olds, news);
      olds = [];
      news = [];
      const c = compare(A[i], B[j]);
      if (c) out.push(c);
      else unchanged++;
      i++;
      j++;
    } else if (j < B.length && (i >= A.length || dp[i][j + 1] >= dp[i + 1][j])) news.push(B[j++]);
    else olds.push(A[i++]);
  }
  flush(olds, news);
  const doc = (ss, text) => ({ parity: captureSnapshot(SOURCE_DOCUMENT_SCHEMA, { sentences: ss.map((s) => s.snap.parity_sha256), source_id: null, retrieved_at: null }, { captured_at: at }).parity_sha256, text: sha256Hex(text) });
  const before = doc(A, input2.before);
  const after = doc(B, input2.after);
  const counts = {
    unchanged,
    cosmetic: out.filter((s) => s.status === "cosmetic").length,
    real: out.filter((s) => s.status === "real").length,
    added: out.filter((s) => s.status === "added").length,
    removed: out.filter((s) => s.status === "removed").length
  };
  const kind = counts.real + counts.added + counts.removed > 0 ? "real" : counts.cosmetic > 0 || before.text !== after.text ? "cosmetic" : "none";
  const strip = (s) => input2.include_text ? s : { ...s, before: null, after: null, changes: s.changes.map((c) => ({ ...c, before: null, after: null })) };
  const sentences = out.map(strip);
  return {
    kind,
    before_parity_sha256: before.parity,
    after_parity_sha256: after.parity,
    before_text_sha256: before.text,
    after_text_sha256: after.text,
    counts,
    sentences,
    changes: sentences.filter((s) => s.status !== "cosmetic").flatMap((s) => s.changes)
  };
}
function documentParityHash(text, captured_at) {
  return captureSnapshot(SOURCE_DOCUMENT_SCHEMA, { sentences: sentencesOf(text, captured_at).map((s) => s.snap.parity_sha256), source_id: null, retrieved_at: null }, { captured_at }).parity_sha256;
}

// ../verify-parity/src/triage.ts
var DEFAULT_TRIAGE_POLICY = { genuine_disagreement: "human_review" };
function triageDisagreement(runs, policy = DEFAULT_TRIAGE_POLICY) {
  if (runs.length < 2) throw new Error("triage needs at least two runs");
  const outcomes = [...new Set(runs.map((r) => r.outcome))].sort();
  const ids = [...new Set(runs.flatMap((r) => Object.keys(r.sources)))].sort();
  const mismatched_sources = ids.map((id) => ({ source_id: id, hashes: Object.fromEntries(runs.map((r) => [r.run_id, r.sources[id] ?? null])) })).filter((m) => new Set(Object.values(m.hashes)).size > 1);
  if (outcomes.length === 1) return { kind: "agreement", route: "NONE", outcomes, mismatched_sources, explanation: "the runs agree" };
  if (mismatched_sources.length) {
    return { kind: "infrastructure_fault", route: "REEVAL", outcomes, mismatched_sources, explanation: `the runs disagree and did not see the same source snapshots (${mismatched_sources.map((m) => m.source_id).join(", ")}): re-evaluate on one snapshot` };
  }
  return { kind: "genuine_disagreement", route: policy.genuine_disagreement, outcomes, mismatched_sources, explanation: `the runs saw identical source snapshots and still disagree: ${policy.genuine_disagreement.replace("_", " ")}` };
}

// ../verify-parity/src/records.ts
var h2 = (s) => s === null ? null : sha256Hex(s);
function sourceChangeRecord(change, meta) {
  return {
    record_type: "source_change",
    parity_version: PARITY_VERSION,
    source_id: meta.source_id,
    path: meta.path,
    schema: "source-document@1",
    kind: change.kind,
    before_parity_sha256: change.before_parity_sha256,
    after_parity_sha256: change.after_parity_sha256,
    before_text_sha256: change.before_text_sha256,
    after_text_sha256: change.after_text_sha256,
    counts: change.counts,
    changes: change.changes.map((c) => ({ type: c.type, class: c.class, before_sha256: h2(c.before), after_sha256: h2(c.after), ...meta.include_text ? { before: c.before, after: c.after } : {} }))
  };
}
function triageRecord(subject, runs, t) {
  return { record_type: "disagreement_triage", parity_version: PARITY_VERSION, subject, runs, kind: t.kind, route: t.route, outcomes: t.outcomes, mismatched_sources: t.mismatched_sources.map((m) => m.source_id), explanation: t.explanation };
}

// ../verify-policy/src/policy-change.ts
var POLICY_CHANGE_VERSION = "0.2.0";
var POLICY_CHANGE_NOTE = "Each linked test was re-checked in code against the changed source; no answer was regenerated and no model was used. A finding means a person should review the golden set; it is no judgement of the new text.";
function policyChangeTitle(n) {
  return `Policy changed: ${n} answer${n === 1 ? "" : "s"} need${n === 1 ? "s" : ""} review`;
}
function aggregate(claims) {
  const present = claims.filter((c) => c.present_in_answer && c.verdict !== null);
  if (!present.length) return claims.length ? "unverifiable" : null;
  if (present.some((c) => c.verdict === "contradicted")) return "contradicted";
  if (present.some((c) => c.verdict === "unsupported")) return "unsupported";
  if (present.some((c) => c.verdict === "unverifiable")) return "unverifiable";
  return "supported";
}
async function verdictOf(answer, expected, sources) {
  if (answer === null || !sources.length) return null;
  const ev = await evaluateAnswer({ question: "", answer, sources, expected, policy: { ...DEFAULT_POLICY, require_citations: false }, include_text: true });
  return aggregate(ev.claims);
}
async function documentTestVerdict(t, sources) {
  const linked = sources.filter((s) => t.source_ids.includes(s.id));
  let answer = t.answer ?? (t.expected.length ? t.expected.map((e) => /[.!?]$/.test(e.claim.trim()) ? e.claim.trim() : `${e.claim.trim()}.`).join(" ") : null);
  if (answer === null && t.required_conditions.length) {
    const carriers = linked.flatMap((s) => splitSentences(s.text).map((x) => x.text.trim())).filter((x) => t.required_conditions.some((rc) => containsText(x, rc.text)));
    answer = carriers.length ? carriers.join(" ") : null;
  }
  return verdictOf(answer, t.expected, linked);
}
var versionId = (id, version) => `${id}@${version ?? "previous"}`;
function supersedesPrevious(s) {
  return s.supersedes.some((x) => s.version_before ? x === versionId(s.id, s.version_before) : x.startsWith(`${s.id}@`));
}
async function freshnessFor(answer, s) {
  if (!supersedesPrevious(s) || s.before === null || s.after === null) return null;
  const oldId = versionId(s.id, s.version_before);
  const ev = await evaluateAnswer({ question: "", answer, sources: [{ id: oldId, text: s.before }], expected: [], policy: DEFAULT_POLICY, include_text: true });
  const supported = ev.claims.find((c) => c.verdict === "supported");
  if (!supported) return null;
  const asResult = { index: 0, text: supported.text ?? answer, provenance: { spans: supported.spans } };
  const sources = [
    { id: oldId, text: s.before, ...s.version_before ? { version: s.version_before } : {}, ...s.effective_date_before ? { effective_date: s.effective_date_before } : {} },
    { id: s.id, text: s.after, supersedes: [oldId], ...s.version_after ? { version: s.version_after } : {}, ...s.effective_date_after ? { effective_date: s.effective_date_after } : {} }
  ];
  return { source_id: s.id, version: s.version_before, newer_version: s.version_after, explanation: claimFreshness(asResult, sources).explanation };
}
var clip = (s, n = 240) => s === null ? null : s.length > n ? `${s.slice(0, n - 1)}\u2026` : s;
async function assessPolicyChange(input2) {
  const byId = new Map(input2.changed.map((s) => [s.id, s]));
  const at = input2.captured_at;
  const parityRecords = [];
  const changeOf = /* @__PURE__ */ new Map();
  for (const s of input2.changed) {
    if (s.before === null || s.after === null) continue;
    const c = detectSourceChange({ before: s.before, after: s.after, captured_at: at, include_text: true });
    changeOf.set(s.id, c);
    parityRecords.push(sourceChangeRecord(c, { source_id: s.id, path: s.path, include_text: input2.record_text ?? input2.include_text }));
  }
  const current = new Map(input2.current.map((s) => [s.id, s]));
  const results = [];
  for (const t of input2.tests) {
    const touched = t.source_ids.filter((id) => byId.has(id));
    if (!touched.length) continue;
    const changed = touched.map((id) => byId.get(id));
    const reasons = [];
    const afterSources = t.source_ids.flatMap((id) => byId.has(id) ? byId.get(id).after === null ? [] : [{ id, text: byId.get(id).after }] : current.has(id) ? [current.get(id)] : []);
    const beforeKnown = changed.every((s) => s.before !== null);
    const beforeSources = beforeKnown ? t.source_ids.flatMap((id) => byId.has(id) ? [{ id, text: byId.get(id).before }] : current.has(id) ? [current.get(id)] : []) : null;
    const afterText = afterSources.map((s) => s.text).join("\n");
    let answer = t.answer ?? (t.expected.length ? t.expected.map((e) => /[.!?]$/.test(e.claim.trim()) ? e.claim.trim() : `${e.claim.trim()}.`).join(" ") : null);
    if (answer === null && beforeSources && t.required_conditions.length) {
      const carriers = beforeSources.flatMap((s) => splitSentences(s.text).map((x) => x.text.trim())).filter((x) => t.required_conditions.some((rc) => containsText(x, rc.text)));
      answer = carriers.length ? carriers.join(" ") : null;
    }
    const hunks = changed.flatMap((s) => s.before !== null && s.after !== null ? sentenceDiff(s.before, s.after).map((h3) => ({ source_id: s.id, ...h3 })) : []);
    const anchor = answer ?? [t.question, ...t.required_conditions.map((c) => c.text)].join(" ");
    const relevant = hunks.filter((h3) => {
      const text = h3.after ?? h3.before ?? "";
      if (h3.before && t.required_conditions.some((rc) => containsText(h3.before, rc.text))) return true;
      return Math.min(coverage(contentStems(anchor), contentStems(text)), coverage(contentStems(text), contentStems(anchor))) >= 0.5;
    });
    const conditions = [];
    const lostReplacements = /* @__PURE__ */ new Set();
    for (const rc of t.required_conditions) {
      const kept = afterSources.length > 0 && containsText(afterText, rc.text);
      let now;
      if (!kept) {
        const h3 = relevant.find((x) => x.before && containsText(x.before, rc.text) && x.after);
        if (h3?.after) {
          const repl = conditionPhrases(h3.after).find((p) => p.class === rc.class && !containsText(h3.before, p.text));
          now = repl?.text ?? clip(h3.after, 160);
          if (repl) lostReplacements.add(normText(repl.text));
        }
      }
      conditions.push({ class: rc.class, status: kept ? "kept" : "lost", in_answer: answer === null ? null : containsText(answer, rc.text), text_hash: sha256Hex(rc.text), ...input2.include_text ? { text: rc.text, ...now ? { now } : {} } : {} });
    }
    const seen = /* @__PURE__ */ new Set();
    for (const h3 of relevant) {
      if (!h3.after) continue;
      const oldPhrases = h3.before ? conditionPhrases(h3.before) : [];
      for (const p of conditionPhrases(h3.after)) {
        if (h3.before && containsText(h3.before, p.text)) continue;
        if (lostReplacements.has(normText(p.text)) || seen.has(normText(p.text))) continue;
        if (t.required_conditions.some((rc) => containsText(rc.text, p.text) || containsText(p.text, rc.text))) continue;
        seen.add(normText(p.text));
        const was = oldPhrases.find((o) => o.class === p.class);
        conditions.push({
          class: p.class,
          status: was ? "changed" : "newly_required",
          in_answer: answer === null ? null : containsText(answer, p.text),
          text_hash: sha256Hex(p.text),
          ...input2.include_text ? { text: p.text, ...was ? { was: was.text } : {} } : {}
        });
      }
    }
    const prior = input2.previous?.(t.id) ?? null;
    const recomputed = beforeSources ? await verdictOf(answer, t.expected, beforeSources) : null;
    let verdict_before = prior?.verdict ?? recomputed;
    let before_from = prior ? "previous_run" : beforeSources ? "recomputed" : "unavailable";
    let triage;
    let genuineRoute = null;
    if (prior && recomputed && prior.verdict !== recomputed && beforeSources) {
      const seen2 = Object.fromEntries(beforeSources.map((s) => [s.id, documentParityHash(s.text, at)]));
      const runs = [
        { run_id: "previous_run", outcome: prior.verdict, sources: prior.sources },
        { run_id: "recomputed", outcome: recomputed, sources: seen2 }
      ];
      const tr = triageDisagreement(runs, input2.triage_policy);
      parityRecords.push(triageRecord(t.id, runs, tr));
      if (tr.kind === "infrastructure_fault") {
        verdict_before = recomputed;
        before_from = "recomputed";
        triage = { kind: tr.kind, route: tr.route, explanation: tr.explanation };
      } else if (tr.kind === "genuine_disagreement") {
        genuineRoute = tr.route;
        triage = { kind: tr.kind, route: tr.route, explanation: tr.explanation };
      }
    }
    const verdict_after = await verdictOf(answer, t.expected, afterSources);
    let superseded = null;
    if (answer !== null && verdict_before === "supported" && verdict_after !== "supported") {
      for (const s of changed) superseded = await freshnessFor(answer, s) ?? superseded;
    }
    let decision = "pass";
    const unreadable = changed.filter((s) => s.after === null).map((s) => s.id);
    const unversioned = changed.filter((s) => !s.versioned).map((s) => s.id);
    if (unreadable.length) reasons.push(`source unreadable or removed: ${unreadable.join(", ")}`);
    if (unversioned.length) reasons.push(`source has no version in verify-gate.yml: ${unversioned.join(", ")}`);
    const lost = conditions.filter((c) => c.status === "lost");
    const missingNew = conditions.filter((c) => c.status === "newly_required" && c.in_answer === false);
    if (unreadable.length || unversioned.length) decision = "hold";
    else if (lost.length || missingNew.length || verdict_after === "contradicted") {
      decision = "block";
      if (lost.length) reasons.push(`${lost.length} required condition(s) lost: ${lost.map((c) => c.class).join(", ")}`);
      if (missingNew.length) reasons.push(`${missingNew.length} condition(s) newly required by the new version and missing from the saved answer: ${missingNew.map((c) => c.class).join(", ")}`);
      if (verdict_after === "contradicted") reasons.push("the new version contradicts the saved answer");
    } else if (verdict_after !== null && verdict_after !== "supported" && (verdict_before === null || verdict_before === "supported")) {
      decision = "human_review";
      reasons.push(superseded ? "the saved answer matches the old version, and the newer version that supersedes it conflicts" : `the saved answer is ${verdict_after} against the new version, and nothing declares that it replaces the old one`);
    } else if (conditions.some((c) => c.status === "changed" && c.in_answer === false)) {
      decision = "human_review";
      reasons.push(`a condition the saved answer relies on was reworded or changed: ${conditions.filter((c) => c.status === "changed").map((c) => c.class).join(", ")}`);
    } else if (verdict_after === null && answer === null && !t.required_conditions.length) {
      decision = "human_review";
      reasons.push("the test has no saved answer and no required conditions to check");
    }
    const cosmeticOnly = changed.every((s) => ["cosmetic", "none"].includes(changeOf.get(s.id)?.kind ?? "unknown"));
    const cosmeticPass = cosmeticOnly && (decision === "human_review" || decision === "block") && !genuineRoute;
    if (cosmeticPass) {
      reasons.length = 0;
      superseded = null;
      reasons.push(`the source change is cosmetic (verify-parity: formatting only; no condition, value, date, negation, modality or citation changed), so it is not a change to the policy; code reads the new wording as ${verdict_after ?? "n/a"}`);
      decision = "pass";
    }
    if (genuineRoute && decision !== "hold" && decision !== "block") {
      if (genuineRoute === "block") decision = "block";
      else if (decision === "pass") decision = "human_review";
      reasons.push(`the previous run and a recomputation disagree on the same source snapshots (${prior.verdict} vs ${recomputed}): ${genuineRoute.replace("_", " ")}`);
    }
    if (decision === "pass" && !reasons.length) reasons.push("still supported; the change is recorded");
    if (superseded && decision === "block") reasons.push("the saved answer also still matches the superseded version");
    results.push({
      id: t.id,
      kind: t.kind,
      location: t.location,
      question_hash: sha256Hex(t.question),
      changed_sources: touched,
      decision,
      reported: decision === "block" && input2.enforcement === "report_only" ? "warn" : decision,
      verdict_before,
      verdict_after,
      before_from,
      conditions,
      superseded,
      reasons,
      answer_hash: answer === null ? null : sha256Hex(answer),
      ...cosmeticPass ? { cosmetic_source_change: true } : {},
      ...triage ? { triage } : {},
      ...input2.include_text ? { diff: relevant.map((h3) => ({ source_id: h3.source_id, before: clip(h3.before), after: clip(h3.after) })) } : {}
    });
  }
  const n = results.filter((r) => r.decision !== "pass").length;
  const unprotected = input2.unprotected ?? [];
  const failing = results.some((r) => r.decision === "block" || r.decision === "hold");
  return {
    version: POLICY_CHANGE_VERSION,
    mode: "document_change",
    changed_sources: input2.changed.map((s) => ({
      id: s.id,
      path: s.path,
      sha256_before: s.before === null ? null : sha256Hex(s.before),
      sha256_after: s.after === null ? null : sha256Hex(s.after),
      versioned: s.versioned,
      version_before: s.version_before,
      version_after: s.version_after,
      supersedes_previous: supersedesPrevious(s),
      before_available: s.before !== null,
      change: changeOf.has(s.id) ? (() => {
        const c = changeOf.get(s.id);
        return { kind: c.kind, counts: c.counts, changes: input2.include_text ? c.changes : c.changes.map((x) => ({ ...x, before: null, after: null })) };
      })() : null
    })),
    tests: results,
    unprotected,
    needs_review: n,
    title: policyChangeTitle(n),
    enforcement: input2.enforcement,
    conclusion: input2.enforcement === "enforce" && failing ? "failure" : n || unprotected.some((u) => u.change_kind !== "cosmetic") ? "neutral" : "success",
    method: "code_only",
    note: POLICY_CHANGE_NOTE,
    assurance_scope: ASSURANCE_SCOPE,
    parity_records: parityRecords
  };
}
var esc = (s) => s.replace(/\|/g, "\\|").replace(/</g, "&lt;").replace(/\r?\n/g, " ");
var LABEL = { pass: "\u2705 pass", human_review: "\u{1F440} human review", warn: "\u26A0\uFE0F warn (would block)", block: "\u26D4 block", hold: "\u23F8\uFE0F hold" };
function conditionCell(c) {
  const what = c.text ? `"${esc(c.text)}"` : c.class;
  if (c.status === "lost") return `\u274C lost ${c.class} ${what}${c.now ? ` (now: "${esc(c.now)}")` : ""}`;
  if (c.status === "newly_required") return c.in_answer === false ? `\u2795 newly required ${c.class} ${what}, missing from the answer` : `\u2795 new ${c.class} ${what}${c.in_answer ? ", stated in the answer" : ""}`;
  if (c.status === "changed") return `~ changed ${c.class}${c.was ? ` "${esc(c.was)}" \u2192` : ""} ${what}`;
  return `\u2713 ${c.class} ${what}`;
}
var CHANGE_WORDS = {
  condition_added: "added",
  condition_removed: "removed",
  condition_changed: "changed",
  value_changed: "value changed",
  date_changed: "date changed",
  negation_changed: "negation changed",
  modality_changed: "modality changed",
  citation_changed: "citation changed",
  wording_changed: "wording changed",
  sentence_added: "sentence added",
  sentence_removed: "sentence removed"
};
function describeChange(c) {
  if (c.kind === "none") return "Parity: no change.";
  if (c.kind === "cosmetic") return `Parity: cosmetic only (${c.counts.cosmetic} sentence${c.counts.cosmetic === 1 ? "" : "s"} reformatted; no condition, value, date or citation changed).`;
  const named2 = c.changes.slice(0, 6).map((x) => {
    const what = x.class ? `${x.class} ${CHANGE_WORDS[x.type] ?? x.type}` : CHANGE_WORDS[x.type] ?? x.type;
    const detail = x.type === "condition_changed" && x.before && x.after ? `: "${esc(x.before)}" \u2192 "${esc(x.after)}"` : x.type === "condition_added" && x.after ? `: "${esc(x.after)}"` : x.type === "condition_removed" && x.before ? `: "${esc(x.before)}"` : "";
    return `${what}${detail}`;
  });
  return `Parity: real change (${named2.join("; ")}${c.changes.length > 6 ? `; ${c.changes.length - 6} more` : ""}).`;
}
function renderPolicyChange(r) {
  const lines = [`### ${r.title}`, ""];
  for (const s of r.changed_sources) {
    const v = s.version_before || s.version_after ? `: version ${s.version_before ?? "(none)"} \u2192 ${s.version_after ?? "(none)"}` : "";
    const sup = !s.versioned ? " (no version in verify-gate.yml: linked tests hold)" : s.supersedes_previous ? `, which supersedes ${s.id}@${s.version_before ?? "previous"}` : ` (no \`supersedes: [${s.id}@${s.version_before ?? "\u2026"}]\`, so freshness is not established)`;
    lines.push(`- \`${esc(s.path)}\` (${esc(s.id)}) changed${v}${sup}.${s.before_available ? "" : " The base version could not be read: before-verdicts are unavailable."}${s.change ? ` ${describeChange(s.change)}` : ""}`);
  }
  if (r.changed_sources.length) lines.push("", "Only the tests linked to a changed source were re-run, in code, against the new version.", "");
  if (r.tests.length) {
    lines.push("| Test | Verdict before \u2192 after | Conditions | Decision | Source change |", "|---|---|---|---|---|");
    for (const t of r.tests) {
      const cond = t.conditions.filter((c) => c.status !== "kept" || t.conditions.length <= 3).map(conditionCell).join("<br>") || "\u2014";
      const diff = (t.diff ?? []).slice(0, 2).map((d) => d.before && d.after ? `~~${esc(d.before)}~~ \u2192 ${esc(d.after)}` : d.after ? `added: ${esc(d.after)}` : `removed: ~~${esc(d.before ?? "")}~~`).join("<br>") || "\u2014";
      const fresh = t.cosmetic_source_change ? `<br>Cosmetic source change only (verify-parity): code reads the new wording as ${t.verdict_after ?? "n/a"}, but no condition, value, date or citation changed.` : t.superseded ? `<br>Still matches the superseded version ${esc(t.superseded.version ?? "previous")}: ${esc(t.superseded.explanation)}.` : "";
      lines.push(`| \`${esc(t.id)}\` | ${t.verdict_before ?? "n/a"} \u2192 ${t.verdict_after ?? "n/a"}${t.before_from === "previous_run" ? " (before: previous run)" : ""} | ${cond} | ${LABEL[t.reported]}${fresh} | ${diff} |`);
    }
  } else if (r.changed_sources.length) lines.push("_No test is linked to the changed source._");
  for (const u of r.unprotected) {
    if (u.change_kind === "cosmetic") {
      lines.push("", `\u2139\uFE0F \`${esc(u.path)}\` changed cosmetically (formatting only, no condition, value, date or citation changed); no test is linked to it.`);
      continue;
    }
    lines.push("", `\u26A0\uFE0F **Unprotected source change:** \`${esc(u.path)}\` changed and ${u.reason === "not_a_source" ? "is not listed under `sources`" : `no test links source \`${esc(u.source_id ?? "")}\``}, so no answer was re-checked against it. Link it with a test (\`tests[].source_ids\`) or list it under \`sources\`.`);
  }
  lines.push(
    "",
    r.enforcement === "enforce" ? "Enforced: a block or hold fails this check." : "Report-only: blocks are shown as warnings and nothing fails. After review, update the saved answers and required conditions and re-pin the source with `npx @xyntherium/verify-cli pin`.",
    "",
    `> ${r.note} Assurance scope: ${ASSURANCE_SCOPE}`
  );
  return lines.join("\n");
}

// src/gate/github.ts
var GitHubError = class extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
};
var GitHub = class {
  constructor(ctx, fetchImpl = fetch) {
    this.ctx = ctx;
    this.fetchImpl = fetchImpl;
  }
  get available() {
    return !!this.ctx.token;
  }
  async call(method, path, body) {
    if (!this.ctx.token) throw new GitHubError(401, "no GitHub token");
    const res = await this.fetchImpl(`${this.ctx.api_url.replace(/\/$/, "")}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.ctx.token}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "xyntherium-verify-gate/0.1.0",
        ...body !== void 0 ? { "content-type": "application/json" } : {}
      },
      ...body !== void 0 ? { body: JSON.stringify(body) } : {}
    });
    if (!res.ok) throw new GitHubError(res.status, `${method} ${path.split("?")[0]}: HTTP ${res.status}`);
    return res.status === 204 ? null : await res.json();
  }
  repoPath(p) {
    return `/repos/${encodeURIComponent(this.ctx.owner)}/${encodeURIComponent(this.ctx.repo)}${p}`;
  }
  /** Files changed in the pull request, or null when they cannot be listed. */
  async changedFiles() {
    if (!this.ctx.pull_number) return null;
    const out = [];
    for (let page = 1; page <= 30; page++) {
      const files = await this.call("GET", this.repoPath(`/pulls/${this.ctx.pull_number}/files?per_page=100&page=${page}`));
      for (const f of files) {
        out.push(f.filename);
        if (f.previous_filename) out.push(f.previous_filename);
      }
      if (files.length < 100) return out;
    }
    return null;
  }
  /** A repository file's text at `ref`, or null when it does not exist there. */
  async fileAt(path, ref) {
    if (!this.ctx.token) throw new GitHubError(401, "no GitHub token");
    const enc = path.split("/").map(encodeURIComponent).join("/");
    const res = await this.fetchImpl(`${this.ctx.api_url.replace(/\/$/, "")}${this.repoPath(`/contents/${enc}?ref=${encodeURIComponent(ref)}`)}`, {
      headers: { authorization: `Bearer ${this.ctx.token}`, accept: "application/vnd.github.raw+json", "x-github-api-version": "2022-11-28", "user-agent": "xyntherium-verify-gate/0.1.0" }
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new GitHubError(res.status, `GET /contents: HTTP ${res.status}`);
    return res.text();
  }
  /** Create or update the Gate's PR comment (found by its hidden marker). */
  async upsertComment(body) {
    const n = this.ctx.pull_number;
    for (let page = 1; page <= 10; page++) {
      const comments = await this.call("GET", this.repoPath(`/issues/${n}/comments?per_page=100&page=${page}`));
      const mine = comments.find((c) => c.body?.includes(COMMENT_MARKER));
      if (mine) {
        await this.call("PATCH", this.repoPath(`/issues/comments/${mine.id}`), { body });
        return "updated";
      }
      if (comments.length < 100) break;
    }
    await this.call("POST", this.repoPath(`/issues/${n}/comments`), { body });
    return "created";
  }
  async checkRun(o) {
    await this.call("POST", this.repoPath("/check-runs"), {
      name: o.name,
      head_sha: this.ctx.sha,
      status: "completed",
      conclusion: o.conclusion,
      output: { title: o.title.slice(0, 255), summary: o.summary.slice(0, 65e3) }
    });
  }
  async uploadSarif(sarif) {
    const encoded = (0, import_node_zlib.gzipSync)(Buffer.from(JSON.stringify(sarif))).toString("base64");
    await this.call("POST", this.repoPath("/code-scanning/sarifs"), { commit_sha: this.ctx.ref_sha || this.ctx.sha, ref: this.ctx.ref, sarif: encoded, tool_name: "Xyntherium Verify Gate" });
  }
  async permissionOf(user) {
    try {
      const r = await this.call("GET", this.repoPath(`/collaborators/${encodeURIComponent(user)}/permission`));
      const p = r.role_name ?? r.permission ?? "none";
      return ["admin", "maintain", "write", "triage", "read"].includes(p) ? p : "none";
    } catch {
      return "none";
    }
  }
  async inTeam(team, user) {
    const [org, slug] = team.split("/");
    try {
      const r = await this.call("GET", `/orgs/${encodeURIComponent(org)}/teams/${encodeURIComponent(slug)}/memberships/${encodeURIComponent(user)}`);
      return r.state === "active";
    } catch {
      return false;
    }
  }
  /** Who last applied `label` to the PR, if it is still applied. */
  async labelApplier(label) {
    const n = this.ctx.pull_number;
    const issue = await this.call("GET", this.repoPath(`/issues/${n}`));
    if (!issue.labels?.some((l) => l.name === label)) return null;
    let applier = null;
    for (let page = 1; page <= 10; page++) {
      const events = await this.call("GET", this.repoPath(`/issues/${n}/events?per_page=100&page=${page}`));
      for (const e of events) if (e.event === "labeled" && e.label?.name === label && e.actor?.login) applier = e.actor.login;
      if (events.length < 100) break;
    }
    return applier;
  }
  /** The most recent comments on the PR, oldest first (for /verify-override). */
  async recentComments() {
    const n = this.ctx.pull_number;
    const out = [];
    for (let page = 1; page <= 10; page++) {
      const cs = await this.call("GET", this.repoPath(`/issues/${n}/comments?per_page=100&page=${page}`));
      for (const c of cs) if (c.user?.login && c.body) out.push({ author: c.user.login, body: c.body, created_at: c.created_at });
      if (cs.length < 100) break;
    }
    return out;
  }
};
function contextFromEnv(env, token) {
  const [owner, repo] = (env.GITHUB_REPOSITORY ?? "").split("/");
  if (!owner || !repo) return null;
  let pull = null;
  try {
    if (env.GITHUB_EVENT_PATH) {
      const ev = JSON.parse((0, import_node_fs.readFileSync)(env.GITHUB_EVENT_PATH, "utf8"));
      pull = ev.pull_request?.number ?? (ev.issue?.pull_request ? ev.issue.number ?? null : null);
      if (ev.pull_request?.head?.sha) env = { ...env, XYN_HEAD_SHA: ev.pull_request.head.sha };
      if (ev.pull_request?.base?.sha) env = { ...env, XYN_BASE_SHA: ev.pull_request.base.sha };
    }
  } catch {
    pull = null;
  }
  const m = /^refs\/pull\/(\d+)\//.exec(env.GITHUB_REF ?? "");
  if (!pull && m) pull = Number(m[1]);
  return {
    api_url: env.GITHUB_API_URL ?? "https://api.github.com",
    token,
    owner,
    repo,
    sha: env.XYN_HEAD_SHA ?? env.GITHUB_SHA ?? "",
    ref: env.GITHUB_REF ?? "",
    ref_sha: env.GITHUB_SHA ?? null,
    pull_number: pull,
    base_sha: env.XYN_BASE_SHA ?? null,
    event_name: env.GITHUB_EVENT_NAME ?? "",
    actor: env.GITHUB_ACTOR ?? null,
    run_id: env.GITHUB_RUN_ID ?? null
  };
}

// src/gate/run.ts
var import_node_crypto5 = require("node:crypto");
var import_node_fs4 = require("node:fs");
var import_node_path3 = require("node:path");

// src/gate/cache.ts
var import_node_fs2 = require("node:fs");
var import_node_path = require("node:path");
var MAX_CACHE_ENTRIES = 5e3;
var ResultCache = class {
  constructor(dir) {
    this.entries = {};
    this.dirty = false;
    this.path = (0, import_node_path.join)(dir, "verify-gate-cache.json");
    try {
      if ((0, import_node_fs2.existsSync)(this.path)) {
        const d = JSON.parse((0, import_node_fs2.readFileSync)(this.path, "utf8"));
        if (d.version === 1 && d.entries && typeof d.entries === "object") this.entries = d.entries;
      }
    } catch {
      this.entries = {};
    }
  }
  get(key, rulesVersion) {
    const e = this.entries[key];
    return e && e.rules_version === rulesVersion ? e.case : null;
  }
  set(key, rulesVersion, c, now) {
    if (c.status !== "checked" || c.decision === "hold") return;
    this.entries[key] = { at: now, rules_version: rulesVersion, case: c };
    this.dirty = true;
  }
  save() {
    if (!this.dirty) return;
    const keys = Object.keys(this.entries).sort((a, b) => this.entries[b].at < this.entries[a].at ? -1 : 1);
    const kept = Object.fromEntries(keys.slice(0, MAX_CACHE_ENTRIES).map((k) => [k, this.entries[k]]));
    (0, import_node_fs2.mkdirSync)((0, import_node_path.dirname)(this.path), { recursive: true });
    (0, import_node_fs2.writeFileSync)(this.path, `${JSON.stringify({ version: 1, entries: kept })}
`);
  }
};
var DocResultStore = class {
  constructor(dir) {
    this.entries = {};
    this.dirty = false;
    this.path = (0, import_node_path.join)(dir, "verify-gate-doc-results.json");
    try {
      if ((0, import_node_fs2.existsSync)(this.path)) {
        const d = JSON.parse((0, import_node_fs2.readFileSync)(this.path, "utf8"));
        if (d.version === 2 && d.entries && typeof d.entries === "object") this.entries = d.entries;
      }
    } catch {
      this.entries = {};
    }
  }
  get(key) {
    const e = this.entries[key];
    if (!e || !["supported", "contradicted", "unsupported", "unverifiable"].includes(e.verdict) || !e.sources || typeof e.sources !== "object") return null;
    return { verdict: e.verdict, sources: e.sources };
  }
  set(key, verdict, sources, now) {
    this.entries[key] = { at: now, verdict, sources };
    this.dirty = true;
  }
  save() {
    if (!this.dirty) return;
    const keys = Object.keys(this.entries).sort((a, b) => this.entries[b].at < this.entries[a].at ? -1 : 1);
    (0, import_node_fs2.mkdirSync)((0, import_node_path.dirname)(this.path), { recursive: true });
    (0, import_node_fs2.writeFileSync)(this.path, `${JSON.stringify({ version: 2, entries: Object.fromEntries(keys.slice(0, MAX_CACHE_ENTRIES).map((k) => [k, this.entries[k]])) })}
`);
  }
};

// src/gate/changes.ts
var DEFAULT_PATHS = ["prompts/**", "retrieval/**"];
function globToRegExp(glob) {
  let re = "";
  const g = glob.replace(/^\.\//, "");
  for (let i = 0; i < g.length; i++) {
    const ch = g[i];
    if (ch === "*") {
      if (g[i + 1] === "*") {
        i++;
        if (g[i + 1] === "/") i++;
        re += "(?:.*/)?" + (g[i + 1] === void 0 ? ".*" : "");
      } else re += "[^/]*";
    } else if (ch === "?") re += "[^/]";
    else re += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}
function relevantPatterns(o) {
  return [...DEFAULT_PATHS, o.config_path, ...o.source_paths, ...o.paths];
}
function relevantChanges(changed, patterns) {
  if (changed === null) return null;
  const res = patterns.map(globToRegExp);
  return changed.filter((f) => res.some((r) => r.test(f.replace(/^\.\//, ""))));
}

// src/gate/config.ts
var import_node_crypto = require("node:crypto");

// ../../node_modules/js-yaml/dist/js-yaml.mjs
var __create2 = Object.create;
var __defProp2 = Object.defineProperty;
var __getOwnPropDesc2 = Object.getOwnPropertyDescriptor;
var __getOwnPropNames2 = Object.getOwnPropertyNames;
var __getProtoOf2 = Object.getPrototypeOf;
var __hasOwnProp2 = Object.prototype.hasOwnProperty;
var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod), cb = null), mod.exports);
var __copyProps2 = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames2(from), i = 0, n = keys.length, key; i < n; i++) {
    key = keys[i];
    if (!__hasOwnProp2.call(to, key) && key !== except) __defProp2(to, key, {
      get: ((k) => from[k]).bind(null, key),
      enumerable: !(desc = __getOwnPropDesc2(from, key)) || desc.enumerable
    });
  }
  return to;
};
var __toESM2 = (mod, isNodeMode, target) => (target = mod != null ? __create2(__getProtoOf2(mod)) : {}, __copyProps2(isNodeMode || !mod || !mod.__esModule ? __defProp2(target, "default", {
  value: mod,
  enumerable: true
}) : target, mod));
var require_common = /* @__PURE__ */ __commonJSMin(((exports2, module2) => {
  function isNothing(subject) {
    return typeof subject === "undefined" || subject === null;
  }
  function isObject(subject) {
    return typeof subject === "object" && subject !== null;
  }
  function toArray(sequence) {
    if (Array.isArray(sequence)) return sequence;
    else if (isNothing(sequence)) return [];
    return [sequence];
  }
  function extend(target, source) {
    if (source) {
      const sourceKeys = Object.keys(source);
      for (let index = 0, length = sourceKeys.length; index < length; index += 1) {
        const key = sourceKeys[index];
        target[key] = source[key];
      }
    }
    return target;
  }
  function repeat(string, count) {
    let result = "";
    for (let cycle = 0; cycle < count; cycle += 1) result += string;
    return result;
  }
  function isNegativeZero(number) {
    return number === 0 && Number.NEGATIVE_INFINITY === 1 / number;
  }
  module2.exports.isNothing = isNothing;
  module2.exports.isObject = isObject;
  module2.exports.toArray = toArray;
  module2.exports.repeat = repeat;
  module2.exports.isNegativeZero = isNegativeZero;
  module2.exports.extend = extend;
}));
var require_exception = /* @__PURE__ */ __commonJSMin(((exports2, module2) => {
  function formatError(exception, compact) {
    let where = "";
    const message = exception.reason || "(unknown reason)";
    if (!exception.mark) return message;
    if (exception.mark.name) where += 'in "' + exception.mark.name + '" ';
    where += "(" + (exception.mark.line + 1) + ":" + (exception.mark.column + 1) + ")";
    if (!compact && exception.mark.snippet) where += "\n\n" + exception.mark.snippet;
    return message + " " + where;
  }
  function YAMLException2(reason, mark) {
    Error.call(this);
    this.name = "YAMLException";
    this.reason = reason;
    this.mark = mark;
    this.message = formatError(this, false);
    if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor);
    else this.stack = (/* @__PURE__ */ new Error()).stack || "";
  }
  YAMLException2.prototype = Object.create(Error.prototype);
  YAMLException2.prototype.constructor = YAMLException2;
  YAMLException2.prototype.toString = function toString(compact) {
    return this.name + ": " + formatError(this, compact);
  };
  module2.exports = YAMLException2;
}));
var require_snippet = /* @__PURE__ */ __commonJSMin(((exports2, module2) => {
  var common = require_common();
  function getLine(buffer, lineStart, lineEnd, position, maxLineLength) {
    let head = "";
    let tail = "";
    const maxHalfLength = Math.floor(maxLineLength / 2) - 1;
    if (position - lineStart > maxHalfLength) {
      head = " ... ";
      lineStart = position - maxHalfLength + head.length;
    }
    if (lineEnd - position > maxHalfLength) {
      tail = " ...";
      lineEnd = position + maxHalfLength - tail.length;
    }
    return {
      str: head + buffer.slice(lineStart, lineEnd).replace(/\t/g, "\u2192") + tail,
      pos: position - lineStart + head.length
    };
  }
  function padStart(string, max) {
    return common.repeat(" ", max - string.length) + string;
  }
  function makeSnippet(mark, options) {
    options = Object.create(options || null);
    if (!mark.buffer) return null;
    if (!options.maxLength) options.maxLength = 79;
    if (typeof options.indent !== "number") options.indent = 1;
    if (typeof options.linesBefore !== "number") options.linesBefore = 3;
    if (typeof options.linesAfter !== "number") options.linesAfter = 2;
    const re = /\r?\n|\r|\0/g;
    const lineStarts = [0];
    const lineEnds = [];
    let match;
    let foundLineNo = -1;
    while (match = re.exec(mark.buffer)) {
      lineEnds.push(match.index);
      lineStarts.push(match.index + match[0].length);
      if (mark.position <= match.index && foundLineNo < 0) foundLineNo = lineStarts.length - 2;
    }
    if (foundLineNo < 0) foundLineNo = lineStarts.length - 1;
    let result = "";
    const lineNoLength = Math.min(mark.line + options.linesAfter, lineEnds.length).toString().length;
    const maxLineLength = options.maxLength - (options.indent + lineNoLength + 3);
    for (let i = 1; i <= options.linesBefore; i++) {
      if (foundLineNo - i < 0) break;
      const line2 = getLine(mark.buffer, lineStarts[foundLineNo - i], lineEnds[foundLineNo - i], mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo - i]), maxLineLength);
      result = common.repeat(" ", options.indent) + padStart((mark.line - i + 1).toString(), lineNoLength) + " | " + line2.str + "\n" + result;
    }
    const line = getLine(mark.buffer, lineStarts[foundLineNo], lineEnds[foundLineNo], mark.position, maxLineLength);
    result += common.repeat(" ", options.indent) + padStart((mark.line + 1).toString(), lineNoLength) + " | " + line.str + "\n";
    result += common.repeat("-", options.indent + lineNoLength + 3 + line.pos) + "^\n";
    for (let i = 1; i <= options.linesAfter; i++) {
      if (foundLineNo + i >= lineEnds.length) break;
      const line2 = getLine(mark.buffer, lineStarts[foundLineNo + i], lineEnds[foundLineNo + i], mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo + i]), maxLineLength);
      result += common.repeat(" ", options.indent) + padStart((mark.line + i + 1).toString(), lineNoLength) + " | " + line2.str + "\n";
    }
    return result.replace(/\n$/, "");
  }
  module2.exports = makeSnippet;
}));
var require_type = /* @__PURE__ */ __commonJSMin(((exports2, module2) => {
  var YAMLException2 = require_exception();
  var TYPE_CONSTRUCTOR_OPTIONS = [
    "kind",
    "multi",
    "resolve",
    "construct",
    "instanceOf",
    "predicate",
    "represent",
    "representName",
    "defaultStyle",
    "styleAliases"
  ];
  var YAML_NODE_KINDS = [
    "scalar",
    "sequence",
    "mapping"
  ];
  function compileStyleAliases(map) {
    const result = {};
    if (map !== null) Object.keys(map).forEach(function(style) {
      map[style].forEach(function(alias) {
        result[String(alias)] = style;
      });
    });
    return result;
  }
  function Type2(tag, options) {
    options = options || {};
    Object.keys(options).forEach(function(name) {
      if (TYPE_CONSTRUCTOR_OPTIONS.indexOf(name) === -1) throw new YAMLException2('Unknown option "' + name + '" is met in definition of "' + tag + '" YAML type.');
    });
    this.options = options;
    this.tag = tag;
    this.kind = options["kind"] || null;
    this.resolve = options["resolve"] || function() {
      return true;
    };
    this.construct = options["construct"] || function(data) {
      return data;
    };
    this.instanceOf = options["instanceOf"] || null;
    this.predicate = options["predicate"] || null;
    this.represent = options["represent"] || null;
    this.representName = options["representName"] || null;
    this.defaultStyle = options["defaultStyle"] || null;
    this.multi = options["multi"] || false;
    this.styleAliases = compileStyleAliases(options["styleAliases"] || null);
    if (YAML_NODE_KINDS.indexOf(this.kind) === -1) throw new YAMLException2('Unknown kind "' + this.kind + '" is specified for "' + tag + '" YAML type.');
  }
  module2.exports = Type2;
}));
var require_schema = /* @__PURE__ */ __commonJSMin(((exports2, module2) => {
  var YAMLException2 = require_exception();
  var Type2 = require_type();
  function compileList(schema, name) {
    const result = [];
    schema[name].forEach(function(currentType) {
      let newIndex = result.length;
      result.forEach(function(previousType, previousIndex) {
        if (previousType.tag === currentType.tag && previousType.kind === currentType.kind && previousType.multi === currentType.multi) newIndex = previousIndex;
      });
      result[newIndex] = currentType;
    });
    return result;
  }
  function compileMap() {
    const result = {
      scalar: {},
      sequence: {},
      mapping: {},
      fallback: {},
      multi: {
        scalar: [],
        sequence: [],
        mapping: [],
        fallback: []
      }
    };
    function collectType(type) {
      if (type.multi) {
        result.multi[type.kind].push(type);
        result.multi["fallback"].push(type);
      } else result[type.kind][type.tag] = result["fallback"][type.tag] = type;
    }
    for (let index = 0, length = arguments.length; index < length; index += 1) arguments[index].forEach(collectType);
    return result;
  }
  function Schema2(definition) {
    return this.extend(definition);
  }
  Schema2.prototype.extend = function extend(definition) {
    let implicit = [];
    let explicit = [];
    if (definition instanceof Type2) explicit.push(definition);
    else if (Array.isArray(definition)) explicit = explicit.concat(definition);
    else if (definition && (Array.isArray(definition.implicit) || Array.isArray(definition.explicit))) {
      if (definition.implicit) implicit = implicit.concat(definition.implicit);
      if (definition.explicit) explicit = explicit.concat(definition.explicit);
    } else throw new YAMLException2("Schema.extend argument should be a Type, [ Type ], or a schema definition ({ implicit: [...], explicit: [...] })");
    implicit.forEach(function(type) {
      if (!(type instanceof Type2)) throw new YAMLException2("Specified list of YAML types (or a single Type object) contains a non-Type object.");
      if (type.loadKind && type.loadKind !== "scalar") throw new YAMLException2("There is a non-scalar type in the implicit list of a schema. Implicit resolving of such types is not supported.");
      if (type.multi) throw new YAMLException2("There is a multi type in the implicit list of a schema. Multi tags can only be listed as explicit.");
    });
    explicit.forEach(function(type) {
      if (!(type instanceof Type2)) throw new YAMLException2("Specified list of YAML types (or a single Type object) contains a non-Type object.");
    });
    const result = Object.create(Schema2.prototype);
    result.implicit = (this.implicit || []).concat(implicit);
    result.explicit = (this.explicit || []).concat(explicit);
    result.compiledImplicit = compileList(result, "implicit");
    result.compiledExplicit = compileList(result, "explicit");
    result.compiledTypeMap = compileMap(result.compiledImplicit, result.compiledExplicit);
    return result;
  };
  module2.exports = Schema2;
}));
var require_str = /* @__PURE__ */ __commonJSMin(((exports2, module2) => {
  module2.exports = new (require_type())("tag:yaml.org,2002:str", {
    kind: "scalar",
    construct: function(data) {
      return data !== null ? data : "";
    }
  });
}));
var require_seq = /* @__PURE__ */ __commonJSMin(((exports2, module2) => {
  module2.exports = new (require_type())("tag:yaml.org,2002:seq", {
    kind: "sequence",
    construct: function(data) {
      return data !== null ? data : [];
    }
  });
}));
var require_map = /* @__PURE__ */ __commonJSMin(((exports2, module2) => {
  module2.exports = new (require_type())("tag:yaml.org,2002:map", {
    kind: "mapping",
    construct: function(data) {
      return data !== null ? data : {};
    }
  });
}));
var require_failsafe = /* @__PURE__ */ __commonJSMin(((exports2, module2) => {
  module2.exports = new (require_schema())({ explicit: [
    require_str(),
    require_seq(),
    require_map()
  ] });
}));
var require_null = /* @__PURE__ */ __commonJSMin(((exports2, module2) => {
  var Type2 = require_type();
  function resolveYamlNull(data) {
    if (data === null) return true;
    const max = data.length;
    return max === 1 && data === "~" || max === 4 && (data === "null" || data === "Null" || data === "NULL");
  }
  function constructYamlNull() {
    return null;
  }
  function isNull(object) {
    return object === null;
  }
  module2.exports = new Type2("tag:yaml.org,2002:null", {
    kind: "scalar",
    resolve: resolveYamlNull,
    construct: constructYamlNull,
    predicate: isNull,
    represent: {
      canonical: function() {
        return "~";
      },
      lowercase: function() {
        return "null";
      },
      uppercase: function() {
        return "NULL";
      },
      camelcase: function() {
        return "Null";
      },
      empty: function() {
        return "";
      }
    },
    defaultStyle: "lowercase"
  });
}));
var require_bool = /* @__PURE__ */ __commonJSMin(((exports2, module2) => {
  var Type2 = require_type();
  function resolveYamlBoolean(data) {
    if (data === null) return false;
    const max = data.length;
    return max === 4 && (data === "true" || data === "True" || data === "TRUE") || max === 5 && (data === "false" || data === "False" || data === "FALSE");
  }
  function constructYamlBoolean(data) {
    return data === "true" || data === "True" || data === "TRUE";
  }
  function isBoolean(object) {
    return Object.prototype.toString.call(object) === "[object Boolean]";
  }
  module2.exports = new Type2("tag:yaml.org,2002:bool", {
    kind: "scalar",
    resolve: resolveYamlBoolean,
    construct: constructYamlBoolean,
    predicate: isBoolean,
    represent: {
      lowercase: function(object) {
        return object ? "true" : "false";
      },
      uppercase: function(object) {
        return object ? "TRUE" : "FALSE";
      },
      camelcase: function(object) {
        return object ? "True" : "False";
      }
    },
    defaultStyle: "lowercase"
  });
}));
var require_int = /* @__PURE__ */ __commonJSMin(((exports2, module2) => {
  var common = require_common();
  var Type2 = require_type();
  function isHexCode(c) {
    return c >= 48 && c <= 57 || c >= 65 && c <= 70 || c >= 97 && c <= 102;
  }
  function isOctCode(c) {
    return c >= 48 && c <= 55;
  }
  function isDecCode(c) {
    return c >= 48 && c <= 57;
  }
  function resolveYamlInteger(data) {
    if (data === null) return false;
    const max = data.length;
    let index = 0;
    let hasDigits = false;
    if (!max) return false;
    let ch = data[index];
    if (ch === "-" || ch === "+") ch = data[++index];
    if (ch === "0") {
      if (index + 1 === max) return true;
      ch = data[++index];
      if (ch === "b") {
        index++;
        for (; index < max; index++) {
          ch = data[index];
          if (ch !== "0" && ch !== "1") return false;
          hasDigits = true;
        }
        return hasDigits && Number.isFinite(parseYamlInteger(data));
      }
      if (ch === "x") {
        index++;
        for (; index < max; index++) {
          if (!isHexCode(data.charCodeAt(index))) return false;
          hasDigits = true;
        }
        return hasDigits && Number.isFinite(parseYamlInteger(data));
      }
      if (ch === "o") {
        index++;
        for (; index < max; index++) {
          if (!isOctCode(data.charCodeAt(index))) return false;
          hasDigits = true;
        }
        return hasDigits && Number.isFinite(parseYamlInteger(data));
      }
    }
    for (; index < max; index++) {
      if (!isDecCode(data.charCodeAt(index))) return false;
      hasDigits = true;
    }
    if (!hasDigits) return false;
    return Number.isFinite(parseYamlInteger(data));
  }
  function parseYamlInteger(data) {
    let value = data;
    let sign2 = 1;
    let ch = value[0];
    if (ch === "-" || ch === "+") {
      if (ch === "-") sign2 = -1;
      value = value.slice(1);
      ch = value[0];
    }
    if (value === "0") return 0;
    if (ch === "0") {
      if (value[1] === "b") return sign2 * parseInt(value.slice(2), 2);
      if (value[1] === "x") return sign2 * parseInt(value.slice(2), 16);
      if (value[1] === "o") return sign2 * parseInt(value.slice(2), 8);
    }
    return sign2 * parseInt(value, 10);
  }
  function constructYamlInteger(data) {
    return parseYamlInteger(data);
  }
  function isInteger(object) {
    return Object.prototype.toString.call(object) === "[object Number]" && object % 1 === 0 && !common.isNegativeZero(object);
  }
  module2.exports = new Type2("tag:yaml.org,2002:int", {
    kind: "scalar",
    resolve: resolveYamlInteger,
    construct: constructYamlInteger,
    predicate: isInteger,
    represent: {
      binary: function(obj) {
        return obj >= 0 ? "0b" + obj.toString(2) : "-0b" + obj.toString(2).slice(1);
      },
      octal: function(obj) {
        return obj >= 0 ? "0o" + obj.toString(8) : "-0o" + obj.toString(8).slice(1);
      },
      decimal: function(obj) {
        return obj.toString(10);
      },
      hexadecimal: function(obj) {
        return obj >= 0 ? "0x" + obj.toString(16).toUpperCase() : "-0x" + obj.toString(16).toUpperCase().slice(1);
      }
    },
    defaultStyle: "decimal",
    styleAliases: {
      binary: [2, "bin"],
      octal: [8, "oct"],
      decimal: [10, "dec"],
      hexadecimal: [16, "hex"]
    }
  });
}));
var require_float = /* @__PURE__ */ __commonJSMin(((exports2, module2) => {
  var common = require_common();
  var Type2 = require_type();
  var YAML_FLOAT_PATTERN = /* @__PURE__ */ new RegExp("^(?:[-+]?(?:[0-9]+)(?:\\.[0-9]*)?(?:[eE][-+]?[0-9]+)?|\\.[0-9]+(?:[eE][-+]?[0-9]+)?|[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$");
  var YAML_FLOAT_SPECIAL_PATTERN = /* @__PURE__ */ new RegExp("^(?:[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$");
  function resolveYamlFloat(data) {
    if (data === null) return false;
    if (!YAML_FLOAT_PATTERN.test(data)) return false;
    if (Number.isFinite(parseFloat(data, 10))) return true;
    return YAML_FLOAT_SPECIAL_PATTERN.test(data);
  }
  function constructYamlFloat(data) {
    let value = data.toLowerCase();
    const sign2 = value[0] === "-" ? -1 : 1;
    if ("+-".indexOf(value[0]) >= 0) value = value.slice(1);
    if (value === ".inf") return sign2 === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
    else if (value === ".nan") return NaN;
    return sign2 * parseFloat(value, 10);
  }
  var SCIENTIFIC_WITHOUT_DOT = /^[-+]?[0-9]+e/;
  function representYamlFloat(object, style) {
    if (isNaN(object)) switch (style) {
      case "lowercase":
        return ".nan";
      case "uppercase":
        return ".NAN";
      case "camelcase":
        return ".NaN";
    }
    else if (Number.POSITIVE_INFINITY === object) switch (style) {
      case "lowercase":
        return ".inf";
      case "uppercase":
        return ".INF";
      case "camelcase":
        return ".Inf";
    }
    else if (Number.NEGATIVE_INFINITY === object) switch (style) {
      case "lowercase":
        return "-.inf";
      case "uppercase":
        return "-.INF";
      case "camelcase":
        return "-.Inf";
    }
    else if (common.isNegativeZero(object)) return "-0.0";
    const res = object.toString(10);
    return SCIENTIFIC_WITHOUT_DOT.test(res) ? res.replace("e", ".e") : res;
  }
  function isFloat(object) {
    return Object.prototype.toString.call(object) === "[object Number]" && (object % 1 !== 0 || common.isNegativeZero(object));
  }
  module2.exports = new Type2("tag:yaml.org,2002:float", {
    kind: "scalar",
    resolve: resolveYamlFloat,
    construct: constructYamlFloat,
    predicate: isFloat,
    represent: representYamlFloat,
    defaultStyle: "lowercase"
  });
}));
var require_json = /* @__PURE__ */ __commonJSMin(((exports2, module2) => {
  module2.exports = require_failsafe().extend({ implicit: [
    require_null(),
    require_bool(),
    require_int(),
    require_float()
  ] });
}));
var require_core = /* @__PURE__ */ __commonJSMin(((exports2, module2) => {
  module2.exports = require_json();
}));
var require_timestamp = /* @__PURE__ */ __commonJSMin(((exports2, module2) => {
  var Type2 = require_type();
  var YAML_DATE_REGEXP = /* @__PURE__ */ new RegExp("^([0-9][0-9][0-9][0-9])-([0-9][0-9])-([0-9][0-9])$");
  var YAML_TIMESTAMP_REGEXP = /* @__PURE__ */ new RegExp("^([0-9][0-9][0-9][0-9])-([0-9][0-9]?)-([0-9][0-9]?)(?:[Tt]|[ \\t]+)([0-9][0-9]?):([0-9][0-9]):([0-9][0-9])(?:\\.([0-9]*))?(?:[ \\t]*(Z|([-+])([0-9][0-9]?)(?::([0-9][0-9]))?))?$");
  function resolveYamlTimestamp(data) {
    if (data === null) return false;
    if (YAML_DATE_REGEXP.exec(data) !== null) return true;
    if (YAML_TIMESTAMP_REGEXP.exec(data) !== null) return true;
    return false;
  }
  function constructYamlTimestamp(data) {
    let fraction = 0;
    let delta = null;
    let match = YAML_DATE_REGEXP.exec(data);
    if (match === null) match = YAML_TIMESTAMP_REGEXP.exec(data);
    if (match === null) throw new Error("Date resolve error");
    const year = +match[1];
    const month = +match[2] - 1;
    const day2 = +match[3];
    if (!match[4]) return new Date(Date.UTC(year, month, day2));
    const hour = +match[4];
    const minute = +match[5];
    const second = +match[6];
    if (match[7]) {
      fraction = match[7].slice(0, 3);
      while (fraction.length < 3) fraction += "0";
      fraction = +fraction;
    }
    if (match[9]) {
      const tzHour = +match[10];
      const tzMinute = +(match[11] || 0);
      delta = (tzHour * 60 + tzMinute) * 6e4;
      if (match[9] === "-") delta = -delta;
    }
    const date = new Date(Date.UTC(year, month, day2, hour, minute, second, fraction));
    if (delta) date.setTime(date.getTime() - delta);
    return date;
  }
  function representYamlTimestamp(object) {
    return object.toISOString();
  }
  module2.exports = new Type2("tag:yaml.org,2002:timestamp", {
    kind: "scalar",
    resolve: resolveYamlTimestamp,
    construct: constructYamlTimestamp,
    instanceOf: Date,
    represent: representYamlTimestamp
  });
}));
var require_merge = /* @__PURE__ */ __commonJSMin(((exports2, module2) => {
  var Type2 = require_type();
  function resolveYamlMerge(data) {
    return data === "<<" || data === null;
  }
  module2.exports = new Type2("tag:yaml.org,2002:merge", {
    kind: "scalar",
    resolve: resolveYamlMerge
  });
}));
var require_binary = /* @__PURE__ */ __commonJSMin(((exports2, module2) => {
  var Type2 = require_type();
  var BASE64_MAP = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=\n\r";
  function resolveYamlBinary(data) {
    if (data === null) return false;
    let bitlen = 0;
    const max = data.length;
    const map = BASE64_MAP;
    for (let idx = 0; idx < max; idx++) {
      const code = map.indexOf(data.charAt(idx));
      if (code > 64) continue;
      if (code < 0) return false;
      bitlen += 6;
    }
    return bitlen % 8 === 0;
  }
  function constructYamlBinary(data) {
    const input2 = data.replace(/[\r\n=]/g, "");
    const max = input2.length;
    const map = BASE64_MAP;
    let bits = 0;
    const result = [];
    for (let idx = 0; idx < max; idx++) {
      if (idx % 4 === 0 && idx) {
        result.push(bits >> 16 & 255);
        result.push(bits >> 8 & 255);
        result.push(bits & 255);
      }
      bits = bits << 6 | map.indexOf(input2.charAt(idx));
    }
    const tailbits = max % 4 * 6;
    if (tailbits === 0) {
      result.push(bits >> 16 & 255);
      result.push(bits >> 8 & 255);
      result.push(bits & 255);
    } else if (tailbits === 18) {
      result.push(bits >> 10 & 255);
      result.push(bits >> 2 & 255);
    } else if (tailbits === 12) result.push(bits >> 4 & 255);
    return new Uint8Array(result);
  }
  function representYamlBinary(object) {
    let result = "";
    let bits = 0;
    const max = object.length;
    const map = BASE64_MAP;
    for (let idx = 0; idx < max; idx++) {
      if (idx % 3 === 0 && idx) {
        result += map[bits >> 18 & 63];
        result += map[bits >> 12 & 63];
        result += map[bits >> 6 & 63];
        result += map[bits & 63];
      }
      bits = (bits << 8) + object[idx];
    }
    const tail = max % 3;
    if (tail === 0) {
      result += map[bits >> 18 & 63];
      result += map[bits >> 12 & 63];
      result += map[bits >> 6 & 63];
      result += map[bits & 63];
    } else if (tail === 2) {
      result += map[bits >> 10 & 63];
      result += map[bits >> 4 & 63];
      result += map[bits << 2 & 63];
      result += map[64];
    } else if (tail === 1) {
      result += map[bits >> 2 & 63];
      result += map[bits << 4 & 63];
      result += map[64];
      result += map[64];
    }
    return result;
  }
  function isBinary(obj) {
    return Object.prototype.toString.call(obj) === "[object Uint8Array]";
  }
  module2.exports = new Type2("tag:yaml.org,2002:binary", {
    kind: "scalar",
    resolve: resolveYamlBinary,
    construct: constructYamlBinary,
    predicate: isBinary,
    represent: representYamlBinary
  });
}));
var require_omap = /* @__PURE__ */ __commonJSMin(((exports2, module2) => {
  var Type2 = require_type();
  var _hasOwnProperty = Object.prototype.hasOwnProperty;
  var _toString = Object.prototype.toString;
  function resolveYamlOmap(data) {
    if (data === null) return true;
    const objectKeys = [];
    const object = data;
    for (let index = 0, length = object.length; index < length; index += 1) {
      const pair = object[index];
      let pairHasKey = false;
      if (_toString.call(pair) !== "[object Object]") return false;
      let pairKey;
      for (pairKey in pair) if (_hasOwnProperty.call(pair, pairKey)) if (!pairHasKey) pairHasKey = true;
      else return false;
      if (!pairHasKey) return false;
      if (objectKeys.indexOf(pairKey) === -1) objectKeys.push(pairKey);
      else return false;
    }
    return true;
  }
  function constructYamlOmap(data) {
    return data !== null ? data : [];
  }
  module2.exports = new Type2("tag:yaml.org,2002:omap", {
    kind: "sequence",
    resolve: resolveYamlOmap,
    construct: constructYamlOmap
  });
}));
var require_pairs = /* @__PURE__ */ __commonJSMin(((exports2, module2) => {
  var Type2 = require_type();
  var _toString = Object.prototype.toString;
  function resolveYamlPairs(data) {
    if (data === null) return true;
    const object = data;
    const result = new Array(object.length);
    for (let index = 0, length = object.length; index < length; index += 1) {
      const pair = object[index];
      if (_toString.call(pair) !== "[object Object]") return false;
      const keys = Object.keys(pair);
      if (keys.length !== 1) return false;
      result[index] = [keys[0], pair[keys[0]]];
    }
    return true;
  }
  function constructYamlPairs(data) {
    if (data === null) return [];
    const object = data;
    const result = new Array(object.length);
    for (let index = 0, length = object.length; index < length; index += 1) {
      const pair = object[index];
      const keys = Object.keys(pair);
      result[index] = [keys[0], pair[keys[0]]];
    }
    return result;
  }
  module2.exports = new Type2("tag:yaml.org,2002:pairs", {
    kind: "sequence",
    resolve: resolveYamlPairs,
    construct: constructYamlPairs
  });
}));
var require_set = /* @__PURE__ */ __commonJSMin(((exports2, module2) => {
  var Type2 = require_type();
  var _hasOwnProperty = Object.prototype.hasOwnProperty;
  function resolveYamlSet(data) {
    if (data === null) return true;
    const object = data;
    for (const key in object) if (_hasOwnProperty.call(object, key)) {
      if (object[key] !== null) return false;
    }
    return true;
  }
  function constructYamlSet(data) {
    return data !== null ? data : {};
  }
  module2.exports = new Type2("tag:yaml.org,2002:set", {
    kind: "mapping",
    resolve: resolveYamlSet,
    construct: constructYamlSet
  });
}));
var require_default = /* @__PURE__ */ __commonJSMin(((exports2, module2) => {
  module2.exports = require_core().extend({
    implicit: [require_timestamp(), require_merge()],
    explicit: [
      require_binary(),
      require_omap(),
      require_pairs(),
      require_set()
    ]
  });
}));
var require_loader = /* @__PURE__ */ __commonJSMin(((exports2, module2) => {
  var common = require_common();
  var YAMLException2 = require_exception();
  var makeSnippet = require_snippet();
  var DEFAULT_SCHEMA2 = require_default();
  var _hasOwnProperty = Object.prototype.hasOwnProperty;
  var CONTEXT_FLOW_IN = 1;
  var CONTEXT_FLOW_OUT = 2;
  var CONTEXT_BLOCK_IN = 3;
  var CONTEXT_BLOCK_OUT = 4;
  var CHOMPING_CLIP = 1;
  var CHOMPING_STRIP = 2;
  var CHOMPING_KEEP = 3;
  var PATTERN_NON_PRINTABLE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/;
  var PATTERN_NON_ASCII_LINE_BREAKS = /[\x85\u2028\u2029]/;
  var PATTERN_FLOW_INDICATORS = /[,\[\]{}]/;
  var PATTERN_TAG_HANDLE = /^(?:!|!!|![0-9A-Za-z-]+!)$/;
  var PATTERN_TAG_URI = /^(?:!|[^,\[\]{}])(?:%[0-9a-f]{2}|[0-9a-z\-#;/?:@&=+$,_.!~*'()\[\]])*$/i;
  function _class(obj) {
    return Object.prototype.toString.call(obj);
  }
  function isEol(c) {
    return c === 10 || c === 13;
  }
  function isWhiteSpace(c) {
    return c === 9 || c === 32;
  }
  function isWsOrEol(c) {
    return c === 9 || c === 32 || c === 10 || c === 13;
  }
  function isFlowIndicator(c) {
    return c === 44 || c === 91 || c === 93 || c === 123 || c === 125;
  }
  function fromHexCode(c) {
    if (c >= 48 && c <= 57) return c - 48;
    const lc = c | 32;
    if (lc >= 97 && lc <= 102) return lc - 97 + 10;
    return -1;
  }
  function escapedHexLen(c) {
    if (c === 120) return 2;
    if (c === 117) return 4;
    if (c === 85) return 8;
    return 0;
  }
  function fromDecimalCode(c) {
    if (c >= 48 && c <= 57) return c - 48;
    return -1;
  }
  function simpleEscapeSequence(c) {
    switch (c) {
      case 48:
        return "\0";
      case 97:
        return "\x07";
      case 98:
        return "\b";
      case 116:
        return "	";
      case 9:
        return "	";
      case 110:
        return "\n";
      case 118:
        return "\v";
      case 102:
        return "\f";
      case 114:
        return "\r";
      case 101:
        return "\x1B";
      case 32:
        return " ";
      case 34:
        return '"';
      case 47:
        return "/";
      case 92:
        return "\\";
      case 78:
        return "\x85";
      case 95:
        return "\xA0";
      case 76:
        return "\u2028";
      case 80:
        return "\u2029";
      default:
        return "";
    }
  }
  function charFromCodepoint(c) {
    if (c <= 65535) return String.fromCharCode(c);
    return String.fromCharCode((c - 65536 >> 10) + 55296, (c - 65536 & 1023) + 56320);
  }
  function setProperty(object, key, value) {
    if (key === "__proto__") Object.defineProperty(object, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value
    });
    else object[key] = value;
  }
  var simpleEscapeCheck = new Array(256);
  var simpleEscapeMap = new Array(256);
  for (let i = 0; i < 256; i++) {
    simpleEscapeCheck[i] = simpleEscapeSequence(i) ? 1 : 0;
    simpleEscapeMap[i] = simpleEscapeSequence(i);
  }
  function State(input2, options) {
    this.input = input2;
    this.filename = options["filename"] || null;
    this.schema = options["schema"] || DEFAULT_SCHEMA2;
    this.onWarning = options["onWarning"] || null;
    this.legacy = options["legacy"] || false;
    this.json = options["json"] || false;
    this.listener = options["listener"] || null;
    this.maxDepth = typeof options["maxDepth"] === "number" ? options["maxDepth"] : 100;
    this.maxMergeSeqLength = typeof options["maxMergeSeqLength"] === "number" ? options["maxMergeSeqLength"] : 20;
    this.implicitTypes = this.schema.compiledImplicit;
    this.typeMap = this.schema.compiledTypeMap;
    this.length = input2.length;
    this.position = 0;
    this.line = 0;
    this.lineStart = 0;
    this.lineIndent = 0;
    this.depth = 0;
    this.firstTabInLine = -1;
    this.documents = [];
    this.anchorMapTransactions = [];
  }
  function generateError(state, message) {
    const mark = {
      name: state.filename,
      buffer: state.input.slice(0, -1),
      position: state.position,
      line: state.line,
      column: state.position - state.lineStart
    };
    mark.snippet = makeSnippet(mark);
    return new YAMLException2(message, mark);
  }
  function throwError(state, message) {
    throw generateError(state, message);
  }
  function throwWarning(state, message) {
    if (state.onWarning) state.onWarning.call(null, generateError(state, message));
  }
  function storeAnchor(state, name, value) {
    const transactions = state.anchorMapTransactions;
    if (transactions.length !== 0) {
      const transaction = transactions[transactions.length - 1];
      if (!_hasOwnProperty.call(transaction, name)) transaction[name] = {
        existed: _hasOwnProperty.call(state.anchorMap, name),
        value: state.anchorMap[name]
      };
    }
    state.anchorMap[name] = value;
  }
  function beginAnchorTransaction(state) {
    state.anchorMapTransactions.push(/* @__PURE__ */ Object.create(null));
  }
  function commitAnchorTransaction(state) {
    const transaction = state.anchorMapTransactions.pop();
    const transactions = state.anchorMapTransactions;
    if (transactions.length === 0) return;
    const parent = transactions[transactions.length - 1];
    const names = Object.keys(transaction);
    for (let index = 0, length = names.length; index < length; index += 1) {
      const name = names[index];
      if (!_hasOwnProperty.call(parent, name)) parent[name] = transaction[name];
    }
  }
  function rollbackAnchorTransaction(state) {
    const transaction = state.anchorMapTransactions.pop();
    const names = Object.keys(transaction);
    for (let index = names.length - 1; index >= 0; index -= 1) {
      const entry = transaction[names[index]];
      if (entry.existed) state.anchorMap[names[index]] = entry.value;
      else delete state.anchorMap[names[index]];
    }
  }
  function snapshotState(state) {
    return {
      position: state.position,
      line: state.line,
      lineStart: state.lineStart,
      lineIndent: state.lineIndent,
      firstTabInLine: state.firstTabInLine,
      tag: state.tag,
      anchor: state.anchor,
      kind: state.kind,
      result: state.result
    };
  }
  function restoreState(state, snapshot) {
    state.position = snapshot.position;
    state.line = snapshot.line;
    state.lineStart = snapshot.lineStart;
    state.lineIndent = snapshot.lineIndent;
    state.firstTabInLine = snapshot.firstTabInLine;
    state.tag = snapshot.tag;
    state.anchor = snapshot.anchor;
    state.kind = snapshot.kind;
    state.result = snapshot.result;
  }
  var directiveHandlers = {
    YAML: function handleYamlDirective(state, name, args) {
      if (state.version !== null) throwError(state, "duplication of %YAML directive");
      if (args.length !== 1) throwError(state, "YAML directive accepts exactly one argument");
      const match = /^([0-9]+)\.([0-9]+)$/.exec(args[0]);
      if (match === null) throwError(state, "ill-formed argument of the YAML directive");
      const major = parseInt(match[1], 10);
      const minor = parseInt(match[2], 10);
      if (major !== 1) throwError(state, "unacceptable YAML version of the document");
      state.version = args[0];
      state.checkLineBreaks = minor < 2;
      if (minor !== 1 && minor !== 2) throwWarning(state, "unsupported YAML version of the document");
    },
    TAG: function handleTagDirective(state, name, args) {
      let prefix;
      if (args.length !== 2) throwError(state, "TAG directive accepts exactly two arguments");
      const handle = args[0];
      prefix = args[1];
      if (!PATTERN_TAG_HANDLE.test(handle)) throwError(state, "ill-formed tag handle (first argument) of the TAG directive");
      if (_hasOwnProperty.call(state.tagMap, handle)) throwError(state, 'there is a previously declared suffix for "' + handle + '" tag handle');
      if (!PATTERN_TAG_URI.test(prefix)) throwError(state, "ill-formed tag prefix (second argument) of the TAG directive");
      try {
        prefix = decodeURIComponent(prefix);
      } catch (err) {
        throwError(state, "tag prefix is malformed: " + prefix);
      }
      state.tagMap[handle] = prefix;
    }
  };
  function captureSegment(state, start, end, checkJson) {
    if (start < end) {
      const _result = state.input.slice(start, end);
      if (checkJson) for (let _position = 0, _length = _result.length; _position < _length; _position += 1) {
        const _character = _result.charCodeAt(_position);
        if (!(_character === 9 || _character >= 32 && _character <= 1114111)) throwError(state, "expected valid JSON character");
      }
      else if (PATTERN_NON_PRINTABLE.test(_result)) throwError(state, "the stream contains non-printable characters");
      state.result += _result;
    }
  }
  function mergeMappings(state, destination, source, overridableKeys) {
    if (!common.isObject(source)) throwError(state, "cannot merge mappings; the provided source object is unacceptable");
    const sourceKeys = Object.keys(source);
    for (let index = 0, quantity = sourceKeys.length; index < quantity; index += 1) {
      const key = sourceKeys[index];
      if (!_hasOwnProperty.call(destination, key)) {
        setProperty(destination, key, source[key]);
        overridableKeys[key] = true;
      }
    }
  }
  function storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, startLine, startLineStart, startPos) {
    if (Array.isArray(keyNode)) {
      keyNode = Array.prototype.slice.call(keyNode);
      for (let index = 0, quantity = keyNode.length; index < quantity; index += 1) {
        if (Array.isArray(keyNode[index])) throwError(state, "nested arrays are not supported inside keys");
        if (typeof keyNode === "object" && _class(keyNode[index]) === "[object Object]") keyNode[index] = "[object Object]";
      }
    }
    if (typeof keyNode === "object" && _class(keyNode) === "[object Object]") keyNode = "[object Object]";
    keyNode = String(keyNode);
    if (_result === null) _result = {};
    if (keyTag === "tag:yaml.org,2002:merge") if (Array.isArray(valueNode)) {
      if (valueNode.length > state.maxMergeSeqLength) throwError(state, "merge sequence length exceeded maxMergeSeqLength (" + state.maxMergeSeqLength + ")");
      const seen = /* @__PURE__ */ new Set();
      for (let index = 0, quantity = valueNode.length; index < quantity; index += 1) {
        const src = valueNode[index];
        if (seen.has(src)) continue;
        seen.add(src);
        mergeMappings(state, _result, src, overridableKeys);
      }
    } else mergeMappings(state, _result, valueNode, overridableKeys);
    else {
      if (!state.json && !_hasOwnProperty.call(overridableKeys, keyNode) && _hasOwnProperty.call(_result, keyNode)) {
        state.line = startLine || state.line;
        state.lineStart = startLineStart || state.lineStart;
        state.position = startPos || state.position;
        throwError(state, "duplicated mapping key");
      }
      setProperty(_result, keyNode, valueNode);
      delete overridableKeys[keyNode];
    }
    return _result;
  }
  function readLineBreak(state) {
    const ch = state.input.charCodeAt(state.position);
    if (ch === 10) state.position++;
    else if (ch === 13) {
      state.position++;
      if (state.input.charCodeAt(state.position) === 10) state.position++;
    } else throwError(state, "a line break is expected");
    state.line += 1;
    state.lineStart = state.position;
    state.firstTabInLine = -1;
  }
  function skipSeparationSpace(state, allowComments, checkIndent) {
    let lineBreaks = 0;
    let ch = state.input.charCodeAt(state.position);
    while (ch !== 0) {
      while (isWhiteSpace(ch)) {
        if (ch === 9 && state.firstTabInLine === -1) state.firstTabInLine = state.position;
        ch = state.input.charCodeAt(++state.position);
      }
      if (allowComments && ch === 35) do
        ch = state.input.charCodeAt(++state.position);
      while (ch !== 10 && ch !== 13 && ch !== 0);
      if (isEol(ch)) {
        readLineBreak(state);
        ch = state.input.charCodeAt(state.position);
        lineBreaks++;
        state.lineIndent = 0;
        while (ch === 32) {
          state.lineIndent++;
          ch = state.input.charCodeAt(++state.position);
        }
      } else break;
    }
    if (checkIndent !== -1 && lineBreaks !== 0 && state.lineIndent < checkIndent) throwWarning(state, "deficient indentation");
    return lineBreaks;
  }
  function testDocumentSeparator(state) {
    let _position = state.position;
    let ch = state.input.charCodeAt(_position);
    if ((ch === 45 || ch === 46) && ch === state.input.charCodeAt(_position + 1) && ch === state.input.charCodeAt(_position + 2)) {
      _position += 3;
      ch = state.input.charCodeAt(_position);
      if (ch === 0 || isWsOrEol(ch)) return true;
    }
    return false;
  }
  function writeFoldedLines(state, count) {
    if (count === 1) state.result += " ";
    else if (count > 1) state.result += common.repeat("\n", count - 1);
  }
  function readPlainScalar(state, nodeIndent, withinFlowCollection) {
    let captureStart;
    let captureEnd;
    let hasPendingContent;
    let _line;
    let _lineStart;
    let _lineIndent;
    const _kind = state.kind;
    const _result = state.result;
    let ch = state.input.charCodeAt(state.position);
    if (isWsOrEol(ch) || isFlowIndicator(ch) || ch === 35 || ch === 38 || ch === 42 || ch === 33 || ch === 124 || ch === 62 || ch === 39 || ch === 34 || ch === 37 || ch === 64 || ch === 96) return false;
    if (ch === 63 || ch === 45) {
      const following = state.input.charCodeAt(state.position + 1);
      if (isWsOrEol(following) || withinFlowCollection && isFlowIndicator(following)) return false;
    }
    state.kind = "scalar";
    state.result = "";
    captureStart = captureEnd = state.position;
    hasPendingContent = false;
    while (ch !== 0) {
      if (ch === 58) {
        const following = state.input.charCodeAt(state.position + 1);
        if (isWsOrEol(following) || withinFlowCollection && isFlowIndicator(following)) break;
      } else if (ch === 35) {
        if (isWsOrEol(state.input.charCodeAt(state.position - 1))) break;
      } else if (state.position === state.lineStart && testDocumentSeparator(state) || withinFlowCollection && isFlowIndicator(ch)) break;
      else if (isEol(ch)) {
        _line = state.line;
        _lineStart = state.lineStart;
        _lineIndent = state.lineIndent;
        skipSeparationSpace(state, false, -1);
        if (state.lineIndent >= nodeIndent) {
          hasPendingContent = true;
          ch = state.input.charCodeAt(state.position);
          continue;
        } else {
          state.position = captureEnd;
          state.line = _line;
          state.lineStart = _lineStart;
          state.lineIndent = _lineIndent;
          break;
        }
      }
      if (hasPendingContent) {
        captureSegment(state, captureStart, captureEnd, false);
        writeFoldedLines(state, state.line - _line);
        captureStart = captureEnd = state.position;
        hasPendingContent = false;
      }
      if (!isWhiteSpace(ch)) captureEnd = state.position + 1;
      ch = state.input.charCodeAt(++state.position);
    }
    captureSegment(state, captureStart, captureEnd, false);
    if (state.result) return true;
    state.kind = _kind;
    state.result = _result;
    return false;
  }
  function readSingleQuotedScalar(state, nodeIndent) {
    let captureStart;
    let captureEnd;
    let ch = state.input.charCodeAt(state.position);
    if (ch !== 39) return false;
    state.kind = "scalar";
    state.result = "";
    state.position++;
    captureStart = captureEnd = state.position;
    while ((ch = state.input.charCodeAt(state.position)) !== 0) if (ch === 39) {
      captureSegment(state, captureStart, state.position, true);
      ch = state.input.charCodeAt(++state.position);
      if (ch === 39) {
        captureStart = state.position;
        state.position++;
        captureEnd = state.position;
      } else return true;
    } else if (isEol(ch)) {
      captureSegment(state, captureStart, captureEnd, true);
      writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
      captureStart = captureEnd = state.position;
    } else if (state.position === state.lineStart && testDocumentSeparator(state)) throwError(state, "unexpected end of the document within a single quoted scalar");
    else {
      state.position++;
      if (!isWhiteSpace(ch)) captureEnd = state.position;
    }
    throwError(state, "unexpected end of the stream within a single quoted scalar");
  }
  function readDoubleQuotedScalar(state, nodeIndent) {
    let captureStart;
    let captureEnd;
    let tmp;
    let ch = state.input.charCodeAt(state.position);
    if (ch !== 34) return false;
    state.kind = "scalar";
    state.result = "";
    state.position++;
    captureStart = captureEnd = state.position;
    while ((ch = state.input.charCodeAt(state.position)) !== 0) if (ch === 34) {
      captureSegment(state, captureStart, state.position, true);
      state.position++;
      return true;
    } else if (ch === 92) {
      captureSegment(state, captureStart, state.position, true);
      ch = state.input.charCodeAt(++state.position);
      if (isEol(ch)) skipSeparationSpace(state, false, nodeIndent);
      else if (ch < 256 && simpleEscapeCheck[ch]) {
        state.result += simpleEscapeMap[ch];
        state.position++;
      } else if ((tmp = escapedHexLen(ch)) > 0) {
        let hexLength = tmp;
        let hexResult = 0;
        for (; hexLength > 0; hexLength--) {
          ch = state.input.charCodeAt(++state.position);
          if ((tmp = fromHexCode(ch)) >= 0) hexResult = (hexResult << 4) + tmp;
          else throwError(state, "expected hexadecimal character");
        }
        state.result += charFromCodepoint(hexResult);
        state.position++;
      } else throwError(state, "unknown escape sequence");
      captureStart = captureEnd = state.position;
    } else if (isEol(ch)) {
      captureSegment(state, captureStart, captureEnd, true);
      writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
      captureStart = captureEnd = state.position;
    } else if (state.position === state.lineStart && testDocumentSeparator(state)) throwError(state, "unexpected end of the document within a double quoted scalar");
    else {
      state.position++;
      if (!isWhiteSpace(ch)) captureEnd = state.position;
    }
    throwError(state, "unexpected end of the stream within a double quoted scalar");
  }
  function readFlowCollection(state, nodeIndent) {
    let readNext = true;
    let _line;
    let _lineStart;
    let _pos;
    const _tag = state.tag;
    let _result;
    const _anchor = state.anchor;
    let terminator;
    let isPair;
    let isExplicitPair;
    let isMapping;
    const overridableKeys = /* @__PURE__ */ Object.create(null);
    let keyNode;
    let keyTag;
    let valueNode;
    let ch = state.input.charCodeAt(state.position);
    if (ch === 91) {
      terminator = 93;
      isMapping = false;
      _result = [];
    } else if (ch === 123) {
      terminator = 125;
      isMapping = true;
      _result = {};
    } else return false;
    if (state.anchor !== null) storeAnchor(state, state.anchor, _result);
    ch = state.input.charCodeAt(++state.position);
    while (ch !== 0) {
      skipSeparationSpace(state, true, nodeIndent);
      ch = state.input.charCodeAt(state.position);
      if (ch === terminator) {
        state.position++;
        state.tag = _tag;
        state.anchor = _anchor;
        state.kind = isMapping ? "mapping" : "sequence";
        state.result = _result;
        return true;
      } else if (!readNext) throwError(state, "missed comma between flow collection entries");
      else if (ch === 44) throwError(state, "expected the node content, but found ','");
      keyTag = keyNode = valueNode = null;
      isPair = isExplicitPair = false;
      if (ch === 63) {
        if (isWsOrEol(state.input.charCodeAt(state.position + 1))) {
          isPair = isExplicitPair = true;
          state.position++;
          skipSeparationSpace(state, true, nodeIndent);
        }
      }
      _line = state.line;
      _lineStart = state.lineStart;
      _pos = state.position;
      composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
      keyTag = state.tag;
      keyNode = state.result;
      skipSeparationSpace(state, true, nodeIndent);
      ch = state.input.charCodeAt(state.position);
      if ((isExplicitPair || state.line === _line) && ch === 58) {
        isPair = true;
        ch = state.input.charCodeAt(++state.position);
        skipSeparationSpace(state, true, nodeIndent);
        composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
        valueNode = state.result;
      }
      if (isMapping) storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos);
      else if (isPair) _result.push(storeMappingPair(state, null, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos));
      else _result.push(keyNode);
      skipSeparationSpace(state, true, nodeIndent);
      ch = state.input.charCodeAt(state.position);
      if (ch === 44) {
        readNext = true;
        ch = state.input.charCodeAt(++state.position);
      } else readNext = false;
    }
    throwError(state, "unexpected end of the stream within a flow collection");
  }
  function readBlockScalar(state, nodeIndent) {
    let folding;
    let chomping = CHOMPING_CLIP;
    let didReadContent = false;
    let detectedIndent = false;
    let textIndent = nodeIndent;
    let emptyLines = 0;
    let atMoreIndented = false;
    let tmp;
    let ch = state.input.charCodeAt(state.position);
    if (ch === 124) folding = false;
    else if (ch === 62) folding = true;
    else return false;
    state.kind = "scalar";
    state.result = "";
    while (ch !== 0) {
      ch = state.input.charCodeAt(++state.position);
      if (ch === 43 || ch === 45) if (CHOMPING_CLIP === chomping) chomping = ch === 43 ? CHOMPING_KEEP : CHOMPING_STRIP;
      else throwError(state, "repeat of a chomping mode identifier");
      else if ((tmp = fromDecimalCode(ch)) >= 0) if (tmp === 0) throwError(state, "bad explicit indentation width of a block scalar; it cannot be less than one");
      else if (!detectedIndent) {
        textIndent = nodeIndent + tmp - 1;
        detectedIndent = true;
      } else throwError(state, "repeat of an indentation width identifier");
      else break;
    }
    if (isWhiteSpace(ch)) {
      do
        ch = state.input.charCodeAt(++state.position);
      while (isWhiteSpace(ch));
      if (ch === 35) do
        ch = state.input.charCodeAt(++state.position);
      while (!isEol(ch) && ch !== 0);
    }
    while (ch !== 0) {
      readLineBreak(state);
      state.lineIndent = 0;
      ch = state.input.charCodeAt(state.position);
      while ((!detectedIndent || state.lineIndent < textIndent) && ch === 32) {
        state.lineIndent++;
        ch = state.input.charCodeAt(++state.position);
      }
      if (!detectedIndent && state.lineIndent > textIndent) textIndent = state.lineIndent;
      if (isEol(ch)) {
        emptyLines++;
        continue;
      }
      if (!detectedIndent && textIndent === 0) throwError(state, "missing indentation for block scalar");
      if (state.lineIndent < textIndent) {
        if (chomping === CHOMPING_KEEP) state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
        else if (chomping === CHOMPING_CLIP) {
          if (didReadContent) state.result += "\n";
        }
        break;
      }
      if (folding) if (isWhiteSpace(ch)) {
        atMoreIndented = true;
        state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
      } else if (atMoreIndented) {
        atMoreIndented = false;
        state.result += common.repeat("\n", emptyLines + 1);
      } else if (emptyLines === 0) {
        if (didReadContent) state.result += " ";
      } else state.result += common.repeat("\n", emptyLines);
      else state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
      didReadContent = true;
      detectedIndent = true;
      emptyLines = 0;
      const captureStart = state.position;
      while (!isEol(ch) && ch !== 0) ch = state.input.charCodeAt(++state.position);
      captureSegment(state, captureStart, state.position, false);
    }
    return true;
  }
  function readBlockSequence(state, nodeIndent) {
    const _tag = state.tag;
    const _anchor = state.anchor;
    const _result = [];
    let detected = false;
    if (state.firstTabInLine !== -1) return false;
    if (state.anchor !== null) storeAnchor(state, state.anchor, _result);
    let ch = state.input.charCodeAt(state.position);
    while (ch !== 0) {
      if (state.firstTabInLine !== -1) {
        state.position = state.firstTabInLine;
        throwError(state, "tab characters must not be used in indentation");
      }
      if (ch !== 45) break;
      if (!isWsOrEol(state.input.charCodeAt(state.position + 1))) break;
      detected = true;
      state.position++;
      if (skipSeparationSpace(state, true, -1)) {
        if (state.lineIndent <= nodeIndent) {
          _result.push(null);
          ch = state.input.charCodeAt(state.position);
          continue;
        }
      }
      const _line = state.line;
      composeNode(state, nodeIndent, CONTEXT_BLOCK_IN, false, true);
      _result.push(state.result);
      skipSeparationSpace(state, true, -1);
      ch = state.input.charCodeAt(state.position);
      if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) throwError(state, "bad indentation of a sequence entry");
      else if (state.lineIndent < nodeIndent) break;
    }
    if (detected) {
      state.tag = _tag;
      state.anchor = _anchor;
      state.kind = "sequence";
      state.result = _result;
      return true;
    }
    return false;
  }
  function readBlockMapping(state, nodeIndent, flowIndent) {
    let allowCompact;
    let _keyLine;
    let _keyLineStart;
    let _keyPos;
    const _tag = state.tag;
    const _anchor = state.anchor;
    const _result = {};
    const overridableKeys = /* @__PURE__ */ Object.create(null);
    let keyTag = null;
    let keyNode = null;
    let valueNode = null;
    let atExplicitKey = false;
    let detected = false;
    if (state.firstTabInLine !== -1) return false;
    if (state.anchor !== null) storeAnchor(state, state.anchor, _result);
    let ch = state.input.charCodeAt(state.position);
    while (ch !== 0) {
      if (!atExplicitKey && state.firstTabInLine !== -1) {
        state.position = state.firstTabInLine;
        throwError(state, "tab characters must not be used in indentation");
      }
      const following = state.input.charCodeAt(state.position + 1);
      const _line = state.line;
      if ((ch === 63 || ch === 58) && isWsOrEol(following)) {
        if (ch === 63) {
          if (atExplicitKey) {
            storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
            keyTag = keyNode = valueNode = null;
          }
          detected = true;
          atExplicitKey = true;
          allowCompact = true;
        } else if (atExplicitKey) {
          atExplicitKey = false;
          allowCompact = true;
        } else throwError(state, "incomplete explicit mapping pair; a key node is missed; or followed by a non-tabulated empty line");
        state.position += 1;
        ch = following;
      } else {
        _keyLine = state.line;
        _keyLineStart = state.lineStart;
        _keyPos = state.position;
        if (!composeNode(state, flowIndent, CONTEXT_FLOW_OUT, false, true)) break;
        if (state.line === _line) {
          ch = state.input.charCodeAt(state.position);
          while (isWhiteSpace(ch)) ch = state.input.charCodeAt(++state.position);
          if (ch === 58) {
            ch = state.input.charCodeAt(++state.position);
            if (!isWsOrEol(ch)) throwError(state, "a whitespace character is expected after the key-value separator within a block mapping");
            if (atExplicitKey) {
              storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
              keyTag = keyNode = valueNode = null;
            }
            detected = true;
            atExplicitKey = false;
            allowCompact = false;
            keyTag = state.tag;
            keyNode = state.result;
          } else if (detected) throwError(state, "can not read an implicit mapping pair; a colon is missed");
          else {
            state.tag = _tag;
            state.anchor = _anchor;
            return true;
          }
        } else if (detected) throwError(state, "can not read a block mapping entry; a multiline key may not be an implicit key");
        else {
          state.tag = _tag;
          state.anchor = _anchor;
          return true;
        }
      }
      if (state.line === _line || state.lineIndent > nodeIndent) {
        if (atExplicitKey) {
          _keyLine = state.line;
          _keyLineStart = state.lineStart;
          _keyPos = state.position;
        }
        if (composeNode(state, nodeIndent, CONTEXT_BLOCK_OUT, true, allowCompact)) if (atExplicitKey) keyNode = state.result;
        else valueNode = state.result;
        if (!atExplicitKey) {
          storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _keyLine, _keyLineStart, _keyPos);
          keyTag = keyNode = valueNode = null;
        }
        skipSeparationSpace(state, true, -1);
        ch = state.input.charCodeAt(state.position);
      }
      if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) throwError(state, "bad indentation of a mapping entry");
      else if (state.lineIndent < nodeIndent) break;
    }
    if (atExplicitKey) storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
    if (detected) {
      state.tag = _tag;
      state.anchor = _anchor;
      state.kind = "mapping";
      state.result = _result;
    }
    return detected;
  }
  function readTagProperty(state) {
    let isVerbatim = false;
    let isNamed = false;
    let tagHandle;
    let tagName;
    let ch = state.input.charCodeAt(state.position);
    if (ch !== 33) return false;
    if (state.tag !== null) throwError(state, "duplication of a tag property");
    ch = state.input.charCodeAt(++state.position);
    if (ch === 60) {
      isVerbatim = true;
      ch = state.input.charCodeAt(++state.position);
    } else if (ch === 33) {
      isNamed = true;
      tagHandle = "!!";
      ch = state.input.charCodeAt(++state.position);
    } else tagHandle = "!";
    let _position = state.position;
    if (isVerbatim) {
      do
        ch = state.input.charCodeAt(++state.position);
      while (ch !== 0 && ch !== 62);
      if (state.position < state.length) {
        tagName = state.input.slice(_position, state.position);
        ch = state.input.charCodeAt(++state.position);
      } else throwError(state, "unexpected end of the stream within a verbatim tag");
    } else {
      while (ch !== 0 && !isWsOrEol(ch)) {
        if (ch === 33) if (!isNamed) {
          tagHandle = state.input.slice(_position - 1, state.position + 1);
          if (!PATTERN_TAG_HANDLE.test(tagHandle)) throwError(state, "named tag handle cannot contain such characters");
          isNamed = true;
          _position = state.position + 1;
        } else throwError(state, "tag suffix cannot contain exclamation marks");
        ch = state.input.charCodeAt(++state.position);
      }
      tagName = state.input.slice(_position, state.position);
      if (PATTERN_FLOW_INDICATORS.test(tagName)) throwError(state, "tag suffix cannot contain flow indicator characters");
    }
    if (tagName && !PATTERN_TAG_URI.test(tagName)) throwError(state, "tag name cannot contain such characters: " + tagName);
    try {
      tagName = decodeURIComponent(tagName);
    } catch (err) {
      throwError(state, "tag name is malformed: " + tagName);
    }
    if (isVerbatim) state.tag = tagName;
    else if (_hasOwnProperty.call(state.tagMap, tagHandle)) state.tag = state.tagMap[tagHandle] + tagName;
    else if (tagHandle === "!") state.tag = "!" + tagName;
    else if (tagHandle === "!!") state.tag = "tag:yaml.org,2002:" + tagName;
    else throwError(state, 'undeclared tag handle "' + tagHandle + '"');
    return true;
  }
  function readAnchorProperty(state) {
    let ch = state.input.charCodeAt(state.position);
    if (ch !== 38) return false;
    if (state.anchor !== null) throwError(state, "duplication of an anchor property");
    ch = state.input.charCodeAt(++state.position);
    const _position = state.position;
    while (ch !== 0 && !isWsOrEol(ch) && !isFlowIndicator(ch)) ch = state.input.charCodeAt(++state.position);
    if (state.position === _position) throwError(state, "name of an anchor node must contain at least one character");
    state.anchor = state.input.slice(_position, state.position);
    return true;
  }
  function readAlias(state) {
    let ch = state.input.charCodeAt(state.position);
    if (ch !== 42) return false;
    ch = state.input.charCodeAt(++state.position);
    const _position = state.position;
    while (ch !== 0 && !isWsOrEol(ch) && !isFlowIndicator(ch)) ch = state.input.charCodeAt(++state.position);
    if (state.position === _position) throwError(state, "name of an alias node must contain at least one character");
    const alias = state.input.slice(_position, state.position);
    if (!_hasOwnProperty.call(state.anchorMap, alias)) throwError(state, 'unidentified alias "' + alias + '"');
    state.result = state.anchorMap[alias];
    skipSeparationSpace(state, true, -1);
    return true;
  }
  function tryReadBlockMappingFromProperty(state, propertyStart, nodeIndent, flowIndent) {
    const fallbackState = snapshotState(state);
    beginAnchorTransaction(state);
    restoreState(state, propertyStart);
    state.tag = null;
    state.anchor = null;
    state.kind = null;
    state.result = null;
    if (readBlockMapping(state, nodeIndent, flowIndent) && state.kind === "mapping") {
      commitAnchorTransaction(state);
      return true;
    }
    rollbackAnchorTransaction(state);
    restoreState(state, fallbackState);
    return false;
  }
  function composeNode(state, parentIndent, nodeContext, allowToSeek, allowCompact) {
    let allowBlockScalars;
    let allowBlockCollections;
    let indentStatus = 1;
    let atNewLine = false;
    let hasContent = false;
    let propertyStart = null;
    let type;
    let flowIndent;
    let blockIndent;
    if (state.depth >= state.maxDepth) throwError(state, "nesting exceeded maxDepth (" + state.maxDepth + ")");
    state.depth += 1;
    if (state.listener !== null) state.listener("open", state);
    state.tag = null;
    state.anchor = null;
    state.kind = null;
    state.result = null;
    const allowBlockStyles = allowBlockScalars = allowBlockCollections = CONTEXT_BLOCK_OUT === nodeContext || CONTEXT_BLOCK_IN === nodeContext;
    if (allowToSeek) {
      if (skipSeparationSpace(state, true, -1)) {
        atNewLine = true;
        if (state.lineIndent > parentIndent) indentStatus = 1;
        else if (state.lineIndent === parentIndent) indentStatus = 0;
        else if (state.lineIndent < parentIndent) indentStatus = -1;
      }
    }
    if (indentStatus === 1) while (true) {
      const ch = state.input.charCodeAt(state.position);
      const propertyState = snapshotState(state);
      if (atNewLine && (ch === 33 && state.tag !== null || ch === 38 && state.anchor !== null)) break;
      if (!readTagProperty(state) && !readAnchorProperty(state)) break;
      if (propertyStart === null) propertyStart = propertyState;
      if (skipSeparationSpace(state, true, -1)) {
        atNewLine = true;
        allowBlockCollections = allowBlockStyles;
        if (state.lineIndent > parentIndent) indentStatus = 1;
        else if (state.lineIndent === parentIndent) indentStatus = 0;
        else if (state.lineIndent < parentIndent) indentStatus = -1;
      } else allowBlockCollections = false;
    }
    if (allowBlockCollections) allowBlockCollections = atNewLine || allowCompact;
    if (indentStatus === 1 || CONTEXT_BLOCK_OUT === nodeContext) {
      if (CONTEXT_FLOW_IN === nodeContext || CONTEXT_FLOW_OUT === nodeContext) flowIndent = parentIndent;
      else flowIndent = parentIndent + 1;
      blockIndent = state.position - state.lineStart;
      if (indentStatus === 1) if (allowBlockCollections && (readBlockSequence(state, blockIndent) || readBlockMapping(state, blockIndent, flowIndent)) || readFlowCollection(state, flowIndent)) hasContent = true;
      else {
        const ch = state.input.charCodeAt(state.position);
        if (propertyStart !== null && allowBlockStyles && !allowBlockCollections && ch !== 124 && ch !== 62 && tryReadBlockMappingFromProperty(state, propertyStart, propertyStart.position - propertyStart.lineStart, flowIndent)) hasContent = true;
        else if (allowBlockScalars && readBlockScalar(state, flowIndent) || readSingleQuotedScalar(state, flowIndent) || readDoubleQuotedScalar(state, flowIndent)) hasContent = true;
        else if (readAlias(state)) {
          hasContent = true;
          if (state.tag !== null || state.anchor !== null) throwError(state, "alias node should not have any properties");
        } else if (readPlainScalar(state, flowIndent, CONTEXT_FLOW_IN === nodeContext)) {
          hasContent = true;
          if (state.tag === null) state.tag = "?";
        }
        if (state.anchor !== null) storeAnchor(state, state.anchor, state.result);
      }
      else if (indentStatus === 0) hasContent = allowBlockCollections && readBlockSequence(state, blockIndent);
    }
    if (state.tag === null) {
      if (state.anchor !== null) storeAnchor(state, state.anchor, state.result);
    } else if (state.tag === "?") {
      if (state.result !== null && state.kind !== "scalar") throwError(state, 'unacceptable node kind for !<?> tag; it should be "scalar", not "' + state.kind + '"');
      for (let typeIndex = 0, typeQuantity = state.implicitTypes.length; typeIndex < typeQuantity; typeIndex += 1) {
        type = state.implicitTypes[typeIndex];
        if (type.resolve(state.result)) {
          state.result = type.construct(state.result);
          state.tag = type.tag;
          if (state.anchor !== null) storeAnchor(state, state.anchor, state.result);
          break;
        }
      }
    } else if (state.tag !== "!") {
      if (_hasOwnProperty.call(state.typeMap[state.kind || "fallback"], state.tag)) type = state.typeMap[state.kind || "fallback"][state.tag];
      else {
        type = null;
        const typeList = state.typeMap.multi[state.kind || "fallback"];
        for (let typeIndex = 0, typeQuantity = typeList.length; typeIndex < typeQuantity; typeIndex += 1) if (state.tag.slice(0, typeList[typeIndex].tag.length) === typeList[typeIndex].tag) {
          type = typeList[typeIndex];
          break;
        }
      }
      if (!type) throwError(state, "unknown tag !<" + state.tag + ">");
      if (state.result !== null && type.kind !== state.kind) throwError(state, "unacceptable node kind for !<" + state.tag + '> tag; it should be "' + type.kind + '", not "' + state.kind + '"');
      if (!type.resolve(state.result, state.tag)) throwError(state, "cannot resolve a node with !<" + state.tag + "> explicit tag");
      else {
        state.result = type.construct(state.result, state.tag);
        if (state.anchor !== null) storeAnchor(state, state.anchor, state.result);
      }
    }
    if (state.listener !== null) state.listener("close", state);
    state.depth -= 1;
    return state.tag !== null || state.anchor !== null || hasContent;
  }
  function readDocument(state) {
    const documentStart = state.position;
    let hasDirectives = false;
    let ch;
    state.version = null;
    state.checkLineBreaks = state.legacy;
    state.tagMap = /* @__PURE__ */ Object.create(null);
    state.anchorMap = /* @__PURE__ */ Object.create(null);
    while ((ch = state.input.charCodeAt(state.position)) !== 0) {
      skipSeparationSpace(state, true, -1);
      ch = state.input.charCodeAt(state.position);
      if (state.lineIndent > 0 || ch !== 37) break;
      hasDirectives = true;
      ch = state.input.charCodeAt(++state.position);
      let _position = state.position;
      while (ch !== 0 && !isWsOrEol(ch)) ch = state.input.charCodeAt(++state.position);
      const directiveName = state.input.slice(_position, state.position);
      const directiveArgs = [];
      if (directiveName.length < 1) throwError(state, "directive name must not be less than one character in length");
      while (ch !== 0) {
        while (isWhiteSpace(ch)) ch = state.input.charCodeAt(++state.position);
        if (ch === 35) {
          do
            ch = state.input.charCodeAt(++state.position);
          while (ch !== 0 && !isEol(ch));
          break;
        }
        if (isEol(ch)) break;
        _position = state.position;
        while (ch !== 0 && !isWsOrEol(ch)) ch = state.input.charCodeAt(++state.position);
        directiveArgs.push(state.input.slice(_position, state.position));
      }
      if (ch !== 0) readLineBreak(state);
      if (_hasOwnProperty.call(directiveHandlers, directiveName)) directiveHandlers[directiveName](state, directiveName, directiveArgs);
      else throwWarning(state, 'unknown document directive "' + directiveName + '"');
    }
    skipSeparationSpace(state, true, -1);
    if (state.lineIndent === 0 && state.input.charCodeAt(state.position) === 45 && state.input.charCodeAt(state.position + 1) === 45 && state.input.charCodeAt(state.position + 2) === 45) {
      state.position += 3;
      skipSeparationSpace(state, true, -1);
    } else if (hasDirectives) throwError(state, "directives end mark is expected");
    composeNode(state, state.lineIndent - 1, CONTEXT_BLOCK_OUT, false, true);
    skipSeparationSpace(state, true, -1);
    if (state.checkLineBreaks && PATTERN_NON_ASCII_LINE_BREAKS.test(state.input.slice(documentStart, state.position))) throwWarning(state, "non-ASCII line breaks are interpreted as content");
    state.documents.push(state.result);
    if (state.position === state.lineStart && testDocumentSeparator(state)) {
      if (state.input.charCodeAt(state.position) === 46) {
        state.position += 3;
        skipSeparationSpace(state, true, -1);
      }
      return;
    }
    if (state.position < state.length - 1) throwError(state, "end of the stream or a document separator is expected");
  }
  function loadDocuments(input2, options) {
    input2 = String(input2);
    options = options || {};
    if (input2.length !== 0) {
      if (input2.charCodeAt(input2.length - 1) !== 10 && input2.charCodeAt(input2.length - 1) !== 13) input2 += "\n";
      if (input2.charCodeAt(0) === 65279) input2 = input2.slice(1);
    }
    const state = new State(input2, options);
    const nullpos = input2.indexOf("\0");
    if (nullpos !== -1) {
      state.position = nullpos;
      throwError(state, "null byte is not allowed in input");
    }
    state.input += "\0";
    while (state.input.charCodeAt(state.position) === 32) {
      state.lineIndent += 1;
      state.position += 1;
    }
    while (state.position < state.length - 1) readDocument(state);
    return state.documents;
  }
  function loadAll2(input2, iterator, options) {
    if (iterator !== null && typeof iterator === "object" && typeof options === "undefined") {
      options = iterator;
      iterator = null;
    }
    const documents = loadDocuments(input2, options);
    if (typeof iterator !== "function") return documents;
    for (let index = 0, length = documents.length; index < length; index += 1) iterator(documents[index]);
  }
  function load2(input2, options) {
    const documents = loadDocuments(input2, options);
    if (documents.length === 0) return;
    else if (documents.length === 1) return documents[0];
    throw new YAMLException2("expected a single document in the stream, but found more");
  }
  module2.exports.loadAll = loadAll2;
  module2.exports.load = load2;
}));
var require_dumper = /* @__PURE__ */ __commonJSMin(((exports2, module2) => {
  var common = require_common();
  var YAMLException2 = require_exception();
  var DEFAULT_SCHEMA2 = require_default();
  var _toString = Object.prototype.toString;
  var _hasOwnProperty = Object.prototype.hasOwnProperty;
  var CHAR_BOM = 65279;
  var CHAR_TAB = 9;
  var CHAR_LINE_FEED = 10;
  var CHAR_CARRIAGE_RETURN = 13;
  var CHAR_SPACE = 32;
  var CHAR_EXCLAMATION = 33;
  var CHAR_DOUBLE_QUOTE = 34;
  var CHAR_SHARP = 35;
  var CHAR_PERCENT = 37;
  var CHAR_AMPERSAND = 38;
  var CHAR_SINGLE_QUOTE = 39;
  var CHAR_ASTERISK = 42;
  var CHAR_COMMA = 44;
  var CHAR_MINUS = 45;
  var CHAR_COLON = 58;
  var CHAR_EQUALS = 61;
  var CHAR_GREATER_THAN = 62;
  var CHAR_QUESTION = 63;
  var CHAR_COMMERCIAL_AT = 64;
  var CHAR_LEFT_SQUARE_BRACKET = 91;
  var CHAR_RIGHT_SQUARE_BRACKET = 93;
  var CHAR_GRAVE_ACCENT = 96;
  var CHAR_LEFT_CURLY_BRACKET = 123;
  var CHAR_VERTICAL_LINE = 124;
  var CHAR_RIGHT_CURLY_BRACKET = 125;
  var ESCAPE_SEQUENCES = {};
  ESCAPE_SEQUENCES[0] = "\\0";
  ESCAPE_SEQUENCES[7] = "\\a";
  ESCAPE_SEQUENCES[8] = "\\b";
  ESCAPE_SEQUENCES[9] = "\\t";
  ESCAPE_SEQUENCES[10] = "\\n";
  ESCAPE_SEQUENCES[11] = "\\v";
  ESCAPE_SEQUENCES[12] = "\\f";
  ESCAPE_SEQUENCES[13] = "\\r";
  ESCAPE_SEQUENCES[27] = "\\e";
  ESCAPE_SEQUENCES[34] = '\\"';
  ESCAPE_SEQUENCES[92] = "\\\\";
  ESCAPE_SEQUENCES[133] = "\\N";
  ESCAPE_SEQUENCES[160] = "\\_";
  ESCAPE_SEQUENCES[8232] = "\\L";
  ESCAPE_SEQUENCES[8233] = "\\P";
  var DEPRECATED_BOOLEANS_SYNTAX = [
    "y",
    "Y",
    "yes",
    "Yes",
    "YES",
    "on",
    "On",
    "ON",
    "n",
    "N",
    "no",
    "No",
    "NO",
    "off",
    "Off",
    "OFF"
  ];
  var DEPRECATED_BASE60_SYNTAX = /^[-+]?[0-9_]+(?::[0-9_]+)+(?:\.[0-9_]*)?$/;
  function compileStyleMap(schema, map) {
    if (map === null) return {};
    const result = {};
    const keys = Object.keys(map);
    for (let index = 0, length = keys.length; index < length; index += 1) {
      let tag = keys[index];
      let style = String(map[tag]);
      if (tag.slice(0, 2) === "!!") tag = "tag:yaml.org,2002:" + tag.slice(2);
      const type = schema.compiledTypeMap["fallback"][tag];
      if (type && _hasOwnProperty.call(type.styleAliases, style)) style = type.styleAliases[style];
      result[tag] = style;
    }
    return result;
  }
  function encodeHex(character) {
    let handle;
    let length;
    const string = character.toString(16).toUpperCase();
    if (character <= 255) {
      handle = "x";
      length = 2;
    } else if (character <= 65535) {
      handle = "u";
      length = 4;
    } else if (character <= 4294967295) {
      handle = "U";
      length = 8;
    } else throw new YAMLException2("code point within a string may not be greater than 0xFFFFFFFF");
    return "\\" + handle + common.repeat("0", length - string.length) + string;
  }
  var QUOTING_TYPE_SINGLE = 1;
  var QUOTING_TYPE_DOUBLE = 2;
  function State(options) {
    this.schema = options["schema"] || DEFAULT_SCHEMA2;
    this.indent = Math.max(1, options["indent"] || 2);
    this.noArrayIndent = options["noArrayIndent"] || false;
    this.skipInvalid = options["skipInvalid"] || false;
    this.flowLevel = common.isNothing(options["flowLevel"]) ? -1 : options["flowLevel"];
    this.styleMap = compileStyleMap(this.schema, options["styles"] || null);
    this.sortKeys = options["sortKeys"] || false;
    this.lineWidth = options["lineWidth"] || 80;
    this.noRefs = options["noRefs"] || false;
    this.noCompatMode = options["noCompatMode"] || false;
    this.condenseFlow = options["condenseFlow"] || false;
    this.quotingType = options["quotingType"] === '"' ? QUOTING_TYPE_DOUBLE : QUOTING_TYPE_SINGLE;
    this.forceQuotes = options["forceQuotes"] || false;
    this.replacer = typeof options["replacer"] === "function" ? options["replacer"] : null;
    this.implicitTypes = this.schema.compiledImplicit;
    this.explicitTypes = this.schema.compiledExplicit;
    this.tag = null;
    this.result = "";
    this.duplicates = [];
    this.usedDuplicates = null;
  }
  function indentString(string, spaces) {
    const ind = common.repeat(" ", spaces);
    let position = 0;
    let result = "";
    const length = string.length;
    while (position < length) {
      let line;
      const next = string.indexOf("\n", position);
      if (next === -1) {
        line = string.slice(position);
        position = length;
      } else {
        line = string.slice(position, next + 1);
        position = next + 1;
      }
      if (line.length && line !== "\n") result += ind;
      result += line;
    }
    return result;
  }
  function generateNextLine(state, level) {
    return "\n" + common.repeat(" ", state.indent * level);
  }
  function testImplicitResolving(state, str3) {
    for (let index = 0, length = state.implicitTypes.length; index < length; index += 1) if (state.implicitTypes[index].resolve(str3)) return true;
    return false;
  }
  function isWhitespace(c) {
    return c === CHAR_SPACE || c === CHAR_TAB;
  }
  function isPrintable(c) {
    return c >= 32 && c <= 126 || c >= 161 && c <= 55295 && c !== 8232 && c !== 8233 || c >= 57344 && c <= 65533 && c !== CHAR_BOM || c >= 65536 && c <= 1114111;
  }
  function isNsCharOrWhitespace(c) {
    return isPrintable(c) && c !== CHAR_BOM && c !== CHAR_CARRIAGE_RETURN && c !== CHAR_LINE_FEED;
  }
  function isPlainSafe(c, prev, inblock) {
    const cIsNsCharOrWhitespace = isNsCharOrWhitespace(c);
    const cIsNsChar = cIsNsCharOrWhitespace && !isWhitespace(c);
    return (inblock ? cIsNsCharOrWhitespace : cIsNsCharOrWhitespace && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET) && c !== CHAR_SHARP && !(prev === CHAR_COLON && !cIsNsChar) || isNsCharOrWhitespace(prev) && !isWhitespace(prev) && c === CHAR_SHARP || prev === CHAR_COLON && cIsNsChar;
  }
  function isPlainSafeFirst(c) {
    return isPrintable(c) && c !== CHAR_BOM && !isWhitespace(c) && c !== CHAR_MINUS && c !== CHAR_QUESTION && c !== CHAR_COLON && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET && c !== CHAR_SHARP && c !== CHAR_AMPERSAND && c !== CHAR_ASTERISK && c !== CHAR_EXCLAMATION && c !== CHAR_VERTICAL_LINE && c !== CHAR_EQUALS && c !== CHAR_GREATER_THAN && c !== CHAR_SINGLE_QUOTE && c !== CHAR_DOUBLE_QUOTE && c !== CHAR_PERCENT && c !== CHAR_COMMERCIAL_AT && c !== CHAR_GRAVE_ACCENT;
  }
  function isPlainSafeLast(c) {
    return !isWhitespace(c) && c !== CHAR_COLON;
  }
  function codePointAt(string, pos) {
    const first = string.charCodeAt(pos);
    let second;
    if (first >= 55296 && first <= 56319 && pos + 1 < string.length) {
      second = string.charCodeAt(pos + 1);
      if (second >= 56320 && second <= 57343) return (first - 55296) * 1024 + second - 56320 + 65536;
    }
    return first;
  }
  function needIndentIndicator(string) {
    return /^\n* /.test(string);
  }
  var STYLE_PLAIN = 1;
  var STYLE_SINGLE = 2;
  var STYLE_LITERAL = 3;
  var STYLE_FOLDED = 4;
  var STYLE_DOUBLE = 5;
  function chooseScalarStyle(string, singleLineOnly, indentPerLevel, lineWidth, testAmbiguousType, quotingType, forceQuotes, inblock) {
    let i;
    let char = 0;
    let prevChar = null;
    let hasLineBreak = false;
    let hasFoldableLine = false;
    const shouldTrackWidth = lineWidth !== -1;
    let previousLineBreak = -1;
    let plain = isPlainSafeFirst(codePointAt(string, 0)) && isPlainSafeLast(codePointAt(string, string.length - 1));
    if (singleLineOnly || forceQuotes) for (i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
      char = codePointAt(string, i);
      if (!isPrintable(char)) return STYLE_DOUBLE;
      plain = plain && isPlainSafe(char, prevChar, inblock);
      prevChar = char;
    }
    else {
      for (i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
        char = codePointAt(string, i);
        if (char === CHAR_LINE_FEED) {
          hasLineBreak = true;
          if (shouldTrackWidth) {
            hasFoldableLine = hasFoldableLine || i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ";
            previousLineBreak = i;
          }
        } else if (!isPrintable(char)) return STYLE_DOUBLE;
        plain = plain && isPlainSafe(char, prevChar, inblock);
        prevChar = char;
      }
      hasFoldableLine = hasFoldableLine || shouldTrackWidth && i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ";
    }
    if (!hasLineBreak && !hasFoldableLine) {
      if (plain && !forceQuotes && !testAmbiguousType(string)) return STYLE_PLAIN;
      return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
    }
    if (indentPerLevel > 9 && needIndentIndicator(string)) return STYLE_DOUBLE;
    if (!forceQuotes) return hasFoldableLine ? STYLE_FOLDED : STYLE_LITERAL;
    return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
  }
  function writeScalar(state, string, level, iskey, inblock) {
    state.dump = (function() {
      if (string.length === 0) return state.quotingType === QUOTING_TYPE_DOUBLE ? '""' : "''";
      if (!state.noCompatMode) {
        if (DEPRECATED_BOOLEANS_SYNTAX.indexOf(string) !== -1 || DEPRECATED_BASE60_SYNTAX.test(string)) return state.quotingType === QUOTING_TYPE_DOUBLE ? '"' + string + '"' : "'" + string + "'";
      }
      const indent = state.indent * Math.max(1, level);
      const lineWidth = state.lineWidth === -1 ? -1 : Math.max(Math.min(state.lineWidth, 40), state.lineWidth - indent);
      const singleLineOnly = iskey || state.flowLevel > -1 && level >= state.flowLevel;
      function testAmbiguity(string2) {
        return testImplicitResolving(state, string2);
      }
      switch (chooseScalarStyle(string, singleLineOnly, state.indent, lineWidth, testAmbiguity, state.quotingType, state.forceQuotes && !iskey, inblock)) {
        case STYLE_PLAIN:
          return string;
        case STYLE_SINGLE:
          return "'" + string.replace(/'/g, "''") + "'";
        case STYLE_LITERAL:
          return "|" + blockHeader(string, state.indent) + dropEndingNewline(indentString(string, indent));
        case STYLE_FOLDED:
          return ">" + blockHeader(string, state.indent) + dropEndingNewline(indentString(foldString(string, lineWidth), indent));
        case STYLE_DOUBLE:
          return '"' + escapeString(string, lineWidth) + '"';
        default:
          throw new YAMLException2("impossible error: invalid scalar style");
      }
    })();
  }
  function blockHeader(string, indentPerLevel) {
    const indentIndicator = needIndentIndicator(string) ? String(indentPerLevel) : "";
    const clip2 = string[string.length - 1] === "\n";
    return indentIndicator + (clip2 && (string[string.length - 2] === "\n" || string === "\n") ? "+" : clip2 ? "" : "-") + "\n";
  }
  function dropEndingNewline(string) {
    return string[string.length - 1] === "\n" ? string.slice(0, -1) : string;
  }
  function foldString(string, width) {
    const lineRe = /(\n+)([^\n]*)/g;
    let result = (function() {
      let nextLF = string.indexOf("\n");
      nextLF = nextLF !== -1 ? nextLF : string.length;
      lineRe.lastIndex = nextLF;
      return foldLine(string.slice(0, nextLF), width);
    })();
    let prevMoreIndented = string[0] === "\n" || string[0] === " ";
    let moreIndented;
    let match;
    while (match = lineRe.exec(string)) {
      const prefix = match[1];
      const line = match[2];
      moreIndented = line[0] === " ";
      result += prefix + (!prevMoreIndented && !moreIndented && line !== "" ? "\n" : "") + foldLine(line, width);
      prevMoreIndented = moreIndented;
    }
    return result;
  }
  function foldLine(line, width) {
    if (line === "" || line[0] === " ") return line;
    const breakRe = / [^ ]/g;
    let match;
    let start = 0;
    let end;
    let curr = 0;
    let next = 0;
    let result = "";
    while (match = breakRe.exec(line)) {
      next = match.index;
      if (next - start > width) {
        end = curr > start ? curr : next;
        result += "\n" + line.slice(start, end);
        start = end + 1;
      }
      curr = next;
    }
    result += "\n";
    if (line.length - start > width && curr > start) result += line.slice(start, curr) + "\n" + line.slice(curr + 1);
    else result += line.slice(start);
    return result.slice(1);
  }
  function escapeString(string) {
    let result = "";
    let char = 0;
    for (let i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
      char = codePointAt(string, i);
      const escapeSeq = ESCAPE_SEQUENCES[char];
      if (!escapeSeq && isPrintable(char)) {
        result += string[i];
        if (char >= 65536) result += string[i + 1];
      } else result += escapeSeq || encodeHex(char);
    }
    return result;
  }
  function writeFlowSequence(state, level, object) {
    let _result = "";
    const _tag = state.tag;
    for (let index = 0, length = object.length; index < length; index += 1) {
      let value = object[index];
      if (state.replacer) value = state.replacer.call(object, String(index), value);
      if (writeNode(state, level, value, false, false) || typeof value === "undefined" && writeNode(state, level, null, false, false)) {
        if (_result !== "") _result += "," + (!state.condenseFlow ? " " : "");
        _result += state.dump;
      }
    }
    state.tag = _tag;
    state.dump = "[" + _result + "]";
  }
  function writeBlockSequence(state, level, object, compact) {
    let _result = "";
    const _tag = state.tag;
    for (let index = 0, length = object.length; index < length; index += 1) {
      let value = object[index];
      if (state.replacer) value = state.replacer.call(object, String(index), value);
      if (writeNode(state, level + 1, value, true, true, false, true) || typeof value === "undefined" && writeNode(state, level + 1, null, true, true, false, true)) {
        if (!compact || _result !== "") _result += generateNextLine(state, level);
        if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) _result += "-";
        else _result += "- ";
        _result += state.dump;
      }
    }
    state.tag = _tag;
    state.dump = _result || "[]";
  }
  function writeFlowMapping(state, level, object) {
    let _result = "";
    const _tag = state.tag;
    const objectKeyList = Object.keys(object);
    for (let index = 0, length = objectKeyList.length; index < length; index += 1) {
      let pairBuffer = "";
      if (_result !== "") pairBuffer += ", ";
      if (state.condenseFlow) pairBuffer += '"';
      const objectKey = objectKeyList[index];
      let objectValue = object[objectKey];
      if (state.replacer) objectValue = state.replacer.call(object, objectKey, objectValue);
      if (!writeNode(state, level, objectKey, false, false)) continue;
      if (state.dump.length > 1024) pairBuffer += "? ";
      pairBuffer += state.dump + (state.condenseFlow ? '"' : "") + ":" + (state.condenseFlow ? "" : " ");
      if (!writeNode(state, level, objectValue, false, false)) continue;
      pairBuffer += state.dump;
      _result += pairBuffer;
    }
    state.tag = _tag;
    state.dump = "{" + _result + "}";
  }
  function writeBlockMapping(state, level, object, compact) {
    let _result = "";
    const _tag = state.tag;
    const objectKeyList = Object.keys(object);
    if (state.sortKeys === true) objectKeyList.sort();
    else if (typeof state.sortKeys === "function") objectKeyList.sort(state.sortKeys);
    else if (state.sortKeys) throw new YAMLException2("sortKeys must be a boolean or a function");
    for (let index = 0, length = objectKeyList.length; index < length; index += 1) {
      let pairBuffer = "";
      if (!compact || _result !== "") pairBuffer += generateNextLine(state, level);
      const objectKey = objectKeyList[index];
      let objectValue = object[objectKey];
      if (state.replacer) objectValue = state.replacer.call(object, objectKey, objectValue);
      if (!writeNode(state, level + 1, objectKey, true, true, true)) continue;
      const explicitPair = state.tag !== null && state.tag !== "?" || state.dump && state.dump.length > 1024;
      if (explicitPair) if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) pairBuffer += "?";
      else pairBuffer += "? ";
      pairBuffer += state.dump;
      if (explicitPair) pairBuffer += generateNextLine(state, level);
      if (!writeNode(state, level + 1, objectValue, true, explicitPair)) continue;
      if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) pairBuffer += ":";
      else pairBuffer += ": ";
      pairBuffer += state.dump;
      _result += pairBuffer;
    }
    state.tag = _tag;
    state.dump = _result || "{}";
  }
  function detectType(state, object, explicit) {
    const typeList = explicit ? state.explicitTypes : state.implicitTypes;
    for (let index = 0, length = typeList.length; index < length; index += 1) {
      const type = typeList[index];
      if ((type.instanceOf || type.predicate) && (!type.instanceOf || typeof object === "object" && object instanceof type.instanceOf) && (!type.predicate || type.predicate(object))) {
        if (explicit) if (type.multi && type.representName) state.tag = type.representName(object);
        else state.tag = type.tag;
        else state.tag = "?";
        if (type.represent) {
          const style = state.styleMap[type.tag] || type.defaultStyle;
          let _result;
          if (_toString.call(type.represent) === "[object Function]") _result = type.represent(object, style);
          else if (_hasOwnProperty.call(type.represent, style)) _result = type.represent[style](object, style);
          else throw new YAMLException2("!<" + type.tag + '> tag resolver accepts not "' + style + '" style');
          state.dump = _result;
        }
        return true;
      }
    }
    return false;
  }
  function writeNode(state, level, object, block, compact, iskey, isblockseq) {
    state.tag = null;
    state.dump = object;
    if (!detectType(state, object, false)) detectType(state, object, true);
    const type = _toString.call(state.dump);
    const inblock = block;
    if (block) block = state.flowLevel < 0 || state.flowLevel > level;
    const objectOrArray = type === "[object Object]" || type === "[object Array]";
    let duplicateIndex;
    let duplicate;
    if (objectOrArray) {
      duplicateIndex = state.duplicates.indexOf(object);
      duplicate = duplicateIndex !== -1;
    }
    if (state.tag !== null && state.tag !== "?" || duplicate || state.indent !== 2 && level > 0) compact = false;
    if (duplicate && state.usedDuplicates[duplicateIndex]) state.dump = "*ref_" + duplicateIndex;
    else {
      if (objectOrArray && duplicate && !state.usedDuplicates[duplicateIndex]) state.usedDuplicates[duplicateIndex] = true;
      if (type === "[object Object]") if (block && Object.keys(state.dump).length !== 0) {
        writeBlockMapping(state, level, state.dump, compact);
        if (duplicate) state.dump = "&ref_" + duplicateIndex + state.dump;
      } else {
        writeFlowMapping(state, level, state.dump);
        if (duplicate) state.dump = "&ref_" + duplicateIndex + " " + state.dump;
      }
      else if (type === "[object Array]") if (block && state.dump.length !== 0) {
        if (state.noArrayIndent && !isblockseq && level > 0) writeBlockSequence(state, level - 1, state.dump, compact);
        else writeBlockSequence(state, level, state.dump, compact);
        if (duplicate) state.dump = "&ref_" + duplicateIndex + state.dump;
      } else {
        writeFlowSequence(state, level, state.dump);
        if (duplicate) state.dump = "&ref_" + duplicateIndex + " " + state.dump;
      }
      else if (type === "[object String]") {
        if (state.tag !== "?") writeScalar(state, state.dump, level, iskey, inblock);
      } else if (type === "[object Undefined]") return false;
      else {
        if (state.skipInvalid) return false;
        throw new YAMLException2("unacceptable kind of an object to dump " + type);
      }
      if (state.tag !== null && state.tag !== "?") {
        let tagStr = encodeURI(state.tag[0] === "!" ? state.tag.slice(1) : state.tag).replace(/!/g, "%21");
        if (state.tag[0] === "!") tagStr = "!" + tagStr;
        else if (tagStr.slice(0, 18) === "tag:yaml.org,2002:") tagStr = "!!" + tagStr.slice(18);
        else tagStr = "!<" + tagStr + ">";
        state.dump = tagStr + " " + state.dump;
      }
    }
    return true;
  }
  function getDuplicateReferences(object, state) {
    const objects = [];
    const duplicatesIndexes = [];
    inspectNode(object, objects, duplicatesIndexes);
    const length = duplicatesIndexes.length;
    for (let index = 0; index < length; index += 1) state.duplicates.push(objects[duplicatesIndexes[index]]);
    state.usedDuplicates = new Array(length);
  }
  function inspectNode(object, objects, duplicatesIndexes) {
    if (object !== null && typeof object === "object") {
      const index = objects.indexOf(object);
      if (index !== -1) {
        if (duplicatesIndexes.indexOf(index) === -1) duplicatesIndexes.push(index);
      } else {
        objects.push(object);
        if (Array.isArray(object)) for (let i = 0, length = object.length; i < length; i += 1) inspectNode(object[i], objects, duplicatesIndexes);
        else {
          const objectKeyList = Object.keys(object);
          for (let i = 0, length = objectKeyList.length; i < length; i += 1) inspectNode(object[objectKeyList[i]], objects, duplicatesIndexes);
        }
      }
    }
  }
  function dump2(input2, options) {
    options = options || {};
    const state = new State(options);
    if (!state.noRefs) getDuplicateReferences(input2, state);
    let value = input2;
    if (state.replacer) value = state.replacer.call({ "": value }, "", value);
    if (writeNode(state, 0, value, true, true)) return state.dump + "\n";
    return "";
  }
  module2.exports.dump = dump2;
}));
var import_js_yaml = /* @__PURE__ */ __toESM2((/* @__PURE__ */ __commonJSMin(((exports2, module2) => {
  var loader = require_loader();
  var dumper = require_dumper();
  function renamed(from, to) {
    return function() {
      throw new Error("Function yaml." + from + " is removed in js-yaml 4. Use yaml." + to + " instead, which is now safe by default.");
    };
  }
  module2.exports.Type = require_type();
  module2.exports.Schema = require_schema();
  module2.exports.FAILSAFE_SCHEMA = require_failsafe();
  module2.exports.JSON_SCHEMA = require_json();
  module2.exports.CORE_SCHEMA = require_core();
  module2.exports.DEFAULT_SCHEMA = require_default();
  module2.exports.load = loader.load;
  module2.exports.loadAll = loader.loadAll;
  module2.exports.dump = dumper.dump;
  module2.exports.YAMLException = require_exception();
  module2.exports.types = {
    binary: require_binary(),
    float: require_float(),
    map: require_map(),
    null: require_null(),
    pairs: require_pairs(),
    set: require_set(),
    timestamp: require_timestamp(),
    bool: require_bool(),
    int: require_int(),
    merge: require_merge(),
    omap: require_omap(),
    seq: require_seq(),
    str: require_str()
  };
  module2.exports.safeLoad = renamed("safeLoad", "load");
  module2.exports.safeLoadAll = renamed("safeLoadAll", "loadAll");
  module2.exports.safeDump = renamed("safeDump", "dump");
})))(), 1);
var { Type, Schema, FAILSAFE_SCHEMA, JSON_SCHEMA, CORE_SCHEMA, DEFAULT_SCHEMA, load, loadAll, dump, YAMLException, types, safeLoad, safeLoadAll, safeDump } = import_js_yaml.default;
var index_vite_proxy_tmp_default = import_js_yaml.default;

// src/gate/config.ts
var CONFIG_SCHEMA_VERSION = "1";
var DEFAULT_POLICY_PATHS = ["kb/**", "policies/**", "policy/**", "legal/**", "help/**", "support/**", "terms/**", "docs/**/*polic*", "docs/**/*terms*", "docs/**/*refund*", "docs/**/*faq*", "**/*refund*.md", "**/*policy*.md", "**/*terms*.md", "**/*faq*.md"];
var ConfigError = class extends Error {
  constructor(problems) {
    super(`verify-gate.yml is not valid:
- ${problems.join("\n- ")}`);
    this.problems = problems;
  }
};
var ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
var ENV_REF = /\$\{env\.([A-Z_][A-Z0-9_]*)\}/g;
function str2(v) {
  return typeof v === "string" && v.trim().length > 0;
}
function caseLine(yamlText, caseId) {
  const esc2 = caseId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^\\s*-?\\s*id:\\s*['"]?${esc2}['"]?\\s*(?:#.*)?$`, "m");
  const m = re.exec(yamlText);
  return m ? yamlText.slice(0, m.index).split("\n").length : null;
}
function endpointOf(raw, where, problems) {
  if (raw === void 0 || raw === null) return null;
  const e = raw;
  if (typeof e !== "object") {
    problems.push(`${where} must be a mapping`);
    return null;
  }
  for (const k of Object.keys(e)) if (!["url", "method", "headers", "body", "answer_path", "timeout_ms", "max_response_bytes", "retries"].includes(k)) problems.push(`${where}.${k} is not a known setting`);
  if (!str2(e.url)) problems.push(`${where}.url is required`);
  const method = typeof e.method === "string" ? e.method.toUpperCase() : "POST";
  if (!["GET", "POST", "PUT"].includes(method)) problems.push(`${where}.method must be GET, POST or PUT`);
  const headers = {};
  if (e.headers !== void 0) {
    if (!e.headers || typeof e.headers !== "object") problems.push(`${where}.headers must be a mapping`);
    else
      for (const [k, v] of Object.entries(e.headers)) {
        if (typeof v !== "string") {
          problems.push(`${where}.headers.${k} must be a string`);
          continue;
        }
        const sensitive = /^(authorization|proxy-authorization|cookie|x-api-key|api-key|x-auth-token)$/i.test(k) || /key|token|secret|auth/i.test(k);
        if (sensitive && v.replace(ENV_REF, "").replace(/^(Bearer|Basic|Token)\s+/i, "").trim()) {
          problems.push(`${where}.headers.${k} must reference an environment variable (\${env.NAME}); never write a credential into verify-gate.yml`);
        }
        headers[k] = v;
      }
  }
  let body = null;
  if (e.body !== void 0 && e.body !== null) {
    if (typeof e.body === "string") body = e.body;
    else if (typeof e.body === "object") body = JSON.stringify(e.body);
    else problems.push(`${where}.body must be a string or a mapping`);
    if (body !== null && !body.includes("{{question}}")) problems.push(`${where}.body must contain {{question}}`);
  }
  if (method === "GET" && body !== null) problems.push(`${where}: a GET endpoint takes no body; put {{question}} in the url`);
  if (method === "GET" && typeof e.url === "string" && !e.url.includes("{{question}}")) problems.push(`${where}.url must contain {{question}} for a GET endpoint`);
  const int = (k, def, min, max) => {
    const v = e[k];
    if (v === void 0) return def;
    if (!Number.isInteger(v) || v < min || v > max) {
      problems.push(`${where}.${k} must be an integer between ${min} and ${max}`);
      return def;
    }
    return v;
  };
  return {
    url: String(e.url ?? ""),
    method,
    headers,
    body,
    answer_path: typeof e.answer_path === "string" ? e.answer_path : "/answer",
    timeout_ms: int("timeout_ms", 3e4, 1e3, 12e4),
    max_response_bytes: int("max_response_bytes", 262144, 1024, 4194304),
    retries: int("retries", 2, 0, 5)
  };
}
function parseConfig(yamlText) {
  const problems = [];
  let raw;
  try {
    raw = load(yamlText, { json: false });
  } catch (e) {
    throw new ConfigError([`not valid YAML: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`]);
  }
  const c = raw ?? {};
  if (typeof c !== "object" || Array.isArray(c)) throw new ConfigError(["the top level must be a mapping"]);
  for (const k of Object.keys(c)) if (!["version", "draft", "mode", "network_mode", "sources", "endpoint", "policy", "paths", "cost", "ledger", "policy_change", "tests", "concurrency", "suites"].includes(k)) problems.push(`${k} is not a known top-level setting`);
  if (String(c.version ?? "") !== CONFIG_SCHEMA_VERSION) problems.push(`version must be ${CONFIG_SCHEMA_VERSION}`);
  const mode = c.mode === void 0 ? null : c.mode;
  if (mode !== null && mode !== "local" && mode !== "hosted") problems.push("mode must be local or hosted");
  const network_mode = c.network_mode === void 0 ? "public" : c.network_mode;
  if (network_mode !== "public" && network_mode !== "local") problems.push("network_mode must be public or local");
  const sources = [];
  const ids = /* @__PURE__ */ new Set();
  if (!Array.isArray(c.sources) || !c.sources.length) problems.push("sources: list at least one checked-in source file");
  for (const [i, s] of (Array.isArray(c.sources) ? c.sources : []).entries()) {
    const x = s;
    if (!x || typeof x !== "object") {
      problems.push(`sources[${i}] must be a mapping`);
      continue;
    }
    if (!str2(x.id) || !ID.test(x.id)) problems.push(`sources[${i}].id must match ${ID.source}`);
    else if (ids.has(x.id)) problems.push(`sources[${i}].id "${x.id}" is a duplicate`);
    else ids.add(x.id);
    if (!str2(x.path)) problems.push(`sources[${i}].path is required`);
    else if (/^[a-z][a-z0-9+.-]*:\/\//i.test(x.path)) problems.push(`sources[${i}].path is a URL; the Gate never fetches sources \u2014 check the file into the repository`);
    else if (x.path.startsWith("/") || x.path.split(/[\\/]/).includes("..")) problems.push(`sources[${i}].path must be relative to the repository and stay inside it`);
    if (x.sha256 === void 0 || x.sha256 === null) problems.push(`sources[${i}].sha256 is required, so a changed source holds the run (fill it in with: npx @xyntherium/verify-cli pin)`);
    else if (typeof x.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(x.sha256)) problems.push(`sources[${i}].sha256 must be 64 lowercase hex characters`);
    sources.push({
      id: String(x.id ?? ""),
      path: String(x.path ?? ""),
      version: x.version === void 0 || x.version === null ? null : String(x.version),
      sha256: typeof x.sha256 === "string" ? x.sha256 : null,
      ...typeof x.effective_date === "string" ? { effective_date: x.effective_date } : {},
      ...Array.isArray(x.supersedes) ? { supersedes: x.supersedes.map(String) } : {}
    });
  }
  const endpoint = endpointOf(c.endpoint, "endpoint", problems);
  const { policy, errors } = resolvePolicy(c.policy);
  problems.push(...errors);
  const paths = Array.isArray(c.paths) ? c.paths.filter(str2) : [];
  if (c.paths !== void 0 && !Array.isArray(c.paths)) problems.push("paths must be a list of glob patterns");
  const cost = c.cost ?? {};
  const maxCases = cost.max_cases_per_run === void 0 || cost.max_cases_per_run === null ? null : cost.max_cases_per_run;
  if (maxCases !== null && (!Number.isInteger(maxCases) || maxCases < 1)) problems.push("cost.max_cases_per_run must be a positive integer");
  const sampleRate = cost.sample_rate === void 0 || cost.sample_rate === null ? null : cost.sample_rate;
  if (sampleRate !== null && (typeof sampleRate !== "number" || sampleRate <= 0 || sampleRate > 1)) problems.push("cost.sample_rate must be in (0, 1]");
  const prsPerDay = cost.expected_prs_per_day === void 0 || cost.expected_prs_per_day === null ? null : cost.expected_prs_per_day;
  if (prsPerDay !== null && (typeof prsPerDay !== "number" || prsPerDay < 0)) problems.push("cost.expected_prs_per_day must be a non-negative number");
  const pc = c.policy_change ?? {};
  if (c.policy_change !== void 0 && (typeof c.policy_change !== "object" || c.policy_change === null || Array.isArray(c.policy_change))) problems.push("policy_change must be a mapping");
  for (const k of Object.keys(pc)) if (!["enabled", "enforcement", "policy_paths"].includes(k)) problems.push(`policy_change.${k} is not a known setting`);
  if (pc.policy_paths !== void 0 && (!Array.isArray(pc.policy_paths) || pc.policy_paths.some((x) => !str2(x)))) problems.push("policy_change.policy_paths must be a list of glob patterns");
  if (pc.enabled !== void 0 && typeof pc.enabled !== "boolean") problems.push("policy_change.enabled must be a boolean");
  if (pc.enforcement !== void 0 && pc.enforcement !== "report_only" && pc.enforcement !== "enforce") problems.push("policy_change.enforcement must be report_only or enforce");
  const concurrency = c.concurrency === void 0 ? 4 : c.concurrency;
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 10) problems.push("concurrency must be an integer between 1 and 10");
  const tests = [];
  const testIds = /* @__PURE__ */ new Set();
  if (c.tests !== void 0 && !Array.isArray(c.tests)) problems.push("tests must be a list");
  for (const [ti, t] of (Array.isArray(c.tests) ? c.tests : []).entries()) {
    const y = t;
    const where = `tests[${ti}]`;
    if (!y || typeof y !== "object") {
      problems.push(`${where} must be a mapping`);
      continue;
    }
    for (const k of Object.keys(y)) if (!["id", "source_ids", "question", "answer", "required_conditions"].includes(k)) problems.push(`${where}.${k} is not a known setting`);
    if (!str2(y.id) || !ID.test(y.id)) problems.push(`${where}.id must match ${ID.source}`);
    else if (testIds.has(y.id)) problems.push(`${where}.id "${y.id}" is a duplicate`);
    else testIds.add(y.id);
    if (!str2(y.question)) problems.push(`${where}.question is required`);
    const sids = Array.isArray(y.source_ids) ? y.source_ids.map(String) : [];
    if (!sids.length) problems.push(`${where}.source_ids: link at least one source`);
    for (const sid of sids) if (!ids.has(sid)) problems.push(`${where}.source_ids: "${sid}" is not a declared source`);
    if (y.answer !== void 0 && typeof y.answer !== "string") problems.push(`${where}.answer must be a string`);
    const conds = [];
    if (y.required_conditions !== void 0 && !Array.isArray(y.required_conditions)) problems.push(`${where}.required_conditions must be a list`);
    for (const [ri, rc] of (Array.isArray(y.required_conditions) ? y.required_conditions : []).entries()) {
      const z = rc;
      const w = `${where}.required_conditions[${ri}]`;
      if (!z || typeof z !== "object") {
        problems.push(`${w} must be a mapping {class, text}`);
        continue;
      }
      if (!CONDITION_CLASSES.includes(String(z.class))) problems.push(`${w}.class must be one of ${CONDITION_CLASSES.join(", ")}`);
      if (!str2(z.text)) problems.push(`${w}.text is required (the condition as the source states it)`);
      conds.push({ class: String(z.class), text: String(z.text ?? "") });
    }
    if (y.answer === void 0 && !conds.length) problems.push(`${where}: give a saved answer, required_conditions, or both`);
    tests.push({ id: String(y.id ?? ""), source_ids: sids, question: String(y.question ?? ""), answer: typeof y.answer === "string" ? y.answer : null, required_conditions: conds, line: str2(y.id) ? caseLine(yamlText, y.id) : null });
  }
  const suites = [];
  const caseKeys = /* @__PURE__ */ new Set();
  if ((!Array.isArray(c.suites) || !c.suites.length) && !tests.length) problems.push("suites: define at least one suite with cases (or tests: for document change mode)");
  for (const [si, s] of (Array.isArray(c.suites) ? c.suites : []).entries()) {
    const x = s;
    const name = str2(x?.name) ? x.name : `suite-${si + 1}`;
    if (!ID.test(name)) problems.push(`suites[${si}].name must match ${ID.source}`);
    const suiteEndpoint = endpointOf(x?.endpoint, `suites[${si}].endpoint`, problems);
    const cases = [];
    if (!Array.isArray(x?.cases) || !x.cases.length) problems.push(`suites[${si}].cases: add at least one case`);
    for (const [ci, k] of (Array.isArray(x?.cases) ? x.cases : []).entries()) {
      const y = k;
      const where = `suites[${si}].cases[${ci}]`;
      if (!str2(y?.id) || !ID.test(y.id)) problems.push(`${where}.id must match ${ID.source}`);
      else if (caseKeys.has(`${name}/${y.id}`)) problems.push(`${where}.id "${y.id}" is a duplicate in suite ${name}`);
      else caseKeys.add(`${name}/${y.id}`);
      if (!str2(y?.question)) problems.push(`${where}.question is required`);
      const caseSources = Array.isArray(y?.sources) ? y.sources.map(String) : [...ids];
      for (const sid of caseSources) if (!ids.has(sid)) problems.push(`${where}.sources: "${sid}" is not a declared source`);
      if (y?.answer !== void 0 && typeof y.answer !== "string") problems.push(`${where}.answer must be a string`);
      if (y?.answer === void 0 && !suiteEndpoint && !endpoint) problems.push(`${where}: give a recorded answer or an endpoint`);
      const claims = [];
      for (const [mi, mc] of (Array.isArray(y?.material_claims) ? y.material_claims : []).entries()) {
        const z = typeof mc === "string" ? { claim: mc } : mc;
        const w = `${where}.material_claims[${mi}]`;
        if (!str2(z?.claim)) problems.push(`${w}.claim is required`);
        const materiality = z?.materiality ?? "high";
        if (!MATERIALITY.includes(materiality)) problems.push(`${w}.materiality must be one of ${MATERIALITY.join(", ")}`);
        if (z?.source !== void 0 && !ids.has(String(z.source))) problems.push(`${w}.source "${String(z.source)}" is not a declared source`);
        claims.push({
          id: str2(z?.id) ? z.id : `${String(y?.id ?? ci)}-claim-${mi + 1}`,
          claim: String(z?.claim ?? ""),
          materiality,
          quote: typeof z?.quote === "string" ? z.quote : null,
          source: z?.source === void 0 ? null : String(z.source),
          require_citation: z?.require_citation === true
        });
      }
      const overrides = y?.policy === void 0 ? null : y.policy;
      if (overrides) problems.push(...resolvePolicy({ ...c.policy, ...overrides }).errors.map((e) => `${where}.${e}`));
      cases.push({
        suite: name,
        id: String(y?.id ?? ""),
        question: String(y?.question ?? ""),
        answer: typeof y?.answer === "string" ? y.answer : null,
        sources: caseSources,
        require_citations: y?.require_citations === true,
        material_claims: claims,
        policy_overrides: overrides,
        line: str2(y?.id) ? caseLine(yamlText, y.id) : null
      });
    }
    suites.push({ name, endpoint: suiteEndpoint, cases });
  }
  if (problems.length) throw new ConfigError(problems);
  return {
    version: CONFIG_SCHEMA_VERSION,
    draft: c.draft === true,
    mode,
    network_mode,
    sources,
    endpoint,
    policy,
    paths,
    cost: { max_cases_per_run: maxCases, sample_rate: sampleRate, cache: cost.cache !== false, expected_prs_per_day: prsPerDay },
    ledger: { include_text: c.ledger?.include_text === true },
    policy_change: { enabled: pc.enabled !== false, enforcement: pc.enforcement === "enforce" ? "enforce" : "report_only", policy_paths: Array.isArray(pc.policy_paths) ? pc.policy_paths.map(String) : DEFAULT_POLICY_PATHS },
    tests,
    concurrency,
    suites,
    sha256: (0, import_node_crypto.createHash)("sha256").update(yamlText).digest("hex")
  };
}
function envRefs(e) {
  if (!e) return [];
  const out = /* @__PURE__ */ new Set();
  for (const v of [e.url, e.body ?? "", ...Object.values(e.headers)]) for (const m of v.matchAll(ENV_REF)) out.add(m[1]);
  return [...out];
}
function expandEnv(v, env) {
  return v.replace(ENV_REF, (_, name) => env[name] ?? "");
}

// src/gate/endpoint.ts
var import_node_crypto2 = require("node:crypto");
var import_node_dns = require("node:dns");
var import_node_http = require("node:http");
var import_node_https = require("node:https");
var import_node_net = require("node:net");
var EndpointError = class extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
};
function v4(ip) {
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(ip);
  return m ? m.slice(1).map(Number) : null;
}
function isBlockedAddress(ip) {
  const lower = ip.toLowerCase().replace(/^\[|\]$/g, "");
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  const a = v4(mapped ? mapped[1] : lower);
  if (a) {
    const [x, y] = a;
    return x === 0 || x === 10 || x === 127 || x === 100 && y >= 64 && y <= 127 || x === 169 && y === 254 || x === 172 && y >= 16 && y <= 31 || x === 192 && y === 168 || x === 192 && y === 0 && a[2] === 0 || x === 198 && (y === 18 || y === 19) || x >= 224;
  }
  if ((0, import_node_net.isIP)(lower) === 6) {
    return lower === "::" || lower === "::1" || lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb") || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("ff") || lower.startsWith("64:ff9b:");
  }
  return true;
}
function safeLookup(hostname, options, cb) {
  (0, import_node_dns.lookup)(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return cb(err, []);
    const list = addresses;
    const bad = list.find((a) => isBlockedAddress(a.address));
    if (bad || !list.length) {
      const e = new Error(`endpoint host resolves to a private, loopback or metadata address; set network_mode: local to allow it`);
      e.code = "EBLOCKEDADDR";
      return cb(e, []);
    }
    if (options.all) return cb(null, list);
    cb(null, list[0].address, list[0].family);
  });
}
var nodeTransport = (o) => new Promise((resolvePromise, reject) => {
  const req = (o.url.protocol === "https:" ? import_node_https.request : import_node_http.request)(
    o.url,
    { method: o.method, headers: o.headers, timeout: o.timeout_ms, ...o.network_mode === "public" ? { lookup: safeLookup } : {} },
    (res) => {
      const chunks = [];
      let size = 0;
      res.on("data", (c) => {
        size += c.length;
        if (size > o.max_bytes) {
          req.destroy(new EndpointError("endpoint_error", `response exceeded ${o.max_bytes} bytes`));
          return;
        }
        chunks.push(c);
      });
      res.on("end", () => resolvePromise({ status: res.statusCode ?? 0, headers: Object.fromEntries(Object.entries(res.headers).map(([k, v]) => [k, String(v)])), body: Buffer.concat(chunks) }));
      res.on("error", reject);
    }
  );
  req.on("timeout", () => req.destroy(new EndpointError("endpoint_timeout", `no response within ${o.timeout_ms} ms`)));
  req.on("error", reject);
  if (o.body !== null) req.write(o.body);
  req.end();
});
function fillTemplate(template, question, kind) {
  if (kind === "url") return template.replace(/\{\{question\}\}/g, encodeURIComponent(question));
  if (kind === "json") {
    let out = "";
    let inString = false;
    for (let i = 0; i < template.length; i++) {
      if (template.startsWith("{{question}}", i)) {
        out += inString ? JSON.stringify(question).slice(1, -1) : JSON.stringify(question);
        i += "{{question}}".length - 1;
        continue;
      }
      const ch = template[i];
      if (ch === '"' && template[i - 1] !== "\\") inString = !inString;
      out += ch;
    }
    return out;
  }
  return template.replace(/\{\{question\}\}/g, question);
}
function pointer(doc, path) {
  if (!path || path === "/") return doc;
  let cur = doc;
  for (const raw of path.replace(/^\//, "").split("/")) {
    const key = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (cur === null || typeof cur !== "object") return void 0;
    cur = cur[key];
  }
  return cur;
}
var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function endpointFingerprint(e) {
  let target = e.url;
  try {
    const u = new URL(e.url.replace(/\{\{question\}\}/g, "q").replace(/\$\{env\.[A-Z0-9_]+\}/g, "env"));
    target = `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
  }
  const h3 = (0, import_node_crypto2.createHash)("sha256").update([e.method, target, e.body ?? "", Object.keys(e.headers).map((k) => k.toLowerCase()).sort().join(","), e.answer_path].join("|")).digest("hex");
  return h3;
}
async function callEndpoint(e, question, o) {
  const transport = o.transport ?? nodeTransport;
  const rawUrl = expandEnv(e.url, o.env);
  const url = new URL(e.method === "GET" ? fillTemplate(rawUrl, question, "url") : rawUrl);
  if (url.protocol !== "https:" && !(o.network_mode === "local" && url.protocol === "http:")) {
    throw new EndpointError("endpoint_error", "the endpoint must use https (http is allowed only with network_mode: local)");
  }
  if (o.network_mode === "public" && (0, import_node_net.isIP)(url.hostname.replace(/^\[|\]$/g, "")) && isBlockedAddress(url.hostname)) {
    throw new EndpointError("endpoint_error", "the endpoint is a private, loopback or metadata address; set network_mode: local to allow it");
  }
  const headers = {};
  for (const [k, v] of Object.entries(e.headers)) headers[k] = expandEnv(v, o.env);
  const isJson = e.body !== null && /^\s*[{[]/.test(e.body);
  const body = e.body === null ? null : fillTemplate(expandEnv(e.body, o.env), question, isJson ? "json" : "text");
  if (body !== null && !Object.keys(headers).some((k) => k.toLowerCase() === "content-type")) headers["content-type"] = isJson ? "application/json" : "text/plain; charset=utf-8";
  headers["user-agent"] = "xyntherium-verify-gate/0.1.0";
  const request_hash = (0, import_node_crypto2.createHash)("sha256").update(`${e.method}|${url.toString()}|${body ?? ""}`).digest("hex");
  let last = null;
  for (let attempt = 1; attempt <= e.retries + 1; attempt++) {
    const retryable = attempt <= e.retries;
    let res;
    try {
      res = await transport({ url, method: e.method, headers, body, timeout_ms: e.timeout_ms, max_bytes: e.max_response_bytes, network_mode: o.network_mode });
    } catch (err) {
      const code = err?.code;
      if (code === "EBLOCKEDADDR") throw new EndpointError("endpoint_error", err.message);
      last = err instanceof EndpointError ? err : new EndpointError("endpoint_error", `network error (${code ?? "unknown"})`);
      if (/exceeded/.test(last.message)) throw last;
      if (retryable) await sleep((o.backoff_ms ?? 400) * 3 ** (attempt - 1));
      continue;
    }
    if (res.status >= 300 && res.status < 400) throw new EndpointError("endpoint_error", `the endpoint answered with a redirect (HTTP ${res.status}); redirects are not followed`);
    if (res.status === 429 || res.status >= 500) {
      last = new EndpointError("endpoint_error", `HTTP ${res.status}`);
      if (retryable) await sleep((o.backoff_ms ?? 400) * 3 ** (attempt - 1));
      continue;
    }
    if (res.status >= 400) throw new EndpointError("endpoint_error", `HTTP ${res.status}`);
    const response_hash = (0, import_node_crypto2.createHash)("sha256").update(res.body).digest("hex");
    const text = res.body.toString("utf8");
    let answer = text;
    if (e.answer_path) {
      try {
        answer = pointer(JSON.parse(text), e.answer_path);
      } catch {
        throw new EndpointError("endpoint_error", `the response is not JSON, so answer_path ${e.answer_path} cannot be read`);
      }
    }
    if (typeof answer !== "string" || !answer.trim()) throw new EndpointError("endpoint_error", `no answer text at ${e.answer_path || "the response body"}`);
    return { answer, request_hash, response_hash, status: res.status, attempts: attempt };
  }
  throw last ?? new EndpointError("endpoint_error", "no attempt made");
}

// src/gate/sampling.ts
var import_node_crypto3 = require("node:crypto");
function selectCases(cases, o) {
  if (o.full_run || o.max_cases_per_run === null && o.sample_rate === null) return cases;
  const ranked = cases.map((c) => ({ c, r: parseInt((0, import_node_crypto3.createHash)("sha256").update(`${o.seed}|${c.suite}|${c.id}`).digest("hex").slice(0, 8), 16) / 4294967296 })).filter((x) => o.sample_rate === null || x.r < o.sample_rate).sort((a, b) => a.r - b.r);
  const picked = new Set((o.max_cases_per_run === null ? ranked : ranked.slice(0, o.max_cases_per_run)).map((x) => x.c));
  return cases.filter((c) => picked.has(c));
}
function estimateMonthlyUnits(o) {
  const prs = o.prs_per_day ?? 10;
  const fresh = 1 - Math.min(1, Math.max(0, o.cache_hit_rate ?? 0));
  return Math.round(o.cases_per_pr_run * fresh * prs * 30 + (o.nightly_full_run ? o.full_suite_cases * 30 : 0));
}

// src/gate/sources.ts
var import_node_crypto4 = require("node:crypto");
var import_node_fs3 = require("node:fs");
var import_node_path2 = require("node:path");
var MAX_SOURCE_BYTES = 2e6;
function sha256File(bytes) {
  return (0, import_node_crypto4.createHash)("sha256").update(bytes).digest("hex");
}
function insideRoot(root, p) {
  const real = (0, import_node_fs3.realpathSync)(p);
  const rel = (0, import_node_path2.relative)((0, import_node_fs3.realpathSync)(root), real);
  return !!rel && !rel.startsWith("..") && !(0, import_node_path2.isAbsolute)(rel);
}
function resolveSources(specs, root) {
  return specs.map((spec) => {
    const abs = (0, import_node_path2.resolve)((0, import_node_path2.join)(root, spec.path));
    if (!(0, import_node_fs3.existsSync)(abs)) return { spec, text: null, sha256: null, status: "missing", detail: `${spec.path} does not exist` };
    if (!insideRoot(root, abs)) return { spec, text: null, sha256: null, status: "missing", detail: `${spec.path} resolves outside the repository` };
    const st = (0, import_node_fs3.statSync)(abs);
    if (!st.isFile()) return { spec, text: null, sha256: null, status: "missing", detail: `${spec.path} is not a file` };
    if (st.size > MAX_SOURCE_BYTES) return { spec, text: null, sha256: null, status: "missing", detail: `${spec.path} is larger than ${MAX_SOURCE_BYTES} bytes` };
    const bytes = (0, import_node_fs3.readFileSync)(abs);
    const hash = sha256File(bytes);
    const text = bytes.toString("utf8");
    if (!text.trim()) return { spec, text: null, sha256: hash, status: "missing", detail: `${spec.path} is empty` };
    if (spec.sha256 && spec.sha256 !== hash) return { spec, text, sha256: hash, status: "hash_mismatch", detail: `${spec.path} sha256 is ${hash.slice(0, 12)}\u2026, the golden set pins ${spec.sha256.slice(0, 12)}\u2026` };
    return { spec, text, sha256: hash, status: "ok", detail: null };
  });
}

// src/gate/run.ts
var CACHE_VERSION = `gate-${GATE_VERSION}+rules-${RULES_VERSION}+policy-${POLICY_VERSION}`;
async function pool2(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(n, items.length)) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    })
  );
  return out;
}
var keyOf = (c) => `${c.suite}/${c.case_id ?? c.id}`;
function integrityFor(c, sources) {
  const out = [];
  for (const id of c.sources) {
    const s = sources.get(id);
    if (!s) continue;
    if (s.status === "hash_mismatch") out.push({ kind: "source_hash_mismatch", detail: s.detail ?? s.spec.path, source_id: id });
    if (s.status === "missing") out.push({ kind: "source_missing", detail: s.detail ?? s.spec.path, source_id: id });
  }
  return out;
}
async function hostedRun(o, body) {
  const f = o.fetch ?? fetch;
  const url = `${o.base_url.replace(/\/+$/, "")}/v1/gate/verify-run`;
  let last = "no attempt";
  for (let attempt = 1; attempt <= 3; attempt++) {
    let res;
    try {
      res = await f(url, { method: "POST", headers: { authorization: `Bearer ${o.api_key}`, "content-type": "application/json", "user-agent": "xyntherium-verify-gate/0.1.0", "idempotency-key": body.run.run_id }, body: JSON.stringify(body) });
    } catch {
      last = "network error";
      await new Promise((r) => setTimeout(r, 500 * attempt));
      continue;
    }
    if (res.ok) return await res.json();
    if (res.status === 429 || res.status >= 500) {
      last = `HTTP ${res.status}`;
      const quota = res.status === 429 && /quota/i.test(await res.text().catch(() => ""));
      if (quota) throw Object.assign(new Error("the Verify quota is exhausted"), { kind: "quota_exhausted" });
      await new Promise((r) => setTimeout(r, 500 * attempt));
      continue;
    }
    const text = await res.text().catch(() => "");
    throw Object.assign(new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`), { kind: "verifier_error" });
  }
  throw Object.assign(new Error(`the verifier was unavailable (${last})`), { kind: "verifier_unavailable" });
}
async function runGate(o) {
  const log = o.log ?? ((l) => process.stdout.write(`${l}
`));
  const now = o.now ?? (() => /* @__PURE__ */ new Date());
  const notes = [];
  const artifactDir = (0, import_node_path3.isAbsolute)(o.artifact_path) ? o.artifact_path : (0, import_node_path3.join)(o.root, o.artifact_path);
  const paths = { ledger: (0, import_node_path3.join)(artifactDir, "verify-gate-ledger.json"), sarif: (0, import_node_path3.join)(artifactDir, "verify-gate.sarif"), markdown: (0, import_node_path3.join)(artifactDir, "verify-gate-summary.md"), policy_change: (0, import_node_path3.join)(artifactDir, "verify-gate-policy-change.json") };
  const rel = (p) => (0, import_node_path3.relative)(o.root, p) || p;
  for (const s of [o.api_key, o.signing_key]) if (s) o.mask?.(s);
  let cfg;
  let yamlText;
  try {
    yamlText = (0, import_node_fs4.readFileSync)((0, import_node_path3.join)(o.root, o.config_path), "utf8");
    cfg = parseConfig(yamlText);
  } catch (e) {
    const msg = e instanceof ConfigError ? e.message : `cannot read ${o.config_path}: ${e instanceof Error ? e.message : String(e)}`;
    log(`::error::${msg.split("\n").join(" ")}`);
    const md = `## Verify Gate: \u23F8\uFE0F hold \u2014 the golden set could not be read

${msg.replace(/</g, "&lt;")}

> Assurance scope: evidence support for supplied sources only; not a compliance certification, legal assessment, or determination of real-world truth.`;
    (0, import_node_fs4.mkdirSync)(artifactDir, { recursive: true });
    (0, import_node_fs4.writeFileSync)(paths.markdown, `${md}
`);
    return { ledger: null, exit_code: 1, decision: "hold", paths, outputs: { decision: "hold", "ledger-path": "", "sarif-path": "", "claims-total": "0", "material-failures": "0", "policy-changed-answers": "0" }, notes: [msg], skipped: false, markdown: md, config_error: msg, policy_change: null };
  }
  const mode = o.mode ?? cfg.mode ?? "local";
  if (mode === "hosted" && !o.api_key) throw new Error("hosted mode needs an api-key (local mode needs none)");
  for (const e of [cfg.endpoint, ...cfg.suites.map((s) => s.endpoint)]) for (const name of envRefs(e)) if (o.env[name]) o.mask?.(o.env[name]);
  const policy = cfg.draft ? { ...cfg.policy, enforcement: "report_only" } : cfg.policy;
  if (cfg.draft) notes.push("draft golden set: reporting only until a person approves it (remove draft: true)");
  const resolved = resolveSources(cfg.sources, o.root);
  const byId = new Map(resolved.map((s) => [s.spec.id, s]));
  for (const s of resolved) if (s.status !== "ok") log(`source ${s.spec.id}: ${s.status}`);
  const gh = o.github ? new GitHub(o.github, o.fetch) : null;
  const scheduled = o.github?.event_name === "schedule";
  const fullRun = o.full_run || scheduled;
  const real = (p) => {
    try {
      return (0, import_node_fs4.realpathSync)(p);
    } catch {
      return p;
    }
  };
  const rawPrefix = o.repo_root ? (0, import_node_path3.relative)(real(o.repo_root), real(o.root)).split(import_node_path3.sep).join("/") : "";
  const prefix = rawPrefix.startsWith("..") || (0, import_node_path3.isAbsolute)(rawPrefix) ? "" : rawPrefix;
  const toRoot = (f) => {
    const g = f.replace(/^\.\//, "");
    return !prefix ? g : g.startsWith(`${prefix}/`) ? g.slice(prefix.length + 1) : null;
  };
  const repoPath = (p) => (prefix ? import_node_path3.posix.join(prefix, p) : p).replace(/^\.\//, "");
  let skipped = null;
  let changedInRoot = null;
  if (gh?.available && o.github?.pull_number) {
    try {
      const changed = await gh.changedFiles();
      changedInRoot = changed === null ? null : changed.map(toRoot).filter((f) => f !== null);
      const hits = relevantChanges(changedInRoot, relevantPatterns({ config_path: o.config_path, source_paths: cfg.sources.map((s) => s.path), paths: cfg.paths }));
      if (!fullRun && hits !== null && hits.length === 0) skipped = "no relevant changes";
    } catch (e) {
      notes.push(`changed files could not be listed (${e instanceof Error ? e.message : "error"}); running every selected case`);
    }
  }
  if (changedInRoot === null && o.changed_files) {
    try {
      const changed = await o.changed_files();
      changedInRoot = changed === null ? null : changed.map(toRoot).filter((f) => f !== null);
    } catch {
      changedInRoot = null;
    }
  }
  const allCases = cfg.suites.flatMap((s) => s.cases.map((c) => ({ ...c, endpoint: s.endpoint ?? cfg.endpoint })));
  const selected = skipped ? [] : selectCases(allCases, { max_cases_per_run: cfg.cost.max_cases_per_run, sample_rate: cfg.cost.sample_rate, seed: o.github?.sha ?? "local", full_run: fullRun });
  const cache = o.cache_dir && cfg.cost.cache ? new ResultCache((0, import_node_path3.isAbsolute)(o.cache_dir) ? o.cache_dir : (0, import_node_path3.join)(o.root, o.cache_dir)) : null;
  const runId = o.run_id ?? (0, import_node_crypto5.randomUUID)();
  const firstEndpoint = cfg.endpoint ?? cfg.suites.find((s) => s.endpoint)?.endpoint ?? null;
  const prepared = await pool2(selected, cfg.concurrency, async (c) => {
    const integrity = integrityFor(c, byId);
    let answer = c.answer;
    let request_hash = null;
    let response_hash = null;
    if (answer === null && c.endpoint && !integrity.length) {
      try {
        const r = await callEndpoint(c.endpoint, c.question, { env: o.env, network_mode: cfg.network_mode, transport: o.transport, backoff_ms: o.endpoint_backoff_ms });
        answer = r.answer;
        request_hash = r.request_hash;
        response_hash = r.response_hash;
      } catch (e) {
        const err = e instanceof EndpointError ? e : new EndpointError("endpoint_error", "endpoint call failed");
        integrity.push({ kind: err.code, detail: err.message });
      }
    }
    const sourceHashes = c.sources.map((id) => byId.get(id)?.sha256 ?? "missing");
    const cache_key = answer !== null ? caseCacheKey({ question: c.question, answer, source_hashes: sourceHashes, config_hash: cfg.sha256, rules_version: CACHE_VERSION }) : null;
    const prior = mode === "local" && cache_key && cache && !integrity.length ? cache.get(cache_key, CACHE_VERSION) : null;
    return { spec: c, answer, integrity, request_hash, response_hash, cache_key, cached: prior };
  });
  const texts = {};
  let cases = [];
  let hostedLedger = null;
  const sourcesFor = (c) => c.sources.map((id) => byId.get(id)).filter((s) => s.text !== null).map((s) => ({ id: s.spec.id, text: s.text, sha256: s.sha256, ...s.spec.effective_date ? { effective_date: s.spec.effective_date } : {} }));
  const run = {
    run_id: runId,
    created_at: now().toISOString(),
    gate_version: "0.1.0",
    mode,
    trigger: o.github?.event_name || "cli",
    repository: o.github ? `${o.github.owner}/${o.github.repo}` : null,
    commit_sha: o.github?.sha || null,
    ref: o.github?.ref || null,
    pull_request: o.github?.pull_number ?? null,
    workflow_run_id: o.github?.run_id ?? null,
    actor: o.github?.actor ?? null,
    config: { path: o.config_path, sha256: cfg.sha256, schema_version: cfg.version },
    engine: engineInfo(),
    policy,
    endpoint: firstEndpoint ? { fingerprint: endpointFingerprint(firstEndpoint), method: firstEndpoint.method } : null,
    sources: resolved.map((s) => ({ id: s.spec.id, path: s.spec.path, version: s.spec.version, sha256: s.sha256 ?? "", status: s.status })),
    sampling: { total_cases: allCases.length, selected_cases: selected.length, max_cases_per_run: cfg.cost.max_cases_per_run, sample_rate: cfg.cost.sample_rate, full_run: fullRun },
    cost: { billable_units: 0, cached_cases: prepared.filter((p) => p.cached).length, estimated_monthly_units: null },
    include_text: cfg.ledger.include_text
  };
  let overrideCandidate = null;
  if (gh?.available && o.github?.pull_number && policy.overrides.enabled) {
    try {
      const applier = await gh.labelApplier(policy.overrides.label);
      if (applier) {
        const comments = await gh.recentComments();
        const last = [...comments].reverse().find((c) => parseOverrideComment(c.body) !== null);
        if (last) {
          const teams = policy.overrides.require_team && await gh.inTeam(policy.overrides.require_team, last.author) ? [policy.overrides.require_team] : [];
          overrideCandidate = { actor: last.author, reason: parseOverrideComment(last.body), timestamp: last.created_at, label_applied_by: applier, label_perm: await gh.permissionOf(applier), author_perm: await gh.permissionOf(last.author), teams };
        } else notes.push(`the "${policy.overrides.label}" label is applied, but no /verify-override <reason> comment was found`);
      }
    } catch (e) {
      notes.push(`override facts could not be read (${e instanceof Error ? e.message : "error"})`);
    }
  }
  let policyChange = null;
  const norm2 = (p) => p.replace(/^\.\//, "");
  const readBase = o.base_text ?? (gh?.available && o.github?.base_sha ? (p) => gh.fileAt(p, o.github.base_sha) : null);
  const baseCache = /* @__PURE__ */ new Map();
  const safeRead = async (p) => {
    if (!readBase) return null;
    if (baseCache.has(p)) return baseCache.get(p);
    let t = null;
    try {
      t = await readBase(p);
    } catch (e) {
      notes.push(`policy change: ${p} could not be read at the base (${e instanceof Error ? e.message : "error"})`);
    }
    baseCache.set(p, t);
    return t;
  };
  const changedSources = [];
  if (cfg.policy_change.enabled) {
    for (const s of resolved) {
      if (s.status === "hash_mismatch" || (changedInRoot?.includes(norm2(s.spec.path)) ?? false)) changedSources.push(s);
      else if (changedInRoot === null && readBase) {
        const before = await safeRead(repoPath(s.spec.path));
        if (before !== null && before !== (s.text ?? "")) changedSources.push(s);
      }
    }
  }
  const docTests = cfg.tests.length ? cfg.tests.map((t) => ({ id: t.id, kind: "test", location: { path: o.config_path, line: t.line }, question: t.question, answer: t.answer, expected: [], source_ids: t.source_ids, required_conditions: t.required_conditions })) : allCases.map((c) => ({ id: `${c.suite}/${c.id}`, kind: "case", location: { path: o.config_path, line: c.line }, question: c.question, answer: c.answer, expected: c.material_claims, source_ids: c.sources, required_conditions: [] }));
  const linked = new Set(docTests.flatMap((t) => t.source_ids));
  const policyLike = cfg.policy_change.policy_paths.map(globToRegExp);
  const docExt = /\.(?:md|mdx|markdown|txt|html?|rst|adoc)$/i;
  const unprotected = [];
  if (cfg.policy_change.enabled && changedInRoot) {
    for (const f of [...new Set(changedInRoot)].sort()) {
      if (norm2(f) === norm2(o.config_path)) continue;
      const src = cfg.sources.find((x) => norm2(x.path) === norm2(f));
      const entry = src ? linked.has(src.id) ? null : { path: f, source_id: src.id, reason: "no_linked_tests" } : docExt.test(f) && policyLike.some((r) => r.test(f)) ? { path: f, source_id: null, reason: "not_a_source" } : null;
      if (!entry) continue;
      const before = await safeRead(repoPath(f));
      const abs = (0, import_node_path3.join)(o.root, f);
      const after = (0, import_node_fs4.existsSync)(abs) ? (0, import_node_fs4.readFileSync)(abs, "utf8") : null;
      entry.change_kind = before !== null && after !== null ? detectSourceChange({ before, after, captured_at: run.created_at }).kind === "real" ? "real" : "cosmetic" : "unknown";
      unprotected.push(entry);
    }
  }
  const docStore = o.cache_dir && cfg.cost.cache ? new DocResultStore((0, import_node_path3.isAbsolute)(o.cache_dir) ? o.cache_dir : (0, import_node_path3.join)(o.root, o.cache_dir)) : null;
  const docKey = (testId) => {
    const t = docTests.find((x) => x.id === testId);
    return (0, import_node_crypto5.createHash)("sha256").update(JSON.stringify([testId, t?.answer ?? null, t?.required_conditions ?? [], CACHE_VERSION])).digest("hex");
  };
  const snapshotsOf = (t) => Object.fromEntries(t.source_ids.map((id) => [id, byId.get(id)?.text != null ? documentParityHash(byId.get(id).text, run.created_at) : "missing"]));
  if (changedSources.length || unprotected.length) {
    let baseCfg = null;
    const baseYaml = await safeRead(repoPath(o.config_path));
    if (baseYaml !== null) {
      try {
        baseCfg = parseConfig(baseYaml);
      } catch {
        baseCfg = null;
      }
    }
    const changed = [];
    for (const s of changedSources) {
      const before = await safeRead(repoPath(s.spec.path));
      const after = s.text;
      const old = baseCfg?.sources.find((x) => x.id === s.spec.id);
      changed.push({
        id: s.spec.id,
        path: s.spec.path,
        // The same text on both sides says nothing about what was approved before.
        before: before !== null && after !== null && before === after ? null : before,
        after,
        versioned: s.spec.version !== null,
        version_before: old?.version ?? null,
        version_after: s.spec.version,
        ...old?.effective_date ? { effective_date_before: old.effective_date } : {},
        ...s.spec.effective_date ? { effective_date_after: s.spec.effective_date } : {},
        supersedes: s.spec.supersedes ?? []
      });
    }
    policyChange = await assessPolicyChange({
      changed,
      tests: docTests,
      current: resolved.filter((x) => x.text !== null).map((x) => ({ id: x.spec.id, text: x.text })),
      unprotected,
      enforcement: cfg.policy_change.enforcement,
      include_text: true,
      // The ledger carries text only when the golden set asks for it.
      record_text: cfg.ledger.include_text,
      captured_at: run.created_at,
      previous: docStore ? (id) => docStore.get(docKey(id)) : void 0
    });
    if (docStore) {
      for (const t of policyChange.tests) {
        const spec = docTests.find((x) => x.id === t.id);
        if (spec && t.verdict_after && t.decision !== "hold") docStore.set(docKey(t.id), t.verdict_after, snapshotsOf(spec), run.created_at);
      }
    }
  }
  if (docStore && cfg.tests.length) {
    const reported = new Set(policyChange?.tests.map((t) => t.id) ?? []);
    const cur = resolved.filter((x) => x.text !== null && x.status === "ok").map((x) => ({ id: x.spec.id, text: x.text }));
    for (const t of docTests) {
      if (reported.has(t.id) || t.source_ids.some((id) => byId.get(id)?.status !== "ok")) continue;
      const v = await documentTestVerdict(t, cur);
      if (v) docStore.set(docKey(t.id), v, snapshotsOf(t), run.created_at);
    }
    docStore.save();
  }
  if (mode === "local") {
    cases = await pool2(prepared, cfg.concurrency, async (p) => {
      const loc = { path: o.config_path, line: p.spec.line };
      if (p.cached) return cachedCase(p.cached, { location: loc, request_hash: p.request_hash, response_hash: p.response_hash });
      const r = await runGateCase({
        suite: p.spec.suite,
        case_id: p.spec.id,
        location: loc,
        question: p.spec.question,
        answer: p.answer,
        sources: sourcesFor(p.spec),
        expected: p.spec.material_claims,
        require_citations: p.spec.require_citations,
        policy,
        policy_overrides: p.spec.policy_overrides,
        integrity: p.integrity,
        mode: "local",
        include_text: cfg.ledger.include_text,
        request_hash: p.request_hash,
        response_hash: p.response_hash,
        cache_key: p.cache_key
      });
      texts[keyOf(r.ledger)] = r.texts;
      return r.ledger;
    });
  } else {
    const toCheck = prepared.filter((p) => !p.cached);
    try {
      const reply = await hostedRun(o, {
        run,
        policy,
        include_text: cfg.ledger.include_text,
        config_sha256: cfg.sha256,
        override_request: overrideCandidate,
        parity_records: policyChange?.parity_records ?? [],
        cases: toCheck.map((p) => ({
          suite: p.spec.suite,
          case_id: p.spec.id,
          location: { path: o.config_path, line: p.spec.line },
          question: p.spec.question,
          answer: p.answer,
          sources: sourcesFor(p.spec),
          material_claims: p.spec.material_claims,
          require_citations: p.spec.require_citations,
          policy_overrides: p.spec.policy_overrides,
          integrity: p.integrity,
          request_hash: p.request_hash,
          response_hash: p.response_hash
        }))
      });
      hostedLedger = reply.ledger;
      cases = reply.ledger.cases;
      Object.assign(texts, reply.texts ?? {});
    } catch (e) {
      const kind = e.kind ?? "verifier_unavailable";
      notes.push(`hosted verifier: ${e instanceof Error ? e.message : "error"}`);
      cases = await pool2(
        prepared,
        cfg.concurrency,
        async (p) => (await runGateCase({
          suite: p.spec.suite,
          case_id: p.spec.id,
          location: { path: o.config_path, line: p.spec.line },
          question: p.spec.question,
          answer: null,
          sources: sourcesFor(p.spec),
          expected: [],
          require_citations: false,
          policy,
          policy_overrides: null,
          integrity: [...p.integrity, { kind, detail: e instanceof Error ? e.message : "error" }],
          mode: "hosted",
          include_text: false,
          request_hash: p.request_hash,
          response_hash: p.response_hash,
          cache_key: p.cache_key
        })).ledger
      );
    }
  }
  if (skipped) {
    cases = allCases.map((c) => ({
      suite: c.suite,
      case_id: c.id,
      location: { path: o.config_path, line: c.line },
      status: "skipped",
      cache_key: null,
      question_hash: (0, import_node_crypto5.createHash)("sha256").update(c.question).digest("hex"),
      answer_hash: null,
      request_hash: null,
      response_hash: null,
      source_ids: c.sources,
      claims: [],
      findings: [],
      decision: "pass",
      reasons: ["skipped: no relevant changes"],
      counts: { claims: 0, material: 0, supported_material: 0, deterministic_findings: 0, model_findings: 0 },
      billable_units: 0,
      error: null
    }));
  }
  if (mode === "local") {
    for (const c of cases) if (cache && c.cache_key && c.status === "checked") cache.set(c.cache_key, CACHE_VERSION, c, run.created_at);
  }
  cache?.save();
  const decision = worst(cases.filter((c) => c.status !== "skipped").map((c) => c.decision));
  let override = hostedLedger?.decision.override ?? null;
  if (!hostedLedger && overrideCandidate) {
    const ok = checkOverride({ decision, policy, label_applied_by: overrideCandidate.label_applied_by, label_applier_permission: overrideCandidate.label_perm, comment_author: overrideCandidate.actor, comment_author_permission: overrideCandidate.author_perm, reason: overrideCandidate.reason, author_teams: overrideCandidate.teams });
    if (ok.ok) {
      override = {
        actor: overrideCandidate.actor,
        reason: overrideCandidate.reason,
        timestamp: overrideCandidate.timestamp,
        overridden_claims: cases.flatMap((c) => c.findings.filter((f) => f.decision === "block").map((f) => ({ suite: c.suite, case_id: c.case_id, claim_index: f.claim_index, rule: f.rule })))
      };
    } else notes.push(`override not applied: ${ok.error}`);
  }
  const cachedCount = cases.filter((c) => c.status === "cached").length;
  run.cost = {
    billable_units: cases.reduce((n, c) => n + c.billable_units, 0),
    cached_cases: cachedCount,
    estimated_monthly_units: mode === "hosted" ? estimateMonthlyUnits({ cases_per_pr_run: selected.length, full_suite_cases: allCases.length, prs_per_day: cfg.cost.expected_prs_per_day, nightly_full_run: cfg.cost.max_cases_per_run !== null || cfg.cost.sample_rate !== null, cache_hit_rate: selected.length ? cachedCount / selected.length : 0 }) : 0
  };
  let ledger;
  if (hostedLedger) {
    ledger = hostedLedger;
  } else {
    const outcome = runOutcome(decision, { enforcement: policy.enforcement, fail_on: o.fail_on, override });
    ledger = buildLedger({
      run,
      cases,
      parity: policyChange?.parity_records ?? [],
      decision: { ...outcome, title: skipped ? "skipped: no relevant changes" : outcome.title, enforcement: policy.enforcement, fail_on: o.fail_on, reasons: [...new Set(cases.flatMap((c) => c.reasons))].slice(0, 20), override }
    });
    if (o.signing_key) {
      try {
        ledger = await signLedger(ledger, o.signing_key, "repository-secret");
      } catch (e) {
        notes.push(`the signing key could not be used (${e instanceof Error ? e.message : "error"}); the ledger is unsigned`);
      }
    }
  }
  (0, import_node_fs4.mkdirSync)(artifactDir, { recursive: true });
  (0, import_node_fs4.writeFileSync)(paths.ledger, `${JSON.stringify(ledger, null, 2)}
`);
  const sarif = buildSarif(ledger, { config_path: o.config_path, texts });
  (0, import_node_fs4.writeFileSync)(paths.sarif, `${JSON.stringify(sarif, null, 2)}
`);
  let markdown = renderReport(ledger, { ledger_path: rel(paths.ledger), texts, skipped_reason: skipped, draft: cfg.draft, github_notes: notes });
  (0, import_node_fs4.writeFileSync)(paths.markdown, `${markdown}
`);
  if (policyChange) {
    const stored = cfg.ledger.include_text ? policyChange : {
      ...policyChange,
      changed_sources: policyChange.changed_sources.map((c) => ({ ...c, change: c.change ? { ...c.change, changes: c.change.changes.map((x) => ({ ...x, before: null, after: null })) } : null })),
      tests: policyChange.tests.map(({ diff: _d, ...t }) => ({ ...t, conditions: t.conditions.map(({ text: _t, now: _n, was: _w, ...c }) => c) }))
    };
    (0, import_node_fs4.writeFileSync)(paths.policy_change, `${JSON.stringify(stored, null, 2)}
`);
    markdown = `${markdown}

${renderPolicyChange(policyChange)}`;
    (0, import_node_fs4.writeFileSync)(paths.markdown, `${markdown}
`);
    log(`policy change: ${policyChange.title}; ${policyChange.unprotected.filter((u) => u.change_kind !== "cosmetic").length} unprotected source change(s); ${policyChange.parity_records.length} parity record(s) (${policyChange.enforcement})`);
  }
  log(`verify-gate: ${cases.length} case(s), decision ${ledger.decision.decision}${ledger.decision.override ? ` (overridden by ${ledger.decision.override.actor})` : ""}; ledger ${rel(paths.ledger)} (${ledger.signing.alg === "Ed25519" ? `signed, key ${ledger.signing.key_id}` : "unsigned"})`);
  for (const c of cases) log(`  ${c.suite}/${c.case_id}: ${c.status === "skipped" ? "skipped" : c.decision}${c.findings.length ? ` [${[...new Set(c.findings.filter((f) => f.decision !== "pass").map((f) => f.rule))].join(",")}]` : ""}`);
  const ghNotes = [];
  if (o.env.GITHUB_STEP_SUMMARY) {
    try {
      (0, import_node_fs4.appendFileSync)(o.env.GITHUB_STEP_SUMMARY, `${markdown}
`);
    } catch {
      ghNotes.push("job summary not written");
    }
  }
  if (gh?.available) {
    if (o.comment_pr && o.github?.pull_number) {
      try {
        await gh.upsertComment(markdown);
      } catch (e) {
        ghNotes.push(`PR comment not posted (${e instanceof Error ? e.message : "error"}; needs pull-requests: write)`);
      }
    }
    try {
      await gh.checkRun({ name: o.check_name ?? "Verify Gate", conclusion: ledger.decision.conclusion, title: ledger.decision.title, summary: markdown });
    } catch (e) {
      ghNotes.push(`check run not created (${e instanceof Error ? e.message : "error"}; needs checks: write)`);
    }
    if (policyChange) {
      try {
        await gh.checkRun({ name: `${o.check_name ?? "Verify Gate"}: policy change`, conclusion: policyChange.conclusion, title: policyChange.title, summary: renderPolicyChange(policyChange) });
      } catch (e) {
        ghNotes.push(`policy-change check run not created (${e instanceof Error ? e.message : "error"}; needs checks: write)`);
      }
    }
    if (o.upload_sarif) {
      try {
        await gh.uploadSarif(sarif);
      } catch (e) {
        ghNotes.push(`SARIF not uploaded (${e instanceof Error ? e.message : "error"}; needs security-events: write and code scanning enabled)`);
      }
    }
  } else if (o.github) ghNotes.push("no GitHub token: PR comment, check run and SARIF upload skipped");
  if (ghNotes.length) {
    for (const n of ghNotes) log(`::warning::${n}`);
    markdown = renderReport(ledger, { ledger_path: rel(paths.ledger), texts, skipped_reason: skipped, draft: cfg.draft, github_notes: [...notes, ...ghNotes] });
    if (policyChange) markdown = `${markdown}

${renderPolicyChange(policyChange)}`;
    (0, import_node_fs4.writeFileSync)(paths.markdown, `${markdown}
`);
  }
  const claimsTotal = cases.reduce((n, c) => n + c.claims.length, 0);
  const policyFails = policyChange?.conclusion === "failure";
  return {
    ledger,
    exit_code: ledger.decision.exit_code === 1 || policyFails ? 1 : 0,
    decision: ledger.decision.decision,
    paths,
    outputs: { decision: skipped ? "pass" : ledger.decision.decision, "ledger-path": rel(paths.ledger), "sarif-path": rel(paths.sarif), "claims-total": String(claimsTotal), "material-failures": String(ledger.summary.material_failures), "policy-changed-answers": String(policyChange?.needs_review ?? 0) },
    notes: [...notes, ...ghNotes],
    skipped: !!skipped,
    markdown,
    config_error: null,
    policy_change: policyChange
  };
}

// src/run.ts
var import_node_fs5 = require("node:fs");

// ../verify-sdk/src/index.ts
var XyntheriumError = class extends Error {
  constructor(message, status, code, retryAfterSeconds = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
    this.name = "XyntheriumError";
  }
};
var RETRYABLE = /* @__PURE__ */ new Set([409, 429, 502, 503, 504]);
var sleep2 = (ms) => new Promise((r) => setTimeout(r, ms));
function randomKey() {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `xyn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
var Xyntherium = class {
  constructor(opts) {
    this.opts = opts;
    if (!opts?.apiKey) throw new Error("Xyntherium: apiKey is required");
    this.base = (opts.baseUrl ?? "https://xyntherium.com").replace(/\/+$/, "");
    this.fetchImpl = opts.fetch ?? fetch;
  }
  /** Check an answer against its sources. Resolves with the full result; throws XyntheriumError on an API error. */
  async verify(body, options = {}) {
    return this.request("POST", "/v1/verify", body, { "Idempotency-Key": options.idempotencyKey ?? randomKey() }, options.signal);
  }
  /** A stored result by request_id. */
  async getVerification(id) {
    return this.request("GET", `/v1/verify/${encodeURIComponent(id)}`);
  }
  /** An evidence-ledger entry with its hash checks recomputed by the API. */
  async getLedgerEntry(id) {
    return this.request("GET", `/v1/ledger/${encodeURIComponent(id)}`);
  }
  async request(method, path, body, extra = {}, signal) {
    const maxRetries = this.opts.maxRetries ?? 2;
    let attempt = 0;
    for (; ; ) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs ?? 12e4);
      signal?.addEventListener("abort", () => controller.abort(), { once: true });
      let res;
      try {
        res = await this.fetchImpl(`${this.base}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${this.opts.apiKey}`,
            "Content-Type": "application/json",
            "User-Agent": "xyntherium-verify-sdk/1.0.0",
            ...this.opts.headers,
            ...extra
          },
          body: body === void 0 ? void 0 : JSON.stringify(body),
          signal: controller.signal
        });
      } catch (e) {
        clearTimeout(timer);
        if (signal?.aborted) throw e;
        if (attempt++ < maxRetries) {
          await sleep2(500 * 2 ** attempt);
          continue;
        }
        throw new XyntheriumError(e instanceof Error ? e.message : "network error", 0, "network_error");
      }
      clearTimeout(timer);
      if (res.ok) return await res.json();
      const retryAfter = Number(res.headers.get("retry-after"));
      const payload = await res.json().catch(() => null);
      if (RETRYABLE.has(res.status) && attempt++ < maxRetries) {
        await sleep2(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 10) * 1e3 : 750 * 2 ** attempt);
        continue;
      }
      throw new XyntheriumError(payload?.error?.message ?? `HTTP ${res.status}`, res.status, payload?.error?.code ?? "http_error", Number.isFinite(retryAfter) ? retryAfter : null);
    }
  }
};

// src/run.ts
function loadFixtures(path) {
  const raw = (0, import_node_fs5.readFileSync)(path, "utf8").trim();
  const list = raw.startsWith("[") ? JSON.parse(raw) : raw.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
  if (!Array.isArray(list) || !list.length) throw new Error(`${path}: expected a non-empty JSON array or JSONL file`);
  return list.map((f, i) => {
    const x = f;
    if (!x.question || !x.answer || !Array.isArray(x.sources)) throw new Error(`${path}: fixture ${i + 1} needs question, answer and sources`);
    return x;
  });
}
async function runFixtures(cfg) {
  const client = new Xyntherium({ apiKey: cfg.apiKey, baseUrl: cfg.baseUrl, ...cfg.fetch ? { fetch: cfg.fetch } : {} });
  const fixtures = loadFixtures(cfg.fixturesPath);
  const outcomes = new Array(fixtures.length);
  let next = 0;
  const worker = async () => {
    while (next < fixtures.length) {
      const i = next++;
      const f = fixtures[i];
      const name = f.name ?? `fixture ${i + 1}`;
      try {
        const r = await client.verify({ question: f.question, answer: f.answer, sources: f.sources, ...f.options ? { options: f.options } : {} });
        const passed = cfg.allowed.includes(r.release_recommendation);
        const problems = r.claims.filter((c) => c.verdict !== "supported").map((c) => `${c.verdict}${c.failure_reason ? ` (${c.failure_reason})` : ""}: ${c.text}`);
        outcomes[i] = { name, recommendation: r.release_recommendation, passed, problems, error: null };
      } catch (e) {
        outcomes[i] = { name, recommendation: null, passed: false, problems: [], error: e instanceof Error ? e.message : String(e) };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(cfg.concurrency, 10)) }, worker));
  const failed = outcomes.filter((o) => !o.passed).length;
  return { outcomes, failed, ok: failed <= cfg.maxFailures };
}
function summaryMarkdown(outcomes, ok, cfg) {
  const rows = outcomes.map((o) => `| ${o.passed ? "\u2705" : "\u274C"} | ${o.name.replace(/\|/g, "\\|")} | ${o.recommendation ?? `error: ${o.error}`} | ${o.problems.slice(0, 3).join("<br>").replace(/\|/g, "\\|")} |`);
  return [
    `## Xyntherium Verify: ${ok ? "passed" : "failed"}`,
    "",
    `${outcomes.filter((o) => o.passed).length}/${outcomes.length} fixtures got ${cfg.allowed.join(" or ")} (up to ${cfg.maxFailures} allowed to fail).`,
    "",
    "| | Fixture | Release recommendation | Claims not supported |",
    "|---|---|---|---|",
    ...rows,
    "",
    "_Verdicts describe whether the supplied passages support each claim, not whether any claim is true in the world._"
  ].join("\n");
}

// src/main.ts
var input = (name, fallback = "") => (process.env[`INPUT_${name.replace(/ /g, "_").toUpperCase()}`] ?? fallback).trim();
var bool = (name, fallback) => {
  const v = input(name, String(fallback)).toLowerCase();
  return v === "true" || v === "1" || v === "yes";
};
var mask = (s) => {
  for (const line of s.split(/\r?\n/)) if (line.trim()) process.stdout.write(`::add-mask::${line.trim()}
`);
};
function setOutputs(o) {
  if (!process.env.GITHUB_OUTPUT) return;
  (0, import_node_fs6.appendFileSync)(process.env.GITHUB_OUTPUT, Object.entries(o).map(([k, v]) => `${k}=${v.replace(/\r?\n/g, " ")}`).join("\n") + "\n");
}
async function legacy(apiKey) {
  process.stdout.write("::warning::The fixtures input is deprecated; move to verify-gate.yml (see the README). It keeps working.\n");
  const cfg = {
    apiKey,
    fixturesPath: input("fixtures"),
    allowed: input("allowed-recommendations", "allow").split(",").map((s) => s.trim()).filter(Boolean),
    maxFailures: Number(input("max-failures", "0")) || 0,
    baseUrl: input("base-url", "https://xyntherium.com"),
    concurrency: Number(input("concurrency", "4")) || 4
  };
  const { outcomes, failed, ok } = await runFixtures(cfg);
  for (const o of outcomes) process.stdout.write(`${o.passed ? "PASS" : "FAIL"} ${o.name}: ${o.recommendation ?? o.error}
`);
  setOutputs({ total: String(outcomes.length), passed: String(outcomes.length - failed), failed: String(failed) });
  if (process.env.GITHUB_STEP_SUMMARY) (0, import_node_fs6.appendFileSync)(process.env.GITHUB_STEP_SUMMARY, `${summaryMarkdown(outcomes, ok, cfg)}
`);
  if (!ok) {
    process.stdout.write(`::error::${failed} fixture(s) were not released (allowed: ${cfg.allowed.join(", ")}; max failures ${cfg.maxFailures})
`);
    process.exitCode = 1;
  }
}
async function main() {
  const apiKey = input("api-key");
  const signingKey = input("signing-key");
  const token = input("github-token");
  for (const s of [apiKey, signingKey, token]) if (s) mask(s);
  const root = (0, import_node_path4.resolve)(process.env.GITHUB_WORKSPACE ?? process.cwd(), input("working-directory", ".") || ".");
  const configPath = input("config", "verify-gate.yml");
  if (input("fixtures") && !(0, import_node_fs6.existsSync)((0, import_node_path4.join)(root, configPath))) {
    if (!apiKey) throw new Error("api-key is required for the fixtures input");
    return legacy(apiKey);
  }
  const modeIn = input("mode");
  if (modeIn && modeIn !== "local" && modeIn !== "hosted") throw new Error("mode must be local or hosted");
  const failOnRaw = input("fail-on", "block").toLowerCase();
  const failOn = failOnRaw === "none" ? [] : failOnRaw.split(",").map((s) => s.trim()).filter(Boolean);
  for (const f of failOn) if (!["block", "hold", "warn"].includes(f)) throw new Error(`fail-on: unknown value "${f}" (use block, hold, warn or none)`);
  const r = await runGate({
    root,
    repo_root: process.env.GITHUB_WORKSPACE ?? null,
    config_path: configPath,
    mode: modeIn || null,
    api_key: apiKey || null,
    base_url: input("base-url", "https://xyntherium.com"),
    fail_on: failOn,
    upload_sarif: bool("upload-sarif", true),
    comment_pr: bool("comment-pr", true),
    artifact_path: input("artifact-path", ".xyntherium"),
    signing_key: signingKey || null,
    cache_dir: input("cache-dir", ".xyntherium/cache") || null,
    full_run: bool("full-run", false),
    env: process.env,
    github: contextFromEnv(process.env, token || null),
    mask
  });
  setOutputs(r.outputs);
  if (r.exit_code === 1) {
    process.stdout.write(`::error::Verify Gate: ${r.config_error ? "the golden set could not be read" : r.decision} (see the job summary and ${r.outputs["ledger-path"] || "the log"})
`);
    process.exitCode = 1;
  }
}
main().catch((e) => {
  process.stdout.write(`::error::${e instanceof Error ? e.message : String(e)}
`);
  process.exitCode = 1;
});
/*! Bundled license information:

js-yaml/dist/js-yaml.mjs:
  (*! js-yaml 4.2.0 https://github.com/nodeca/js-yaml @license MIT *)
*/

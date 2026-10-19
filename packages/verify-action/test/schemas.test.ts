/**
 * The published JSON Schemas match what the code accepts and emits: every
 * example golden set validates against schemas/verify-gate.schema.json and
 * parses with the Action's own validator, and a real run's ledger validates
 * against schemas/verify-gate-ledger-1.0.0.schema.json.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Ajv from 'ajv';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { parseConfig } from '../src/gate/config';
import { runGate } from '../src/gate/run';

const ROOT = new URL('../../..', import.meta.url).pathname;
const ajv = new Ajv({ allErrors: true });
const gateSchema = ajv.compile(JSON.parse(readFileSync(join(ROOT, 'schemas/verify-gate.schema.json'), 'utf8')));
const ledgerSchema = ajv.compile(JSON.parse(readFileSync(join(ROOT, 'schemas/verify-gate-ledger-1.0.0.schema.json'), 'utf8')));

function exampleConfigs(): string[] {
  const dir = join(ROOT, 'examples');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).map((d) => join(dir, d, 'verify-gate.yml')).filter(existsSync);
}

describe('published JSON Schemas', () => {
  it('every example golden set validates against the schema and parses with the Action', () => {
    for (const f of exampleConfigs()) {
      const text = readFileSync(f, 'utf8');
      expect(gateSchema(load(text)), `${f}: ${JSON.stringify(gateSchema.errors)}`).toBe(true);
      expect(() => parseConfig(text), f).not.toThrow();
    }
  });

  it('the schema rejects what the Action rejects: a URL source, an unpinned source', () => {
    const bad = { version: 1, sources: [{ id: 'a', path: 'https://x/y', sha256: 'a'.repeat(64) }], suites: [{ name: 's', cases: [{ id: 'c', question: 'q', answer: 'a' }] }] };
    expect(gateSchema(bad)).toBe(false);
    expect(gateSchema({ ...bad, sources: [{ id: 'a', path: 'p.md' }] })).toBe(false);
  });

  it('a real run\'s ledger validates against the ledger schema, assurance scope included', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'xyn-schema-'));
    mkdirSync(join(dir, 'kb'));
    const text = 'Shipping is free on orders over $50 within the contiguous United States.';
    writeFileSync(join(dir, 'kb/shipping.md'), text);
    writeFileSync(
      join(dir, 'verify-gate.yml'),
      `version: 1\nsources:\n  - { id: shipping, path: kb/shipping.md, sha256: ${createHash('sha256').update(text).digest('hex')} }\nsuites:\n  - name: s\n    cases:\n      - { id: ok, question: "Is shipping free?", answer: "Shipping is free on orders over $50 within the contiguous United States." }\n      - { id: dropped, question: "Is shipping free?", answer: "Shipping is free on orders over $50." }\n`,
    );
    const r = await runGate({ root: dir, config_path: 'verify-gate.yml', mode: null, api_key: null, base_url: 'https://x', fail_on: ['block'], upload_sarif: false, comment_pr: false, artifact_path: '.xyntherium', signing_key: null, cache_dir: null, full_run: false, env: {}, github: null, log: () => {} });
    const ledger = JSON.parse(readFileSync(r.paths.ledger, 'utf8'));
    expect(ledgerSchema(ledger), JSON.stringify(ledgerSchema.errors)).toBe(true);
    expect(ledgerSchema({ ...ledger, assurance_scope: 'certified' })).toBe(false);
    const { assurance_scope: _a, ...without } = ledger;
    expect(ledgerSchema(without)).toBe(false);
  });
});

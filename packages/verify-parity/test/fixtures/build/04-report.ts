// Writes test/fixtures/report.json: the detector's scores on the eCFR fixture and the
// synthetic edits (see evaluate.ts). ecfr-fixtures.test.ts fails if the file is stale.
//   npx tsx packages/verify-parity/test/fixtures/build/04-report.ts
import fs from 'node:fs';
import { evaluate, REPORT_PATH } from '../evaluate';

const t0 = Date.now();
const report = evaluate();
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ history: { confusion: report.history.confusion, precision: report.history.precision, recall: report.history.recall, naming: report.history.naming.rate }, derived_cosmetic: report.derived_cosmetic, synthetic: { cosmetic: [report.synthetic.cosmetic.cases, report.synthetic.cosmetic.flagged], conservative: [report.synthetic.conservative.cases, report.synthetic.conservative.flagged], real: [report.synthetic.real.cases, report.synthetic.real.flagged, report.synthetic.real.named] } }, null, 1));
console.log(`(${Date.now() - t0} ms)`);

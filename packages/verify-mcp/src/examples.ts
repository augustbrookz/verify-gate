/**
 * The published, reproducible verify_answer examples (shown on /docs/mcp and /developers,
 * and in this package's README). Calls with exactly these inputs are counted as demo checks,
 * not real use, by the hosted server's instrumentation; only a hash is compared.
 */
import { inputHash } from './tool';

export interface McpExample {
  id: string;
  title: string;
  /** The arguments to verify_answer. */
  args: { question?: string; answer: string; sources: { id: string; title?: string; text: string }[]; mode?: 'fast' | 'strict' };
  /** What the check is expected to find (the release recommendation, and the source wording it names). */
  expect: { release: 'allow' | 'cite_required' | 'revise' | 'human_review'; names: string[] };
  /** Where the source text comes from. */
  provenance: string;
}

/** The return policy in the launch side-by-side (written for the example). */
export const NORTHWIND_POLICY =
  'Returns and refunds\n\nUnworn items can be returned for a full refund within 30 days of delivery. Items must have their original tags attached.\n\nShipping costs are not refunded. Return shipping is free for Northwind members; other customers pay a $7 return label fee, deducted from the refund.\n\nFinal-sale items, including anything bought in the clearance section, cannot be returned or exchanged.\n\nRefunds are issued to the original payment method within 5 business days of receiving the return. Gift purchases are refunded as store credit.';

export const EXAMPLES: McpExample[] = [
  {
    id: 'launch-refund',
    title: 'A support answer that drops the final-sale exception (drafted by claude-haiku-5-5)',
    args: {
      question: "can I get a refund on the jacket I got 2 weeks ago? it doesn't fit",
      answer: "Yes, if it's unworn with tags attached, it's returnable within 30 days of delivery; non-members pay a $7 fee.",
      sources: [{ id: 'returns', title: 'Northwind Outfitters: Returns and refunds', text: NORTHWIND_POLICY }],
    },
    expect: { release: 'revise', names: ['Final-sale items'] },
    provenance: 'The policy is written for this example. The answer is claude-haiku-5-5 output, unedited (run 3 of 5 with a 20-word limit; claude-sonnet-5-5 kept the exception in 3 of 3 runs).',
  },
  {
    id: 'refund',
    title: 'A refund answer that drops the conditions',
    args: {
      question: 'Can I get a refund?',
      answer: 'Refunds are available within 30 days.',
      sources: [{ id: 'returns', title: 'Return policy', text: 'Refunds are available within 30 days for unopened items with proof of purchase.' }],
    },
    expect: { release: 'revise', names: ['unopened items', 'proof of purchase'] },
    provenance: 'Written for this example.',
  },
  {
    id: 'tariff',
    title: 'A tariff answer that uses the rate from an older HTS revision',
    args: {
      question: 'What is the general rate of duty under heading 9903.81.87 for goods entered on June 10, 2025?',
      answer: 'The general rate of duty under heading 9903.81.87 is the duty provided in the applicable subheading + 25%.',
      sources: [
        {
          id: 'hts-9903.81.87',
          title: '2025 HTS Revision 14 (in force 2025-06-06 to 2025-06-20), heading 9903.81.87',
          text: 'HTSUS 9903.81.87 (2025 HTS Revision 14, in force from 2025-06-06): Except for derivative iron or steel products described in headings 9903.81.89, 9903.81.90 or 9903.81.91, products of iron or steel provided for in the tariff headings or subheadings enumerated in subdivision (j) of note 16 to this subchapter. General rate of duty: The duty provided in the applicable subheading + 50%.',
        },
      ],
    },
    expect: { release: 'revise', names: ['+ 50%'] },
    provenance: 'USITC Harmonized Tariff Schedule, 2025 Revision 14, heading 9903.81.87 (the previous revision, 13, read "+ 25%"). Public domain.',
  },
  {
    id: 'medicare',
    title: 'A Medicare coverage answer that drops the documentation requirement',
    args: {
      question: 'Does Medicare cover a CGM for a beneficiary with problematic hypoglycemia?',
      answer: 'A CGM is covered if the beneficiary has a history of problematic hypoglycemia.',
      sources: [
        {
          id: 'lcd-l33822-criterion-4',
          title: 'Glucose Monitors LCD (L33822), coverage criterion 4, as quoted in the Noridian DME MAC clinician checklist (updated 12/3/2025)',
          text: '4. The beneficiary for whom a CGM is being prescribed, to improve glycemic control, meets at least one of the criteria below: A. The beneficiary is insulin-treated; or B. The beneficiary has a history of problematic hypoglycemia with documentation of at least one of the following: Recurrent (more than one) level 2 hypoglycemic events (glucose <54mg/dL (3.0mmol/L)) that persist despite multiple (more than one) attempts to adjust medication(s) and/or modify the diabetes treatment plan; or A history of one level 3 hypoglycemic event (glucose <54mg/dL (3.0mmol/L)) characterized by altered mental and/or physical state requiring third-party assistance for treatment of hypoglycemia.',
        },
      ],
    },
    expect: { release: 'revise', names: ['level 2 hypoglycemic events'] },
    provenance: 'CMS Local Coverage Determination L33822 (Glucose Monitors), criterion 4, verbatim from the Noridian Healthcare Solutions clinician checklist for CGMs. Not medical or coverage advice.',
  },
];

export const DEMO_INPUT_HASHES: ReadonlySet<string> = new Set(EXAMPLES.map((e) => inputHash(e.args)));

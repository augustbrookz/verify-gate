/** Display helpers with no Node dependencies (also used by the website's in-browser demo). */

/**
 * The part of a dropped source phrase the statement really lacks: leading words the statement
 * already contains are trimmed ("within 30 days for unopened items" against "…within 30 days."
 * → "for unopened items").
 */
export function missingPart(statement: string, sourceText: string): string {
  const norm = (x: string) => x.toLowerCase().replace(/[^\p{L}\p{N}$%]+/gu, ' ').trim();
  const have = ` ${norm(statement)} `;
  const words = sourceText.trim().split(/\s+/);
  let k = 0;
  while (k < words.length - 1 && have.includes(` ${norm(words.slice(0, k + 1).join(' '))} `)) k++;
  return words.slice(k).join(' ');
}

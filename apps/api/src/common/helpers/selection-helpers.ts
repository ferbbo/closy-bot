/**
 * PR-04.0 — selection-helpers
 * REQ-09, REQ-10: Helpers for numbered list formatting and numeric input parsing.
 * AC-08, AC-09
 */

/** Emoji digits 1–9 for WhatsApp-friendly numbered lists */
const EMOJI_DIGITS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];

/**
 * REQ-09 / AC-08: Format an array of strings as a numbered WhatsApp list.
 * Each item is prefixed with its corresponding emoji digit (1️⃣…9️⃣).
 * Items beyond 9 fall back to plain "N. item" format.
 *
 * @example
 * formatNumberedList(["A", "B", "C"])
 * // → "1️⃣ A\n2️⃣ B\n3️⃣ C"
 */
export function formatNumberedList(items: string[]): string {
  return items
    .map((item, index) => {
      const prefix = EMOJI_DIGITS[index] ?? `${index + 1}.`;
      return `${prefix} ${item}`;
    })
    .join('\n');
}

/**
 * REQ-10 / AC-09: Parse user text input as an integer selection in range [1, max].
 * Trims whitespace. Rejects decimals, non-numeric strings, 0, and out-of-range values.
 *
 * @returns The parsed integer, or null if invalid.
 *
 * @example
 * parseNumericSelection("2", 5)   // → 2
 * parseNumericSelection(" 3 ", 5) // → 3 (trimmed)
 * parseNumericSelection("0", 5)   // → null (below range)
 * parseNumericSelection("6", 5)   // → null (above range)
 * parseNumericSelection("hola", 5)// → null (not numeric)
 * parseNumericSelection("1.5", 5) // → null (decimal)
 */
export function parseNumericSelection(text: string, max: number): number | null {
  const trimmed = text.trim();

  // Must be only digits (no decimal, no sign, no spaces within)
  if (!/^\d+$/.test(trimmed)) return null;

  const n = parseInt(trimmed, 10);

  if (n < 1 || n > max) return null;

  return n;
}

/**
 * PR-04.0 — selection-helpers unit tests
 * AC-08: formatNumberedList
 * AC-09: parseNumericSelection
 */

import { formatNumberedList, parseNumericSelection } from './selection-helpers';

describe('AC-08: formatNumberedList', () => {
  it('should return empty string for empty array', () => {
    expect(formatNumberedList([])).toBe('');
  });

  it('should format a single item with emoji 1️⃣', () => {
    expect(formatNumberedList(['Alpha'])).toBe('1️⃣ Alpha');
  });

  it('should format 3 items with emojis 1️⃣–3️⃣', () => {
    expect(formatNumberedList(['A', 'B', 'C'])).toBe('1️⃣ A\n2️⃣ B\n3️⃣ C');
  });

  it('should format 5 items with correct emojis', () => {
    const items = ['Uno', 'Dos', 'Tres', 'Cuatro', 'Cinco'];
    const result = formatNumberedList(items);
    expect(result).toBe('1️⃣ Uno\n2️⃣ Dos\n3️⃣ Tres\n4️⃣ Cuatro\n5️⃣ Cinco');
  });

  it('should format 9 items using all emoji digits', () => {
    const items = Array.from({ length: 9 }, (_, i) => `Item ${i + 1}`);
    const result = formatNumberedList(items);
    expect(result).toContain('1️⃣ Item 1');
    expect(result).toContain('9️⃣ Item 9');
  });

  it('should fall back to plain number for items beyond index 9', () => {
    const items = Array.from({ length: 10 }, (_, i) => `Item ${i + 1}`);
    const result = formatNumberedList(items);
    expect(result).toContain('10. Item 10');
  });
});

describe('AC-09: parseNumericSelection', () => {
  it('should return a valid integer within range', () => {
    expect(parseNumericSelection('2', 5)).toBe(2);
  });

  it('should accept a valid number with surrounding spaces', () => {
    expect(parseNumericSelection(' 3 ', 5)).toBe(3);
  });

  it('should accept boundary value 1', () => {
    expect(parseNumericSelection('1', 5)).toBe(1);
  });

  it('should accept boundary value equal to max', () => {
    expect(parseNumericSelection('5', 5)).toBe(5);
  });

  it('should return null for 0 (below valid range)', () => {
    expect(parseNumericSelection('0', 5)).toBeNull();
  });

  it('should return null for value above max', () => {
    expect(parseNumericSelection('6', 5)).toBeNull();
  });

  it('should return null for non-numeric text', () => {
    expect(parseNumericSelection('hola', 5)).toBeNull();
  });

  it('should return null for decimal input', () => {
    expect(parseNumericSelection('1.5', 5)).toBeNull();
  });

  it('should return null for empty string', () => {
    expect(parseNumericSelection('', 5)).toBeNull();
  });

  it('should return null for mixed alphanumeric input', () => {
    expect(parseNumericSelection('2a', 5)).toBeNull();
  });
});

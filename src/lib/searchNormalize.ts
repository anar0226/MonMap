// Cyrillic → Latin transliteration for bilingual search.
// Digraphs must come before single chars to avoid double-substitution.
const CYR_TO_LAT: [RegExp, string][] = [
  [/щ/g, 'shch'], [/ш/g, 'sh'], [/ч/g, 'ch'], [/ц/g, 'ts'],
  [/ю/g, 'yu'],   [/я/g, 'ya'], [/ё/g, 'yo'],
  [/а/g, 'a'], [/б/g, 'b'], [/в/g, 'v'], [/г/g, 'g'], [/д/g, 'd'],
  [/е/g, 'e'], [/ж/g, 'j'], [/з/g, 'z'], [/и/g, 'i'], [/й/g, 'y'],
  [/к/g, 'k'], [/л/g, 'l'], [/м/g, 'm'], [/н/g, 'n'], [/о/g, 'o'],
  [/ө/g, 'o'], [/п/g, 'p'], [/р/g, 'r'], [/с/g, 's'], [/т/g, 't'],
  [/у/g, 'u'], [/ү/g, 'u'], [/ф/g, 'f'], [/х/g, 'h'], [/ъ/g, ''],
  [/ы/g, 'i'], [/ь/g, ''],  [/э/g, 'e'],
];

/**
 * Normalize a string for substring search across Cyrillic + Latin input.
 * Lowercases, transliterates Cyrillic to Latin, folds "kh" → "h" so
 * "Khan" and "Хаан" both reduce to the same "haan"-derived form, then
 * collapses non-alphanumeric runs to single spaces.
 */
export function normalizeForSearch(s: string): string {
  let r = s.toLowerCase();
  for (const [from, to] of CYR_TO_LAT) r = r.replace(from, to);
  r = r.replace(/kh/g, 'h');
  return r.replace(/[^a-z0-9]+/g, ' ').trim();
}

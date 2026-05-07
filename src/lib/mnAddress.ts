/**
 * Mongolian address parser/formatter.
 *
 * Mongolian addresses in Ulaanbaatar are stylized:
 *   "Сүхбаатар дүүрэг, 1-р хороо, 5-р хороолол, 23-р байр, 2-р хаалга, 45 тоот"
 *
 * Components, in widening-to-narrowing order:
 *   дүүрэг   — district (9 in UB)
 *   хороо    — administrative subdistrict (numbered, ~150 in UB)
 *   хороолол — colloquial microdistrict (numbered or named)
 *   байр     — building number
 *   хаалга   — entrance / stairwell
 *   тоот     — apartment unit
 *
 * Pure functions, no React/RN imports — also used by Node backfill scripts.
 */

import { normalizeForSearch } from './searchNormalize';

export interface MnAddressParts {
  district?: string;
  khoroo?: number;
  khoroolol?: string;
  buildingNumber?: string;
  entranceNumber?: number;
  unitNumber?: string;
}

// ── District table (UB) ──────────────────────────────────────────────────────

const DISTRICT_NAMES: string[] = [
  'Сүхбаатар',
  'Чингэлтэй',
  'Баянзүрх',
  'Хан-Уул',
  'Сонгинохайрхан',
  'Баянгол',
  'Налайх',
  'Багануур',
  'Багахангай',
];

const DISTRICT_ABBR: Record<string, string> = {
  'сбд': 'Сүхбаатар',
  'чд':  'Чингэлтэй',
  'бзд': 'Баянзүрх',
  'худ': 'Хан-Уул',
  'схд': 'Сонгинохайрхан',
  'бгд': 'Баянгол',
  'нд':  'Налайх',
  'бнд': 'Багануур',
  'бхд': 'Багахангай',
};

// Lowercased name → canonical capitalized form. Built once.
const DISTRICT_LOWER: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const n of DISTRICT_NAMES) m[n.toLowerCase()] = n;
  return m;
})();

// ── Patterns ─────────────────────────────────────────────────────────────────
// Operate on a lowercased copy of the input; "р" includes Latin "p" since users
// (and Google) sometimes substitute. Hyphen between number and "р" is optional.

const RE_KHOROO       = /(\d{1,3})\s*-?\s*[рp]?\s*хороо(?!лол)/;
const RE_KHOROOLOL_N  = /(\d{1,3})\s*-?\s*[рp]?\s*хороолол/;
const RE_KHOROOLOL_S  = /([а-яөү][а-яөү\-]+)\s+(хороолол|хотхон)/;
const RE_BUILDING     = /(\d{1,4}[а-яөү]?)\s*-?\s*[рp]?\s*байр/;
const RE_ENTRANCE     = /(\d{1,2})\s*-?\s*[рp]?\s*хаалга/;
const RE_UNIT         = /(\d{1,4}[а-яөү]?)\s*тоот/;

// District abbreviation as standalone token (word boundaries).
const RE_DISTRICT_ABBR = /(?:^|[^а-яөү])(сбд|чд|бзд|худ|схд|бгд|нд|бнд|бхд)(?![а-яөү])/;

function capitalizeWords(s: string): string {
  return s.replace(/(^|[\s\-])([а-яөү])/g, (_, sep, c) => sep + c.toUpperCase());
}

/**
 * Parse a free-text Mongolian address into its structured parts.
 * Returns an empty object if no recognizable tokens are found —
 * never throws.
 */
export function parseMnAddress(text: string | null | undefined): MnAddressParts {
  if (!text) return {};
  const lower = text.toLowerCase();
  const out: MnAddressParts = {};

  // District: full names first (longest match wins to avoid "Баянгол" inside "Баянголын"-like substrings)
  for (const lc of Object.keys(DISTRICT_LOWER).sort((a, b) => b.length - a.length)) {
    if (lower.includes(lc)) {
      out.district = DISTRICT_LOWER[lc];
      break;
    }
  }
  if (!out.district) {
    const m = lower.match(RE_DISTRICT_ABBR);
    if (m) out.district = DISTRICT_ABBR[m[1]];
  }

  const mKhoroo = lower.match(RE_KHOROO);
  if (mKhoroo) {
    const n = parseInt(mKhoroo[1], 10);
    if (n > 0 && n < 1000) out.khoroo = n;
  }

  const mKhN = lower.match(RE_KHOROOLOL_N);
  if (mKhN) {
    out.khoroolol = `${parseInt(mKhN[1], 10)}-р хороолол`;
  } else {
    const mKhS = lower.match(RE_KHOROOLOL_S);
    if (mKhS) {
      out.khoroolol = `${capitalizeWords(mKhS[1])} ${mKhS[2]}`;
    }
  }

  const mBldg = lower.match(RE_BUILDING);
  if (mBldg) out.buildingNumber = mBldg[1].toUpperCase();

  const mEntr = lower.match(RE_ENTRANCE);
  if (mEntr) {
    const n = parseInt(mEntr[1], 10);
    if (n > 0 && n < 100) out.entranceNumber = n;
  }

  const mUnit = lower.match(RE_UNIT);
  if (mUnit) out.unitNumber = mUnit[1].toUpperCase();

  return out;
}

/**
 * Render structured parts as a Mongolian-readable address string.
 * Returns '' when nothing is set, so callers can `formatMnAddress(p) || fallback`.
 *
 * - Default form:  "Сүхбаатар, 1-р хороо, 5-р хороолол, 23-р байр, 2-р хаалга, 45 тоот"
 * - short=true:    "5-р хороолол, 23-р байр"  (drops district + хороо)
 */
export function formatMnAddress(
  p: MnAddressParts,
  opts: { short?: boolean } = {},
): string {
  const parts: string[] = [];
  if (!opts.short && p.district) parts.push(p.district);
  if (!opts.short && p.khoroo) parts.push(`${p.khoroo}-р хороо`);
  if (p.khoroolol) parts.push(p.khoroolol);
  if (p.buildingNumber) parts.push(`${p.buildingNumber}-р байр`);
  if (p.entranceNumber) parts.push(`${p.entranceNumber}-р хаалга`);
  if (p.unitNumber) parts.push(`${p.unitNumber} тоот`);
  return parts.join(', ');
}

/**
 * Build a normalized search blob combining the structured parts and the
 * original free-text. Stored in `places.address_searchable` so that a query
 * like "5-р хороолол 23 байр" matches via simple substring after running
 * through normalizeForSearch on both sides.
 */
export function normalizeAddressForSearch(
  p: MnAddressParts,
  original?: string | null,
): string {
  const tokens: string[] = [];
  if (p.district) tokens.push(p.district);
  if (p.khoroo) tokens.push(`${p.khoroo}-р хороо`);
  if (p.khoroolol) tokens.push(p.khoroolol);
  if (p.buildingNumber) tokens.push(`${p.buildingNumber}-р байр`, `${p.buildingNumber} байр`);
  if (p.entranceNumber) tokens.push(`${p.entranceNumber}-р хаалга`);
  if (p.unitNumber) tokens.push(`${p.unitNumber} тоот`);
  if (original) tokens.push(original);
  return normalizeForSearch(tokens.join(' '));
}

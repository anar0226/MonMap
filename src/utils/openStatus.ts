import type { Place } from '../types/place';
import { getHolidayWindow } from '../constants/mongolianHolidays';

// A crowd signal (open confirmation or closure report) younger than this keeps
// the badge fully opaque. Older than this and the badge degrades to "unverified".
const STALE_DAYS = 45;

export type OpenStatusKind =
  | 'open'          // fresh + open_now = true
  | 'closed'        // fresh + open_now = false
  | 'holiday'       // within a holiday window
  | 'stale_open'    // stale + open_now = true
  | 'stale_closed'  // stale + open_now = false
  | 'stale_unknown' // stale + no open_now data
  | 'unknown';      // no hours data at all → hide badge

export interface OpenStatus {
  kind: OpenStatusKind;
  label: string;
  holidayName?: string; // set when kind === 'holiday'
  badgeBg: string;
  textColor: string;
}

export function getOpenStatus(place: Place, now = new Date()): OpenStatus {
  const openNow = place.current_opening_hours?.open_now;
  const hasHours = openNow !== undefined;

  // 1. Holiday window takes precedence — we can't trust regular hours on these days.
  const holiday = getHolidayWindow(now);
  if (holiday && hasHours) {
    return {
      kind: 'holiday',
      label: 'БАЯРЫН ӨДӨР',
      holidayName: holiday.name,
      badgeBg: 'rgba(251,184,36,0.15)',
      textColor: '#FBB824',
    };
  }

  // 2. Staleness check.
  const verifiedAt = place.hours_verified_at ? new Date(place.hours_verified_at) : null;
  const isStale = !verifiedAt
    || (now.getTime() - verifiedAt.getTime()) > STALE_DAYS * 24 * 60 * 60 * 1000;

  if (isStale) {
    if (openNow === true) {
      return {
        kind: 'stale_open',
        label: 'НЭЭЛТТЭЙ',
        badgeBg: 'rgba(16,185,129,0.07)',
        textColor: 'rgba(16,185,129,0.55)',
      };
    }
    if (openNow === false) {
      return {
        kind: 'stale_closed',
        label: 'ХААЛТТАЙ',
        badgeBg: 'rgba(239,68,68,0.07)',
        textColor: 'rgba(239,68,68,0.55)',
      };
    }
    return {
      kind: 'stale_unknown',
      label: 'ЦАГ БАТАЛГААЖААГҮЙ',
      badgeBg: 'rgba(255,255,255,0.07)',
      textColor: 'rgba(255,255,255,0.30)',
    };
  }

  // 3. Fresh data.
  if (openNow === true) {
    return {
      kind: 'open',
      label: 'НЭЭЛТТЭЙ',
      badgeBg: 'rgba(16,185,129,0.12)',
      textColor: '#10B981',
    };
  }
  if (openNow === false) {
    return {
      kind: 'closed',
      label: 'ХААЛТТАЙ',
      badgeBg: 'rgba(239,68,68,0.12)',
      textColor: '#EF4444',
    };
  }

  return {
    kind: 'unknown',
    label: 'ЦАГ МЭДЭГДЭХГҮЙ',
    badgeBg: 'rgba(255,255,255,0.07)',
    textColor: 'rgba(255,255,255,0.35)',
  };
}

export function isStaleStatus(kind: OpenStatusKind): boolean {
  return kind === 'stale_open' || kind === 'stale_closed' || kind === 'stale_unknown';
}

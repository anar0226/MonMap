// Mongolian public holidays.
// Fixed-date holidays are expressed as { month, day } pairs (month is 1-based).
// Tsagaan Sar (lunar) is hardcoded per year and must be updated annually.
// windowDays: how many days before the start and after the end to extend the warning.

export interface HolidayWindow {
  name: string;
  nameEn: string;
}

interface FixedHoliday {
  name: string;
  nameEn: string;
  month: number;
  startDay: number;
  endDay: number;
  windowDays?: number;
}

interface LunarHoliday {
  name: string;
  nameEn: string;
  year: number;
  month: number;  // Gregorian month of first day (1-based)
  startDay: number;
  endDay: number;
  windowDays?: number;
}

const FIXED_HOLIDAYS: FixedHoliday[] = [
  { name: 'Шинэ жил', nameEn: 'New Year', month: 1, startDay: 1, endDay: 1, windowDays: 1 },
  { name: 'Эмэгтэйчүүдийн баяр', nameEn: "Women's Day", month: 3, startDay: 8, endDay: 8 },
  { name: 'Хүүхдийн баяр', nameEn: "Children's Day", month: 6, startDay: 1, endDay: 1 },
  // Naadam: Jul 11–13 official; extend window to catch the long weekend
  { name: 'Наадам', nameEn: 'Naadam', month: 7, startDay: 11, endDay: 13, windowDays: 2 },
  { name: 'Тусгаар тогтнолын өдөр', nameEn: 'Independence Day', month: 11, startDay: 26, endDay: 26 },
];

// Update Tsagaan Sar first day each year (Mongolian lunar calendar).
// Dates below are the first day of the 3-day holiday.
const TSAGAAN_SAR: LunarHoliday[] = [
  { name: 'Цагаан Сар', nameEn: 'Tsagaan Sar', year: 2026, month: 2, startDay: 17, endDay: 19, windowDays: 2 },
  { name: 'Цагаан Сар', nameEn: 'Tsagaan Sar', year: 2027, month: 2, startDay: 7,  endDay: 9,  windowDays: 2 },
];

export function getHolidayWindow(date: Date): HolidayWindow | null {
  const y = date.getFullYear();
  const m = date.getMonth() + 1; // 1-based
  const d = date.getDate();

  for (const h of FIXED_HOLIDAYS) {
    const w = h.windowDays ?? 0;
    // Build window start/end as absolute day-of-year offsets isn't clean across month
    // boundaries, so compare by building Date objects for start and end.
    const windowStart = new Date(y, h.month - 1, h.startDay - w);
    const windowEnd   = new Date(y, h.month - 1, h.endDay + w);
    const check       = new Date(y, m - 1, d);
    if (check >= windowStart && check <= windowEnd) {
      return { name: h.name, nameEn: h.nameEn };
    }
  }

  for (const h of TSAGAAN_SAR) {
    if (h.year !== y) continue;
    const w = h.windowDays ?? 0;
    const windowStart = new Date(y, h.month - 1, h.startDay - w);
    const windowEnd   = new Date(y, h.month - 1, h.endDay + w);
    const check       = new Date(y, m - 1, d);
    if (check >= windowStart && check <= windowEnd) {
      return { name: h.name, nameEn: h.nameEn };
    }
  }

  return null;
}

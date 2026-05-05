// Transport modes shown in the directions panel.
// Pricing constants reflect publicly-known Ulaanbaatar rates as of 2025-2026.
// They are estimates — actual fares vary by surge, time-of-day, and operator changes.

export type TransportMode =
  | 'driving'
  | 'transit'
  | 'ubcab'
  | 'aba'
  | 'escooter'
  | 'walking';

export interface ModeMeta {
  key: TransportMode;
  label: string;
  shortLabel: string;
  icon: string;
  color: string;
  hasNavigation: boolean;
  mapboxProfile: 'driving-traffic' | 'walking' | 'cycling' | null;
}

export const MODES: ModeMeta[] = [
  {
    key: 'driving',
    label: 'Машинаар',
    shortLabel: 'Машин',
    icon: 'car',
    color: '#1a6fc4',
    hasNavigation: true,
    mapboxProfile: 'driving-traffic',
  },
  {
    key: 'transit',
    label: 'Нийтийн тээвэр',
    shortLabel: 'Автобус',
    icon: 'bus',
    color: '#10B981',
    hasNavigation: false,
    mapboxProfile: null,
  },
  {
    key: 'ubcab',
    label: 'UBCab такси',
    shortLabel: 'UBCab',
    icon: 'car-sport',
    color: '#FBB824',
    hasNavigation: false,
    mapboxProfile: null,
  },
  {
    key: 'aba',
    label: 'ABA такси',
    shortLabel: 'ABA',
    icon: 'car-sport',
    color: '#F59E0B',
    hasNavigation: false,
    mapboxProfile: null,
  },
  {
    key: 'escooter',
    label: 'Цахилгаан скүүтер',
    shortLabel: 'Скүүтер',
    icon: 'flash',
    color: '#A78BFA',
    hasNavigation: true,
    mapboxProfile: 'cycling',
  },
  {
    key: 'walking',
    label: 'Явганаар',
    shortLabel: 'Явган',
    icon: 'walk',
    color: '#0EA5E9',
    hasNavigation: true,
    mapboxProfile: 'walking',
  },
];

export const MODE_BY_KEY: Record<TransportMode, ModeMeta> = MODES.reduce(
  (acc, m) => {
    acc[m.key] = m;
    return acc;
  },
  {} as Record<TransportMode, ModeMeta>,
);

export interface PriceEstimate {
  amountMnt: number;
  label: string;
  approximate: boolean;
}

// UBCab: ≈ 1500₮ initial + 1500₮/km
export function ubcabPrice(distanceMeters: number): PriceEstimate {
  const km = distanceMeters / 1000;
  const fare = 1500 + km * 1500;
  const rounded = Math.round(fare / 100) * 100;
  return { amountMnt: rounded, label: `~${formatMnt(rounded)}`, approximate: true };
}

// ABA: ≈ 1200₮ initial + 1300₮/km
export function abaPrice(distanceMeters: number): PriceEstimate {
  const km = distanceMeters / 1000;
  const fare = 1200 + km * 1300;
  const rounded = Math.round(fare / 100) * 100;
  return { amountMnt: rounded, label: `~${formatMnt(rounded)}`, approximate: true };
}

// E-scooter: ≈ 500₮ unlock + 180₮/min
export function escooterPrice(durationSeconds: number): PriceEstimate {
  const minutes = durationSeconds / 60;
  const fare = 500 + minutes * 180;
  const rounded = Math.round(fare / 100) * 100;
  return { amountMnt: rounded, label: `~${formatMnt(rounded)}`, approximate: true };
}

// Public transport in UB: flat 500₮ U-money fare
export function transitPrice(): PriceEstimate {
  return { amountMnt: 500, label: '500₮', approximate: false };
}

export function walkingPrice(): PriceEstimate {
  return { amountMnt: 0, label: 'Үнэгүй', approximate: false };
}

function formatMnt(amount: number): string {
  return `${amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}₮`;
}

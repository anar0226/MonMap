export interface Maneuver {
  type: string;
  modifier?: string;
  instruction?: string;
  location: [number, number];
  bearing_before?: number;
  bearing_after?: number;
  exit?: number;
}

export interface NavStep {
  maneuver: Maneuver;
  name: string;
  distance: number;
  duration: number;
  geometry: { type: 'LineString'; coordinates: [number, number][] };
}

const TURN: Record<string, string> = {
  left: 'зүүн тийш эргэнэ',
  right: 'баруун тийш эргэнэ',
  'sharp left': 'эрс зүүн тийш эргэнэ',
  'sharp right': 'эрс баруун тийш эргэнэ',
  'slight left': 'бага зэрэг зүүн тийш эргэнэ',
  'slight right': 'бага зэрэг баруун тийш эргэнэ',
  straight: 'шууд үргэлжлүүлнэ',
  uturn: 'буцаж эргэнэ',
};

const FORK: Record<string, string> = {
  left: 'зүүн салаагаар үргэлжлүүлнэ',
  right: 'баруун салаагаар үргэлжлүүлнэ',
  'slight left': 'зүүн салаагаар үргэлжлүүлнэ',
  'slight right': 'баруун салаагаар үргэлжлүүлнэ',
  straight: 'шууд үргэлжлүүлнэ',
};

export function translateManeuver(m: Maneuver, streetName: string): string {
  const street = streetName?.trim();
  const onStreet = street ? ` ${street} рүү` : '';

  switch (m.type) {
    case 'depart':
      return street ? `${street}-аар хөдөлнө` : 'Замаар хөдөлнө';
    case 'arrive':
      return 'Хүрэх газартаа хүрлээ';
    case 'turn': {
      const phrase = TURN[m.modifier ?? ''] ?? 'эргэнэ';
      return street ? `${phrase}${onStreet}` : phrase;
    }
    case 'continue':
      return street ? `${street}-аар үргэлжлүүлнэ` : 'Шууд үргэлжлүүлнэ';
    case 'merge':
      return street ? `${street} руу нэгдэнэ` : 'Замд нэгдэнэ';
    case 'on ramp':
    case 'on_ramp':
      return 'Гарам дээр гарна';
    case 'off ramp':
    case 'off_ramp':
      return 'Гарамаар буух';
    case 'fork':
      return FORK[m.modifier ?? ''] ?? 'Салаагаар үргэлжлүүлнэ';
    case 'end of road':
    case 'end_of_road': {
      const phrase = TURN[m.modifier ?? ''] ?? 'эргэнэ';
      return `Замын төгсгөлд ${phrase}`;
    }
    case 'roundabout':
    case 'rotary':
      return m.exit
        ? `Тойргоор ${m.exit}-р гарцаар гарна`
        : 'Тойргоор үргэлжлүүлнэ';
    case 'exit roundabout':
    case 'exit_roundabout':
    case 'exit rotary':
    case 'exit_rotary':
      return 'Тойргоос гарна';
    case 'new name':
    case 'new_name':
      return street ? `${street}-аар үргэлжлүүлнэ` : 'Үргэлжлүүлнэ';
    case 'notification':
      return m.instruction ?? 'Үргэлжлүүлнэ';
    default:
      return m.instruction ?? 'Үргэлжлүүлнэ';
  }
}

export function maneuverIcon(m: Maneuver): string {
  switch (m.type) {
    case 'arrive': return 'flag';
    case 'depart': return 'navigate';
    case 'roundabout':
    case 'rotary':
    case 'exit roundabout':
    case 'exit_roundabout':
      return 'reload-circle-outline';
    case 'merge': return 'git-merge-outline';
    case 'on_ramp':
    case 'on ramp':
    case 'off_ramp':
    case 'off ramp':
      return 'trending-up-outline';
    case 'fork':
      return m.modifier?.includes('left') ? 'git-branch-outline' : 'git-branch-outline';
    case 'turn':
    case 'end of road':
    case 'end_of_road': {
      const mod = m.modifier ?? 'straight';
      if (mod === 'uturn') return 'arrow-undo';
      if (mod.includes('sharp left')) return 'return-up-back';
      if (mod.includes('sharp right')) return 'return-up-forward';
      if (mod.includes('left')) return 'arrow-back';
      if (mod.includes('right')) return 'arrow-forward';
      return 'arrow-up';
    }
    case 'continue':
    case 'new name':
    case 'new_name':
    default:
      return 'arrow-up';
  }
}

export function distanceMeters(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export function formatDistanceMn(m: number): string {
  if (m < 50)   return `${Math.round(m / 10) * 10} метр`;
  if (m < 1000) return `${Math.round(m / 50) * 50} метр`;
  const km = m / 1000;
  return km < 10 ? `${km.toFixed(1)} километр` : `${Math.round(km)} километр`;
}

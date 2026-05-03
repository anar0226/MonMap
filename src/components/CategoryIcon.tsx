import React from 'react';
import { View } from 'react-native';
import Svg, { G, Path, Line, Rect, Circle, Polygon } from 'react-native-svg';
import { categoryColor } from '../constants/categories';

// ── Icon paths — 24×24 viewBox, stroke-based, white ──────────────────────────
// All icons share: stroke="white" strokeLinecap="round" strokeLinejoin="round" fill="none"
// unless a specific element uses fill="white" (e.g. filled dots/polygons).

type IconProps = { sw?: number };

const icons: Record<string, React.FC<IconProps>> = {
  restaurant: ({ sw = 1.7 }) => (
    <>
      <Line x1="8" y1="3" x2="8" y2="13" strokeWidth={sw} />
      <Path d="M5 5 C5 5 5 9 8 9 C11 9 11 5 11 5" strokeWidth={sw} />
      <Line x1="8" y1="13" x2="8" y2="21" strokeWidth={sw} />
      <Line x1="15" y1="3" x2="15" y2="21" strokeWidth={sw} />
      <Path d="M13 3 L13 10 L17 10 L17 3" strokeWidth={sw} />
    </>
  ),

  cafe: ({ sw = 1.7 }) => (
    <>
      <Path d="M6 3 L6 14 C6 16.2 7.8 18 10 18 C12.2 18 14 16.2 14 14 L14 3" strokeWidth={sw} />
      <Path d="M14 7 L16 7 C17.1 7 18 7.9 18 9 C18 10.1 17.1 11 16 11 L14 11" strokeWidth={sw} />
      <Line x1="7" y1="21" x2="13" y2="21" strokeWidth={sw} />
      <Line x1="10" y1="18" x2="10" y2="21" strokeWidth={sw} />
    </>
  ),

  bar: ({ sw = 1.7 }) => (
    <>
      <Path d="M5 3 L19 3 L13 11 L13 20 L11 20 L11 11 Z" strokeWidth={sw} />
      <Line x1="8" y1="21" x2="16" y2="21" strokeWidth={sw} />
    </>
  ),

  bakery: ({ sw = 1.7 }) => (
    <>
      <Path d="M12 3 C8.7 3 6 5.7 6 9 C6 10.6 6.6 12 7.6 13.1 L7 20 L17 20 L16.4 13.1 C17.4 12 18 10.6 18 9 C18 5.7 15.3 3 12 3 Z" strokeWidth={sw} />
      <Line x1="7" y1="21" x2="17" y2="21" strokeWidth={sw} />
      <Path d="M9 9 C9 9 9 11 12 11 C15 11 15 9 15 9" strokeWidth={1.4} />
    </>
  ),

  grocery_or_supermarket: ({ sw = 1.7 }) => (
    <>
      <Path d="M3 5 L5 5 L7 15 L19 15 L21 8 L7 8" strokeWidth={sw} />
      <Circle cx="9" cy="19" r="1.5" fill="white" stroke="none" />
      <Circle cx="17" cy="19" r="1.5" fill="white" stroke="none" />
    </>
  ),

  convenience_store: ({ sw = 1.7 }) => (
    <>
      <Rect x="4" y="8" width="16" height="13" rx="1.5" strokeWidth={sw} />
      <Path d="M4 8 L8 3 L16 3 L20 8" strokeWidth={sw} />
      <Rect x="9" y="14" width="6" height="7" rx="1" strokeWidth={1.4} />
      <Line x1="8" y1="12" x2="8" y2="14" strokeWidth={1.4} />
      <Line x1="16" y1="12" x2="16" y2="14" strokeWidth={1.4} />
    </>
  ),

  shopping_mall: ({ sw = 1.7 }) => (
    <>
      <Rect x="3" y="9" width="18" height="12" rx="1.5" strokeWidth={sw} />
      <Path d="M3 9 L6 4 L18 4 L21 9" strokeWidth={sw} />
      <Line x1="9" y1="9" x2="9" y2="21" strokeWidth={1.4} />
      <Line x1="15" y1="9" x2="15" y2="21" strokeWidth={1.4} />
      <Line x1="3" y1="15" x2="21" y2="15" strokeWidth={1.4} />
    </>
  ),

  clothing_store: ({ sw = 1.7 }) => (
    <Path d="M8 3 L3 8 L6 10 L6 21 L18 21 L18 10 L21 8 L16 3 C16 3 14.5 6 12 6 C9.5 6 8 3 8 3 Z" strokeWidth={sw} />
  ),

  beauty_salon: ({ sw = 1.7 }) => (
    <>
      <Path d="M12 3 C12 3 8 6 8 10 C8 12.2 9.8 14 12 14 C14.2 14 16 12.2 16 10 C16 6 12 3 12 3 Z" strokeWidth={sw} />
      <Line x1="12" y1="14" x2="12" y2="21" strokeWidth={sw} />
      <Line x1="9" y1="18" x2="15" y2="18" strokeWidth={sw} />
      <Path d="M9 10 C9 10 10 12 12 12 C14 12 15 10 15 10" strokeWidth={1.3} />
    </>
  ),

  hair_care: ({ sw = 1.7 }) => (
    <>
      <Path d="M7 3 C7 3 5 7 6 11 C6.7 13.6 9 15 9 15 L9 21" strokeWidth={sw} />
      <Path d="M17 3 C17 3 19 7 18 11 C17.3 13.6 15 15 15 15 L15 21" strokeWidth={sw} />
      <Path d="M9 9 C9 9 10.5 11 12 11 C13.5 11 15 9 15 9" strokeWidth={1.5} />
      <Line x1="9" y1="18" x2="15" y2="18" strokeWidth={1.5} />
    </>
  ),

  spa: ({ sw = 1.7 }) => (
    <>
      <Path d="M12 20 C12 20 5 16 5 10 C5 7 7 5 9.5 5 C10.7 5 11.5 5.8 12 7 C12.5 5.8 13.3 5 14.5 5 C17 5 19 7 19 10 C19 16 12 20 12 20 Z" strokeWidth={sw} />
      <Path d="M12 7 C12 7 12 12 12 20" strokeWidth={1.3} strokeOpacity={0.6} />
    </>
  ),

  gym: ({ sw = 1.7 }) => (
    <>
      <Line x1="2" y1="12" x2="22" y2="12" strokeWidth={sw} />
      <Line x1="6" y1="8" x2="6" y2="16" strokeWidth={2.5} />
      <Line x1="18" y1="8" x2="18" y2="16" strokeWidth={2.5} />
      <Line x1="3" y1="10" x2="3" y2="14" strokeWidth={2} />
      <Line x1="21" y1="10" x2="21" y2="14" strokeWidth={2} />
    </>
  ),

  pharmacy: ({ sw = 1.7 }) => (
    <>
      <Rect x="4" y="4" width="16" height="16" rx="2.5" strokeWidth={sw} />
      <Line x1="12" y1="8" x2="12" y2="16" strokeWidth={2} />
      <Line x1="8" y1="12" x2="16" y2="12" strokeWidth={2} />
    </>
  ),

  hospital: ({ sw = 1.7 }) => (
    <>
      <Path d="M12 3 C7.6 3 4 6.6 4 11 C4 16 12 21 12 21 C12 21 20 16 20 11 C20 6.6 16.4 3 12 3 Z" strokeWidth={sw} />
      <Line x1="12" y1="8" x2="12" y2="15" strokeWidth={1.8} />
      <Line x1="8.5" y1="11.5" x2="15.5" y2="11.5" strokeWidth={1.8} />
    </>
  ),

  doctor: ({ sw = 1.7 }) => (
    <>
      <Circle cx="12" cy="8" r="4" strokeWidth={sw} />
      <Path d="M4 21 C4 17.1 7.6 14 12 14 C16.4 14 20 17.1 20 21" strokeWidth={sw} />
      <Line x1="16" y1="10" x2="16" y2="15" strokeWidth={1.5} />
      <Line x1="13.5" y1="12.5" x2="18.5" y2="12.5" strokeWidth={1.5} />
    </>
  ),

  dentist: ({ sw = 1.7 }) => (
    <Path d="M8 3 C5.5 3 4 5 4 7 C4 9 5 10 5 12 C5 15 6 21 8 21 C10 21 10 17 12 17 C14 17 14 21 16 21 C18 21 19 15 19 12 C19 10 20 9 20 7 C20 5 18.5 3 16 3 C14.5 3 13.3 4 12 4 C10.7 4 9.5 3 8 3 Z" strokeWidth={sw} />
  ),

  bank: ({ sw = 1.7 }) => (
    <>
      <Polygon points="12,3 21,8 21,9 3,9 3,8" strokeWidth={sw} />
      <Line x1="6" y1="9" x2="6" y2="18" strokeWidth={sw} />
      <Line x1="10" y1="9" x2="10" y2="18" strokeWidth={sw} />
      <Line x1="14" y1="9" x2="14" y2="18" strokeWidth={sw} />
      <Line x1="18" y1="9" x2="18" y2="18" strokeWidth={sw} />
      <Line x1="3" y1="18" x2="21" y2="18" strokeWidth={sw} />
      <Line x1="3" y1="21" x2="21" y2="21" strokeWidth={2} />
    </>
  ),

  car_repair: ({ sw = 1.7 }) => (
    <>
      <Path d="M6 8 L4 12 L4 17 C4 17.6 4.4 18 5 18 L7 18 C7.6 18 8 17.6 8 17 L8 16 L16 16 L16 17 C16 17.6 16.4 18 17 18 L19 18 C19.6 18 20 17.6 20 17 L20 12 L18 8 Z" strokeWidth={sw} />
      <Line x1="4" y1="12" x2="20" y2="12" strokeWidth={1.4} />
      <Circle cx="7.5" cy="17.5" r="2" strokeWidth={1.4} />
      <Circle cx="16.5" cy="17.5" r="2" strokeWidth={1.4} />
      <Path d="M10 5 L14 5 M12 3 L12 7" strokeWidth={1.5} />
    </>
  ),

  gas_station: ({ sw = 1.7 }) => (
    <>
      <Rect x="3" y="6" width="12" height="15" rx="1.5" strokeWidth={sw} />
      <Line x1="3" y1="11" x2="15" y2="11" strokeWidth={1.4} />
      <Path d="M15 8 L17 8 C18.1 8 19 8.9 19 10 L19 14 C19 14.6 19.4 15 20 15 C20.6 15 21 14.6 21 14 L21 9 L19 7" strokeWidth={1.5} />
      <Line x1="7" y1="15" x2="11" y2="15" strokeWidth={1.5} />
    </>
  ),

  apartments: ({ sw = 1.7 }) => (
    <>
      <Rect x="4" y="3" width="16" height="18" rx="1" strokeWidth={sw} />
      <Rect x="7"  y="6"  width="3" height="3" strokeWidth={1.3} />
      <Rect x="14" y="6"  width="3" height="3" strokeWidth={1.3} />
      <Rect x="7"  y="11" width="3" height="3" strokeWidth={1.3} />
      <Rect x="14" y="11" width="3" height="3" strokeWidth={1.3} />
      <Rect x="10" y="16" width="4" height="5" strokeWidth={1.3} />
    </>
  ),

  school: ({ sw = 1.7 }) => (
    <>
      <Path d="M2 9 L12 4 L22 9 L12 14 Z" strokeWidth={sw} />
      <Path d="M6 11 L6 17 C6 17 8.5 19 12 19 C15.5 19 18 17 18 17 L18 11" strokeWidth={sw} />
      <Line x1="22" y1="9" x2="22" y2="14" strokeWidth={1.5} />
    </>
  ),

  university: ({ sw = 1.7 }) => (
    <>
      <Path d="M2 9 L12 4 L22 9 L12 14 Z" strokeWidth={sw} />
      <Path d="M6 11 L6 17 C6 17 8.5 19 12 19 C15.5 19 18 17 18 17 L18 11" strokeWidth={sw} />
      <Path d="M22 9 L22 15 L20 19" strokeWidth={1.5} />
    </>
  ),

  kindergarten: ({ sw = 1.7 }) => (
    <>
      <Rect x="3"  y="14" width="6" height="6" strokeWidth={sw} />
      <Rect x="9"  y="14" width="6" height="6" strokeWidth={sw} />
      <Rect x="15" y="14" width="6" height="6" strokeWidth={sw} />
      <Rect x="6"  y="8" width="6" height="6" strokeWidth={sw} />
      <Rect x="12" y="8" width="6" height="6" strokeWidth={sw} />
      <Rect x="9" y="2" width="6" height="6" strokeWidth={sw} />
    </>
  ),

  library: ({ sw = 1.7 }) => (
    <>
      <Rect x="4" y="4" width="3" height="16" strokeWidth={sw} />
      <Rect x="8" y="4" width="3" height="16" strokeWidth={sw} />
      <Path d="M13 5 L16 4 L19 5 L18 20 L14 20 Z" strokeWidth={sw} />
      <Line x1="4" y1="9" x2="11" y2="9" strokeWidth={1.3} />
    </>
  ),

  police: ({ sw = 1.7 }) => (
    <>
      <Path d="M12 3 L20 6 L20 12 C20 17 16 20 12 21 C8 20 4 17 4 12 L4 6 Z" strokeWidth={sw} />
      <Path d="M9 12 L11 14 L15 10" strokeWidth={1.8} />
    </>
  ),

  post_office: ({ sw = 1.7 }) => (
    <>
      <Rect x="3" y="6" width="18" height="13" rx="1" strokeWidth={sw} />
      <Path d="M3 7 L12 14 L21 7" strokeWidth={sw} />
    </>
  ),

  fire_station: ({ sw = 1.7 }) => (
    <Path d="M12 2 C12 2 8 7 8 11 C8 12 8.5 13 9 14 C9 12.5 10 11.5 11 11 C11 13 13 13 13 16 C13 18 11.5 19 10 19.5 C10.5 19.8 11 20 12 20 C16 20 18 16.5 18 13 C18 9 14 7 14 5 C14 7 12 8 12 5 C12 4 12 3 12 2 Z" strokeWidth={sw} />
  ),

  government: ({ sw = 1.7 }) => (
    <>
      <Path d="M3 9 L12 3 L21 9" strokeWidth={sw} />
      <Line x1="3"  y1="9"  x2="21" y2="9"  strokeWidth={sw} />
      <Line x1="6"  y1="9"  x2="6"  y2="18" strokeWidth={sw} />
      <Line x1="10" y1="9"  x2="10" y2="18" strokeWidth={sw} />
      <Line x1="14" y1="9"  x2="14" y2="18" strokeWidth={sw} />
      <Line x1="18" y1="9"  x2="18" y2="18" strokeWidth={sw} />
      <Line x1="3"  y1="18" x2="21" y2="18" strokeWidth={sw} />
      <Line x1="2"  y1="21" x2="22" y2="21" strokeWidth={2} />
    </>
  ),

  park: ({ sw = 1.7 }) => (
    <>
      <Path d="M12 2 C9 2 7 4.5 7 7 C5.5 7.5 4.5 9 4.5 10.5 C4.5 12.5 6 14 8 14 L16 14 C18 14 19.5 12.5 19.5 10.5 C19.5 9 18.5 7.5 17 7 C17 4.5 15 2 12 2 Z" strokeWidth={sw} />
      <Line x1="12" y1="14" x2="12" y2="21" strokeWidth={sw} />
      <Line x1="9" y1="21" x2="15" y2="21" strokeWidth={sw} />
    </>
  ),

  fallback: ({ sw = 1.7 }) => (
    <>
      <Circle cx="12" cy="12" r="9" strokeWidth={sw} />
      <Circle cx="12" cy="12" r="3.5" fill="white" stroke="none" />
      <Line x1="12" y1="3" x2="12" y2="6" strokeWidth={1.5} />
      <Line x1="12" y1="18" x2="12" y2="21" strokeWidth={1.5} />
      <Line x1="3" y1="12" x2="6" y2="12" strokeWidth={1.5} />
      <Line x1="18" y1="12" x2="21" y2="12" strokeWidth={1.5} />
    </>
  ),
};

// ── Component ─────────────────────────────────────────────────────────────────

interface CategoryIconProps {
  category: string | null | undefined;
  size?: number;
}

export function CategoryIcon({ category, size = 40 }: CategoryIconProps) {
  const key = category ?? 'fallback';
  const color = categoryColor(category);
  const IconPaths = icons[key] ?? icons.fallback;

  // strokeWidth scales with icon size (designed at 40px)
  const sw = Math.max(1, 1.7 * (size / 40));

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        overflow: 'hidden',
      }}
    >
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <G
          stroke="white"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        >
          <IconPaths sw={sw} />
        </G>
      </Svg>
    </View>
  );
}

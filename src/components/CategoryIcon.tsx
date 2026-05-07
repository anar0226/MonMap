import React from 'react';
import { View } from 'react-native';
import Svg, { G, Path, Line, Rect, Circle, Polygon, Text as SvgText } from 'react-native-svg';
import { categoryColor } from '../constants/categories';

// ── Icon paths — 24×24 viewBox, stroke-based, white ──────────────────────────
// All icons share: stroke="white" strokeLinecap="round" strokeLinejoin="round" fill="none"
// unless a specific element uses fill="white" (e.g. filled dots/polygons).

type IconProps = { sw?: number };

const icons: Record<string, React.FC<IconProps>> = {
  restaurant: ({ sw = 1.8 }) => (
    <>
      <Path d="M7 3 V11 M5 3 V7 Q5 8 7 8 Q9 8 9 7 V3" strokeWidth={sw} />
      <Line x1="7" y1="11" x2="7" y2="21" strokeWidth={sw} />
      <Path d="M16 3 Q13 4 13 9 Q13 11 15 11 V21" strokeWidth={sw} />
      <Line x1="17" y1="3" x2="17" y2="11" strokeWidth={sw} />
    </>
  ),

  cafe: ({ sw = 1.8 }) => (
    <>
      <Path d="M5 8 H16 V14 Q16 17 12 17 H9.5 Q5 17 5 14 Z" strokeWidth={sw} />
      <Path d="M16 10 H18 Q20 10 20 12 Q20 14 18 14 H16" strokeWidth={sw} />
      <Line x1="3" y1="20" x2="18" y2="20" strokeWidth={sw} />
      <Path d="M8 3 Q7 4 8 5 Q9 6 8 7" strokeWidth={sw * (1.6/1.8)} />
      <Path d="M12 3 Q11 4 12 5 Q13 6 12 7" strokeWidth={sw * (1.6/1.8)} />
    </>
  ),

  bar: ({ sw = 1.8 }) => (
    <>
      <Path d="M3 3 H21 L13 12 V19 H17 H7 H11 V12 Z" strokeWidth={sw} />
      <Line x1="7" y1="20.5" x2="17" y2="20.5" strokeWidth={sw} />
      <Circle cx="9" cy="6" r="0.9" fill="white" strokeWidth={0} />
    </>
  ),

  bakery: ({ sw = 1.8 }) => (
    <>
      <Path d="M4 12 Q4 8 7 8 Q8 6 10 6 Q12 5 14 6 Q16 6 17 8 Q20 8 20 12 Q20 15 17 15 H7 Q4 15 4 12 Z" strokeWidth={sw} />
      <Path d="M7 11 Q8 12 9 11 M11 11 Q12 12 13 11 M15 11 Q16 12 17 11" strokeWidth={sw * (1.4/1.8)} />
      <Path d="M5 15 V18 Q5 20 7 20 H17 Q19 20 19 18 V15" strokeWidth={sw} />
    </>
  ),

  grocery_or_supermarket: ({ sw = 1.8 }) => (
    <>
      <Path d="M3 4 H6 L7 7 M7 7 L9 15 H19 L21 8 H7" strokeWidth={sw} />
      <Circle cx="10" cy="19" r="1.6" strokeWidth={sw * (1.6/1.8)} />
      <Circle cx="17" cy="19" r="1.6" strokeWidth={sw * (1.6/1.8)} />
    </>
  ),

  convenience_store: ({ sw = 1.8 }) => (
    <>
      <Path d="M3 9 L5 4 H19 L21 9" strokeWidth={sw} />
      <Rect x="4" y="9" width="16" height="12" strokeWidth={sw} />
      <Rect x="10" y="13" width="4" height="8" strokeWidth={sw * (1.6/1.8)} />
      <Line x1="3" y1="9" x2="21" y2="9" strokeWidth={sw * (1.6/1.8)} />
      <Line x1="9" y1="6" x2="9" y2="9" strokeWidth={sw * (1.4/1.8)} />
      <Line x1="15" y1="6" x2="15" y2="9" strokeWidth={sw * (1.4/1.8)} />
    </>
  ),

  shopping_mall: ({ sw = 1.8 }) => (
    <>
      <Path d="M5 9 V5 Q5 3 7 3 Q9 3 9 5 V9 M15 9 V5 Q15 3 17 3 Q19 3 19 5 V9" strokeWidth={sw} />
      <Path d="M3 9 H21 L19.5 21 H4.5 Z" strokeWidth={sw} />
    </>
  ),

  clothing_store: ({ sw = 1.8 }) => (
    <Path d="M9 4 L4 8 L7 11 V20 H17 V11 L20 8 L15 4 Q15 7 12 7 Q9 7 9 4 Z" strokeWidth={sw} />
  ),

  beauty_salon: ({ sw = 1.7 }) => (
    <>
      <Rect x="9" y="3" width="6" height="5" rx="0.6" strokeWidth={sw} />
      <Rect x="7.5" y="8" width="9" height="3" rx="0.6" fill="white" strokeWidth={0} />
      <Rect x="8.5" y="11" width="7" height="10" rx="1" strokeWidth={sw} />
      <Line x1="10.5" y1="14" x2="13.5" y2="14" strokeWidth={sw * (1.4/1.7)} />
      <Line x1="10.5" y1="17" x2="13.5" y2="17" strokeWidth={sw * (1.4/1.7)} />
    </>
  ),

  hair_care: ({ sw = 1.7 }) => (
    <>
      <Circle cx="6" cy="17" r="3" strokeWidth={sw} />
      <Circle cx="6" cy="7" r="3" strokeWidth={sw} />
      <Line x1="8.1" y1="8.9" x2="21" y2="19" strokeWidth={sw} />
      <Line x1="8.1" y1="15.1" x2="21" y2="5" strokeWidth={sw} />
      <Line x1="14" y1="10.7" x2="17" y2="13" strokeWidth={sw} />
    </>
  ),

  spa: ({ sw = 1.7 }) => (
    <>
      <Path d="M12 4 Q15 8 12 12 Q9 8 12 4 Z" fill="white" strokeWidth={0} />
      <Path d="M12 12 Q16 9 20 11 Q18 15 13 13.5" fill="white" strokeWidth={0} />
      <Path d="M12 12 Q8 9 4 11 Q6 15 11 13.5" fill="white" strokeWidth={0} />
      <Path d="M12 12 Q15 14 16 19 Q13 19.5 12 16" fill="white" strokeWidth={0} />
      <Path d="M12 12 Q9 14 8 19 Q11 19.5 12 16" fill="white" strokeWidth={0} />
      <Circle cx="12" cy="12.5" r="1.4" fill="none" strokeWidth={sw * (1.2/1.7)} />
    </>
  ),

  gym: ({ sw = 2 }) => (
    <>
      <Line x1="2" y1="12" x2="22" y2="12" strokeWidth={sw} />
      <Rect x="5" y="8" width="2.5" height="8" rx="0.5" fill="white" strokeWidth={0} />
      <Rect x="16.5" y="8" width="2.5" height="8" rx="0.5" fill="white" strokeWidth={0} />
      <Rect x="2.5" y="10" width="2" height="4" rx="0.5" fill="white" strokeWidth={0} />
      <Rect x="19.5" y="10" width="2" height="4" rx="0.5" fill="white" strokeWidth={0} />
    </>
  ),

  pharmacy: ({ sw = 1.8 }) => (
    <>
      <Rect x="3" y="3" width="18" height="18" rx="2.5" strokeWidth={sw} />
      <Rect x="10.5" y="7" width="3" height="10" fill="white" strokeWidth={0} />
      <Rect x="7" y="10.5" width="10" height="3" fill="white" strokeWidth={0} />
    </>
  ),

  hospital: ({ sw = 1.8 }) => (
    <>
      <Rect x="3" y="6" width="18" height="15" rx="1.5" strokeWidth={sw} />
      <Path d="M7 6 V3 H17 V6" strokeWidth={sw} />
      <Rect x="10.5" y="10" width="3" height="8" fill="white" strokeWidth={0} />
      <Rect x="8" y="12.5" width="8" height="3" fill="white" strokeWidth={0} />
    </>
  ),

  doctor: ({ sw = 1.7 }) => (
    <>
      <Path d="M7 4 V8 Q7 11 9.5 12 V14 Q9.5 17 12 17 Q14.5 17 14.5 14 V12 Q17 11 17 8 V4" strokeWidth={sw} />
      <Line x1="7" y1="4" x2="9" y2="4" strokeWidth={sw} />
      <Line x1="15" y1="4" x2="17" y2="4" strokeWidth={sw} />
      <Line x1="12" y1="17" x2="12" y2="19" strokeWidth={sw * (1.5/1.7)} />
      <Circle cx="12" cy="20" r="1.4" strokeWidth={sw * (1.5/1.7)} />
    </>
  ),

  dentist: ({ sw = 1.7 }) => (
    <Path d="M7 3 Q4 3 4 7 Q4 9 5 11 Q5 14 6 18 Q6.5 21 8 21 Q9.5 21 10 17 Q10.5 14 12 14 Q13.5 14 14 17 Q14.5 21 16 21 Q17.5 21 18 18 Q19 14 19 11 Q20 9 20 7 Q20 3 17 3 Q15 3 13.5 4 Q12 4.5 12 4.5 Q12 4.5 10.5 4 Q9 3 7 3 Z" strokeWidth={sw} />
  ),

  bank: ({ sw = 1.8 }) => (
    <>
      <Path d="M3 9 L12 3 L21 9" strokeWidth={sw} />
      <Line x1="3" y1="9" x2="21" y2="9" strokeWidth={sw} />
      <Line x1="6" y1="11" x2="6" y2="17" strokeWidth={sw} />
      <Line x1="10" y1="11" x2="10" y2="17" strokeWidth={sw} />
      <Line x1="14" y1="11" x2="14" y2="17" strokeWidth={sw} />
      <Line x1="18" y1="11" x2="18" y2="17" strokeWidth={sw} />
      <Line x1="3" y1="19" x2="21" y2="19" strokeWidth={sw * (2/1.8)} />
    </>
  ),

  car_repair: ({ sw = 1.8 }) => (
    <>
      <Path d="M5 11 L7 6 H17 L19 11" strokeWidth={sw} />
      <Rect x="3" y="11" width="18" height="6" rx="1.5" strokeWidth={sw} />
      <Circle cx="7.5" cy="17.5" r="2" fill="#37474F" strokeWidth={sw * (1.6/1.8)} />
      <Circle cx="16.5" cy="17.5" r="2" fill="#37474F" strokeWidth={sw * (1.6/1.8)} />
      <Line x1="5" y1="14" x2="7" y2="14" strokeWidth={sw * (1.4/1.8)} />
      <Line x1="17" y1="14" x2="19" y2="14" strokeWidth={sw * (1.4/1.8)} />
    </>
  ),

  gas_station: ({ sw = 1.8 }) => (
    <>
      <Rect x="4" y="4" width="11" height="17" rx="1.5" strokeWidth={sw} />
      <Line x1="4" y1="9" x2="15" y2="9" strokeWidth={sw * (1.6/1.8)} />
      <Rect x="6.5" y="11" width="6" height="3.5" strokeWidth={sw * (1.4/1.8)} />
      <Path d="M15 12 H17 Q19 12 19 14 V16 Q19 17.5 20 17.5 Q21 17.5 21 16 V8 L18.5 5.5" strokeWidth={sw * (1.6/1.8)} />
    </>
  ),

  hotel: ({ sw = 1.8 }) => (
    <>
      <Rect x="3" y="6" width="18" height="15" strokeWidth={sw} />
      <Rect x="6" y="9" width="3" height="3" fill="white" strokeWidth={0} />
      <Rect x="11" y="9" width="3" height="3" fill="white" strokeWidth={0} />
      <Rect x="16" y="9" width="3" height="3" fill="white" strokeWidth={0} />
      <Rect x="6" y="14" width="3" height="3" fill="white" strokeWidth={0} />
      <Rect x="11" y="14" width="3" height="3" fill="white" strokeWidth={0} />
      <Rect x="16" y="14" width="3" height="3" fill="white" strokeWidth={0} />
      <Rect x="9" y="3" width="6" height="3" strokeWidth={sw * (1.6/1.8)} />
    </>
  ),

  nightclub: ({ sw = 1.8 }) => (
    <>
      <Circle cx="8" cy="17" r="3" strokeWidth={sw} />
      <Circle cx="17" cy="15" r="3" strokeWidth={sw} />
      <Line x1="11" y1="17" x2="11" y2="5" strokeWidth={sw} />
      <Line x1="20" y1="15" x2="20" y2="3" strokeWidth={sw} />
      <Path d="M11 5 L20 3" strokeWidth={sw} />
      <Path d="M11 8 L20 6" strokeWidth={sw} />
    </>
  ),

  karaoke: ({ sw = 1.8 }) => (
    <>
      <Rect x="9.5" y="3" width="5" height="11" rx="2.5" strokeWidth={sw} />
      <Line x1="12" y1="14" x2="12" y2="20" strokeWidth={sw} />
      <Line x1="9" y1="20.5" x2="15" y2="20.5" strokeWidth={sw} />
      <Path d="M6 9 Q6 14 12 14 Q18 14 18 9" strokeWidth={sw * (1.6/1.8)} />
    </>
  ),

  billiards: ({ sw = 1.8 }) => (
    <>
      <Circle cx="12" cy="12" r="9" strokeWidth={sw} />
      <Circle cx="12" cy="12" r="4.5" fill="white" strokeWidth={0} />
      <SvgText x="12" y="14.5" textAnchor="middle" fontSize="6" fontWeight="700" fill="#558B2F" strokeWidth={0}>8</SvgText>
    </>
  ),

  sauna: ({ sw = 1.8 }) => (
    <>
      <Path d="M4 21 V11 L12 5 L20 11 V21 Z" strokeWidth={sw} />
      <Path d="M9 17 Q8 15 9 13 Q10 11 9 9" strokeWidth={sw * (1.6/1.8)} />
      <Path d="M12 17 Q11 15 12 13 Q13 11 12 9" strokeWidth={sw * (1.6/1.8)} />
      <Path d="M15 17 Q14 15 15 13 Q16 11 15 9" strokeWidth={sw * (1.6/1.8)} />
    </>
  ),

  event_hall: ({ sw = 1.8 }) => (
    <>
      <Path d="M3 7 H21 L19 21 H5 Z" strokeWidth={sw} />
      <Path d="M7 7 V5 Q7 3 9 3 H15 Q17 3 17 5 V7" strokeWidth={sw} />
      <Circle cx="12" cy="14" r="3" strokeWidth={sw * (1.6/1.8)} />
      <Path d="M10.5 14 L11.5 15 L13.5 13" strokeWidth={sw * (1.6/1.8)} />
    </>
  ),

  pc_cafe: ({ sw = 1.8 }) => (
    <>
      <Rect x="2" y="4" width="20" height="13" rx="1.5" strokeWidth={sw} />
      <Rect x="4.5" y="6.5" width="15" height="8" strokeWidth={sw * (1.4/1.8)} />
      <Line x1="8" y1="20" x2="16" y2="20" strokeWidth={sw} />
      <Line x1="12" y1="17" x2="12" y2="20" strokeWidth={sw * (1.6/1.8)} />
    </>
  ),

  apartments: ({ sw = 1.8 }) => (
    <>
      <Rect x="4" y="3" width="16" height="18" strokeWidth={sw} />
      <Rect x="6.5" y="6" width="2.5" height="2.5" fill="white" strokeWidth={0} />
      <Rect x="10.75" y="6" width="2.5" height="2.5" fill="white" strokeWidth={0} />
      <Rect x="15" y="6" width="2.5" height="2.5" fill="white" strokeWidth={0} />
      <Rect x="6.5" y="10" width="2.5" height="2.5" fill="white" strokeWidth={0} />
      <Rect x="10.75" y="10" width="2.5" height="2.5" fill="white" strokeWidth={0} />
      <Rect x="15" y="10" width="2.5" height="2.5" fill="white" strokeWidth={0} />
      <Rect x="6.5" y="14" width="2.5" height="2.5" fill="white" strokeWidth={0} />
      <Rect x="15" y="14" width="2.5" height="2.5" fill="white" strokeWidth={0} />
      <Rect x="10.5" y="14.5" width="3" height="6.5" strokeWidth={sw * (1.4/1.8)} />
    </>
  ),

  school: ({ sw = 1.8 }) => (
    <>
      <Path d="M2 9 L12 4 L22 9 L12 14 Z" strokeWidth={sw} />
      <Path d="M6 11 V17 Q6 19 12 19 Q18 19 18 17 V11" strokeWidth={sw} />
      <Line x1="22" y1="9" x2="22" y2="14" strokeWidth={sw * (1.6/1.8)} />
    </>
  ),

  university: ({ sw = 1.8 }) => (
    <>
      <Path d="M2 9 L12 4 L22 9 L12 14 Z" strokeWidth={sw} />
      <Path d="M6 11 V17 Q6 19 12 19 Q18 19 18 17 V11" strokeWidth={sw} />
      <Path d="M22 9 V14 L20 16" strokeWidth={sw * (1.6/1.8)} />
      <Circle cx="20" cy="17" r="1" fill="white" strokeWidth={0} />
      <Line x1="9" y1="11" x2="9" y2="14" strokeWidth={sw * (1.4/1.8)} />
      <Line x1="15" y1="11" x2="15" y2="14" strokeWidth={sw * (1.4/1.8)} />
    </>
  ),

  kindergarten: ({ sw = 1.7 }) => (
    <>
      <Circle cx="8" cy="9" r="3" strokeWidth={sw} />
      <Circle cx="16" cy="9" r="3" strokeWidth={sw} />
      <Path d="M3 21 Q3 15 8 15 Q11 15 12 17 Q13 15 16 15 Q21 15 21 21" strokeWidth={sw} />
      <Path d="M8 7 V11 M16 7 V11 M14 9 H18 M6 9 H10" strokeWidth={sw * (1.4/1.7)} />
    </>
  ),

  library: ({ sw = 1.7 }) => (
    <>
      <Rect x="4" y="4" width="3.5" height="16" strokeWidth={sw} />
      <Rect x="9" y="4" width="3.5" height="16" strokeWidth={sw} />
      <Path d="M14.5 6 L17.5 5.2 L20.5 7 L18 20 L13 18.5 Z" strokeWidth={sw} />
      <Line x1="5" y1="8" x2="6.5" y2="8" strokeWidth={sw * (1.3/1.7)} />
      <Line x1="10" y1="8" x2="11.5" y2="8" strokeWidth={sw * (1.3/1.7)} />
    </>
  ),

  police: ({ sw = 1.8 }) => (
    <>
      <Path d="M12 3 L4 6 V12 Q4 17 12 21 Q20 17 20 12 V6 Z" strokeWidth={sw} />
      <Path d="M9 12 L11 14 L15 9.5" strokeWidth={sw} />
    </>
  ),

  post_office: ({ sw = 1.8 }) => (
    <>
      <Rect x="3" y="6" width="18" height="13" rx="1.5" strokeWidth={sw} />
      <Path d="M3 7 L12 13 L21 7" strokeWidth={sw} />
    </>
  ),

  fire_station: ({ sw = 1.7 }) => (
    <>
      <Path d="M12 3 Q12 7 9 9 Q6 11 6 14 Q6 19 12 21 Q18 19 18 14 Q18 11 16 9 Q14 11 14 8 Q14 5 12 3 Z" strokeWidth={sw} />
      <Path d="M10 16 Q10 18 12 19 Q14 18 14 16 Q14 14 12 13 Q10 14 10 16 Z" fill="white" strokeWidth={0} />
    </>
  ),

  government: ({ sw = 1.7 }) => (
    <>
      <Path d="M2 21 H22" strokeWidth={sw * (2/1.7)} />
      <Path d="M3 9 L12 3 L21 9" strokeWidth={sw} />
      <Line x1="3" y1="9" x2="21" y2="9" strokeWidth={sw} />
      <Line x1="5" y1="11" x2="5" y2="18" strokeWidth={sw} />
      <Line x1="9" y1="11" x2="9" y2="18" strokeWidth={sw} />
      <Line x1="15" y1="11" x2="15" y2="18" strokeWidth={sw} />
      <Line x1="19" y1="11" x2="19" y2="18" strokeWidth={sw} />
      <Line x1="3" y1="18.5" x2="21" y2="18.5" strokeWidth={sw} />
    </>
  ),

  park: ({ sw = 1.8 }) => (
    <Path d="M12 3 L7 11 H10 L6 17 H10 L7 21 H17 L14 17 H18 L14 11 H17 Z" strokeWidth={sw} />
  ),

  fallback: ({ sw = 1.7 }) => (
    <>
      <Circle cx="12" cy="12" r="9" strokeWidth={sw} />
      <Circle cx="12" cy="12" r="3.5" fill="white" strokeWidth={0} />
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

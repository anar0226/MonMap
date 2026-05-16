export const CATEGORY_COLORS: Record<string, string> = {
  restaurant:              '#E53935',
  cafe:                    '#6D4C41',
  bar:                     '#7B1FA2',
  bakery:                  '#FB8C00',
  grocery_or_supermarket:  '#43A047',
  convenience_store:       '#00897B',
  shopping_mall:           '#3949AB',
  clothing_store:          '#E91E63',
  beauty_salon:            '#AD1457',
  hair_care:               '#880E4F',
  spa:                     '#00838F',
  gym:                     '#2E7D32',
  pharmacy:                '#C62828',
  hospital:                '#B71C1C',
  doctor:                  '#EF5350',
  dentist:                 '#1565C0',
  bank:                    '#0D47A1',
  car_repair:              '#37474F',
  gas_station:             '#E65100',
  // Going-out & lodging (OSM + Google)
  karaoke:                 '#C2185B',
  billiards:               '#558B2F',
  sauna:                   '#EF6C00',
  event_hall:              '#6A1B9A',
  hotel:                   '#283593',
  pc_cafe:                 '#00ACC1',
  nightclub:               '#4A148C',
  // OSM-sourced civic & residential categories
  apartments:              '#5C6BC0',
  school:                  '#039BE5',
  university:              '#0277BD',
  kindergarten:            '#F06292',
  library:                 '#6A1B9A',
  police:                  '#1A237E',
  post_office:             '#FFA000',
  fire_station:            '#D32F2F',
  government:              '#455A64',
  park:                    '#388E3C',
};

export const FALLBACK_COLOR = '#1A73E8';

export const CATEGORY_LABELS: Record<string, string> = {
  restaurant:              'Ресторан',
  cafe:                    'Кафе',
  bar:                     'Бар',
  bakery:                  'Нарийн боов',
  grocery_or_supermarket:  'Дэлгүүр',
  convenience_store:       'Жижиг дэлгүүр',
  shopping_mall:           'Худалдааны төв',
  clothing_store:          'Хувцасны дэлгүүр',
  beauty_salon:            'Гоо сайхан',
  hair_care:               'Үсний салон',
  spa:                     'Спа',
  gym:                     'Фитнесс',
  pharmacy:                'Эмийн сан',
  hospital:                'Эмнэлэг',
  doctor:                  'Эмч',
  dentist:                 'Шүдний эмч',
  bank:                    'Банк',
  car_repair:              'Авто засвар',
  gas_station:             'Шатахуун',
  karaoke:                 'Караоке',
  billiards:               'Билъярд',
  sauna:                   'Сауна',
  event_hall:              'Эвент танхим',
  hotel:                   'Зочид буудал',
  pc_cafe:                 'PC кафе',
  nightclub:               'Шөнийн клуб',
  apartments:              'Орон сууц',
  school:                  'Сургууль',
  university:              'Их сургууль',
  kindergarten:            'Цэцэрлэг',
  library:                 'Номын сан',
  police:                  'Цагдаа',
  post_office:             'Шуудан',
  fire_station:            'Гал хамгаалах',
  government:              'Засаг захиргаа',
  park:                    'Цэцэрлэгт хүрээлэн',
};

export const BOOKABLE_CATEGORIES = new Set([
  'restaurant', 'spa', 'hair_care', 'beauty_salon', 'gym', 'dentist', 'doctor',
  'karaoke', 'billiards', 'sauna',
]);

// ── Zoom-aware POI visibility tiers ─────────────────────────────────────────
// Each category is assigned a minimum zoom level at which it becomes visible.
// At lower zooms, only essential/high-traffic categories appear, keeping the
// map clean.  As the user zooms in, progressively more categories are revealed.
//
// Tier 1 (zoom ≥ 12): Essentials — places people actively navigate to
// Tier 2 (zoom ≥ 14): Dining & nightlife — valuable but not critical at overview
// Tier 3 (zoom ≥ 15): Services — personal services, useful when browsing locally
// Tier 4 (zoom ≥ 16): Civic & education — landmark-like, useful at street level
// Tier 5 (zoom ≥ 17): Residential — almost never useful for navigation

export const CATEGORY_MIN_ZOOM: Record<string, number> = {
  // Tier 1 — Essentials (always visible)
  restaurant:              12,
  cafe:                    12,
  pharmacy:                12,
  hospital:                12,
  gas_station:             12,
  bank:                    12,
  grocery_or_supermarket:  12,
  shopping_mall:           12,

  // Tier 2 — Dining & nightlife
  bar:                     14,
  bakery:                  14,
  convenience_store:       14,
  hotel:                   14,
  karaoke:                 14,
  nightclub:               14,
  billiards:               14,
  sauna:                   14,
  event_hall:              14,

  // Tier 3 — Services
  beauty_salon:            15,
  hair_care:               15,
  spa:                     15,
  gym:                     15,
  car_repair:              15,
  clothing_store:          15,
  pc_cafe:                 15,

  // Tier 4 — Civic & education
  school:                  16,
  university:              16,
  kindergarten:            16,
  library:                 16,
  police:                  16,
  post_office:             16,
  fire_station:            16,
  government:              16,
  park:                    16,
  doctor:                  16,
  dentist:                 16,

  // Tier 5 — Residential
  apartments:              17,
};

// Default minZoom for categories not listed above
export const DEFAULT_MIN_ZOOM = 15;

// Priority score for viewport-cap sorting (higher = more important, wins the cap).
// Categories not listed here get a default of 40.
export const CATEGORY_PRIORITY: Record<string, number> = {
  restaurant:              100,
  cafe:                    100,
  pharmacy:                100,
  hospital:                100,
  gas_station:             100,
  bank:                    100,
  grocery_or_supermarket:  100,
  shopping_mall:           100,
  bar:                      90,
  bakery:                   90,
  convenience_store:        90,
  hotel:                    90,
  karaoke:                  90,
  nightclub:                90,
  billiards:                90,
  sauna:                    90,
  event_hall:               90,
  beauty_salon:             70,
  hair_care:                70,
  spa:                      70,
  gym:                      70,
  car_repair:               70,
  clothing_store:           70,
  pc_cafe:                  70,
  school:                   50,
  university:               50,
  kindergarten:             50,
  library:                  50,
  police:                   50,
  post_office:              50,
  fire_station:             50,
  government:               50,
  park:                     50,
  doctor:                   50,
  dentist:                  50,
  apartments:               10,
};

export const DEFAULT_PRIORITY = 40;

export function categoryColor(category: string | null | undefined): string {
  return CATEGORY_COLORS[category ?? ''] ?? FALLBACK_COLOR;
}

export function categoryLabel(category: string | null | undefined): string {
  return CATEGORY_LABELS[category ?? ''] ?? (category ?? '');
}

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
};

export const BOOKABLE_CATEGORIES = new Set([
  'restaurant', 'spa', 'hair_care', 'beauty_salon', 'gym', 'dentist', 'doctor',
]);

export function categoryColor(category: string | null | undefined): string {
  return CATEGORY_COLORS[category ?? ''] ?? FALLBACK_COLOR;
}

export function categoryLabel(category: string | null | undefined): string {
  return CATEGORY_LABELS[category ?? ''] ?? (category ?? '');
}

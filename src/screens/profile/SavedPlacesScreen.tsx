import React, { useEffect } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme';
import { CategoryIcon } from '../../components/CategoryIcon';
import { CATEGORY_LABELS, CATEGORY_COLORS, FALLBACK_COLOR } from '../../constants/categories';
import { useSavedPlaces } from '../../hooks/useSavedPlaces';
import { getOpenStatus } from '../../utils/openStatus';
import type { AppStackParamList } from '../../navigation';
import type { Place } from '../../types/place';

type Props = { navigation: NativeStackNavigationProp<AppStackParamList, 'SavedPlaces'> };

export default function SavedPlacesScreen({ navigation }: Props) {
  const { places, loading, error, remove, reload } = useSavedPlaces();

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => { reload(); });
    return unsubscribe;
  }, [navigation, reload]);

  return (
    <View style={s.flex}>
      <SafeAreaView edges={['top']} style={s.safeTop}>
        <View style={s.header}>
          <Pressable onPress={() => navigation.goBack()} style={s.backBtn} hitSlop={8}>
            <Ionicons name="arrow-back" size={20} color={colors.textSec} />
          </Pressable>
          <Text style={s.title}>Хадгалсан газрууд</Text>
        </View>
      </SafeAreaView>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error ? (
        <View style={s.center}>
          <View style={s.emptyIcon}>
            <Ionicons name="cloud-offline-outline" size={32} color={colors.textMuted} />
          </View>
          <Text style={s.emptyTitle}>Алдаа гарлаа</Text>
          <Text style={s.emptyDesc}>{error}</Text>
          <Pressable
            onPress={() => reload()}
            style={({ pressed }) => [s.retryBtn, pressed && { opacity: 0.7 }]}
          >
            <Text style={s.retryBtnText}>Дахин оролдох</Text>
          </Pressable>
        </View>
      ) : places.length === 0 ? (
        <View style={s.center}>
          <View style={s.emptyIcon}>
            <Ionicons name="bookmark-outline" size={32} color={colors.textMuted} />
          </View>
          <Text style={s.emptyTitle}>Хадгалсан газар байхгүй</Text>
          <Text style={s.emptyDesc}>
            Газрын дэлгэрэнгүй хуудаснаас "Хадгалах" товчийг дарж{'\n'}газруудаа хадгалаарай.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.list}>
          {places.map(place => (
            <SavedPlaceRow
              key={place.place_id}
              place={place}
              onRemove={() => remove(place.place_id)}
              onPress={() => navigation.navigate('Map', {
                focusPlaceId: place.place_id,
                focusLng:     place.lng,
                focusLat:     place.lat,
              })}
            />
          ))}
          <Text style={s.footerText}>{places.length} газар хадгалсан</Text>
        </ScrollView>
      )}
    </View>
  );
}

function SavedPlaceRow({
  place,
  onRemove,
  onPress,
}: {
  place: Place;
  onRemove: () => void;
  onPress: () => void;
}) {
  const catLabel = CATEGORY_LABELS[place.primary_category ?? ''] ?? place.primary_category ?? '';
  const catColor = CATEGORY_COLORS[place.primary_category ?? ''] ?? FALLBACK_COLOR;
  const address = place.formatted_address ?? place.short_address ?? '';
  const openStatus = getOpenStatus(place);
  const showStatus = openStatus.kind !== 'unknown';

  return (
    <Pressable style={s.card} onPress={onPress}>
      <View style={[s.cardIcon, { backgroundColor: `${catColor}1A` }]}>
        <CategoryIcon category={place.primary_category} size={28} />
      </View>
      <View style={s.cardBody}>
        <Text style={s.cardName} numberOfLines={1}>{place.name}</Text>
        <View style={s.cardMeta}>
          {catLabel ? <Text style={s.catText}>{catLabel}</Text> : null}
          {showStatus && (
            <View style={[s.statusDot, { backgroundColor: openStatus.textColor }]} />
          )}
          {showStatus && (
            <Text style={[s.statusText, { color: openStatus.textColor }]}>
              {openStatus.kind === 'holiday' ? 'Баярын өдөр'
                : openStatus.kind === 'open' || openStatus.kind === 'stale_open' ? 'Нээлттэй'
                : 'Хаалттай'}
            </Text>
          )}
        </View>
        {address ? <Text style={s.cardAddr} numberOfLines={1}>{address}</Text> : null}
      </View>
      <Pressable style={s.removeBtn} onPress={onRemove} hitSlop={8}>
        <Ionicons name="bookmark" size={20} color={colors.primary} />
      </Pressable>
    </Pressable>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  safeTop: { backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 12,
  },
  backBtn: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center', justifyContent: 'center',
  },
  title: { color: colors.text, fontSize: 17, fontWeight: '700', letterSpacing: -0.3 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 8 },
  emptyDesc: { color: colors.textSec, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  list: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 80, gap: 10 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 12,
  },
  cardIcon: {
    width: 48, height: 48, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  cardBody: { flex: 1, gap: 3 },
  cardName: { color: colors.text, fontSize: 14, fontWeight: '700' },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  catText: { color: colors.textMuted, fontSize: 11, fontWeight: '500' },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: '600' },
  cardAddr: { color: colors.textSec, fontSize: 11, marginTop: 1 },
  removeBtn: { padding: 4 },
  footerText: { color: colors.textMuted, fontSize: 11, textAlign: 'center', marginTop: 8 },
  retryBtn: {
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  retryBtnText: { color: colors.text, fontSize: 13, fontWeight: '600' },
});

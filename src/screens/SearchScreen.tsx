import React, { useMemo, useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Modal,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { FeatureCollection, Point } from 'geojson';
import type { PlaceMapFeature } from '../types/place';
import { CategoryIcon } from '../components/CategoryIcon';
import { categoryLabel } from '../constants/categories';

const C = {
  bg:        '#080c14',
  surface:   '#111520',
  border:    'rgba(255,255,255,0.10)',
  borderSub: 'rgba(255,255,255,0.06)',
  text:      'rgba(255,255,255,0.95)',
  textSec:   'rgba(255,255,255,0.50)',
  textMuted: 'rgba(255,255,255,0.30)',
  amber:     '#FBB824',
  primary:   '#0053A3',
};

const MAX_RESULTS = 50;

type Result = {
  place_id: string;
  name: string;
  primary_category: string | null;
  rating: number | null;
  lng: number;
  lat: number;
};

interface Props {
  visible: boolean;
  geojson: FeatureCollection<Point, PlaceMapFeature> | null;
  onClose: () => void;
  onSelect: (placeId: string, lng: number, lat: number) => void;
}

export function SearchScreen({ visible, geojson, onClose, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<TextInput>(null);

  // Auto-focus input when modal opens; reset on close
  useEffect(() => {
    if (visible) {
      const t = setTimeout(() => inputRef.current?.focus(), 120);
      return () => clearTimeout(t);
    } else {
      setQuery('');
    }
  }, [visible]);

  const results = useMemo<Result[]>(() => {
    if (!geojson) return [];
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const out: Result[] = [];
    for (const f of geojson.features) {
      const name = f.properties.name?.toLowerCase() ?? '';
      const cat = f.properties.primary_category ?? '';
      const catLabel = categoryLabel(cat).toLowerCase();
      if (name.includes(q) || catLabel.includes(q)) {
        const [lng, lat] = f.geometry.coordinates as [number, number];
        out.push({
          place_id: f.properties.place_id,
          name: f.properties.name,
          primary_category: f.properties.primary_category,
          rating: f.properties.rating,
          lng,
          lat,
        });
        if (out.length >= MAX_RESULTS) break;
      }
    }
    // Sort: higher rating first
    out.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    return out;
  }, [geojson, query]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={onClose}
            style={styles.backBtn}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="arrow-back" size={22} color={C.text} />
          </TouchableOpacity>

          <View style={styles.inputWrap}>
            <Ionicons name="search" size={16} color={C.textMuted} />
            <TextInput
              ref={inputRef}
              style={styles.input}
              value={query}
              onChangeText={setQuery}
              placeholder="Улаанбаатарт хайх…"
              placeholderTextColor={C.textMuted}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
            />
            {query.length > 0 && (
              <TouchableOpacity
                onPress={() => setQuery('')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={16} color={C.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Results */}
        {query.trim().length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="location-outline" size={42} color={C.textMuted} />
            <Text style={styles.emptyTitle}>Хайх газар сонгоно уу</Text>
            <Text style={styles.emptyDesc}>
              Газрын нэр эсвэл ангилалаар хайна уу{'\n'}(жишээ нь "Ресторан", "Кафе")
            </Text>
          </View>
        ) : results.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="search-outline" size={42} color={C.textMuted} />
            <Text style={styles.emptyTitle}>Илэрц олдсонгүй</Text>
            <Text style={styles.emptyDesc}>
              "{query}" гэсэн хайлтаар таарах газар олдсонгүй.
            </Text>
          </View>
        ) : (
          <FlatList
            data={results}
            keyExtractor={(item) => item.place_id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 40 }}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.row}
                activeOpacity={0.7}
                onPress={() => onSelect(item.place_id, item.lng, item.lat)}
              >
                <CategoryIcon category={item.primary_category} size={36} />
                <View style={styles.rowText}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <View style={styles.rowMeta}>
                    <Text style={styles.rowCat} numberOfLines={1}>
                      {categoryLabel(item.primary_category)}
                    </Text>
                    {item.rating !== null && (
                      <>
                        <Text style={styles.rowMetaDot}>·</Text>
                        <Ionicons name="star" size={11} color={C.amber} />
                        <Text style={styles.rowRating}>{item.rating.toFixed(1)}</Text>
                      </>
                    )}
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={16} color={C.textMuted} />
              </TouchableOpacity>
            )}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.borderSub,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  input: {
    flex: 1,
    color: C.text,
    fontSize: 14,
    padding: 0,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 8,
    marginTop: -60,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: C.textSec,
    marginTop: 8,
  },
  emptyDesc: {
    fontSize: 13,
    color: C.textMuted,
    textAlign: 'center',
    lineHeight: 19,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowName: {
    fontSize: 14,
    fontWeight: '600',
    color: C.text,
    letterSpacing: -0.2,
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  rowCat: {
    fontSize: 12,
    color: C.textMuted,
  },
  rowMetaDot: {
    fontSize: 12,
    color: C.textMuted,
  },
  rowRating: {
    fontSize: 12,
    color: C.amber,
    fontWeight: '600',
  },
  separator: {
    height: 1,
    backgroundColor: C.borderSub,
    marginLeft: 64,
  },
});

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const C = {
  bg:      '#111520',
  border:  'rgba(255,255,255,0.10)',
  text:    'rgba(255,255,255,0.95)',
  textSec: 'rgba(255,255,255,0.50)',
  primary: '#0053A3',
  red:     '#EF4444',
};

interface Props {
  lng: number;
  lat: number;
  onClose: () => void;
  onDirections: () => void;
}

export function DroppedPinCard({ lng, lat, onClose, onDirections }: Props) {
  const coordLabel = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

  return (
    <View style={s.card}>
      <View style={s.row}>
        <View style={s.iconWrap}>
          <Ionicons name="location" size={22} color={C.red} />
        </View>
        <View style={s.info}>
          <Text style={s.title}>Дусмал цэг</Text>
          <Text style={s.coord} numberOfLines={1}>{coordLabel}</Text>
        </View>
        <TouchableOpacity
          onPress={onClose}
          style={s.closeBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="close" size={18} color={C.textSec} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={s.dirBtn} activeOpacity={0.85} onPress={onDirections}>
        <Ionicons name="navigate-outline" size={16} color="#fff" />
        <Text style={s.dirBtnText}>Чиглэл</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 28 : 16,
    left: 12,
    right: 12,
    backgroundColor: C.bg,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(239,68,68,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: C.text,
  },
  coord: {
    fontSize: 12,
    color: C.textSec,
    marginTop: 2,
  },
  closeBtn: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dirBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.primary,
    borderRadius: 12,
    paddingVertical: 11,
  },
  dirBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});

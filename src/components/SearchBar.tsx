import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  onPress: () => void;
}

export function SearchBar({ onPress }: Props) {
  return (
    <TouchableOpacity
      style={styles.bar}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <Ionicons name="search" size={16} color="rgba(255,255,255,0.45)" />
      <Text style={styles.placeholder}>Улаанбаатарт хайх…</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    top: 8,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(13,17,23,0.92)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
    zIndex: 50,
  },
  placeholder: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.30)',
    letterSpacing: 0.1,
  },
});

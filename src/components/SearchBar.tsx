import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  onPress: () => void;
  onProfilePress?: () => void;
}

export function SearchBar({ onPress, onProfilePress }: Props) {
  return (
    <TouchableOpacity
      style={styles.bar}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <Ionicons name="search" size={16} color="rgba(255,255,255,0.45)" />
      <Text style={styles.placeholder}>Улаанбаатарт хайх…</Text>
      {onProfilePress && (
        <TouchableOpacity onPress={onProfilePress} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.profileBtn}>
          <View style={styles.profileCircle}>
            <Ionicons name="person" size={13} color="rgba(255,255,255,0.7)" />
          </View>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    top: 52,
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
    flex: 1,
    fontSize: 13,
    color: 'rgba(255,255,255,0.30)',
    letterSpacing: 0.1,
  },
  profileBtn: {
    marginLeft: 4,
  },
  profileCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,83,163,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(0,83,163,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

import React from 'react'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import type { Floor } from '../types/indoor'

interface Props {
  floors:       Floor[]
  currentFloor: number
  onSelect:     (floorNumber: number) => void
}

export default function FloorSwitcher({ floors, currentFloor, onSelect }: Props) {
  if (floors.length <= 1) return null

  const sorted = [...floors].sort((a, b) => b.floor_number - a.floor_number)

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {sorted.map(f => (
          <TouchableOpacity
            key={f.id}
            style={[styles.pill, f.floor_number === currentFloor && styles.pillActive]}
            onPress={() => onSelect(f.floor_number)}
            activeOpacity={0.7}
          >
            <Text style={[styles.label, f.floor_number === currentFloor && styles.labelActive]}>
              {f.floor_number === 0 ? 'G' : f.floor_number < 0 ? `B${Math.abs(f.floor_number)}` : String(f.floor_number)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 12,
    top: '40%',
    zIndex: 10,
  },
  row: {
    flexDirection: 'column',
    gap: 4,
    paddingVertical: 4,
  },
  pill: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 3,
    elevation: 3,
  },
  pillActive: {
    backgroundColor: '#2563eb',
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
  },
  labelActive: {
    color: '#fff',
  },
})

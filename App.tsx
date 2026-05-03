import 'react-native-gesture-handler';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import MapboxGL from '@rnmapbox/maps';
import { MAPBOX_ACCESS_TOKEN } from './src/constants/config';
import { SupabaseProvider } from './src/context/SupabaseContext';
import RootNavigator from './src/navigation';

MapboxGL.setAccessToken(MAPBOX_ACCESS_TOKEN);

export default function App() {
  return (
    <SafeAreaProvider>
      <SupabaseProvider>
        <StatusBar style="light" />
        <RootNavigator />
      </SupabaseProvider>
    </SafeAreaProvider>
  );
}

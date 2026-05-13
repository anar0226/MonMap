import 'react-native-gesture-handler';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import MapboxGL from '@rnmapbox/maps';
import { MAPBOX_ACCESS_TOKEN } from './src/constants/config';
import { SupabaseProvider } from './src/context/SupabaseContext';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import RootNavigator from './src/navigation';

MapboxGL.setAccessToken(MAPBOX_ACCESS_TOKEN);

// Status bar style depends on the active theme — light icons on dark bg and
// vice versa. We need it inside ThemeProvider, so split into a small inner
// component rather than reading the hook in App() directly.
function ThemedShell() {
  const { theme } = useTheme();
  return (
    <>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      <RootNavigator />
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <SupabaseProvider>
          <ThemedShell />
        </SupabaseProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

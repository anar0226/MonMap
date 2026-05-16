import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import MapboxGL from '@rnmapbox/maps';
import { MAPBOX_ACCESS_TOKEN } from './src/constants/config';
import { SupabaseProvider } from './src/context/SupabaseContext';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import RootNavigator from './src/navigation';
import { captureReferralToken } from './src/lib/referral';

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

function extractReferralToken(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = Linking.parse(url);
    const ref = (parsed.queryParams?.ref ?? null) as string | null;
    if (ref) return ref;
    // Also accept /share/<token> path-style URLs.
    const m = String(parsed.path ?? '').match(/share\/([A-Z2-9]{12})/i);
    return m?.[1]?.toUpperCase() ?? null;
  } catch {
    return null;
  }
}

function ReferralDeepLinkCapture() {
  useEffect(() => {
    Linking.getInitialURL().then(url => {
      const t = extractReferralToken(url);
      if (t) captureReferralToken(t).catch(() => {});
    });
    const sub = Linking.addEventListener('url', ({ url }) => {
      const t = extractReferralToken(url);
      if (t) captureReferralToken(t).catch(() => {});
    });
    return () => sub.remove();
  }, []);
  return null;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <SupabaseProvider>
          <ReferralDeepLinkCapture />
          <ThemedShell />
        </SupabaseProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

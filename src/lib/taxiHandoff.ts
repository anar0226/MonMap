import { Linking, Platform, Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';

export type TaxiProvider = 'ubcab' | 'aba';

interface ProviderConfig {
  name: string;
  iosScheme: string;
  iosStoreUrl: string;
  androidPackage: string;
  androidStoreUrl: string;
}

const PROVIDERS: Record<TaxiProvider, ProviderConfig> = {
  ubcab: {
    name: 'UBCab',
    iosScheme: 'ubcab://',
    iosStoreUrl: 'https://apps.apple.com/app/id863109199',
    androidPackage: 'com.mezorn.ubcab.ubcab_passanger_v2',
    androidStoreUrl:
      'https://play.google.com/store/apps/details?id=com.mezorn.ubcab.ubcab_passanger_v2',
  },
  aba: {
    name: 'ABA',
    iosScheme: 'abataxi://',
    iosStoreUrl: 'https://apps.apple.com/app/id6447431571',
    androidPackage: 'com.abataxi',
    androidStoreUrl: 'https://play.google.com/store/apps/details?id=com.abataxi',
  },
};

/**
 * Hand the user off to UBCab/ABA: copy the destination name to the clipboard,
 * then launch the app (or App/Play Store if not installed).
 *
 * Neither provider publishes a deep-link spec for pre-filling destinations, so
 * the clipboard copy is the closest we can get to "no re-typing."
 */
export async function openTaxiApp(
  provider: TaxiProvider,
  destinationName: string | null,
): Promise<void> {
  const cfg = PROVIDERS[provider];

  if (destinationName) {
    try {
      await Clipboard.setStringAsync(destinationName);
    } catch {
      // Non-fatal — proceed to open the app anyway
    }
  }

  if (Platform.OS === 'android') {
    // Android intent URI: launch the app by package, fall back to Play Store
    // if not installed. No scheme guessing needed.
    const fallback = encodeURIComponent(cfg.androidStoreUrl);
    const intentUrl =
      `intent://#Intent;package=${cfg.androidPackage};` +
      `S.browser_fallback_url=${fallback};end`;
    try {
      await Linking.openURL(intentUrl);
      return;
    } catch {
      await Linking.openURL(cfg.androidStoreUrl).catch(() => {});
      return;
    }
  }

  // iOS: try the app's URL scheme; if not installed, open the App Store.
  try {
    const canOpen = await Linking.canOpenURL(cfg.iosScheme);
    if (canOpen) {
      await Linking.openURL(cfg.iosScheme);
      return;
    }
  } catch {
    // Fall through to store
  }

  Alert.alert(
    `${cfg.name} суулгаагүй байна`,
    `${cfg.name} аппликэйшнийг App Store-оос татах уу?`,
    [
      { text: 'Болих', style: 'cancel' },
      { text: 'App Store', onPress: () => Linking.openURL(cfg.iosStoreUrl) },
    ],
  );
}

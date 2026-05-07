/**
 * useNetworkStatus.ts
 *
 * Subscribes to the device's network reachability state using the
 * NetInfo API that ships with Expo / React Native.
 *
 * Returns `isOnline: boolean` and `wasEverOnline: boolean`.
 * `wasEverOnline` is true once connectivity has been confirmed at
 * least once this session — useful for deciding when to show
 * "offline mode" vs "first launch without network".
 */
import { useState, useEffect } from 'react';
import { AppState, AppStateStatus } from 'react-native';

// React Native's built-in NetInfo
// (no extra package needed — it's part of RN core since 0.60)
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

export interface NetworkStatus {
  /** True when the device has a confirmed internet connection. */
  isOnline: boolean;
  /** True once `isOnline` has been true at least once this session. */
  wasEverOnline: boolean;
  /** ISO string of when the status was last updated. */
  lastCheckedAt: string | null;
}

export function useNetworkStatus(): NetworkStatus {
  const [isOnline, setIsOnline] = useState(true); // optimistic default
  const [wasEverOnline, setWasEverOnline] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);

  useEffect(() => {
    const handleState = (state: NetInfoState) => {
      const online = !!(state.isConnected && state.isInternetReachable !== false);
      setIsOnline(online);
      setLastCheckedAt(new Date().toISOString());
      if (online) setWasEverOnline(true);
    };

    // Subscribe to changes
    const unsubscribe = NetInfo.addEventListener(handleState);

    // Fetch initial state immediately
    NetInfo.fetch().then(handleState).catch(() => {});

    // Re-check when the app comes to foreground (screen unlock, multitask return)
    const appStateSub = AppState.addEventListener(
      'change',
      (nextState: AppStateStatus) => {
        if (nextState === 'active') {
          NetInfo.fetch().then(handleState).catch(() => {});
        }
      },
    );

    return () => {
      unsubscribe();
      appStateSub.remove();
    };
  }, []);

  return { isOnline, wasEverOnline, lastCheckedAt };
}

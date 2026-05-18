/**
 * OfflineBanner.tsx
 *
 * Appears at the top of MapScreen when the device is offline.
 * Shows the offline pill and — if the tile pack hasn't been downloaded —
 * a button to download UB tiles for the next offline session.
 *
 * When online and tiles are incomplete it surfaces a one-time
 * "Download map for offline use" prompt.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  ensureUBOfflinePack,
  getUBPackStatus,
  type DownloadProgress,
  type OfflinePackStatus,
} from '../lib/offlineTiles';

interface Props {
  isOnline: boolean;
  onHeightChange?: (height: number) => void;
}

export function OfflineBanner({ isOnline, onHeightChange }: Props) {
  const [packStatus, setPackStatus] = useState<OfflinePackStatus>('not_downloaded');
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const slideY = useRef(new Animated.Value(-80)).current;

  // ── Check tile pack status ─────────────────────────────────────────────
  useEffect(() => {
    getUBPackStatus().then(setPackStatus);
  }, [isOnline]);

  // ── Animate in/out ────────────────────────────────────────────────────
  const shouldShow = !isOnline || (isOnline && packStatus === 'not_downloaded' && !dismissed);

  useEffect(() => {
    Animated.spring(slideY, {
      toValue: shouldShow ? 0 : -80,
      useNativeDriver: true,
      tension: 60,
      friction: 10,
    }).start();
    if (!shouldShow) onHeightChange?.(0);
  }, [shouldShow, slideY]);

  const handleDownload = async () => {
    setPackStatus('downloading');
    setProgress({ percentage: 0, completedResourceCount: 0, completedResourceSize: 0, requiredResourceCount: 0 });

    await ensureUBOfflinePack(
      (p) => setProgress(p),
      (_err) => setPackStatus('error'),
    );

    const final = await getUBPackStatus();
    setPackStatus(final);
    setProgress(null);
  };

  if (!shouldShow) return null;

  const isOffline = !isOnline;
  const isDownloading = packStatus === 'downloading';
  const pct = progress ? Math.round(progress.percentage * 100) : 0;

  return (
    <Animated.View
      onLayout={(e) => onHeightChange?.(e.nativeEvent.layout.height)}
      style={[
        styles.container,
        isOffline ? styles.offlineBg : styles.downloadBg,
        { transform: [{ translateY: slideY }] },
      ]}
    >
      <View style={styles.row}>
        <Ionicons
          name={isOffline ? 'cloud-offline-outline' : 'cloud-download-outline'}
          size={16}
          color="#fff"
          style={styles.icon}
        />

        {isOffline ? (
          <Text style={styles.label}>
            Офлайн горим
            {packStatus === 'complete' ? ' · Кэш ачааллав' : ' · Холболт байхгүй'}
          </Text>
        ) : isDownloading ? (
          <Text style={styles.label}>
            Офлайн газрын зураг татаж байна… {pct}%
          </Text>
        ) : (
          <Text style={styles.label}>Офлайн газрын зураг татах уу?</Text>
        )}

        {!isOffline && !isDownloading && (
          <>
            <TouchableOpacity
              onPress={handleDownload}
              style={styles.actionBtn}
              accessibilityLabel="Офлайн газрын зураг татах"
            >
              <Text style={styles.actionText}>Татах</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setDismissed(true)}
              style={styles.dismissBtn}
              accessibilityLabel="Хаах"
            >
              <Ionicons name="close" size={14} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Download progress bar */}
      {isDownloading && progress && (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${pct}%` as any }]} />
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 48, // below safe area / status bar
    paddingBottom: 10,
    paddingHorizontal: 16,
    zIndex: 100,
  },
  offlineBg: {
    backgroundColor: 'rgba(30, 30, 35, 0.92)',
  },
  downloadBg: {
    backgroundColor: 'rgba(14, 108, 196, 0.93)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: 8,
  },
  label: {
    flex: 1,
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
  },
  actionBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginLeft: 8,
  },
  actionText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  dismissBtn: {
    marginLeft: 8,
    padding: 4,
  },
  progressTrack: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: 3,
    backgroundColor: '#fff',
    borderRadius: 2,
  },
});

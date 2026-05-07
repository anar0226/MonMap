/**
 * offlineTiles.ts
 *
 * Mapbox offline tile pack management for Ulaanbaatar.
 * Downloads the Standard basemap for the UB metro area
 * at zoom levels 10–16 so the map works without a network connection.
 *
 * Usage (call once when the app comes online for the first time):
 *   import { ensureUBOfflinePack } from './offlineTiles';
 *   await ensureUBOfflinePack(onProgress);
 */
import MapboxGL from '@rnmapbox/maps';
import { MAPBOX_STYLE } from '../constants/config';

// UB metro bounding box — covers the city plus major ger districts
const UB_BOUNDS = {
  ne: [107.1800, 48.0200] as [number, number],
  sw: [106.6200, 47.7500] as [number, number],
};

const PACK_NAME = 'ub-metro-v1';
const MIN_ZOOM = 10;
const MAX_ZOOM = 16;

export type DownloadProgress = {
  /** 0–1 */
  percentage: number;
  completedResourceCount: number;
  completedResourceSize: number;
  requiredResourceCount: number;
};

export type OfflinePackStatus =
  | 'not_downloaded'
  | 'downloading'
  | 'complete'
  | 'error';

/**
 * Returns the current status of the UB offline pack without downloading.
 */
export async function getUBPackStatus(): Promise<OfflinePackStatus> {
  try {
    const packs = await MapboxGL.offlineManager.getPacks();
    const existing = packs.find((p) => p.name === PACK_NAME);
    if (!existing) return 'not_downloaded';

    const status = await existing.status();
    if (!status) return 'not_downloaded';

    if (status.percentage >= 100) return 'complete';
    if (status.percentage > 0) return 'downloading';
    return 'not_downloaded';
  } catch {
    return 'error';
  }
}

/**
 * Ensure the UB offline tile pack exists and is complete.
 * If already complete, resolves immediately.
 * If missing, starts the download and calls `onProgress` until done.
 *
 * Safe to call multiple times — duplicate downloads are no-ops.
 */
export async function ensureUBOfflinePack(
  onProgress?: (p: DownloadProgress) => void,
  onError?: (err: string) => void,
): Promise<void> {
  try {
    const packs = await MapboxGL.offlineManager.getPacks();
    const existing = packs.find((p) => p.name === PACK_NAME);

    if (existing) {
      const status = await existing.status();
      if (status && status.percentage >= 100) {
        // Already complete — nothing to do.
        return;
      }
      // Incomplete pack — delete and re-download cleanly.
      await MapboxGL.offlineManager.deletePack(PACK_NAME);
    }

    await MapboxGL.offlineManager.createPack(
      {
        name: PACK_NAME,
        styleURL: MAPBOX_STYLE,
        bounds: [UB_BOUNDS.ne, UB_BOUNDS.sw],
        minZoom: MIN_ZOOM,
        maxZoom: MAX_ZOOM,
        metadata: { createdAt: new Date().toISOString() },
      },
      // progressListener
      (_pack, status) => {
        onProgress?.({
          percentage: status.percentage / 100,
          completedResourceCount: status.completedResourceCount,
          completedResourceSize: status.completedResourceSize,
          requiredResourceCount: status.requiredResourceCount,
        });
      },
      // errorListener
      (_pack, err) => {
        onError?.(err?.message ?? 'Tile download failed');
      },
    );
  } catch (e: any) {
    onError?.(e?.message ?? 'Offline pack error');
  }
}

/**
 * Delete the UB offline pack (e.g., for storage management).
 */
export async function deleteUBOfflinePack(): Promise<void> {
  try {
    await MapboxGL.offlineManager.deletePack(PACK_NAME);
  } catch {}
}

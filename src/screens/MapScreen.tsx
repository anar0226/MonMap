import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, TouchableOpacity, Text, Platform, ActivityIndicator } from 'react-native';
import MapboxGL from '@rnmapbox/maps';
import * as Location from 'expo-location';
import type { FeatureCollection, Point } from 'geojson';
import {
  UB_CENTER,
  UB_DEFAULT_ZOOM,
  UB_DEFAULT_PITCH,
  UB_MIN_ZOOM,
  UB_MAX_ZOOM,
  MAPBOX_STYLE,
} from '../constants/config';
import { CATEGORY_COLORS, FALLBACK_COLOR } from '../constants/categories';
import { CategoryIcon } from '../components/CategoryIcon';
import { usePlaces } from '../hooks/usePlaces';
import { usePlaceDetail } from '../hooks/usePlaceDetail';
import { PlaceDetailCard } from '../components/PlaceDetailCard';
import { SearchBar } from '../components/SearchBar';
import { SearchScreen } from './SearchScreen';
import type { PlaceMapFeature } from '../types/place';

const VIEWPORT_BUFFER = 0.15;
const FALLBACK_FEATURE_CAP = 200;

// Bottom offset for recenter button when the sheet is visible (collapsed height + margin)
const SHEET_VISIBLE_BOTTOM = 196;

// All category keys we render icons for. Must be kept in sync with categories.ts.
const ALL_CATEGORY_KEYS = [
  ...Object.keys(CATEGORY_COLORS),
  'fallback',
] as const;

// Mapbox image name used in iconImage expression. We rely on `coalesce` to fall
// back to `poi-fallback` when primary_category is null or unknown.
const iconNameFor = (key: string) => `poi-${key}`;

type Bounds = { sw: [number, number]; ne: [number, number] };

export default function MapScreen() {
  const cameraRef = useRef<MapboxGL.Camera>(null);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const { geojson, loading: placesLoading, error: placesError } = usePlaces();
  const { place, loading: detailLoading, fetchDetail, clear } = usePlaceDetail();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled || status !== 'granted') return;

        const last = await Location.getLastKnownPositionAsync();
        if (cancelled) return;
        if (last) {
          setUserLocation([last.coords.longitude, last.coords.latitude]);
          return;
        }

        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!cancelled) setUserLocation([loc.coords.longitude, loc.coords.latitude]);
      } catch {
        // user location dot simply won't appear
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    console.log('[Places] loading=', placesLoading, 'error=', placesError, 'count=', geojson?.features.length ?? 0);
  }, [placesLoading, placesError, geojson]);

  const visibleGeojson = useMemo<FeatureCollection<Point, PlaceMapFeature>>(() => {
    const empty: FeatureCollection<Point, PlaceMapFeature> = { type: 'FeatureCollection', features: [] };
    if (!geojson) return empty;

    if (!bounds) {
      return { type: 'FeatureCollection', features: geojson.features.slice(0, FALLBACK_FEATURE_CAP) };
    }

    const [swLng, swLat] = bounds.sw;
    const [neLng, neLat] = bounds.ne;
    const lngPad = (neLng - swLng) * VIEWPORT_BUFFER;
    const latPad = (neLat - swLat) * VIEWPORT_BUFFER;

    const features = geojson.features.filter((f) => {
      const [lng, lat] = f.geometry.coordinates as [number, number];
      return (
        lng >= swLng - lngPad && lng <= neLng + lngPad &&
        lat >= swLat - latPad && lat <= neLat + latPad
      );
    });
    return { type: 'FeatureCollection', features };
  }, [geojson, bounds]);

  const handleMapIdle = useCallback((state: any) => {
    const b = state?.properties?.bounds;
    if (b?.sw && b?.ne) {
      setBounds({ sw: b.sw as [number, number], ne: b.ne as [number, number] });
    }
  }, []);

  const handlePoiPress = useCallback(
    (event: any) => {
      const placeId = event.features?.[0]?.properties?.place_id;
      if (placeId) fetchDetail(placeId);
    },
    [fetchDetail],
  );

  const handleMapPress = useCallback(() => {
    clear();
  }, [clear]);

  const flyTo = useCallback((lng: number, lat: number, zoom = 17) => {
    cameraRef.current?.setCamera({
      centerCoordinate: [lng, lat],
      zoomLevel: zoom,
      pitch: UB_DEFAULT_PITCH,
      animationDuration: 700,
    });
  }, []);

  const handleSearchSelect = useCallback(
    (placeId: string, lng: number, lat: number) => {
      setSearchOpen(false);
      flyTo(lng, lat, 17);
      fetchDetail(placeId);
    },
    [flyTo, fetchDetail],
  );

  const recenterOnUser = () => {
    const target = userLocation ?? UB_CENTER;
    flyTo(target[0], target[1], UB_DEFAULT_ZOOM);
  };

  const sheetVisible = place !== null || detailLoading;
  const recenterBottom = sheetVisible
    ? SHEET_VISIBLE_BOTTOM + (Platform.OS === 'ios' ? 16 : 0)
    : Platform.OS === 'ios' ? 48 : 32;

  // Build iconImage expression: ['coalesce', ['concat', 'poi-', primary_category], 'poi-fallback']
  // We can't `concat` a literal with an unknown getter that may not match a registered name,
  // so use `match` to map known categories → image name and fall back otherwise.
  const ICON_IMAGE: any = useMemo(() => {
    const expr: any[] = ['match', ['get', 'primary_category']];
    for (const key of Object.keys(CATEGORY_COLORS)) {
      expr.push(key, iconNameFor(key));
    }
    expr.push(iconNameFor('fallback'));
    return expr;
  }, []);

  return (
    <View style={styles.container}>
      <MapboxGL.MapView
        style={styles.map}
        styleURL={MAPBOX_STYLE}
        logoEnabled={false}
        attributionEnabled={true}
        attributionPosition={{ bottom: 8, right: 8 }}
        compassEnabled={true}
        compassPosition={{ top: 100, right: 16 }}
        scaleBarEnabled={false}
        onMapIdle={handleMapIdle}
        onPress={handleMapPress}
        onDidFailLoadingMap={() => {
          setMapError('Газрын зураг ачаалахад алдаа гарлаа. Mapbox token-ийг шалгана уу.');
        }}
        onDidFinishLoadingMap={() => setMapError(null)}
      >
        <MapboxGL.Camera
          ref={cameraRef}
          centerCoordinate={UB_CENTER}
          zoomLevel={UB_DEFAULT_ZOOM}
          pitch={UB_DEFAULT_PITCH}
          minZoomLevel={UB_MIN_ZOOM}
          maxZoomLevel={UB_MAX_ZOOM}
          animationMode="flyTo"
          animationDuration={0}
        />

        <MapboxGL.StyleImport
          id="basemap"
          existing
          config={{
            showPointOfInterestLabels: false,
            showTransitLabels: false,
          }}
        />

        {/* Register one icon image per category. Each renders the React component
            once to a bitmap that the SymbolLayer references by name. */}
        <MapboxGL.Images>
          {ALL_CATEGORY_KEYS.map((key) => (
            <MapboxGL.Image key={key} name={iconNameFor(key)}>
              <View style={{ width: 48, height: 48 }}>
                <CategoryIcon category={key === 'fallback' ? null : key} size={48} />
              </View>
            </MapboxGL.Image>
          ))}
        </MapboxGL.Images>

        {visibleGeojson.features.length > 0 && (
          <MapboxGL.ShapeSource
            id="places"
            shape={visibleGeojson}
            onPress={handlePoiPress}
          >
            {/* Single SymbolLayer with both icon + label. iconAllowOverlap:false +
                textAllowOverlap:false lets Mapbox auto-deconflict. symbolSortKey
                makes higher-rated POIs win collisions (Google-style). */}
            <MapboxGL.SymbolLayer
              id="place-symbols"
              style={{
                iconImage: ICON_IMAGE,
                iconSize: ['interpolate', ['linear'], ['zoom'], 12, 0.32, 16, 0.55, 20, 0.85] as any,
                iconAllowOverlap: false,
                iconIgnorePlacement: false,
                iconAnchor: 'center',
                iconPadding: 2,

                textField: ['get', 'name'] as any,
                textSize: ['interpolate', ['linear'], ['zoom'], 13, 11, 18, 13] as any,
                textOffset: [0, 1.6] as any,
                textAnchor: 'top',
                textColor: '#1a1a1a',
                textHaloColor: '#ffffff',
                textHaloWidth: 1.4,
                textOptional: true,
                textMaxWidth: 8,
                textAllowOverlap: false,
                textIgnorePlacement: false,

                // Lower sortKey = drawn first = wins collisions.
                // Map rating 5→0, 0→5, missing→5 (so unrated lose to rated).
                symbolSortKey: ['-', 5, ['coalesce', ['get', 'rating'], 0]] as any,
              }}
            />
          </MapboxGL.ShapeSource>
        )}

        {userLocation && (
          <MapboxGL.UserLocation
            visible={true}
            showsUserHeadingIndicator={true}
            androidRenderMode="compass"
          />
        )}
      </MapboxGL.MapView>

      {/* Search bar (top) */}
      <SearchBar onPress={() => setSearchOpen(true)} />

      {mapError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{mapError}</Text>
        </View>
      )}

      {placesError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>Газрууд ачаалж чадсангүй: {placesError}</Text>
        </View>
      )}

      {placesLoading && (
        <View style={styles.placesLoading}>
          <ActivityIndicator size="small" color={FALLBACK_COLOR} />
          <Text style={styles.placesLoadingText}>Газрууд ачаалж байна…</Text>
        </View>
      )}

      <TouchableOpacity
        style={[styles.recenterBtn, { bottom: recenterBottom }]}
        onPress={recenterOnUser}
        activeOpacity={0.8}
      >
        <Text style={styles.recenterIcon}>⊕</Text>
      </TouchableOpacity>

      <PlaceDetailCard
        place={place}
        loading={detailLoading}
        onClose={clear}
      />

      {/* Full-screen search modal */}
      <SearchScreen
        visible={searchOpen}
        geojson={geojson}
        onClose={() => setSearchOpen(false)}
        onSelect={handleSearchSelect}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  errorBanner: {
    position: 'absolute',
    top: 70,
    left: 16,
    right: 16,
    backgroundColor: '#c0392b',
    borderRadius: 8,
    padding: 12,
  },
  errorText: {
    color: '#fff',
    fontSize: 13,
    textAlign: 'center',
  },
  placesLoading: {
    position: 'absolute',
    top: 70,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  placesLoadingText: {
    fontSize: 12,
    color: '#555',
  },
  recenterBtn: {
    position: 'absolute',
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  recenterIcon: {
    fontSize: 24,
    color: FALLBACK_COLOR,
  },
});

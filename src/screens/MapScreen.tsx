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
import { usePlaces } from '../hooks/usePlaces';
import { usePlaceDetail } from '../hooks/usePlaceDetail';
import { PlaceDetailCard } from '../components/PlaceDetailCard';
import type { PlaceMapFeature } from '../types/place';

// ─── Category colour palette ──────────────────────────────────────────────────
const CATEGORY_COLORS: Record<string, string> = {
  restaurant: '#E53935',
  cafe: '#6D4C41',
  bar: '#7B1FA2',
  bakery: '#FB8C00',
  grocery_or_supermarket: '#43A047',
  convenience_store: '#00897B',
  shopping_mall: '#3949AB',
  clothing_store: '#E91E63',
  beauty_salon: '#AD1457',
  hair_care: '#880E4F',
  spa: '#00838F',
  gym: '#2E7D32',
  pharmacy: '#C62828',
  hospital: '#B71C1C',
  doctor: '#EF5350',
  dentist: '#1565C0',
  bank: '#0D47A1',
  car_repair: '#37474F',
  gas_station: '#E65100',
};
const FALLBACK_COLOR = '#1A73E8';

function matchExpr(getter: any[], pairs: Record<string, string>, fallback: string): any[] {
  const expr: any[] = ['match', getter];
  for (const [key, value] of Object.entries(pairs)) {
    expr.push(key, value);
  }
  expr.push(fallback);
  return expr;
}

const CIRCLE_COLOR = matchExpr(['get', 'primary_category'], CATEGORY_COLORS, FALLBACK_COLOR);

const VIEWPORT_BUFFER = 0.15;
const FALLBACK_FEATURE_CAP = 200;

// Bottom offset for recenter button when the sheet is visible (collapsed height + margin)
const SHEET_VISIBLE_BOTTOM = 196;

type Bounds = { sw: [number, number]; ne: [number, number] };

export default function MapScreen() {
  const cameraRef = useRef<MapboxGL.Camera>(null);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [bounds, setBounds] = useState<Bounds | null>(null);
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

  const recenterOnUser = () => {
    const target = userLocation ?? UB_CENTER;
    cameraRef.current?.setCamera({
      centerCoordinate: target,
      zoomLevel: UB_DEFAULT_ZOOM,
      pitch: UB_DEFAULT_PITCH,
      animationDuration: 600,
    });
  };

  const sheetVisible = place !== null || detailLoading;
  const recenterBottom = sheetVisible
    ? SHEET_VISIBLE_BOTTOM + (Platform.OS === 'ios' ? 16 : 0)
    : Platform.OS === 'ios' ? 48 : 32;

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

        {visibleGeojson.features.length > 0 && (
          <MapboxGL.ShapeSource
            id="places"
            shape={visibleGeojson}
            onPress={handlePoiPress}
          >
            <MapboxGL.CircleLayer
              id="place-circles"
              style={{
                circleRadius: ['interpolate', ['linear'], ['zoom'], 12, 4, 16, 8, 20, 14] as any,
                circleColor: CIRCLE_COLOR as any,
                circleStrokeColor: '#ffffff',
                circleStrokeWidth: 1.5,
              }}
            />
            <MapboxGL.SymbolLayer
              id="place-labels"
              style={{
                textField: ['get', 'name'] as any,
                textSize: 12,
                textOffset: [0, 1.2] as any,
                textAnchor: 'top',
                textColor: '#222222',
                textHaloColor: '#ffffff',
                textHaloWidth: 1.4,
                textOptional: true,
                textMaxWidth: 8,
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
          <ActivityIndicator size="small" color="#1A73E8" />
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  errorBanner: {
    position: 'absolute',
    top: 60,
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
    top: 16,
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
    color: '#1A73E8',
  },
});

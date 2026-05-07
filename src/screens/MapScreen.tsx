import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AppStackParamList } from '../navigation';
import { useNavigation as useTurnByTurnNav } from '../hooks/useNavigation';
import { NavigationOverlay } from '../components/NavigationOverlay';
import { StyleSheet, View, Text, ActivityIndicator } from 'react-native';
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
import { SearchScreen, type RouteWaypoint } from './SearchScreen';
import { DirectionsPanel } from '../components/DirectionsPanel';
import { useDirections } from '../hooks/useDirections';
import type { Place, PlaceMapFeature } from '../types/place';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { OfflineBanner } from '../components/OfflineBanner';
import { ensureUBOfflinePack, getUBPackStatus } from '../lib/offlineTiles';

const VIEWPORT_BUFFER = 0.15;
const FALLBACK_FEATURE_CAP = 200;

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
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList, 'Map'>>();
  const route = useRoute<RouteProp<AppStackParamList, 'Map'>>();
  const cameraRef = useRef<MapboxGL.Camera>(null);
  const poiPressedRef = useRef(false);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const { geojson, loading: placesLoading, error: placesError } = usePlaces();
  const { place, loading: detailLoading, fetchDetail, clear } = usePlaceDetail();
  const { multi, route, loading: routeLoading, error: routeError, fetchRoute, selectMode, selectAlternative, clear: clearRoute } = useDirections();
  const [routeDestName, setRouteDestName] = useState<string | null>(null);
  const nav = useTurnByTurnNav();
  const { isOnline, wasEverOnline } = useNetworkStatus();

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

  // Kick off tile pack download the first time we have a network connection.
  // We check the pack status first so we never redundantly re-download.
  useEffect(() => {
    if (!isOnline) return;
    getUBPackStatus().then((status) => {
      if (status !== 'complete' && status !== 'downloading') {
        // Download silently in the background; OfflineBanner shows progress.
        ensureUBOfflinePack();
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

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
      if (placeId) {
        poiPressedRef.current = true;
        fetchDetail(placeId);
      }
    },
    [fetchDetail],
  );

  const handleMapPress = useCallback(() => {
    if (poiPressedRef.current) {
      poiPressedRef.current = false;
      return;
    }
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

  // External screens (e.g. SavedPlacesScreen) navigate here with a focus
  // place. Fly the camera and open the detail card whenever a new focus
  // arrives. Re-runs when focusPlaceId changes — repeat-tapping the same
  // place won't re-trigger, but switching to a different one will.
  const focusPlaceId = route.params?.focusPlaceId;
  const focusLng     = route.params?.focusLng;
  const focusLat     = route.params?.focusLat;
  useEffect(() => {
    if (!focusPlaceId) return;
    if (focusLng != null && focusLat != null) flyTo(focusLng, focusLat, 17);
    fetchDetail(focusPlaceId);
    // Clear the param so re-navigating to the same place still re-focuses.
    navigation.setParams({ focusPlaceId: undefined, focusLng: undefined, focusLat: undefined });
  }, [focusPlaceId, focusLng, focusLat, flyTo, fetchDetail, navigation]);

  const fitBoundsToRoute = useCallback((sw: [number, number], ne: [number, number]) => {
    cameraRef.current?.fitBounds(ne, sw, [120, 60, 220, 60], 800);
  }, []);

  const handleRequestDirections = useCallback(async (target: Place) => {
    if (!userLocation) {
      setMapError('Таны байршил тодорхойгүй байна. Байршлын зөвшөөрлийг шалгана уу.');
      return;
    }
    setRouteDestName(target.name);
    clear();
    await fetchRoute(userLocation, [target.lng, target.lat]);
  }, [userLocation, fetchRoute, clear]);

  const handleRouteRequest = useCallback(async (from: RouteWaypoint, to: RouteWaypoint) => {
    const fromCoord: [number, number] | null =
      from.type === 'current' ? userLocation : [from.lng, from.lat];
    const toCoord: [number, number] | null =
      to.type === 'current' ? userLocation : [to.lng, to.lat];

    if (!fromCoord || !toCoord) {
      setMapError('Таны байршил тодорхойгүй байна. Байршлын зөвшөөрлийг шалгана уу.');
      return;
    }

    setSearchOpen(false);
    setRouteDestName(to.name);
    clear();
    clearRoute();
    await fetchRoute(fromCoord, toCoord);
  }, [userLocation, fetchRoute, clear, clearRoute]);

  const handleCloseRoute = useCallback(() => {
    clearRoute();
    setRouteDestName(null);
  }, [clearRoute]);

  const handleStartNavigation = useCallback(() => {
    if (!route || !multi) return;
    nav.start(route.steps, multi.destination);
  }, [route, multi, nav.start]);

  const handleEndNavigation = useCallback(() => {
    nav.stop();
  }, [nav.stop]);

  useEffect(() => {
    if (route) fitBoundsToRoute(route.bounds.sw, route.bounds.ne);
  }, [route, fitBoundsToRoute]);

  // Lock camera to user heading while navigating.
  useEffect(() => {
    if (nav.mode !== 'active' || !nav.userLocation) return;
    cameraRef.current?.setCamera({
      centerCoordinate: nav.userLocation,
      zoomLevel: 17,
      heading: nav.heading ?? 0,
      pitch: 45,
      animationDuration: 600,
    });
  }, [nav.mode, nav.userLocation, nav.heading]);

  const durationRemainingSec = useMemo(() => {
    if (!route || route.distanceMeters === 0) return route?.durationSeconds ?? 0;
    if (nav.distanceToDestination <= 0) return route.durationSeconds;
    return Math.round((nav.distanceToDestination / route.distanceMeters) * route.durationSeconds);
  }, [nav.distanceToDestination, route]);

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
        compassEnabled={false}
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
            showPointOfInterestLabels: false as any,
            showTransitLabels: false as any,
            showPlaceLabels: false as any,
          }}
        />

        {/* Register one icon image per category. Each renders the React component
            once to a bitmap that the SymbolLayer references by name.
            Outer white circle (56px) creates the ring; inner icon (42px) sits centred. */}
        <MapboxGL.Images>
          {ALL_CATEGORY_KEYS.map((key) => (
            <MapboxGL.Image key={key} name={iconNameFor(key)}>
              <View style={{
                width: 56, height: 56,
                borderRadius: 28,
                backgroundColor: 'white',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}>
                <CategoryIcon category={key === 'fallback' ? null : key} size={42} />
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
                iconSize: ['interpolate', ['linear'], ['zoom'], 12, 0.22, 16, 0.38, 20, 0.60] as any,
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

                // Higher sortKey wins collisions (appears on top).
                // Tier 1: category priority. Tier 2: rating tiebreaker.
                // Tier 3: closure reports — subtract 50 so reported places lose to clean ones.
                symbolSortKey: [
                  '-',
                  ['-',
                    ['match', ['get', 'primary_category'],
                      // Top priority — commercial places users actively look for
                      'restaurant',             100,
                      'cafe',                   100,
                      'bar',                    100,
                      'bakery',                 100,
                      'grocery_or_supermarket', 100,
                      'convenience_store',      100,
                      'shopping_mall',          100,
                      'clothing_store',         100,
                      'pharmacy',               100,
                      'gas_station',            100,
                      'bank',                   100,
                      // Going-out & lodging
                      'karaoke',                100,
                      'billiards',              100,
                      'sauna',                  100,
                      'nightclub',              100,
                      'event_hall',             100,
                      'hotel',                  100,
                      // Mid — services & tech
                      'beauty_salon',           80,
                      'hair_care',              80,
                      'spa',                    80,
                      'gym',                    80,
                      'car_repair',             80,
                      'pc_cafe',                80,
                      // Civic / health
                      'hospital',               60,
                      'doctor',                 60,
                      'dentist',                60,
                      'school',                 60,
                      'university',             60,
                      'kindergarten',           60,
                      'library',                60,
                      'police',                 60,
                      'post_office',            60,
                      'fire_station',           60,
                      'government',             60,
                      'park',                   60,
                      // Residential — lowest priority, only show when nothing else competes
                      'apartments',             10,
                      /* default */             40,
                    ],
                    ['coalesce', ['get', 'rating'], 0],
                  ],
                  ['case', ['>', ['get', 'closure_report_count'], 1], 50, 0],
                ] as any,
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

        {/* Alternative driving routes — rendered FIRST (underneath) at low opacity
            so the active route always paints over them.  Each one is its own
            ShapeSource so we can stack them deterministically. */}
        {route?.mode === 'driving' && route.alternatives?.map((altRoute, idx) => (
          <MapboxGL.ShapeSource key={`route-alt-${idx}`} id={`route-alt-${idx}`} shape={altRoute.segments}>
            <MapboxGL.LineLayer
              id={`route-alt-${idx}-line`}
              style={{
                lineColor: '#94A3B8',  // muted gray
                lineWidth: 5,
                lineCap: 'round',
                lineJoin: 'round',
                lineOpacity: 0.55,
              }}
            />
          </MapboxGL.ShapeSource>
        ))}

        {route && (
          <MapboxGL.ShapeSource id="route" shape={route.segments}>
            {/* White casing under the route for contrast */}
            <MapboxGL.LineLayer
              id="route-casing"
              style={{
                lineColor: '#ffffff',
                lineWidth: 9,
                lineCap: 'round',
                lineJoin: 'round',
                lineOpacity: 0.85,
              }}
            />
            {/* Traffic-colored route */}
            <MapboxGL.LineLayer
              id="route-line"
              aboveLayerID="route-casing"
              style={{
                lineColor: [
                  'match', ['get', 'congestion'],
                  'low',      '#10B981',
                  'moderate', '#FBB824',
                  'heavy',    '#F59E0B',
                  'severe',   '#EF4444',
                  /* unknown */ '#0053A3',
                ] as any,
                lineWidth: 6,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </MapboxGL.ShapeSource>
        )}
      </MapboxGL.MapView>

      {/* Offline/download banner — always on top */}
      <OfflineBanner isOnline={isOnline} />

      {/* Search bar — hidden while navigating */}
      {nav.mode === 'idle' && (
        <SearchBar onPress={() => setSearchOpen(true)} onProfilePress={() => navigation.navigate('Profile')} />
      )}

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

      {/* Directions panel — hidden once navigation has started */}
      {nav.mode === 'idle' && (
        <DirectionsPanel
          multi={multi}
          loading={routeLoading}
          error={routeError}
          destinationName={routeDestName}
          onClose={handleCloseRoute}
          onStart={handleStartNavigation}
          onSelectMode={selectMode}
          onSelectAlternative={selectAlternative}
        />
      )}

      <PlaceDetailCard
        place={place}
        loading={detailLoading}
        onClose={clear}
        onRequestDirections={handleRequestDirections}
      />

      {/* Turn-by-turn navigation overlay */}
      {(nav.mode === 'active' || nav.mode === 'arrived') && (
        <NavigationOverlay
          mode={nav.mode}
          upcomingStep={nav.upcomingStep}
          distanceToNextManeuver={nav.distanceToNextManeuver}
          distanceToDestination={nav.distanceToDestination}
          durationRemainingSec={durationRemainingSec}
          destinationName={routeDestName ?? ''}
          onEnd={handleEndNavigation}
        />
      )}

      {/* Full-screen search modal */}
      <SearchScreen
        visible={searchOpen}
        geojson={geojson}
        userLocation={userLocation}
        onClose={() => setSearchOpen(false)}
        onSelect={handleSearchSelect}
        onRouteRequest={handleRouteRequest}
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
});

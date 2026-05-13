/**
 * transit-route Edge Function
 *
 * Proxies the UBSmartBus (USCC) HTTP API — which is HTTP-only and therefore
 * unreachable from Android apps — and returns structured transit leg options.
 *
 * POST body: { from_lng, from_lat, to_lng, to_lat }
 * Response:  { legs: TransitLeg[], fetchedAt: string }
 *
 * Algorithm:
 *  1. Fetch all 1,464 stops (cached per month via YYYYMM key).
 *  2. Find the N closest stops to origin and destination via Haversine.
 *  3. For each origin-side candidate stop, call search_busroutebus_list to
 *     get which routes serve it (also provides real-time arrival data).
 *  4. For each route that also serves a dest-side stop, verify stop-order via
 *     search_busroutebusstop_list (board stop must come before alight stop).
 *  5. Build a TransitLeg with walk+wait+ride times, fetch polyline.
 *  6. Return up to 3 legs sorted by totalSec.
 */

const USCC_BASE = 'http://app.uscc.mn/uscc/ubbus/busmap';
const WALK_SPEED_MPS = 1.3;   // 1.3 m/s ≈ 4.7 km/h
const AVG_WAIT_SEC   = 4 * 60; // 4-minute average bus wait
const AVG_BUS_MPS    = 5.5;    // ~20 km/h average in UB traffic
const MAX_BOARD_DIST = 1000;   // ignore stops > 1 km from origin
const MAX_ALIGHT_DIST = 1000;  // ignore stops > 1 km from destination
const CANDIDATE_STOPS = 6;     // how many nearest stops to consider each side

// USCC's HTTP endpoint occasionally hangs for 30+ seconds before resolving,
// which used to drag the whole function to a timeout. 5 seconds is enough
// for the slowest happy-path call (~1.4k stops, gzipped ≈ 100 KB) on a warm
// edge instance while still being well under the Supabase 60s ceiling.
const USCC_TIMEOUT_MS = 5_000;

// Module-level caches survive warm invocations (15+ min on Supabase). Keys
// match USCC's own YYYYMM partitioning so we don't accidentally serve stale
// stop data after a month rollover. Cold starts pay the network cost once,
// then every subsequent request inside the same instance is sub-millisecond.
const stopsCache    = new Map<string, BusStop[]>();
const routesCache   = new Map<string, RouteAtStop[]>();
const routeStopCache = new Map<number, RouteStop[]>();
const polylineCache = new Map<number, [number, number][]>();

// ── Haversine ──────────────────────────────────────────────────────────────
function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── USCC helpers ───────────────────────────────────────────────────────────
function today(): { yyyymm: string; today: string } {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return { yyyymm: `${y}${m}`, today: `${y}${m}${dd}` };
}

async function usccFetch(path: string): Promise<any> {
  // AbortController is the only way to cap upstream latency — fetch() in
  // Deno otherwise honours USCC's TCP-level timeout, which can be >30s on
  // their slow days. We surface that as a clean AbortError instead so the
  // caller can fall back to cache.
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), USCC_TIMEOUT_MS);
  try {
    const res = await fetch(`${USCC_BASE}${path}`, {
      headers: { 'User-Agent': 'MonMap/1.0' },
      signal: ctrl.signal,
      // Deno can make plain HTTP requests from Edge Functions
    });
    if (!res.ok) throw new Error(`USCC fetch failed: ${path} → ${res.status}`);
    return await res.json();
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') {
      throw new Error(`USCC timeout after ${USCC_TIMEOUT_MS}ms: ${path}`);
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

// ── Types (duplicated from src/types/transit.ts for Deno context) ──────────
interface BusStop {
  id: number;
  nameMn: string;
  nameEn: string;
  lat: number;
  lng: number;
}

interface TransitLeg {
  routeNo: string;
  routeId: number;
  boardStop: BusStop;
  alightStop: BusStop;
  stopCount: number;
  walkToStopSec: number;
  rideSec: number;
  walkFromStopSec: number;
  totalSec: number;
  hasRealtime: boolean;
  nextArrivalSec: number | null;
  boardStopDistM: number;
  alightStopDistM: number;
  polyline: [number, number][];
}

// ── Fetch all stops (raw USCC shape) ───────────────────────────────────────
async function fetchAllStops(): Promise<BusStop[]> {
  const { yyyymm, today: td } = today();
  const cached = stopsCache.get(yyyymm);
  if (cached) return cached;

  // On miss, fetch fresh; on upstream failure fall back to *any* cached
  // month-key. Stop coordinates change roughly never, so a 1-month-old
  // cached list is dramatically better than returning nothing.
  try {
    const raw = await usccFetch(`/busstop_list.json?yyyymm=${yyyymm}&today=${td}`);
    const list = Array.isArray(raw) ? raw : (raw.busstop_list ?? []);
    const stops = list.map((s: any) => ({
      id: Number(s.busstop_id),
      nameMn: s.busstop_nmmn ?? '',
      nameEn: s.busstop_nmus ?? '',
      lat: Number(s.gps_coordy),
      lng: Number(s.gps_coordx),
    })).filter((s: BusStop) => s.lat !== 0 && s.lng !== 0);
    stopsCache.set(yyyymm, stops);
    return stops;
  } catch (err) {
    // Any cached month wins over an empty response — bus stops are static-ish.
    const fallback = [...stopsCache.values()][0];
    if (fallback?.length) {
      console.warn(`fetchAllStops: USCC failed, serving stale cache (${fallback.length} stops):`, err);
      return fallback;
    }
    throw err;
  }
}

// ── Routes at a stop (with real-time arrivals) ────────────────────────────
interface RouteAtStop {
  routeId: number;
  routeNo: string;
  hasRealtime: boolean;
  nextArrivalSec: number | null;
}

async function fetchRoutesAtStop(stopId: number): Promise<RouteAtStop[]> {
  const { yyyymm, today: td } = today();
  // Cache key includes the day so real-time arrival data refreshes daily.
  // Within a single request we often hit the same stop twice (different
  // candidate fans-out converge); this dedupes those.
  const cacheKey = `${stopId}-${td}`;
  const cached = routesCache.get(cacheKey);
  if (cached) return cached;

  const raw = await usccFetch(
    `/search_busroutebus_list.json?busstop_id=${stopId}&yyyymm=${yyyymm}&today=${td}`
  );
  const list = Array.isArray(raw) ? raw : (raw.busroute_list ?? []);
  const out: RouteAtStop[] = list.map((r: any) => {
    const travelStr = r.travle_time ?? r.travel_time ?? '';
    const stopStr   = r.stop_time ?? '';
    // travle_time / stop_time are seconds-until-arrival as strings; empty = no realtime
    const nextSec =
      travelStr !== '' ? Number(travelStr) :
      stopStr   !== '' ? Number(stopStr) :
      null;
    return {
      routeId: Number(r.busroute_id),
      routeNo: String(r.busroute_no ?? r.busroute_id),
      hasRealtime: nextSec !== null,
      nextArrivalSec: nextSec,
    };
  });
  routesCache.set(cacheKey, out);
  return out;
}

// ── Ordered stop sequence for a route ─────────────────────────────────────
interface RouteStop {
  stopId: number;
  seq: number;
  lat: number;
  lng: number;
}

async function fetchRouteStops(routeId: number): Promise<RouteStop[]> {
  // Route stop sequences change only with timetable revisions (months), so
  // module-level cache is appropriate. A typical request fans into 3-6 routes
  // and we'd otherwise hit USCC for each — caching cuts that to one round-trip.
  const cached = routeStopCache.get(routeId);
  if (cached) return cached;

  const raw = await usccFetch(
    `/search_busroutebusstop_list.json?busroute_id=${routeId}&all=all`
  );
  const list = Array.isArray(raw) ? raw : (raw.busroutebusstop_list ?? []);
  const out = list
    .map((s: any) => ({
      stopId: Number(s.busstop_id),
      seq: Number(s.busstop_seq ?? s.seq ?? 0),
      lat: Number(s.gps_coordy ?? s.lat ?? 0),
      lng: Number(s.gps_coordx ?? s.lng ?? 0),
    }))
    .sort((a: RouteStop, b: RouteStop) => a.seq - b.seq);
  routeStopCache.set(routeId, out);
  return out;
}

// ── Route polyline ─────────────────────────────────────────────────────────
async function fetchRoutePolyline(routeId: number): Promise<[number, number][]> {
  const cached = polylineCache.get(routeId);
  if (cached) return cached;

  try {
    const raw = await usccFetch(
      `/search_linecfg_list.json?busroute_id=${routeId}&all=all`
    );
    const list = Array.isArray(raw) ? raw : (raw.linecfg_list ?? []);
    // Sort by cfg_seq to get the ordered polyline
    const sorted = [...list].sort((a: any, b: any) =>
      Number(a.cfg_seq ?? 0) - Number(b.cfg_seq ?? 0)
    );
    const out = sorted
      .map((p: any) => [Number(p.xcoord), Number(p.ycoord)] as [number, number])
      .filter(([lng, lat]: [number, number]) => lng !== 0 && lat !== 0);
    polylineCache.set(routeId, out);
    return out;
  } catch {
    // Polyline failure is non-fatal — the leg still works, the map just
    // can't draw it. Cache the empty array so we don't retry within this
    // warm instance.
    polylineCache.set(routeId, []);
    return [];
  }
}

// ── Main routing logic ─────────────────────────────────────────────────────
async function findTransitLegs(
  fromLng: number, fromLat: number,
  toLng:   number, toLat:   number,
): Promise<TransitLeg[]> {
  const allStops = await fetchAllStops();

  // Find nearest candidate stops to origin and destination
  const withOriginDist = allStops
    .map(s => ({ stop: s, dist: haversineM(fromLat, fromLng, s.lat, s.lng) }))
    .filter(x => x.dist <= MAX_BOARD_DIST)
    .sort((a, b) => a.dist - b.dist)
    .slice(0, CANDIDATE_STOPS);

  const withDestDist = allStops
    .map(s => ({ stop: s, dist: haversineM(toLat, toLng, s.lat, s.lng) }))
    .filter(x => x.dist <= MAX_ALIGHT_DIST)
    .sort((a, b) => a.dist - b.dist)
    .slice(0, CANDIDATE_STOPS);

  if (withOriginDist.length === 0 || withDestDist.length === 0) return [];

  const destStopIds = new Set(withDestDist.map(x => x.stop.id));
  const destDistByStopId = new Map(withDestDist.map(x => [x.stop.id, x.dist]));

  const legs: TransitLeg[] = [];
  const seenRoutes = new Set<string>(); // deduplicate route+board+alight combos

  // For each origin-side stop, get routes
  await Promise.all(
    withOriginDist.map(async ({ stop: boardStopBase, dist: boardDist }) => {
      let routes: RouteAtStop[];
      try {
        routes = await fetchRoutesAtStop(boardStopBase.id);
      } catch {
        return;
      }

      // For each route, check if it also serves a dest-side stop
      await Promise.all(
        routes.map(async (route) => {
          let routeStops: RouteStop[];
          try {
            routeStops = await fetchRouteStops(route.routeId);
          } catch {
            return;
          }

          // Find board stop position in this route's sequence
          const boardPos = routeStops.findIndex(rs => rs.stopId === boardStopBase.id);
          if (boardPos === -1) return;

          // Find the best alight stop that is AFTER board stop AND near destination
          let bestAlight: { routeStop: RouteStop; stop: BusStop; dist: number } | null = null;
          for (let i = boardPos + 1; i < routeStops.length; i++) {
            const rs = routeStops[i];
            if (destStopIds.has(rs.stopId)) {
              const destStop = withDestDist.find(x => x.stop.id === rs.stopId);
              if (destStop && (!bestAlight || destStop.dist < bestAlight.dist)) {
                bestAlight = { routeStop: rs, stop: destStop.stop, dist: destStop.dist };
              }
            }
          }
          if (!bestAlight) return;

          const key = `${route.routeId}-${boardStopBase.id}-${bestAlight.stop.id}`;
          if (seenRoutes.has(key)) return;
          seenRoutes.add(key);

          // Compute times
          const boardPos2   = routeStops.findIndex(rs => rs.stopId === boardStopBase.id);
          const alightIdx   = routeStops.findIndex(rs => rs.stopId === bestAlight!.stop.id);
          const stopCount   = alightIdx - boardPos2;

          // Ride distance: sum haversine between consecutive route stops
          let rideDistM = 0;
          for (let i = boardPos2; i < alightIdx; i++) {
            rideDistM += haversineM(
              routeStops[i].lat, routeStops[i].lng,
              routeStops[i + 1].lat, routeStops[i + 1].lng,
            );
          }
          if (rideDistM === 0) {
            // Fallback: straight-line between board and alight stop * 1.3
            rideDistM = haversineM(boardStopBase.lat, boardStopBase.lng,
              bestAlight.stop.lat, bestAlight.stop.lng) * 1.3;
          }

          const walkToStopSec   = Math.round(boardDist / WALK_SPEED_MPS);
          const rideSec         = Math.round(rideDistM / AVG_BUS_MPS);
          const walkFromStopSec = Math.round(bestAlight.dist / WALK_SPEED_MPS);
          // If realtime, use actual next arrival; otherwise assume AVG_WAIT_SEC
          const waitSec = route.nextArrivalSec !== null
            ? Math.max(0, route.nextArrivalSec)
            : AVG_WAIT_SEC;
          const totalSec = walkToStopSec + waitSec + rideSec + walkFromStopSec;

          // Fetch polyline asynchronously; clip to board→alight section
          const fullPolyline = await fetchRoutePolyline(route.routeId);

          legs.push({
            routeNo: route.routeNo,
            routeId: route.routeId,
            boardStop: boardStopBase,
            alightStop: bestAlight.stop,
            stopCount,
            walkToStopSec,
            rideSec,
            walkFromStopSec,
            totalSec,
            hasRealtime: route.hasRealtime,
            nextArrivalSec: route.nextArrivalSec,
            boardStopDistM: Math.round(boardDist),
            alightStopDistM: Math.round(bestAlight.dist),
            polyline: fullPolyline,
          });
        })
      );
    })
  );

  // Sort by total time, deduplicate same routeNo keeping best
  const byRoute = new Map<string, TransitLeg>();
  for (const leg of legs) {
    const existing = byRoute.get(leg.routeNo);
    if (!existing || leg.totalSec < existing.totalSec) {
      byRoute.set(leg.routeNo, leg);
    }
  }

  return [...byRoute.values()]
    .sort((a, b) => a.totalSec - b.totalSec)
    .slice(0, 3);
}

// ── Deno serve ─────────────────────────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
  'Content-Type': 'application/json',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: CORS });
  }

  try {
    const body = await req.json();
    const { from_lng, from_lat, to_lng, to_lat } = body;
    if (
      typeof from_lng !== 'number' || typeof from_lat !== 'number' ||
      typeof to_lng   !== 'number' || typeof to_lat   !== 'number'
    ) {
      return new Response(
        JSON.stringify({ error: 'Required: from_lng, from_lat, to_lng, to_lat (numbers)' }),
        { status: 400, headers: CORS },
      );
    }

    let legs: TransitLeg[] = [];
    let degraded = false;
    try {
      legs = await findTransitLegs(from_lng, from_lat, to_lng, to_lat);
    } catch (err) {
      // Upstream is unreachable AND we had no cached stops to fall back to.
      // Return an empty leg list with a degraded flag so the client can show
      // "Транзит мэдээлэл түр боломжгүй" instead of an error toast — the
      // map and driving directions still work.
      console.warn('transit-route: upstream failure, returning degraded response:', err);
      degraded = true;
    }
    return new Response(
      JSON.stringify({
        legs,
        fetchedAt: new Date().toISOString(),
        degraded,
        // When degraded=true, the client should display a banner inviting
        // the user to retry. We do NOT cache empty responses — the next
        // call will retry USCC and likely succeed.
      }),
      { status: 200, headers: CORS },
    );
  } catch (err) {
    // Reached only for malformed input or JSON parse failure — genuine 500.
    console.error('transit-route error:', err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: CORS },
    );
  }
});

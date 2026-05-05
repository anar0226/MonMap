// UBSmartBus transit routing types.
// A TransitLeg describes one segment of a multi-modal transit journey
// (walk to stop, ride one bus route, walk from stop).

export interface TransitStop {
  id: number;         // busstop_id
  nameMn: string;    // busstop_nmmn
  nameEn: string;    // busstop_nmus
  lat: number;       // gps_coordy
  lng: number;       // gps_coordx
}

export interface TransitLeg {
  routeNo: string;         // Bus number e.g. "26А", "11"
  routeId: number;         // busroute_id for API lookups
  boardStop: TransitStop;  // Where you get on
  alightStop: TransitStop; // Where you get off
  stopCount: number;       // Number of stops ridden

  walkToStopSec: number;   // Walking time from origin to boardStop
  rideSec: number;         // Estimated riding time
  walkFromStopSec: number; // Walking time from alightStop to destination
  totalSec: number;        // walkToStopSec + wait(240) + rideSec + walkFromStopSec

  hasRealtime: boolean;    // Whether the route has live bus tracking
  nextArrivalSec: number | null; // Seconds until next bus (null = no live data)

  boardStopDistM: number;  // Walking distance to board stop (metres)
  alightStopDistM: number; // Walking distance from alight stop (metres)

  // Polyline for the bus portion (from USCC line config API)
  polyline: [number, number][]; // [lng, lat] pairs
}

export interface TransitResult {
  legs: TransitLeg[];      // Up to 3 best options
  fetchedAt: string;       // ISO timestamp — for showing staleness
}

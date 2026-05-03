export type RecentPlace = {
  place_id: string;
  name: string;
  primary_category: string | null;
  rating: number | null;
  lng: number;
  lat: number;
};

const MAX = 10;
let recents: RecentPlace[] = [];

export function addRecent(place: RecentPlace) {
  recents = [place, ...recents.filter(r => r.place_id !== place.place_id)].slice(0, MAX);
}

export function getRecents(): RecentPlace[] {
  return [...recents];
}

export function removeRecent(placeId: string) {
  recents = recents.filter(r => r.place_id !== placeId);
}

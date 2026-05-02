export interface PlaceMapFeature {
  place_id: string;
  name: string;
  primary_category: string | null;
  rating: number | null;
}

export interface OpeningHours {
  open_now?: boolean;
  weekday_descriptions?: string[];
}

export interface Place {
  place_id: string;
  name: string;
  primary_category: string | null;
  lat: number;
  lng: number;
  formatted_address: string | null;
  short_address: string | null;
  phone_intl: string | null;
  phone_national: string | null;
  regular_opening_hours: OpeningHours | null;
  current_opening_hours: OpeningHours | null;
  rating: number | null;
  user_rating_count: number | null;
  website_uri: string | null;
  business_status: string | null;
}

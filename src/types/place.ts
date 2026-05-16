export interface PlaceMapFeature {
  place_id: string;
  name: string;
  primary_category: string | null;
  rating: number | null;
  closure_report_count: number;
  short_address: string | null;
  address_searchable: string | null;
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
  slot_capacity: number | null;
  booking_open_hour: number | null;
  booking_close_hour: number | null;
  hours_verified_at: string | null;
  district: string | null;
  khoroo: number | null;
  khoroolol: string | null;
  building_number: string | null;
  entrance_number: number | null;
  unit_number: string | null;
  deposit_amount: number | null;
  has_ar_navigation?: boolean | null;
  booking_enabled: boolean;
}

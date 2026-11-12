export interface FoodListing {
  id: number;
  donor_id: number;
  title: string;
  food_type: 'PERISHABLE_COOKED' | 'RAW_PRODUCE' | 'BAKERY' | 'PACKAGED';
  quantity_kg: number;
  prepared_at: string;
  expiry_timestamp: string;
  target_temp_celsius: number;
  dietary_notes: string;
  status: 'PENDING' | 'MATCHED' | 'IN_TRANSIT' | 'DELIVERED' | 'EXPIRED';
  latitude: number;
  longitude: number;
  urgency_score?: number;
}

export interface User {
  id: number;
  role: 'DONOR' | 'VOLUNTEER' | 'SHELTER';
  name: string;
  email: string;
  phone: string;
  latitude: number;
  longitude: number;
  created_at: string;
}

export interface RescueMission {
  id: number;
  volunteer_id: number | null;
  shelter_id: number;
  status: 'DISPATCHED' | 'PICKED_UP' | 'COMPLETED' | 'CANCELLED';
  created_at: string;
  completed_at: string | null;
  listings: number[];
  verification?: {
    pickup_verified: boolean;
    dropoff_verified: boolean;
  };
}

export interface DispatchResponse {
  mission_id: number;
  listing_ids: number[];
  shelter_id: number;
  volunteer_id: number | null;
  status: string;
  created_at: string;
  pickup_code: string;
  dropoff_code: string;
}

export interface Waypoint {
  order: number;
  type: 'START' | 'PICKUP' | 'DROPOFF';
  lat: number;
  lng: number;
  label: string;
  listing_id: number | null;
}

export interface MatchResult {
  shelter_id: number;
  shelter_name: string;
  distance_km: number;
  urgency_score: number;
  composite_score: number;
}

export interface VerificationState {
  success: boolean;
  mission_id: number;
  status: string;
  message: string;
}
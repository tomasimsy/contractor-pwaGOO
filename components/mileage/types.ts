export type TripStatus = 'pending' | 'completed' | 'synced' | 'error';

export interface Trip {
  id: string;
  user_id: string;          // ✅ required in the full Trip type
  estimate_id?: string | null;
  start_image: string;
  end_image: string;
  start_lat: number;
  start_lng: number;
  end_lat: number;
  end_lng: number;
  start_time: string;
  end_time: string;
  distance_miles: number;
  distance_meters: number;
  duration_seconds: number;
  duration_minutes: number;
  route_summary?: string;
  reimbursement: number;
  status: TripStatus;
  created_at: string;
}

// TripInput omits auto‑generated fields and user_id (will be added by the sync hook)
export type TripInput = Omit<Trip, 'id' | 'created_at' | 'status' | 'user_id'>;

export interface RouteInfo {
  distance_meters: number;
  distance_miles: number;
  duration_seconds: number;
  duration_minutes: number;
  route_summary: string;
}

export interface PhotoCapture {
  imageUrl: string;
  lat: number;
  lng: number;
  timestamp: string;
}

export interface Estimate {
  id: string;
  title: string;
  description?: string;
  estimate_number?: number;
  created_at?: string;
}
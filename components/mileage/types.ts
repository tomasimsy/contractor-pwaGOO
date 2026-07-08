export type TripStatus = 'pending' | 'completed' | 'synced' | 'error';
 
export interface Trip {
  id?: string; // UUID from Supabase, optional for offline
  estimate_id?: string | null;
  start_image: string; // URL or data URL
  end_image: string;
  start_lat: number;
  start_lng: number;
  end_lat: number;
  end_lng: number;
  start_time: string; // ISO string
  end_time: string;
  distance_miles: number;
  distance_meters: number;
  duration_seconds: number;
  duration_minutes: number;
  route_summary?: string;
  reimbursement: number;
  status: TripStatus;
  created_at?: string; // ISO string
}

export type TripInput = Omit<Trip, 'id' | 'created_at' | 'status'> & {
  status?: TripStatus;
};


 
 export interface Estimate {
  id: string;
  title: string;
  estimate_number?: number;
  created_at?: string;
}

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
import { useState, useCallback } from 'react';
import { PhotoCapture, RouteInfo, TripInput } from './types';
import { calculateReimbursement, metersToMiles, secondsToMinutes } from './utils';

export function useTripPairing() {
  const [start, setStart] = useState<PhotoCapture | null>(null);
  const [end, setEnd] = useState<PhotoCapture | null>(null);

  const reset = useCallback(() => {
    setStart(null);
    setEnd(null);
  }, []);

  const addPhoto = useCallback(
    (photo: PhotoCapture): { start: PhotoCapture; end: PhotoCapture } | null => {
      console.log('addPhoto called with', photo);
      if (!start) {
        setStart(photo);
        console.log('Start set');
        return null;
      } else if (!end) {
        setEnd(photo);
        console.log('End set, returning pair');
        // Return the pair using the captured start and the new photo
        return { start, end: photo };
      } else {
        console.log('Resetting');
        setStart(photo);
        setEnd(null);
        return null;
      }
    },
    [start, end]
  );

  // ✅ Now accepts start/end photos as parameters
const completeTrip = useCallback(
  (routeInfo: RouteInfo, startPhoto: PhotoCapture, endPhoto: PhotoCapture): TripInput | null => {
    if (!startPhoto || !endPhoto) return null;
    const trip: TripInput = {
      estimate_id: null,
      start_image: startPhoto.imageUrl,
      end_image: endPhoto.imageUrl,
      start_lat: startPhoto.lat,
      start_lng: startPhoto.lng,
      end_lat: endPhoto.lat,
      end_lng: endPhoto.lng,
      start_time: startPhoto.timestamp,
      end_time: endPhoto.timestamp,
      distance_meters: routeInfo.distance_meters,
      distance_miles: metersToMiles(routeInfo.distance_meters),
      // ✅ Round to the nearest integer
      duration_seconds: Math.round(routeInfo.duration_seconds),
    duration_minutes: Math.round(secondsToMinutes(routeInfo.duration_seconds)),
      route_summary: routeInfo.route_summary,
      reimbursement: calculateReimbursement(metersToMiles(routeInfo.distance_meters)),
    };
    reset();
    return trip;
  },
  [reset]
);

  return { start, end, addPhoto, reset, completeTrip };
}
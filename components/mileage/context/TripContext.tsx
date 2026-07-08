'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { PhotoCapture, RouteInfo } from '@/components/mileage/types';
import { supabase } from '@/lib/supabase';
import { useOfflineSync } from '@/components/mileage/useOfflineSync';
import toast from 'react-hot-toast';

const getCurrentPosition = (): Promise<GeolocationPosition> => {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    });
  });
};

interface TripContextType {
  start: PhotoCapture | null;
  isTripActive: boolean;
  isSaving: boolean;
  startTrip: () => Promise<void>;
  endTrip: () => Promise<PhotoCapture>; // returns the captured end photo
  clearTrip: () => void;
  completeTrip: (startPhoto: PhotoCapture, endPhoto: PhotoCapture) => Promise<void>;
}

const TripContext = createContext<TripContextType | undefined>(undefined);

export function TripProvider({ children }: { children: ReactNode }) {
  const [start, setStart] = useState<PhotoCapture | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const { addTrip } = useOfflineSync(userId);

  // Get current user
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id || null);
    });
  }, []);

  // Load start from localStorage on mount (so it persists across pages)
  useEffect(() => {
    if (!userId) return;
    const key = `mileage_start_${userId}`;
    const stored = localStorage.getItem(key);
    if (stored) {
      try {
        const saved = JSON.parse(stored);
        setStart(saved);
      } catch {}
    }
  }, [userId]);

  // Persist start to localStorage whenever it changes
  useEffect(() => {
    if (!userId) return;
    const key = `mileage_start_${userId}`;
    if (start) {
      localStorage.setItem(key, JSON.stringify(start));
    } else {
      localStorage.removeItem(key);
    }
  }, [start, userId]);

  // Start trip – captures GPS and saves to state/localStorage
  const startTrip = useCallback(async () => {
    try {
      const position = await getCurrentPosition();
      const startPhoto: PhotoCapture = {
        imageUrl: 'manual-start',
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        timestamp: new Date().toISOString(),
      };
      setStart(startPhoto);
      toast.success('📍 Trip started!');
    } catch (error) {
      console.error('Failed to start trip:', error);
      toast.error('Location permission denied.');
      throw error;
    }
  }, []);

  // End trip – captures GPS and returns the end photo (does NOT save yet)
  const endTrip = useCallback(async (): Promise<PhotoCapture> => {
    if (!start) {
      throw new Error('Start the trip first.');
    }
    try {
      const position = await getCurrentPosition();
      const endPhoto: PhotoCapture = {
        imageUrl: 'manual-end',
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        timestamp: new Date().toISOString(),
      };
      return endPhoto;
    } catch (error) {
      console.error('Failed to end trip:', error);
      toast.error('Location permission denied.');
      throw error;
    }
  }, [start]);

  // Complete trip – calls route API, saves trip, and clears state
  const completeTrip = useCallback(async (startPhoto: PhotoCapture, endPhoto: PhotoCapture) => {
    if (!userId) {
      toast.error('You must be logged in to save a trip.');
      return;
    }
    setIsSaving(true);
    try {
      console.log('🔄 Completing trip:', { startPhoto, endPhoto });
      const response = await fetch('/api/directions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startLng: startPhoto.lng,
          startLat: startPhoto.lat,
          endLng: endPhoto.lng,
          endLat: endPhoto.lat,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Route calculation failed');
      }
      const routeInfo: RouteInfo = await response.json();

      const distanceMiles = routeInfo.distance_miles || (routeInfo.distance_meters / 1609.344);
      const durationMinutes = routeInfo.duration_minutes || (routeInfo.duration_seconds / 60);

      const tripInput = {
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
        distance_miles: distanceMiles,
        duration_seconds: routeInfo.duration_seconds,
        duration_minutes: durationMinutes,
        route_summary: routeInfo.route_summary || 'Driving route',
        reimbursement: distanceMiles * 0.70,
      };

      const newTrip = addTrip(tripInput);
      toast.success(`✅ Trip recorded: ${distanceMiles.toFixed(2)} miles`);
      setStart(null); // clear start
      // remove from localStorage
      if (userId) {
        localStorage.removeItem(`mileage_start_${userId}`);
      }
      return newTrip;
    } catch (error: any) {
      console.error('❌ Complete trip error:', error);
      toast.error(error.message || 'Failed to save trip.');
      throw error;
    } finally {
      setIsSaving(false);
    }
  }, [userId, addTrip]);

  const clearTrip = useCallback(() => {
    setStart(null);
    if (userId) {
      localStorage.removeItem(`mileage_start_${userId}`);
    }
  }, [userId]);

  const isTripActive = !!start;

  return (
    <TripContext.Provider
      value={{
        start,
        isTripActive,
        isSaving,
        startTrip,
        endTrip,
        clearTrip,
        completeTrip,
      }}
    >
      {children}
    </TripContext.Provider>
  );
}

export function useTrip() {
  const context = useContext(TripContext);
  if (context === undefined) {
    throw new Error('useTrip must be used within a TripProvider');
  }
  return context;
}
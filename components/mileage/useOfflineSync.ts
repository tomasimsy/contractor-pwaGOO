import { useEffect, useState, useCallback } from 'react';
import { Trip, TripStatus, TripInput } from './types';
import { isOnline, generateId } from './utils';
import { supabase } from '@/lib/supabase';

export function useOfflineSync(userId: string | null) {
  // -------- State --------
  const [trips, setTrips] = useState<Trip[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isFetching, setIsFetching] = useState(false);

  // User‑specific storage key
  const storageKey = userId ? `mileage_trips_offline_${userId}` : 'mileage_trips_offline_temp';

  // -------- Local storage load/save --------
  useEffect(() => {
    if (!userId) return;
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Trip[];
        setTrips(parsed);
      } catch {
        setTrips([]);
      }
    }
  }, [userId, storageKey]);

  useEffect(() => {
    if (!userId) return;
    localStorage.setItem(storageKey, JSON.stringify(trips));
  }, [trips, userId, storageKey]);

  // -------- Add trip (local only, status = 'pending') --------
  const addTrip = useCallback(
    (trip: TripInput) => {
      if (!userId) return null as any;
      const newTrip: Trip = {
        ...trip,
        user_id: userId,
        id: generateId(),
        status: 'pending',
        created_at: new Date().toISOString(),
      };
      setTrips((prev) => [newTrip, ...prev]);
      return newTrip;
    },
    [userId]
  );

  // -------- Update trip (local + remote) --------
  const updateTrip = useCallback(
    async (id: string, updates: Partial<Trip>) => {
      if (!userId) return;
      setTrips((prev) =>
        prev.map((t) => (t.id === id ? { ...t, ...updates } : t))
      );
      if (isOnline()) {
        const { error } = await supabase
          .from('mileage_trips')
          .update(updates)
          .eq('id', id)
          .eq('user_id', userId);
        if (error) console.error('Update error', error);
      }
    },
    [userId]
  );

  // -------- Delete trip (local + remote) --------
  const removeTrip = useCallback(
    async (id: string) => {
      if (!userId) return;
      setTrips((prev) => prev.filter((t) => t.id !== id));
      if (isOnline()) {
        const { error } = await supabase
          .from('mileage_trips')
          .delete()
          .eq('id', id)
          .eq('user_id', userId);
        if (error) console.error('Delete error', error);
      }
    },
    [userId]
  );

  // -------- Update trip status (local) --------
  const updateTripStatus = useCallback((id: string, status: TripStatus) => {
    setTrips((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status } : t))
    );
  }, []);

  // -------- Sync pending/error trips to Supabase --------
  const syncPending = useCallback(async () => {
    if (!userId || !isOnline() || isSyncing) return;
    const pending = trips.filter((t) => t.status === 'pending' || t.status === 'error');
    if (pending.length === 0) {
      console.log('✅ No pending trips to sync');
      return;
    }

    setIsSyncing(true);
    try {
      for (const trip of pending) {
        const insertData = {
          user_id: userId,
          estimate_id: trip.estimate_id || null,
          start_image: trip.start_image,
          end_image: trip.end_image,
          start_lat: trip.start_lat,
          start_lng: trip.start_lng,
          end_lat: trip.end_lat,
          end_lng: trip.end_lng,
          start_time: trip.start_time,
          end_time: trip.end_time,
          distance_miles: trip.distance_miles,
          distance_meters: trip.distance_meters,
          duration_seconds: Math.round(trip.duration_seconds),
          duration_minutes: Math.round(trip.duration_minutes),
          route_summary: trip.route_summary,
          reimbursement: trip.reimbursement,
          status: 'completed',
        };
        const { error } = await supabase.from('mileage_trips').insert(insertData);
        if (error) {
          console.error('❌ Sync failed for trip', trip.id, error);
          updateTripStatus(trip.id!, 'error');
        } else {
          console.log('✅ Synced trip', trip.id);
          updateTripStatus(trip.id!, 'synced');
        }
      }
    } catch (error) {
      console.error('Sync error', error);
    } finally {
      setIsSyncing(false);
    }
  }, [userId, trips, isSyncing, updateTripStatus]);

  // -------- Fetch remote trips for this user and merge with local pending --------
  const fetchRemoteTrips = useCallback(async () => {
    if (!userId || !isOnline() || isFetching) return;
    setIsFetching(true);
    try {
      const { data, error } = await supabase
        .from('mileage_trips')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Failed to fetch remote trips', error);
        return;
      }

      const remoteTrips: Trip[] = data.map((row: any) => ({
        id: row.id,
        user_id: row.user_id,
        estimate_id: row.estimate_id,
        start_image: row.start_image,
        end_image: row.end_image,
        start_lat: row.start_lat,
        start_lng: row.start_lng,
        end_lat: row.end_lat,
        end_lng: row.end_lng,
        start_time: row.start_time,
        end_time: row.end_time,
        distance_miles: row.distance_miles,
        distance_meters: row.distance_meters,
        duration_seconds: row.duration_seconds,
        duration_minutes: row.duration_minutes,
        route_summary: row.route_summary,
        reimbursement: row.reimbursement,
        status: 'synced' as TripStatus,
        created_at: row.created_at,
      }));

      const localPending = trips.filter((t) => t.status === 'pending' || t.status === 'error');
      const merged = [...remoteTrips, ...localPending];
      merged.sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return dateB - dateA;
      });

      setTrips(merged);
      console.log(`✅ Merged ${remoteTrips.length} remote + ${localPending.length} pending = ${merged.length} trips for user ${userId}`);
    } catch (err) {
      console.error('Fetch remote error', err);
    } finally {
      setIsFetching(false);
    }
  }, [userId, trips, isFetching]);

  // -------- Manual refresh (for refresh button) --------
  const refresh = useCallback(() => {
    fetchRemoteTrips();
  }, [fetchRemoteTrips]);

  // -------- AUTO‑SYNC: when trips change and we have pending/error trips --------
  useEffect(() => {
    if (!userId || !isOnline() || isSyncing) return;
    const hasPending = trips.some((t) => t.status === 'pending' || t.status === 'error');
    if (hasPending) {
      syncPending();
    }
  }, [trips, userId, isOnline, isSyncing, syncPending]);

  // -------- AUTO‑REFRESH when coming online --------
  useEffect(() => {
    const handleOnline = () => {
      if (userId) {
        fetchRemoteTrips();
      }
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [userId, fetchRemoteTrips]);

  // -------- Auto‑sync on mount (when userId becomes available) --------
  useEffect(() => {
    if (userId && isOnline()) {
      syncPending();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // -------- Auto‑fetch remote trips on mount (when userId becomes available) --------
  useEffect(() => {
    if (userId && isOnline()) {
      fetchRemoteTrips();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // -------- Return all functions and state --------
  return {
    trips,
    addTrip,
    removeTrip,
    updateTrip,
    syncPending,    // you can still call it manually if needed
    refresh,        // manual refresh
    isSyncing,
    isFetching,
    isOnline: isOnline(),
  };
}
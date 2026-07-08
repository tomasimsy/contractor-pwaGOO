'use client';

import React, { useState, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Camera, RefreshCw, Play, Square } from 'lucide-react';
import { useTripPairing } from './useTripPairing';
import { useOfflineSync } from './useOfflineSync';
import { MileageSummary } from './MileageSummary';
import { MileageHistory } from './MileageHistory';
import { PhotoCapture, RouteInfo, Trip, Estimate } from './types';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

const MileageMap = dynamic(
  () => import('@/components/mileage/MileageMap').then((mod) => mod.MileageMap),
  { ssr: false, loading: () => <div className="h-64 w-full bg-gray-100 rounded-xl animate-pulse" /> }
);

type ImageUploadFn = (file: File) => Promise<string>;

interface MileageTrackerProps {
  uploadImage: ImageUploadFn;
  estimateId?: string;
  className?: string;
}

const getCurrentPosition = (): Promise<GeolocationPosition> => {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    });
  });
};

export function MileageTracker({ uploadImage, estimateId, className = '' }: MileageTrackerProps) {
  // -------- ALL HOOKS MUST BE CALLED UNCONDITIONALLY AT THE TOP --------
  const [userId, setUserId] = useState<string | null>(null);
  const { trips, addTrip, removeTrip, syncPending, refresh, isSyncing, updateTrip } =
    useOfflineSync(userId);
  const { start, end, addPhoto, completeTrip } = useTripPairing();
  const [isCapturing, setIsCapturing] = useState(false);
  const [isRouteLoading, setIsRouteLoading] = useState(false);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [online, setOnline] = useState(false);

  // -------- Effects --------
  useEffect(() => {
    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id || null);
      if (!user) {
        toast.error('Please log in to track mileage.');
      }
    }
    getUser();
  }, []);

  useEffect(() => {
    setOnline(navigator.onLine);
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    async function fetchEstimates() {
      if (!online || !userId) return;
      try {
        const { data, error } = await supabase
          .from('estimates')
          .select('id, title, description, estimate_number, created_at')
          .order('estimate_number', { ascending: false })
          .limit(10);
        if (error) {
          console.error('Failed to fetch estimates:', error.message);
          toast.error(`Could not load estimates: ${error.message}`);
        } else {
          setEstimates(data || []);
        }
      } catch (err) {
        console.error('Unexpected error fetching estimates:', err);
        toast.error('Failed to load estimates.');
      }
    }
    fetchEstimates();
  }, [online, userId]);

  useEffect(() => {
    if (typeof uploadImage !== 'function') {
      console.error('MileageTracker: uploadImage prop must be a function.');
      toast.error('Upload function not configured.');
    }
  }, [uploadImage]);

  // -------- All useCallbacks (unconditionally) --------
  const handleCalculateRoute = useCallback(
    async (startPhoto: PhotoCapture, endPhoto: PhotoCapture) => {
      console.log('🔁 Calculating route from', startPhoto, 'to', endPhoto);
      console.time('⏱️ Route calculation');
      setIsRouteLoading(true);
      try {
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
        console.timeEnd('⏱️ Route calculation');

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Route calculation failed');
        }
        const routeInfo: RouteInfo = await response.json();

        const tripInput = completeTrip(routeInfo, startPhoto, endPhoto);
        if (!tripInput) {
          toast.error('Failed to create trip.');
          return;
        }

        if (estimateId) {
          tripInput.estimate_id = estimateId;
        }

        const newTrip = addTrip(tripInput);
        toast.success(`Trip recorded: ${tripInput.distance_miles.toFixed(2)} miles`);
        setSelectedTrip(newTrip);
      } catch (error: any) {
        console.error('Route error', error);
        toast.error(error.message || 'Failed to calculate route.');
      } finally {
        setIsRouteLoading(false);
      }
    },
    [completeTrip, addTrip, estimateId]
  );

  const handleTakePhoto = useCallback(async () => {
    if (typeof uploadImage !== 'function') {
      toast.error('Upload function missing.');
      return;
    }

    let position: GeolocationPosition;
    try {
      position = await getCurrentPosition();
    } catch {
      toast.error('Location permission denied.');
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      setIsCapturing(true);
      try {
        const imageUrl = await uploadImage(file);
        const photo: PhotoCapture = {
          imageUrl,
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          timestamp: new Date().toISOString(),
        };
        const pair = addPhoto(photo);
        if (pair) {
          await handleCalculateRoute(pair.start, pair.end);
        } else {
          toast.success('Start recorded. Take another photo at destination.');
        }
      } catch {
        toast.error('Upload failed.');
      } finally {
        setIsCapturing(false);
        input.value = '';
      }
    };
    input.click();
  }, [addPhoto, uploadImage, handleCalculateRoute]);

  const handleManualStart = useCallback(async () => {
    try {
      const position = await getCurrentPosition();
      const photo: PhotoCapture = {
        imageUrl: 'manual-start',
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        timestamp: new Date().toISOString(),
      };
      addPhoto(photo);
      toast.success('📍 Start recorded (manual). Now end the trip.');
    } catch {
      toast.error('Location permission denied.');
    }
  }, [addPhoto]);

  const handleManualEnd = useCallback(async () => {
    if (!start) {
      toast.error('Start the trip first.');
      return;
    }
    try {
      const position = await getCurrentPosition();
      const photo: PhotoCapture = {
        imageUrl: 'manual-end',
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        timestamp: new Date().toISOString(),
      };
      const pair = addPhoto(photo);
      if (pair) {
        await handleCalculateRoute(pair.start, pair.end);
      } else {
        toast.error('Failed to end trip.');
      }
    } catch {
      toast.error('Location permission denied.');
    }
  }, [start, addPhoto, handleCalculateRoute]);

  const handleViewRoute = useCallback((trip: Trip) => {
    setSelectedTrip(trip);
  }, []);

  const handleDelete = useCallback(
    async (id: string) => {
      await removeTrip(id);
      if (selectedTrip?.id === id) setSelectedTrip(null);
      toast.success('Trip deleted.');
    },
    [removeTrip, selectedTrip]
  );

  const handleSync = useCallback(() => {
    if (!online) {
      toast.error('Offline. Will sync when online.');
      return;
    }
    syncPending();
    toast.success('Syncing...');
  }, [online, syncPending]);

  const handleRefresh = useCallback(() => {
    if (!online) {
      toast.error('Offline. Cannot refresh.');
      return;
    }
    refresh();
    toast.success('Refreshed from cloud.');
  }, [online, refresh]);

  // -------- CONDITIONAL RETURN – placed AFTER all hooks --------
  if (!userId) {
    return (
      <div className="max-w-3xl mx-auto p-4 text-center">
        <p className="text-gray-600">Please log in to use the mileage tracker.</p>
        <button
          onClick={() => supabase.auth.signInWithOAuth({ provider: 'google' })}
          className="mt-4 bg-blue-600 text-white px-6 py-2 rounded-lg"
        >
          Log In
        </button>
      </div>
    );
  }

  // -------- Render (only when userId is truthy) --------
  return (
    <div className={`max-w-3xl mx-auto p-4 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-gray-800">Mileage Tracker</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={!online}
            className="p-2 rounded-full hover:bg-gray-100 text-gray-600 disabled:opacity-50"
            aria-label="Refresh from cloud"
          >
            <RefreshCw size={20} className={isSyncing ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={handleSync}
            disabled={isSyncing || !online}
            className="p-2 rounded-full hover:bg-gray-100 text-gray-600 disabled:opacity-50"
            aria-label="Sync pending trips"
          >
            <RefreshCw size={20} className={isSyncing ? 'animate-spin' : ''} />
          </button>
          <span className="text-xs text-gray-500">
            {online ? '🟢 Online' : '🔴 Offline'}
          </span>
        </div>
      </div>

      <MileageSummary trips={trips} />

      <div className="my-6 space-y-4">
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={handleManualStart}
            disabled={!!start || isRouteLoading || !online}
            className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-5 rounded-full flex items-center gap-2 shadow transition disabled:opacity-50"
          >
            <Play size={18} />
            Start Trip
          </button>
          <button
            onClick={handleManualEnd}
            disabled={!start || !!end || isRouteLoading || !online}
            className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-5 rounded-full flex items-center gap-2 shadow transition disabled:opacity-50"
          >
            <Square size={18} />
            End Trip
          </button>
        </div>
        <p className="text-xs text-gray-500 text-center">
          {start && !end
            ? '📍 Start recorded. Click "End Trip" when you arrive.'
            : 'Click "Start Trip" to begin.'}
        </p>

        <div className="border-t border-gray-200 pt-3 flex flex-col items-center">
          <button
            onClick={handleTakePhoto}
            disabled={isCapturing || isRouteLoading || typeof uploadImage !== 'function'}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-5 rounded-full flex items-center gap-2 shadow transition disabled:opacity-50"
          >
            <Camera size={18} />
            {isCapturing ? 'Compressing...' : 'Take Photo Instead'}
          </button>
          <span className="text-xs text-gray-400 mt-1">(Alternative: upload photos with GPS)</span>
        </div>
      </div>

      {selectedTrip && (
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-lg font-semibold">Route View</h3>
            <button
              onClick={() => setSelectedTrip(null)}
              className="text-sm text-blue-600 hover:underline"
            >
              Close
            </button>
          </div>
          <MileageMap trip={selectedTrip} />
          <div className="text-sm text-gray-600 mt-1 flex justify-between">
            <span>{selectedTrip.route_summary || 'Driving route'}</span>
            <span>{selectedTrip.distance_miles.toFixed(2)} mi</span>
          </div>
        </div>
      )}

      <div className="mt-6">
        <h3 className="text-lg font-semibold mb-3">Trip History</h3>
        <MileageHistory
          trips={trips}
          estimates={estimates}
          onDelete={handleDelete}
          onViewRoute={handleViewRoute}
          onUpdateTrip={updateTrip}
        />
      </div>
    </div>
  );
}
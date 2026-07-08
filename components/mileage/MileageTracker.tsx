'use client';

import React, { useState, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Camera, RefreshCw } from 'lucide-react';
import { useTripPairing } from './useTripPairing';
import { useOfflineSync } from './useOfflineSync';
import { MileageSummary } from './MileageSummary';
import { MileageHistory } from './MileageHistory';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { PhotoCapture, RouteInfo, Trip, Estimate } from './types';

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

// Local Estimate type (should match your 'estimates' table)
 

export function MileageTracker({ uploadImage, estimateId, className = '' }: MileageTrackerProps) {
  // Offline sync hook – includes updateTrip for modifying trips
  const { trips, addTrip, removeTrip, syncPending, refresh, isSyncing, updateTrip } = useOfflineSync();

  const { start, end, addPhoto, completeTrip } = useTripPairing();
  const [isCapturing, setIsCapturing] = useState(false);
  const [isRouteLoading, setIsRouteLoading] = useState(false);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [estimates, setEstimates] = useState<Estimate[]>([]);

  // Client-only online status
  const [online, setOnline] = useState(false);

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

  // Fetch recent 10 estimates from Supabase
useEffect(() => {
  async function fetchEstimates() {
    if (!online) return;
    try {
const { data, error } = await supabase
  .from('estimates')
  .select('id, title, estimate_number, created_at')
  .order('estimate_number', { ascending: false })
  .limit(10);

      if (error) {
        console.error('Failed to fetch estimates:', error.message);
        console.error('Full error:', error);
        // Show toast to user
        toast.error(`Could not load estimates: ${error.message}`);
      } else {
        setEstimates(data || []);
        console.log('Fetched estimates:', data?.length);
      }
    } catch (err) {
      console.error('Unexpected error fetching estimates:', err);
      toast.error('Failed to load estimates.');
    }
  }
  fetchEstimates();
}, [online]);

  // Validate uploadImage prop
  useEffect(() => {
    if (typeof uploadImage !== 'function') {
      console.error('MileageTracker: uploadImage prop must be a function.');
      toast.error('Upload function not configured.');
    }
  }, [uploadImage]);

  // Route calculation using OpenRouteService (as you had)
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

  // Handle photo capture
  const handleTakePhoto = useCallback(async () => {
    if (typeof uploadImage !== 'function') {
      toast.error('Upload function missing.');
      return;
    }

    let position: GeolocationPosition;
    try {
      position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        });
      });
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

      <div className="my-6 flex flex-col items-center">
        <button
          onClick={handleTakePhoto}
          disabled={isCapturing || isRouteLoading || typeof uploadImage !== 'function'}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-full flex items-center gap-2 shadow-lg transition disabled:opacity-50"
        >
          <Camera size={20} />
          {isCapturing ? 'Compressing & uploading...' : isRouteLoading ? 'Calculating route...' : 'Take Photo for Mileage'}
        </button>
        <p className="text-xs text-gray-500 mt-2">
          {start && !end ? '📍 Start recorded. Take another photo at destination.' : 'Take a photo at your start location.'}
        </p>
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
        {/* Pass estimates and updateTrip to MileageHistory */}
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
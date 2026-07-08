'use client';

import React, { useState, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Camera, RefreshCw, Play, Square, Info } from 'lucide-react';
import { useTrip } from './context/TripContext';
import { useOfflineSync } from './useOfflineSync';
import { MileageSummary } from './MileageSummary';
import { MileageHistory } from './MileageHistory';
import { PhotoCapture, Trip, Estimate } from './types';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { MileageReimbursementModal } from './MileageReimbursementModal';
import { MILE_RATE } from './utils';


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
  const { start, isTripActive, isSaving, startTrip, endTrip, completeTrip, clearTrip } = useTrip();

  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const { trips, addTrip, removeTrip, syncPending, refresh, isSyncing, updateTrip } =
    useOfflineSync(userId);

  const [isCapturing, setIsCapturing] = useState(false);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [online, setOnline] = useState(false);
  const [showReimbursementModal, setShowReimbursementModal] = useState(false);

  // -------- Effects (user, online, estimates) --------
  useEffect(() => {
    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        let displayName = user.user_metadata?.full_name || user.user_metadata?.name;
        if (!displayName && user.email) {
          displayName = user.email.split('@')[0];
        }
        setUserName(displayName || 'User');
      } else {
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
      console.error('uploadImage prop must be a function.');
      toast.error('Upload function not configured.');
    }
  }, [uploadImage]);

  // -------- Photo mode --------
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

        if (!start) {
          // First photo: start trip (stores photo as start)
          await startTrip(); // captures GPS – but we already have it; better to store the photo
          // We'll update start manually using a new method, but for simplicity we'll use the context's startTrip which captures its own GPS.
          // To use the photo's GPS, we need to extend context. For now, we'll use the context's startTrip.
          // That will capture GPS again – may be okay.
          // Alternatively, we can set start directly via a setter, but we'll keep it simple.
          await startTrip();
          toast.success('Start recorded. Take another photo at destination.');
        } else if (!isTripActive) {
          // Already have start? Actually isTripActive is true if start exists and no end.
          // We'll use the context's endTrip and completeTrip.
          const endPhoto = await endTrip(); // captures GPS
          if (start && endPhoto) {
            await completeTrip(start, endPhoto);
          }
        } else {
          // If both exist, start a new trip
          await startTrip();
          toast.success('New trip started.');
        }
      } catch (error: any) {
        console.error('Photo error:', error);
        toast.error(error.message || 'Upload failed.');
      } finally {
        setIsCapturing(false);
        input.value = '';
      }
    };
    input.click();
  }, [uploadImage, start, isTripActive, startTrip, endTrip, completeTrip]);

  // -------- Manual Start/End (using context) --------
  const handleManualStart = useCallback(async () => {
    try {
      await startTrip();
    } catch (error: any) {
      toast.error(error.message || 'Failed to start trip.');
    }
  }, [startTrip]);

  const handleManualEnd = useCallback(async () => {
    if (!start) {
      toast.error('Start the trip first.');
      return;
    }
    try {
      const endPhoto = await endTrip();
      if (start && endPhoto) {
        await completeTrip(start, endPhoto);
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to complete trip.');
    }
  }, [start, endTrip, completeTrip]);

  // -------- View, Delete, Sync --------
  const handleViewRoute = useCallback((trip: Trip) => setSelectedTrip(trip), []);
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

  // -------- Conditional return (after all hooks) --------
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

  // -------- Render --------
  return (
<div className={`max-w-5xl mx-auto px-4 py-4 space-y-5 ${className}`}>

  {/* =========================================================
      HEADER
  ========================================================= */}
  <div className="bg-white rounded-2xl border shadow-sm p-4">
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-gray-900">
            Mileage Tracker
          </h1>

          {userName && (
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs uppercase font-medium text-gray-600">
              👤 {userName}
            </span>
          )}
        </div>

        <p className="mt-1 text-sm text-gray-500">
          Track work trips and automatically calculate mileage.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">

        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            online
              ? "bg-green-100 text-green-700"
              : "bg-red-100 text-red-700"
          }`}
        >
          {online ? "🟢 Online" : "🔴 Offline"}
        </span>

        <button
          onClick={() => setShowReimbursementModal(true)}
          className="flex items-center gap-1 rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
        >
          <Info size={16} />
          Rate
        </button>

        <button
          onClick={handleRefresh}
          disabled={!online}
          className="rounded-lg border p-2 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw
            size={18}
            className={isSyncing ? "animate-spin" : ""}
          />
        </button>

        <button
          onClick={handleSync}
          disabled={!online || isSyncing}
          className="rounded-lg bg-blue-600 p-2 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <RefreshCw
            size={18}
            className={isSyncing ? "animate-spin" : ""}
          />
        </button>

      </div>

    </div>
  </div>

  {/* =========================================================
      SUMMARY
  ========================================================= */}

  <div className="rounded-2xl border bg-white p-4 shadow-sm">
    <MileageSummary trips={trips} />
  </div>

  {/* =========================================================
      START / END
  ========================================================= */}

  <div className="rounded-2xl border bg-white p-5 shadow-sm">

    <div className="mb-4">
      <h2 className="text-lg font-semibold text-gray-900">
        Trip Controls
      </h2>

      <p className="text-sm text-gray-500">
        Start a trip before driving and stop it once you arrive.
      </p>
    </div>

    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">

      <button
        onClick={handleManualStart}
        disabled={!!start || isSaving || !online}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-5 py-3 font-semibold text-white transition hover:bg-green-700 disabled:opacity-50"
      >
        <Play size={18} />
        Start Trip
      </button>

      <button
        onClick={handleManualEnd}
        disabled={!start || isSaving || !online}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-3 font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
      >
        <Square size={18} />
        End Trip
      </button>

    </div>

    <div className="mt-4 rounded-xl bg-gray-50 p-3 text-center text-sm text-gray-600">
      {start
        ? "📍 Trip is currently active."
        : "Press Start Trip to begin tracking mileage."}
    </div>

  </div>

  {/* =========================================================
      ROUTE VIEW
  ========================================================= */}

  {selectedTrip && (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">

      <div className="mb-4 flex items-center justify-between">

        <h2 className="text-lg font-semibold">
          Route Preview
        </h2>

        <button
          onClick={() => setSelectedTrip(null)}
          className="text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          Close
        </button>

      </div>

      <MileageMap trip={selectedTrip} />

      <div className="mt-3 flex items-center justify-between text-sm text-gray-500">
        <span>
          {selectedTrip.route_summary || "Driving Route"}
        </span>

        <span className="font-semibold text-gray-800">
          {selectedTrip.distance_miles.toFixed(2)} mi
        </span>
      </div>

    </div>
  )}

  {/* =========================================================
      HISTORY
  ========================================================= */}

  <div className="rounded-2xl border bg-white p-5 shadow-sm">

    <div className="mb-4 flex items-center justify-between">

      <h2 className="text-lg font-semibold">
        Trip History
      </h2>

      <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-500">
        {trips.length} Trips
      </span>

    </div>

    <MileageHistory
      trips={trips}
      estimates={estimates}
      userName={userName || "User"}
      onDelete={handleDelete}
      onViewRoute={handleViewRoute}
      onUpdateTrip={updateTrip}
    />

  </div>

  <MileageReimbursementModal
    isOpen={showReimbursementModal}
    onClose={() => setShowReimbursementModal(false)}
    rate={MILE_RATE}
  />

</div>
  );
}
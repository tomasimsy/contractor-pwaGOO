'use client';

import React from 'react';
import { Trip } from './types';
import { MileageCard } from './MileageCard';

interface Estimate {
  id: string;
  title: string;
}

interface MileageHistoryProps {
  trips: Trip[];
  estimates: Estimate[];
  onDelete: (id: string) => void;
  onViewRoute: (trip: Trip) => void;
  onUpdateTrip: (id: string, updates: Partial<Trip>) => void;
}

export function MileageHistory({
  trips,
  estimates,
  onDelete,
  onViewRoute,
  onUpdateTrip,
}: MileageHistoryProps) {
  if (trips.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p>No trips recorded yet.</p>
        <p className="text-sm">Take a photo at your start and end locations to begin.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {trips.map((trip) => (
        <MileageCard
          key={trip.id}
          trip={trip}
          estimates={estimates}
          onDelete={onDelete}
          onViewRoute={onViewRoute}
          onUpdateTrip={onUpdateTrip}
        />
      ))}
    </div>
  );
}
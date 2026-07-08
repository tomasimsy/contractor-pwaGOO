'use client';

import React from 'react';
import { Trip, Estimate } from './types';
import { MileageCard } from './MileageCard';

interface MileageHistoryProps {
  trips: Trip[];
  estimates: Estimate[];
  userName: string; // 👈 passed down to cards
  onDelete: (id: string) => void;
  onViewRoute: (trip: Trip) => void;
  onUpdateTrip: (id: string, updates: Partial<Trip>) => void;
}

export function MileageHistory({
  trips,
  estimates,
  userName,
  onDelete,
  onViewRoute,
  onUpdateTrip,
}: MileageHistoryProps) {
  if (trips.length === 0) {
    return (
      <div className="text-center py-6 text-gray-400 text-sm">
        <p>No trips recorded yet.</p>
        <p className="text-xs">Start a trip from the bottom nav or take a photo.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {trips.map((trip) => (
        <MileageCard
          key={trip.id}
          trip={trip}
          estimates={estimates}
          userName={userName}
          onDelete={onDelete}
          onViewRoute={onViewRoute}
          onUpdateTrip={onUpdateTrip}
        />
      ))}
    </div>
  );
}
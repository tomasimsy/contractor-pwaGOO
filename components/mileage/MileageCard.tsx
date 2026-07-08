'use client';

import React from 'react';
import { Trip, Estimate } from './types'; // ✅ import Estimate from types
import { formatDistance, formatDuration, formatCurrency, formatDate } from './utils';
import { MapPin, Clock, DollarSign, Trash2, ExternalLink } from 'lucide-react';

interface MileageCardProps {
  trip: Trip;
  estimates: Estimate[]; // ✅ uses imported Estimate
  onDelete: (id: string) => void;
  onViewRoute: (trip: Trip) => void;
  onUpdateTrip: (id: string, updates: Partial<Trip>) => void;
}

export function MileageCard({
  trip,
  estimates = [],
  onDelete,
  onViewRoute,
  onUpdateTrip,
}: MileageCardProps) {
  const statusColor =
    trip.status === 'synced'
      ? 'bg-green-100 text-green-800'
      : trip.status === 'pending'
      ? 'bg-yellow-100 text-yellow-800'
      : 'bg-red-100 text-red-800';

  const handleEstimateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    onUpdateTrip(trip.id!, { estimate_id: value || null });
  };

  return (
    <div className="bg-white rounded-xl shadow-md overflow-hidden border border-gray-100 transition hover:shadow-lg">
      <div className="p-4">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusColor}`}>
                {trip.status === 'synced' ? 'Synced' : trip.status === 'pending' ? 'Pending' : 'Error'}
              </span>
              <span className="text-xs text-gray-500">{formatDate(trip.created_at || trip.start_time)}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <MapPin size={14} />
              <span>Start → End</span>
            </div>
          </div>
          <button
            onClick={() => onDelete(trip.id!)}
            className="text-gray-400 hover:text-red-500 transition"
            aria-label="Delete trip"
          >
            <Trash2 size={18} />
          </button>
        </div>

        {/* Estimate dropdown */}
        <div className="mt-3">
          <select
            value={trip.estimate_id || ''}
            onChange={handleEstimateChange}
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select estimate</option>
            {estimates.map((est) => (
              <option key={est.id} value={est.id}>
                {est.estimate_number ? `#${est.estimate_number} - ` : ''}{est.title}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-3">
          <div className="bg-gray-50 rounded-lg p-2 text-center">
            <div className="text-xs text-gray-500">Distance</div>
            <div className="font-semibold text-sm">{formatDistance(trip.distance_miles)}</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-2 text-center">
            <div className="text-xs text-gray-500">Time</div>
            <div className="font-semibold text-sm">{formatDuration(trip.duration_minutes)}</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-2 text-center">
            <div className="text-xs text-gray-500">Reimbursement</div>
            <div className="font-semibold text-sm text-green-600">{formatCurrency(trip.reimbursement)}</div>
          </div>
        </div>

        <div className="flex justify-end mt-3 gap-2">
          <button
            onClick={() => onViewRoute(trip)}
            className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
          >
            <ExternalLink size={14} /> View Route
          </button>
        </div>
      </div>
    </div>
  );
}
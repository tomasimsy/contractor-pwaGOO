'use client';

import React from 'react';
import { Trip, Estimate } from './types';
import { formatDistance, formatDuration, formatCurrency, formatDate } from './utils';
import { MapPin, Clock, DollarSign, Trash2, ExternalLink } from 'lucide-react';

interface MileageCardProps {
  trip: Trip;
  estimates: Estimate[];
  userName: string; // 👈 user name/email to display
  onDelete: (id: string) => void;
  onViewRoute: (trip: Trip) => void;
  onUpdateTrip: (id: string, updates: Partial<Trip>) => void;
}

const truncateWords = (text: string, maxWords: number = 6): string => {
  if (!text) return '';
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(' ') + '...';
};

export function MileageCard({
  trip,
  estimates,
  userName,
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

  // Generate a simple trip number from the trip id (or use index)
  const tripNumber = trip.id ? trip.id.slice(-6) : '';

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 hover:shadow-md transition p-3">
      <div className="flex items-start justify-between gap-2">
        {/* Left: Title and meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-gray-700">
              Trip #{tripNumber}
            </span>
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${statusColor}`}>
              {trip.status === 'synced' ? 'Synced' : trip.status === 'pending' ? 'Pending' : 'Error'}
            </span>
            <span className="text-[10px] text-gray-400">
              {formatDate(trip.created_at || trip.start_time)}
            </span>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-gray-500 mt-0.5">
            <MapPin size={12} />
            <span className="truncate">Start → End</span>
            <span className="text-gray-300 mx-1">•</span>
            <span className="truncate uppercase">👤 {userName}</span>
          </div>
        </div>

        {/* Delete button */}
        <button
          onClick={() => onDelete(trip.id!)}
          className="text-gray-300 hover:text-red-500 transition p-1"
          aria-label="Delete trip"
        >
          <Trash2 size={16} />
        </button>
      </div>

      {/* Estimate dropdown – compact */}
      <div className="mt-2">
        <select
          value={trip.estimate_id || ''}
          onChange={handleEstimateChange}
          className="w-full text-xs border border-gray-200 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
        >
          <option value="">Select estimate</option>
          {estimates.map((est) => (
            <option key={est.id} value={est.id}>
              {est.estimate_number ? `#${est.estimate_number} - ` : ''}
              {truncateWords(est.description || est.title, 6)}
            </option>
          ))}
        </select>
      </div>

      {/* Metrics – compact grid */}
      <div className="grid grid-cols-3 gap-1.5 mt-2">
        <div className="bg-gray-50 rounded-md p-1.5 text-center">
          <div className="text-[9px] text-gray-500 uppercase tracking-wide">Distance</div>
          <div className="text-sm font-semibold">{formatDistance(trip.distance_miles)}</div>
        </div>
        <div className="bg-gray-50 rounded-md p-1.5 text-center">
          <div className="text-[9px] text-gray-500 uppercase tracking-wide">Time</div>
          <div className="text-sm font-semibold">{formatDuration(trip.duration_minutes)}</div>
        </div>
        <div className="bg-gray-50 rounded-md p-1.5 text-center">
          <div className="text-[9px] text-gray-500 uppercase tracking-wide">Reimb.</div>
          <div className="text-sm font-semibold text-green-600">{formatCurrency(trip.reimbursement)}</div>
        </div>
      </div>

      {/* View Route button */}
      <div className="mt-2 flex justify-end">
        <button
          onClick={() => onViewRoute(trip)}
          className="text-[11px] text-blue-500 hover:text-blue-700 flex items-center gap-1"
        >
          View Route <ExternalLink size={12} />
        </button>
      </div>
    </div>
  );
}
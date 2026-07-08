'use client';

import React, { useMemo } from 'react';
import { Trip } from './types';
import { formatDistance, formatDuration, formatCurrency } from './utils';
import { Car, Calendar, DollarSign, Clock, TrendingUp } from 'lucide-react';

interface MileageSummaryProps {
  trips: Trip[];
}

export function MileageSummary({ trips }: MileageSummaryProps) {
  const stats = useMemo(() => {
    const totalTrips = trips.length;
    const totalMiles = trips.reduce((sum, t) => sum + t.distance_miles, 0);
    const totalReimbursement = trips.reduce((sum, t) => sum + t.reimbursement, 0);
    const totalMinutes = trips.reduce((sum, t) => sum + t.duration_minutes, 0);
    const avgDistance = totalTrips > 0 ? totalMiles / totalTrips : 0;
    return { totalTrips, totalMiles, totalReimbursement, totalMinutes, avgDistance };
  }, [trips]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <StatCard
        icon={<Calendar size={18} />}
        label="Today's Trips"
        value={stats.totalTrips.toString()}
      />
      <StatCard
        icon={<Car size={18} />}
        label="Miles"
        value={formatDistance(stats.totalMiles)}
      />
      <StatCard
        icon={<DollarSign size={18} />}
        label="Reimbursement"
        value={formatCurrency(stats.totalReimbursement)}
      />
      <StatCard
        icon={<TrendingUp size={18} />}
        label="Avg Trip"
        value={formatDistance(stats.avgDistance)}
      />
      <StatCard
        icon={<Clock size={18} />}
        label="Drive Time"
        value={formatDuration(stats.totalMinutes)}
      />
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100 flex flex-col items-center text-center">
      <div className="text-blue-500 mb-1">{icon}</div>
      <div className="text-2xl font-bold text-gray-800">{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}
'use client';

import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup } from 'react-leaflet';
import { LatLngTuple, Icon } from 'leaflet';
import { Trip } from './types';

// Use CDN for marker icons to avoid asset import issues
const defaultIcon = new Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

interface MileageMapProps {
  trip: Pick<Trip, 'start_lat' | 'start_lng' | 'end_lat' | 'end_lng' | 'route_summary'>;
  className?: string;
}

export function MileageMap({ trip, className = '' }: MileageMapProps) {
  const [hasMounted, setHasMounted] = useState(false);

  // Ensure component only renders after mount (client-side)
  useEffect(() => {
    setHasMounted(true);
  }, []);

  if (!hasMounted) {
    return <div className={`h-64 w-full bg-gray-100 rounded-xl animate-pulse ${className}`} />;
  }

  const startPos: LatLngTuple = [trip.start_lat, trip.start_lng];
  const endPos: LatLngTuple = [trip.end_lat, trip.end_lng];
  const center: LatLngTuple = [
    (trip.start_lat + trip.end_lat) / 2,
    (trip.start_lng + trip.end_lng) / 2,
  ];
  const positions: LatLngTuple[] = [startPos, endPos];

  return (
    <div className={`w-full h-64 rounded-xl overflow-hidden ${className}`}>
      <MapContainer
        center={center}
        zoom={13}
        style={{ height: '100%', width: '100%' }}
        whenReady={() => console.log('Map ready')}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={startPos} icon={defaultIcon}>
          <Popup>Start</Popup>
        </Marker>
        <Marker position={endPos} icon={defaultIcon}>
          <Popup>End</Popup>
        </Marker>
        <Polyline positions={positions} color="#3b82f6" weight={4} />
      </MapContainer>
    </div>
  );
}
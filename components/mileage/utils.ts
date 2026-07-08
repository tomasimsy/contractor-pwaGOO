import { RouteInfo } from './types';

export const MILE_RATE = 0.70; // configurable

export function formatDistance(miles: number): string {
  return `${miles.toFixed(2)} mi`;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${hours}h ${mins}m`;
}

export function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function calculateReimbursement(miles: number): number {
  return miles * MILE_RATE;
}

export function metersToMiles(meters: number): number {
  return meters / 1609.344;
}

export function secondsToMinutes(seconds: number): number {
  return seconds / 60;
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

export function isOnline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine;
}
const CACHE_NAME = 'osr-v1';
const urlsToCache = [
  '/',
  '/dashboard',
  '/login',
  '/manifest.json',
  '/offline'
];

// Simple service worker
self.addEventListener('install', (event) => {
  console.log('Service Worker installed');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker activated');
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});

 
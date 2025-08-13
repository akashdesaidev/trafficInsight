// Service Worker for Traffic Insight Dashboard
// Provides offline functionality, caching, and performance optimization

const CACHE_NAME = 'traffic-insight-v1';
const API_CACHE_NAME = 'traffic-api-v1';

// Static assets to cache
const STATIC_ASSETS = [
  '/',
  '/favicon.ico',
  '/manifest.json',
  // Add other static assets as needed
];

// API endpoints to cache (with TTL)
const API_CACHE_CONFIG = {
  '/api/health': { ttl: 60000 }, // 1 minute
  '/api/traffic/live-traffic': { ttl: 120000 }, // 2 minutes
  '/api/traffic/traffic-incidents': { ttl: 120000 }, // 2 minutes
  '/api/historical-traffic': { ttl: 300000 }, // 5 minutes
  '/api/top-chokepoints': { ttl: 3600000 }, // 1 hour
};

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('Service Worker: Installation complete');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('Service Worker: Installation failed', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            // Delete old cache versions
            if (cacheName !== CACHE_NAME && cacheName !== API_CACHE_NAME) {
              console.log('Service Worker: Deleting old cache', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('Service Worker: Activation complete');
        return self.clients.claim();
      })
  );
});

// Fetch event - handle requests with caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Handle API requests
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleApiRequest(request));
    return;
  }

  // Handle static assets
  if (request.destination === 'document' || 
      request.destination === 'script' || 
      request.destination === 'style' ||
      request.destination === 'image') {
    event.respondWith(handleStaticRequest(request));
    return;
  }

  // Default: network first
  event.respondWith(fetch(request));
});

// Handle API requests with cache-first strategy for suitable endpoints
async function handleApiRequest(request) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const cacheConfig = API_CACHE_CONFIG[pathname];

  if (!cacheConfig) {
    // No caching config, go straight to network
    return fetch(request);
  }

  const cache = await caches.open(API_CACHE_NAME);
  const cachedResponse = await cache.match(request);

  // Check if cached response is still valid
  if (cachedResponse) {
    const cacheDate = new Date(cachedResponse.headers.get('sw-cache-date'));
    const now = new Date();
    
    if (now - cacheDate < cacheConfig.ttl) {
      console.log('Service Worker: Serving API from cache', pathname);
      return cachedResponse;
    } else {
      // Cached response expired
      await cache.delete(request);
    }
  }

  try {
    console.log('Service Worker: Fetching API from network', pathname);
    const response = await fetch(request);

    if (response.ok) {
      // Clone response before caching
      const responseToCache = response.clone();
      
      // Add cache timestamp
      const headers = new Headers(responseToCache.headers);
      headers.set('sw-cache-date', new Date().toISOString());
      
      const cachedResponse = new Response(responseToCache.body, {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers: headers
      });

      await cache.put(request, cachedResponse);
    }

    return response;
  } catch (error) {
    console.error('Service Worker: API fetch failed', error);
    
    // Return cached response if available, even if expired
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Return offline response
    return new Response(
      JSON.stringify({ 
        error: 'Offline', 
        message: 'Unable to fetch data while offline' 
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

// Handle static requests with cache-first strategy
async function handleStaticRequest(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    console.log('Service Worker: Serving static asset from cache', request.url);
    return cachedResponse;
  }

  try {
    console.log('Service Worker: Fetching static asset from network', request.url);
    const response = await fetch(request);

    if (response.ok) {
      // Cache successful responses
      await cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    console.error('Service Worker: Static fetch failed', error);
    
    // Return fallback for navigation requests
    if (request.destination === 'document') {
      const fallbackResponse = await cache.match('/');
      if (fallbackResponse) {
        return fallbackResponse;
      }
    }
    
    throw error;
  }
}

// Background sync for export jobs
self.addEventListener('sync', (event) => {
  if (event.tag === 'export-job-sync') {
    event.waitUntil(syncExportJobs());
  }
});

async function syncExportJobs() {
  console.log('Service Worker: Syncing export jobs');
  
  try {
    const response = await fetch('/api/export-status/pending');
    const pendingJobs = await response.json();
    
    // Notify main thread about pending jobs
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'EXPORT_JOBS_SYNC',
        data: pendingJobs
      });
    });
  } catch (error) {
    console.error('Service Worker: Export jobs sync failed', error);
  }
}

// Push notifications for completed exports
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    
    if (data.type === 'export_complete') {
      const options = {
        body: `Your ${data.exportType} export is ready for download`,
        icon: '/icon-192x192.png',
        badge: '/icon-96x96.png',
        tag: 'export-complete',
        data: { jobId: data.jobId },
        actions: [
          {
            action: 'download',
            title: 'Download Now'
          },
          {
            action: 'dismiss',
            title: 'Dismiss'
          }
        ]
      };
      
      event.waitUntil(
        self.registration.showNotification('Export Complete', options)
      );
    }
  }
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'download' && event.notification.data?.jobId) {
    // Open app and navigate to download
    event.waitUntil(
      clients.openWindow(`/?download=${event.notification.data.jobId}`)
    );
  } else if (event.action === 'dismiss') {
    // Just close notification
    return;
  } else {
    // Open app
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

// Message handling for communication with main thread
self.addEventListener('message', (event) => {
  const { type, data } = event.data;
  
  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'CACHE_CLEAR':
      clearCaches().then(() => {
        event.ports[0].postMessage({ success: true });
      }).catch((error) => {
        event.ports[0].postMessage({ success: false, error });
      });
      break;
      
    case 'CACHE_STATUS':
      getCacheStatus().then((status) => {
        event.ports[0].postMessage(status);
      });
      break;
      
    default:
      console.log('Service Worker: Unknown message type', type);
  }
});

// Utility functions
async function clearCaches() {
  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames.map(cacheName => caches.delete(cacheName))
  );
  console.log('Service Worker: All caches cleared');
}

async function getCacheStatus() {
  const staticCache = await caches.open(CACHE_NAME);
  const apiCache = await caches.open(API_CACHE_NAME);
  
  const staticKeys = await staticCache.keys();
  const apiKeys = await apiCache.keys();
  
  return {
    staticCacheSize: staticKeys.length,
    apiCacheSize: apiKeys.length,
    totalCacheSize: staticKeys.length + apiKeys.length
  };
}
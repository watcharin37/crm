// Service Worker สำหรับ Insurance CRM PWA
const CACHE_NAME = 'insurance-crm-v1.0.0';
const STATIC_ASSETS = [
  './',
  './index.html',
  './performance_dashboard.html',
  './manifest.json',
  // Add other static assets as needed
];

// ติดตั้ง Service Worker
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching files');
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

// เปิดใช้งาน Service Worker
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
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

// จัดการ Network Requests
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Strategy: Cache First สำหรับ Static Assets
  if (STATIC_ASSETS.some(asset => request.url.includes(asset.replace('./', '')))) {
    event.respondWith(cacheFirst(request));
    return;
  }
  
  // Strategy: Network First สำหรับ API Calls
  if (url.hostname.includes('script.google.com') || 
      url.hostname.includes('notify-api.line.me')) {
    event.respondWith(networkFirst(request));
    return;
  }
  
  // Strategy: Stale While Revalidate สำหรับ Other Resources
  event.respondWith(staleWhileRevalidate(request));
});

// Cache First Strategy
async function cacheFirst(request) {
  try {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      console.log('Service Worker: Serving from cache', request.url);
      return cachedResponse;
    }
    
    const networkResponse = await fetch(request);
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, networkResponse.clone());
    
    console.log('Service Worker: Fetched and cached', request.url);
    return networkResponse;
  } catch (error) {
    console.error('Service Worker: Cache first failed', error);
    return new Response('Offline', { status: 503 });
  }
}

// Network First Strategy
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    console.log('Service Worker: Network response', request.url);
    return networkResponse;
  } catch (error) {
    console.log('Service Worker: Network failed, trying cache', request.url);
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Return offline response for API calls
    return new Response(JSON.stringify({
      success: false,
      error: 'Offline - No cached data available'
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Stale While Revalidate Strategy
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);
  
  const fetchPromise = fetch(request).then((networkResponse) => {
    cache.put(request, networkResponse.clone());
    return networkResponse;
  }).catch(() => cachedResponse);
  
  return cachedResponse || fetchPromise;
}

// Push Notifications
self.addEventListener('push', (event) => {
  console.log('Service Worker: Push received');
  
  const options = {
    body: event.data ? event.data.text() : 'New notification from Insurance CRM',
    icon: 'https://via.placeholder.com/192x192/667eea/ffffff?text=CRM',
    badge: 'https://via.placeholder.com/72x72/667eea/ffffff?text=!',
    vibrate: [200, 100, 200],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'open',
        title: 'เปิดแอป',
        icon: 'https://via.placeholder.com/24x24/4CAF50/ffffff?text=✓'
      },
      {
        action: 'close',
        title: 'ปิด',
        icon: 'https://via.placeholder.com/24x24/F44336/ffffff?text=✕'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification('Insurance CRM', options)
  );
});

// Notification Click Handler
self.addEventListener('notificationclick', (event) => {
  console.log('Service Worker: Notification click received');
  
  event.notification.close();
  
  if (event.action === 'open') {
    event.waitUntil(
      clients.openWindow('./')
    );
  } else if (event.action === 'close') {
    // Just close the notification
    return;
  } else {
    // Default action - open app
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then((clientList) => {
        for (let client of clientList) {
          if (client.url === self.location.origin + '/' && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow('./');
        }
      })
    );
  }
});

// Background Sync (for offline actions)
self.addEventListener('sync', (event) => {
  console.log('Service Worker: Background sync', event.tag);
  
  if (event.tag === 'sync-customer-data') {
    event.waitUntil(syncCustomerData());
  }
  
  if (event.tag === 'sync-activities') {
    event.waitUntil(syncActivities());
  }
});

// Sync Functions
async function syncCustomerData() {
  try {
    // Get pending data from IndexedDB or localStorage
    const pendingData = JSON.parse(localStorage.getItem('pendingCustomerData') || '[]');
    
    for (const data of pendingData) {
      try {
        const response = await fetch(data.url, data.options);
        if (response.ok) {
          console.log('Service Worker: Synced customer data', data.id);
        }
      } catch (error) {
        console.error('Service Worker: Sync failed for', data.id, error);
      }
    }
    
    // Clear synced data
    localStorage.removeItem('pendingCustomerData');
  } catch (error) {
    console.error('Service Worker: Background sync failed', error);
  }
}

async function syncActivities() {
  try {
    const pendingActivities = JSON.parse(localStorage.getItem('pendingActivities') || '[]');
    
    for (const activity of pendingActivities) {
      try {
        const response = await fetch(activity.url, activity.options);
        if (response.ok) {
          console.log('Service Worker: Synced activity', activity.id);
        }
      } catch (error) {
        console.error('Service Worker: Activity sync failed for', activity.id, error);
      }
    }
    
    localStorage.removeItem('pendingActivities');
  } catch (error) {
    console.error('Service Worker: Activity sync failed', error);
  }
}

// Periodic Background Sync (if supported)
self.addEventListener('periodicsync', (event) => {
  console.log('Service Worker: Periodic sync', event.tag);
  
  if (event.tag === 'daily-sync') {
    event.waitUntil(performDailySync());
  }
});

async function performDailySync() {
  try {
    console.log('Service Worker: Performing daily sync');
    
    // Sync customer data
    await syncCustomerData();
    await syncActivities();
    
    // Send daily summary notification if enabled
    const settings = JSON.parse(localStorage.getItem('crmSettings') || '{}');
    if (settings.dailyNotifications) {
      await sendDailySummary();
    }
    
  } catch (error) {
    console.error('Service Worker: Daily sync failed', error);
  }
}

async function sendDailySummary() {
  try {
    const stats = {
      newCustomers: JSON.parse(localStorage.getItem('dailyStats') || '{}').newCustomers || 0,
      activities: JSON.parse(localStorage.getItem('dailyStats') || '{}').activities || 0,
      wowServices: JSON.parse(localStorage.getItem('dailyStats') || '{}').wowServices || 0
    };
    
    await self.registration.showNotification('📊 สรุปยอดประจำวัน', {
      body: `ลูกค้าใหม่: ${stats.newCustomers} | กิจกรรม: ${stats.activities} | WOW: ${stats.wowServices}`,
      icon: 'https://via.placeholder.com/192x192/667eea/ffffff?text=📊',
      tag: 'daily-summary'
    });
    
  } catch (error) {
    console.error('Service Worker: Daily summary failed', error);
  }
}

// Share Target Handler
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  if (url.pathname === '/' && url.searchParams.has('title')) {
    // Handle shared content
    event.respondWith(handleSharedContent(event.request));
  }
});

async function handleSharedContent(request) {
  const url = new URL(request.url);
  const title = url.searchParams.get('title') || '';
  const text = url.searchParams.get('text') || '';
  const sharedUrl = url.searchParams.get('url') || '';
  
  // Store shared content for the app to process
  const sharedData = { title, text, url: sharedUrl, timestamp: Date.now() };
  
  // Use postMessage to send data to the app
  const clients = await self.clients.matchAll();
  if (clients.length > 0) {
    clients[0].postMessage({
      type: 'SHARED_CONTENT',
      data: sharedData
    });
  }
  
  // Return the main app
  return caches.match('./') || fetch('./');
}
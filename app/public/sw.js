const CACHE_NAME = 'messages-v1'
const API_URL = self.location.origin

// Cache the app shell on install
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(['/', '/manifest.webmanifest'])
    ).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

// Background sync: drain offline queue
self.addEventListener('sync', (event) => {
  if (event.tag === 'offline-messages') {
    event.waitUntil(drainOfflineQueue())
  }
})

async function drainOfflineQueue() {
  // Open IDB and drain pending messages
  const db = await openDB()
  const tx = db.transaction('offline-queue', 'readwrite')
  const store = tx.objectStore('offline-queue')
  const all = await promisifyRequest(store.getAll())

  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  for (const msg of all) {
    // Notify the active window client to re-send the message
    for (const client of clients) {
      client.postMessage({ type: 'DRAIN_OFFLINE', message: msg })
    }
    await promisifyRequest(store.delete(msg.id))
  }
}

// Push notifications
self.addEventListener('push', (event) => {
  if (!event.data) return
  const data = event.data.json()
  event.waitUntil(
    self.registration.showNotification(data.title || 'New Message', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'message',
      renotify: true,
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      if (clients.length > 0) return clients[0].focus()
      return self.clients.openWindow('/')
    })
  )
})

// ---- Minimal IDB helpers ----
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('messages-offline', 1)
    req.onupgradeneeded = () => req.result.createObjectStore('offline-queue', { keyPath: 'id' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

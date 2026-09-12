// 우리집 데스크 서비스워커 — 푸시 알림 수신·클릭 처리만 담당.
self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) {}
  const title = data.title || '우리집 데스크';
  const options = {
    body: data.body || '',
    icon: '/icons/work-desk-icon-192.png',
    badge: '/icons/work-desk-icon-192.png',
    tag: data.tag || 'work-desk',
    renotify: true,
    data: { url: data.url || '/' }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of list) {
      if (c.url.startsWith(self.location.origin) && 'focus' in c) return c.focus();
    }
    return self.clients.openWindow(url);
  })());
});

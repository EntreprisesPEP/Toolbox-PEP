// public/sw-defi-strava.js
// Service worker minimal : reçoit une notification push et l'affiche.
// Suit le même principe que sw-ordre-du-jour.js déjà présent dans le projet.

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'Défi Strava', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'Défi Strava';
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url || '/defi-strava/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/defi-strava/';
  event.waitUntil(clients.openWindow(url));
});

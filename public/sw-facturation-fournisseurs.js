// public/sw-facturation-fournisseurs.js
// Service worker minimal : reçoit une notification push et l'affiche.
// Suit le même principe que sw-defi-strava.js et sw-ordre-du-jour.js
// déjà présents dans le projet.

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'Validation factures de fournisseurs', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'Validation factures de fournisseurs';
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url || '/facturation-fournisseurs/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/facturation-fournisseurs/';
  event.waitUntil(clients.openWindow(url));
});

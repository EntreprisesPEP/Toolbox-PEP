// Service Worker — reçoit les notifications push en arrière-plan, même
// si l'app n'est pas ouverte, et les affiche à l'écran.

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "PEP2000 — Ordre du jour", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "PEP2000 — Ordre du jour";
  const options = {
    body: data.body || "",
    icon: "/_static/ordre-du-jour/icone-app.png",
    badge: "/_static/ordre-du-jour/icone-app.png",
    // Étiquette unique par notification — évite qu'une nouvelle notification
    // remplace silencieusement une précédente sans nouvelle alerte/son.
    tag: `pep2000-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Clique sur la notification -> ouvre (ou remet au premier plan) l'app
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow("/");
    })
  );
});

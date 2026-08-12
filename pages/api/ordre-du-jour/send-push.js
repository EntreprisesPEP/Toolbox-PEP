// Fonction serveur Vercel — envoie une notification push à tous les
// appareils qui se sont abonnés (bouton "Activer les notifications").
// Les abonnements sont stockés dans la même table kv_store que le reste
// de l'app, sous des clés commençant par "push:".

import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const { title, body } = req.body || {};
  if (!title) {
    return res.status(400).json({ error: "Champ 'title' manquant" });
  }

  const { VITE_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY } = process.env;

  if (!VITE_VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return res.status(500).json({ error: "Clés VAPID non configurées sur le serveur." });
  }
  if (!VITE_SUPABASE_URL || !VITE_SUPABASE_ANON_KEY) {
    return res.status(500).json({ error: "Configuration Supabase manquante sur le serveur." });
  }

  webpush.setVapidDetails("mailto:wdubreuil@pep2000.com", VITE_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY);

  try {
    const { data, error } = await supabase
      .from("kv_store")
      .select("key, value")
      .like("key", "push:%");

    if (error) throw error;

    const abonnements = (data || [])
      .map((row) => {
        try {
          return { key: row.key, sub: JSON.parse(row.value) };
        } catch (e) {
          return null;
        }
      })
      .filter(Boolean);

    const payload = JSON.stringify({ title, body: body || "" });
    let envoyes = 0;
    const expirees = [];

    await Promise.all(
      abonnements.map(async ({ key, sub }) => {
        try {
          await webpush.sendNotification(sub, payload, { TTL: 60, urgency: "high" });
          envoyes++;
        } catch (e) {
          // 410/404 = abonnement expiré ou révoqué (ex: notifications désactivées) — à retirer
          if (e.statusCode === 410 || e.statusCode === 404) {
            expirees.push(key);
          }
        }
      })
    );

    // Nettoyage des abonnements expirés
    if (expirees.length) {
      await supabase.from("kv_store").delete().in("key", expirees);
    }

    return res.status(200).json({ success: true, envoyes, total: abonnements.length, expirees: expirees.length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

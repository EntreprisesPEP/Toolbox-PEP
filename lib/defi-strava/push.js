import webpush from 'web-push';
import { getSupabaseAdmin } from './supabaseAdmin';

webpush.setVapidDetails(
  process.env.DEFI_STRAVA_VAPID_SUBJECT || 'mailto:wdubreuil@pep2000.com',
  process.env.DEFI_STRAVA_VAPID_PUBLIC_KEY,
  process.env.DEFI_STRAVA_VAPID_PRIVATE_KEY
);

// Envoie une notification push à TOUS les abonnés (tous les participants
// connectés qui ont activé les notifications sur au moins un appareil).
export async function envoyerPushATous(payload) {
  const supabase = getSupabaseAdmin();
  const { data: subs } = await supabase.from('push_subscriptions').select('*');

  if (!subs || subs.length === 0) return { envoyes: 0, echecs: 0 };

  let envoyes = 0;
  let echecs = 0;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload)
        );
        envoyes++;
      } catch (err) {
        echecs++;
        // 410/404 = l'abonnement n'est plus valide (désinstallé, expiré, etc.)
        if (err.statusCode === 410 || err.statusCode === 404) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id);
        } else {
          console.error('Erreur envoi push:', err.message); // eslint-disable-line no-console
        }
      }
    })
  );

  return { envoyes, echecs };
}

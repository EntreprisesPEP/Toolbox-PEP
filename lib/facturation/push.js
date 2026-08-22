// lib/facturation/push.js
//
// Envoi de notifications push aux personnes abonnées (facturation.push_subscriptions).
// Suit exactement le même pattern que lib/defi-strava/push.js et
// pages/api/ordre-du-jour/send-push.js — chaque app a sa propre paire de
// clés VAPID (FACTURATION_VAPID_PUBLIC_KEY / FACTURATION_VAPID_PRIVATE_KEY).

import webpush from 'web-push';
import { getSupabaseAdmin } from './supabaseAdmin';

let vapidConfigure = false;
function assurerVapid() {
  if (vapidConfigure) return;
  const { FACTURATION_VAPID_PUBLIC_KEY, FACTURATION_VAPID_PRIVATE_KEY } = process.env;
  if (!FACTURATION_VAPID_PUBLIC_KEY || !FACTURATION_VAPID_PRIVATE_KEY) {
    throw new Error('Clés VAPID non configurées sur le serveur (FACTURATION_VAPID_PUBLIC_KEY / FACTURATION_VAPID_PRIVATE_KEY).');
  }
  webpush.setVapidDetails(
    'mailto:wdubreuil@pep2000.com',
    FACTURATION_VAPID_PUBLIC_KEY,
    FACTURATION_VAPID_PRIVATE_KEY
  );
  vapidConfigure = true;
}

async function envoyerAuxAbonnements(supabase, subs, payload) {
  if (!subs || subs.length === 0) return { envoyes: 0, echecs: 0 };
  let envoyes = 0;
  let echecs = 0;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload)
        );
        envoyes++;
      } catch (err) {
        echecs++;
        if (err.statusCode === 410 || err.statusCode === 404) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id);
        } else {
          console.error('Erreur envoi push (facturation):', err.message); // eslint-disable-line no-console
        }
      }
    })
  );
  return { envoyes, echecs };
}

// Envoie une notification push à un utilisateur précis (tous ses
// appareils abonnés).
export async function envoyerPushAUnUtilisateur(userId, payload) {
  assurerVapid();
  const supabase = getSupabaseAdmin();
  const { data: subs } = await supabase.from('push_subscriptions').select('*').eq('user_id', userId);
  return envoyerAuxAbonnements(supabase, subs, payload);
}

// Envoie à une liste d'utilisateurs (ex: tous ceux avec le rôle
// "directeur"). Best-effort par utilisateur — un échec pour l'un
// n'empêche pas les autres de recevoir la notification.
export async function envoyerPushAUtilisateurs(userIds, payload) {
  assurerVapid();
  const supabase = getSupabaseAdmin();
  if (!userIds || userIds.length === 0) return { envoyes: 0, echecs: 0 };
  const { data: subs } = await supabase.from('push_subscriptions').select('*').in('user_id', userIds);
  return envoyerAuxAbonnements(supabase, subs, payload);
}

import { getSupabaseAdmin } from '../../../lib/defi-strava/supabaseAdmin';
import { verifierSession } from '../../../lib/commun/gardeApi';

// ---------------------------------------------------------------------------
// ABONNEMENT AUX NOTIFICATIONS PUSH DU DEFI STRAVA
//
// Revision 46. Cette route n'avait aucun controle. Deux consequences :
//
//   POST   : le participant_id venait du corps de la requete. On pouvait
//            donc inscrire son propre appareil sous le numero de quelqu un
//            d autre et recevoir ses notifications.
//   DELETE : la suppression portait sur un endpoint, sans autre condition.
//            Il suffisait de connaitre l endpoint d un collegue pour le
//            desabonner en silence — il n aurait rien vu, juste plus recu de
//            notifications.
//
// Meme correction que pour /connect : une session Toolbox valide avec l acces
// au Defi Strava, et le numero de participant retrouve a partir du courriel
// de la session au lieu d etre pris dans la requete. Le DELETE est en plus
// limite aux abonnements de la personne elle-meme.
//
// L equivalent cote facturation (pages/api/facturation/push-subscribe.js)
// faisait deja tout ca depuis le debut. C est celui-ci qui avait ete oublie.
// ---------------------------------------------------------------------------

const APP_SLUG = 'defi-strava';

export default async function handler(req, res) {
  const acces = await verifierSession(req, APP_SLUG);
  if (acces.erreur) {
    return res.status(acces.erreur.status).json({ error: acces.erreur.message });
  }

  const supabase = getSupabaseAdmin();

  const { data: participant } = await supabase
    .from('participants')
    .select('id')
    .eq('email', acces.email)
    .maybeSingle();

  if (!participant) {
    return res.status(404).json({
      error:
        "Aucun profil participant n'est associe a ton courriel dans le Defi Strava. Contacte William pour qu'il t'ajoute a la liste.",
    });
  }

  if (req.method === 'POST') {
    const { subscription } = req.body || {};
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return res.status(400).json({ error: 'subscription invalide ou incomplete' });
    }

    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        participant_id: participant.id,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
      { onConflict: 'endpoint' }
    );
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ succes: true });
  }

  if (req.method === 'DELETE') {
    const { endpoint } = req.body || {};
    if (!endpoint) return res.status(400).json({ error: 'endpoint requis' });

    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint)
      .eq('participant_id', participant.id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ succes: true });
  }

  return res.status(405).json({ error: 'Methode non supportee' });
}

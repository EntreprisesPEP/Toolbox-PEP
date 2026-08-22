import { verifierAcces } from '../../../lib/facturation/auth';
import { getSupabaseAdmin } from '../../../lib/facturation/supabaseAdmin';

// Enregistre (POST) ou retire (DELETE) un abonnement push pour
// l'utilisateur actuellement connecté. Contrairement à Défi Strava
// (public), cette app exige une session Toolbox valide.
export default async function handler(req, res) {
  const acces = await verifierAcces(req);
  if (acces.erreur) return res.status(acces.erreur.status).json({ error: acces.erreur.message });
  const { userId } = acces;

  const supabase = getSupabaseAdmin();

  if (req.method === 'POST') {
    const { subscription } = req.body || {};
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return res.status(400).json({ error: 'subscription invalide ou incomplète.' });
    }

    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        user_id: userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
      { onConflict: 'endpoint' }
    );
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const { endpoint } = req.body || {};
    if (!endpoint) return res.status(400).json({ error: 'endpoint requis.' });

    const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint).eq('user_id', userId);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Méthode non supportée' });
}

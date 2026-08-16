import { getSupabaseAdmin } from '../../../lib/defi-strava/supabaseAdmin';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).end();
    return;
  }

  const { participant_id, subscription } = req.body || {};

  if (!subscription?.endpoint) {
    res.status(400).json({ error: 'subscription requise' });
    return;
  }

  const supabase = getSupabaseAdmin();

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      participant_id: participant_id || null,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
    { onConflict: 'endpoint' }
  );

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.status(200).json({ succes: true });
}

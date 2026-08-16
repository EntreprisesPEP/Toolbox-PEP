import { getSupabaseAdmin } from '../../../lib/defi-strava/supabaseAdmin';
import { fetchActivity, getValidAccessToken } from '../../../lib/defi-strava/stravaClient';
import { getIsoWeek } from '../../../lib/defi-strava/weekUtils';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.STRAVA_WEBHOOK_VERIFY_TOKEN) {
      res.status(200).json({ 'hub.challenge': challenge });
      return;
    }
    res.status(403).json({ error: 'Vérification échouée' });
    return;
  }

  if (req.method === 'POST') {
    res.status(200).json({ received: true });
    processEvent(req.body).catch((err) =>
      console.error('Erreur traitement webhook Strava:', err) // eslint-disable-line no-console
    );
    return;
  }

  res.status(405).end();
}

async function processEvent(event) {
  if (event.object_type !== 'activity') return;

  const supabase = getSupabaseAdmin();
  const { data: participant } = await supabase
    .from('participants')
    .select('id')
    .eq('strava_athlete_id', event.owner_id)
    .single();

  if (!participant) {
    console.warn(`Athlète Strava ${event.owner_id} inconnu — ignoré`); // eslint-disable-line no-console
    return;
  }

  if (event.aspect_type === 'delete') {
    await supabase.from('activities').delete().eq('strava_activity_id', event.object_id);
    return;
  }

  const accessToken = await getValidAccessToken(participant.id);
  const activity = await fetchActivity(accessToken, event.object_id);

  await supabase.from('activities').upsert(
    {
      participant_id: participant.id,
      strava_activity_id: activity.id,
      type: activity.type,
      nom: activity.name,
      duree_secondes: activity.moving_time,
      date_debut: activity.start_date,
      semaine_iso: getIsoWeek(new Date(activity.start_date)),
    },
    { onConflict: 'strava_activity_id' }
  );
}

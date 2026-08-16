import { getSupabaseAdmin } from '../../../lib/defi-strava/supabaseAdmin';
import { fetchActivity, getValidAccessToken } from '../../../lib/defi-strava/stravaClient';
import { getIsoWeek } from '../../../lib/defi-strava/weekUtils';
import { detecterChangementMeneur } from '../../../lib/defi-strava/getMonthlyRanking';
import { envoyerPushATous } from '../../../lib/defi-strava/push';

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
    // On attend la fin du traitement AVANT de répondre (voir explication
    // précédente : sur Vercel, le code après la réponse peut être interrompu).
    try {
      await processEvent(req.body);
    } catch (err) {
      console.error('Erreur traitement webhook Strava:', err); // eslint-disable-line no-console
    }
    res.status(200).json({ received: true });
    return;
  }

  res.status(405).end();
}

async function processEvent(event) {
  if (event.object_type !== 'activity') return;

  const supabase = getSupabaseAdmin();
  const { data: participant, error: findError } = await supabase
    .from('participants')
    .select('id')
    .eq('strava_athlete_id', event.owner_id)
    .single();

  if (findError || !participant) {
    console.warn(`Athlète Strava ${event.owner_id} inconnu — ignoré`, findError); // eslint-disable-line no-console
    return;
  }

  if (event.aspect_type === 'delete') {
    await supabase.from('activities').delete().eq('strava_activity_id', event.object_id);
    return;
  }

  const accessToken = await getValidAccessToken(participant.id);
  const activity = await fetchActivity(accessToken, event.object_id);

  const { error: upsertError } = await supabase.from('activities').upsert(
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

  if (upsertError) {
    console.error('Erreur upsert activité:', upsertError); // eslint-disable-line no-console
    return;
  }

  // Vérifie si cette nouvelle activité vient de faire passer quelqu'un
  // en première place du mois — si oui, notification immédiate à tous.
  const nouveauMeneur = await detecterChangementMeneur();
  if (nouveauMeneur) {
    await envoyerPushATous({
      title: '🥇 Nouveau meneur du Défi Strava !',
      body: `${nouveauMeneur} vient de prendre la première place du mois. À vos souliers !`,
      url: `${process.env.NEXT_PUBLIC_APP_URL}/defi-strava/`,
    });
  }
}

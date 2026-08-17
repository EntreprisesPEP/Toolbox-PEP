import { getSupabaseAdmin } from '../../../lib/defi-strava/supabaseAdmin';
import { fetchRecentActivities, getValidAccessToken } from '../../../lib/defi-strava/stravaClient';
import { getIsoWeek } from '../../../lib/defi-strava/weekUtils';

export default async function handler(req, res) {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ error: 'Non autorisé' });
    return;
  }

  const supabase = getSupabaseAdmin();
  const { data: participants, error } = await supabase
    .from('participants')
    .select('id, nom, strava_athlete_id')
    .eq('actif', true)
    .not('strava_athlete_id', 'is', null);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const deuxJoursUnix = Math.floor(Date.now() / 1000) - 48 * 3600;
  const resultats = {};

  for (const participant of participants || []) {
    try {
      const accessToken = await getValidAccessToken(participant.id);
      const activities = await fetchRecentActivities(accessToken, deuxJoursUnix);

      for (const activity of activities) {
        await supabase.from('activities').upsert(
          {
            participant_id: participant.id,
            strava_activity_id: activity.id,
            type: activity.type,
            nom: activity.name,
            duree_secondes: activity.moving_time,
            date_debut: activity.start_date,
            date_debut_locale: activity.start_date_local || null,
            total_photo_count: activity.total_photo_count || 0,
            semaine_iso: getIsoWeek(new Date(activity.start_date)),
          },
          { onConflict: 'strava_activity_id' }
        );
      }
      resultats[participant.nom] = activities.length;
    } catch (err) {
      resultats[participant.nom] = `erreur: ${err.message}`;
    }
  }

  res.status(200).json({ synchronise: resultats });
}

import { getSupabaseAdmin } from '../../../lib/defi-strava/supabaseAdmin';
import { fetchRecentActivities, getValidAccessToken } from '../../../lib/defi-strava/stravaClient';
import { getIsoWeek } from '../../../lib/defi-strava/weekUtils';
import { detecterChangementMeneur } from '../../../lib/defi-strava/getMonthlyRanking';
import { envoyerPushATous } from '../../../lib/defi-strava/push';
import { texteNouveauMeneur } from '../../../lib/defi-strava/format';
import { sendNouveauMeneur } from '../../../lib/defi-strava/emailTemplate';

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

  // Filet de sécurité : si un webhook Strava a été manqué et que cette
  // synchro de rattrapage vient de faire changer la tête du classement,
  // on notifie quand même (push + courriel) — avant, seul le webhook
  // temps réel le faisait.
  let resultatMeneur = null;
  try {
    resultatMeneur = await detecterChangementMeneur();
    if (resultatMeneur) {
      try {
        await envoyerPushATous({
          title: '🏎️ Nouveau meneur du Défi Strava !',
          body: texteNouveauMeneur(resultatMeneur.classement, resultatMeneur.ancienMeneurNom),
          url: `${process.env.NEXT_PUBLIC_APP_URL}/defi-strava/`,
        });
      } catch (err) {
        resultats.erreur_push_meneur = err.message;
      }

      try {
        const { data: participantsActifs } = await supabase.from('participants').select('email').eq('actif', true);
        const emails = (participantsActifs || []).map((p) => p.email).filter(Boolean);
        await sendNouveauMeneur(emails, {
          classement: resultatMeneur.classement,
          ancienMeneurNom: resultatMeneur.ancienMeneurNom,
        });
      } catch (err) {
        resultats.erreur_courriel_meneur = err.message;
      }
    }
  } catch (err) {
    resultats.erreur_detection_meneur = err.message;
  }

  res.status(200).json({ synchronise: resultats, nouveau_meneur_detecte: resultatMeneur?.nom || null });
}

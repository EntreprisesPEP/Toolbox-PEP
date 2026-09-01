import { createClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '../../../lib/defi-strava/supabaseAdmin';
import { getValidAccessToken, fetchRecentActivities } from '../../../lib/defi-strava/stravaClient';
import { getIsoWeek } from '../../../lib/defi-strava/weekUtils';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Meme principe que webhook-status.js / register-webhook.js : cle
// secrete OU session admin Toolbox valide.
async function estAutorise(req) {
  if (req.body?.secret && req.body.secret === process.env.CRON_SECRET) return true;

  const authHeader = req.headers.authorization;
  if (!authHeader || !SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) return false;

  const supabaseAuth = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error } = await supabaseAuth.auth.getUser();
  if (error || !userData?.user) return false;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: roleRow } = await admin
    .from('pep_user_roles').select('role').eq('user_id', userData.user.id).maybeSingle();
  return roleRow?.role === 'admin';
}

// Va chercher directement sur Strava les activites recentes d'un
// participant (par courriel) et les insere dans notre table --
// contourne le webhook, utile quand un evenement n'a jamais ete recu
// (activite "rattrapee"/uploadee apres coup, webhook manque, etc.)
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non supportée' });
  }
  if (!(await estAutorise(req))) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  const { email, depuisHeures } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email requis' });

  const supabase = getSupabaseAdmin();

  try {
    const { data: participant, error: findError } = await supabase
      .from('participants').select('id, nom, strava_athlete_id').eq('email', email).maybeSingle();
    if (findError) throw findError;
    if (!participant) return res.status(404).json({ error: `Aucun participant trouvé pour ${email}` });
    if (!participant.strava_athlete_id) {
      return res.status(409).json({ error: `${participant.nom} n'a pas encore connecté son compte Strava.` });
    }

    const heures = Number(depuisHeures) > 0 ? Number(depuisHeures) : 48;
    const afterUnix = Math.floor(Date.now() / 1000) - heures * 3600;

    const accessToken = await getValidAccessToken(participant.id);
    const activites = await fetchRecentActivities(accessToken, afterUnix);

    const resultats = [];
    for (const activite of activites) {
      const { error: upsertError } = await supabase.from('activities').upsert(
        {
          participant_id: participant.id,
          strava_activity_id: activite.id,
          type: activite.type,
          nom: activite.name,
          duree_secondes: activite.moving_time,
          date_debut: activite.start_date,
          date_debut_locale: activite.start_date_local || null,
          total_photo_count: activite.total_photo_count || 0,
          semaine_iso: getIsoWeek(new Date(activite.start_date)),
        },
        { onConflict: 'strava_activity_id' }
      );
      resultats.push({
        id: activite.id, nom: activite.name, type: activite.type,
        duree_min: Math.round(activite.moving_time / 60),
        date: activite.start_date,
        ok: !upsertError,
        erreur: upsertError?.message || null,
      });
      await supabase.from('webhook_log').insert({
        owner_id: participant.strava_athlete_id,
        object_id: activite.id,
        object_type: 'activity',
        aspect_type: 'resync_manuel',
        resultat: upsertError ? 'erreur' : 'traite',
        detail: upsertError ? upsertError.message : `${activite.type} - ${activite.moving_time}s (resync manuel)`,
        payload_brut: null,
      });
    }

    return res.status(200).json({
      ok: true,
      participant: participant.nom,
      nb_activites_trouvees: activites.length,
      resultats,
    });
  } catch (err) {
    console.error('Erreur resync-participant:', err); // eslint-disable-line no-console
    return res.status(500).json({ error: err.message || 'Erreur inconnue.' });
  }
}

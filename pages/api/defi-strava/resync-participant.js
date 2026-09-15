import { getSupabaseAdmin } from '../../../lib/defi-strava/supabaseAdmin';
import { estAdminOuSecret } from '../../../lib/defi-strava/autorisationAdmin';
import { getValidAccessToken, fetchRecentActivities } from '../../../lib/defi-strava/stravaClient';
import { getIsoWeek } from '../../../lib/defi-strava/weekUtils';

// Va chercher directement sur Strava les activites recentes d'un
// participant (par courriel) et les insere dans notre table --
// contourne le webhook, utile quand un evenement n'a jamais ete recu
// (activite "rattrapee"/uploadee apres coup, webhook manque, etc.)
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non supportée' });
  }
  if (!(await estAdminOuSecret(req))) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  const { email, depuisHeures, depuisDate } = req.body || {};
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

    // Deux facons de dire « depuis quand » :
    //
    //   depuisDate  — une date precise (AAAA-MM-JJ ou ISO complet). C'est ce
    //                 qu'utilise le bouton « rattraper depuis le debut du
    //                 mois » : le mois commence le 1er, pas « il y a 336
    //                 heures », et cette nuance devient fausse chaque jour
    //                 qui passe.
    //   depuisHeures — l'ancienne facon, gardee telle quelle pour le filet de
    //                 securite quotidien et les appels par cle secrete.
    //
    // Une date invalide est refusee plutot que silencieusement ignoree : un
    // rattrapage qui ne couvre pas la periode demandee et n'en dit rien, c'est
    // exactement le genre de faux « tout va bien » qu'on cherche a eviter.
    let afterUnix;
    let periodeDemandee;
    if (depuisDate) {
      const debut = new Date(depuisDate);
      if (Number.isNaN(debut.getTime())) {
        return res.status(400).json({ error: `Date invalide : « ${depuisDate} » (attendu AAAA-MM-JJ).` });
      }
      afterUnix = Math.floor(debut.getTime() / 1000);
      periodeDemandee = `depuis le ${debut.toISOString().slice(0, 10)}`;
    } else {
      const heures = Number(depuisHeures) > 0 ? Number(depuisHeures) : 48;
      afterUnix = Math.floor(Date.now() / 1000) - heures * 3600;
      periodeDemandee = `dernieres ${heures} h`;
    }

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
      periode: periodeDemandee,
      nb_activites_trouvees: activites.length,
      nb_enregistrees: resultats.filter((r) => r.ok).length,
      resultats,
    });
  } catch (err) {
    console.error('Erreur resync-participant:', err); // eslint-disable-line no-console
    return res.status(500).json({ error: err.message || 'Erreur inconnue.' });
  }
}

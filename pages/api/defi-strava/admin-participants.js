import { getSupabaseAdmin } from '../../../lib/defi-strava/supabaseAdmin';
import { estAdminOuSecret } from '../../../lib/defi-strava/autorisationAdmin';
import { fetchActivitesEntre } from '../../../lib/defi-strava/activityHelpers';
import { formatDuree } from '../../../lib/defi-strava/format';
import { getCurrentIsoMonth, formatMoisLisible } from '../../../lib/defi-strava/monthUtils';
import { evaluerBranchement, JOURS_AVANT_SOUPCON } from '../../../lib/defi-strava/etatBranchement';

// ---------------------------------------------------------------------------
// L'ETAT DE BRANCHEMENT DE CHAQUE PARTICIPANT — vue d'administration.
//
// Revision 54. Pourquoi cette route existe : Stephane Boisvert possedait deux
// comptes Strava du meme nom. Le navigateur etait reste connecte sur le vieux,
// vide, et c'est celui-la qu'il a autorise. Tout avait l'air normal — jeton
// valide, permissions completes, aucune erreur nulle part — et l'app le
// montrait simplement « connecte ». Ses vraies activites, elles, etaient sur
// l'autre compte. Il a fallu comparer a la main la base et son profil public
// pour s'en apercevoir.
//
// La lecon n'est pas « verifier les permissions » : ses permissions etaient
// bonnes. C'est qu'un branchement peut etre techniquement parfait et pointer
// au mauvais endroit. La seule chose qui le trahit, c'est le SILENCE : un
// compte branche qui ne rapporte rien. C'est donc ca qu'on affiche.
//
// Aucune donnee personnelle ne sort d'ici : des durees, des dates, et le
// numero de compte Strava (deja public).
// ---------------------------------------------------------------------------

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Méthode non supportée' });
  }
  if (!(await estAdminOuSecret(req))) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  const moisIso = req.query.mois || getCurrentIsoMonth();
  const [annee, moisNum] = moisIso.split('-').map(Number);
  if (!annee || !moisNum || moisNum < 1 || moisNum > 12) {
    return res.status(400).json({ error: 'Paramètre « mois » invalide (attendu AAAA-MM).' });
  }
  const debutMois = new Date(annee, moisNum - 1, 1);
  const finMois = new Date(annee, moisNum, 0);

  try {
    const supabase = getSupabaseAdmin();

    const [{ data: participants, error: eParticipants },
           { data: jetons, error: eJetons },
           { data: toutesActivites, error: eActivites }] = await Promise.all([
      supabase.from('participants').select('id, nom, email, actif, strava_athlete_id').order('nom'),
      supabase.from('strava_tokens').select('participant_id, scope, expires_at, updated_at'),
      supabase.from('activities').select('participant_id, date_debut').order('date_debut', { ascending: false }).limit(20000),
    ]);
    if (eParticipants) throw new Error(`participants : ${eParticipants.message}`);
    if (eJetons) throw new Error(`strava_tokens : ${eJetons.message}`);
    if (eActivites) throw new Error(`activities : ${eActivites.message}`);

    const activitesDuMois = await fetchActivitesEntre(supabase, debutMois, finMois);

    const jetonParId = new Map((jetons || []).map((j) => [j.participant_id, j]));

    // Derniere activite connue, tous mois confondus. La requete est deja
    // triee du plus recent au plus ancien : le premier vu gagne.
    const derniereParId = new Map();
    for (const a of toutesActivites || []) {
      if (!derniereParId.has(a.participant_id)) derniereParId.set(a.participant_id, a.date_debut);
    }

    const totalMoisParId = new Map();
    const nbMoisParId = new Map();
    for (const a of activitesDuMois) {
      totalMoisParId.set(a.participant_id, (totalMoisParId.get(a.participant_id) || 0) + a.duree_secondes);
      nbMoisParId.set(a.participant_id, (nbMoisParId.get(a.participant_id) || 0) + 1);
    }

    const lignes = (participants || []).map((p) => {
      const jeton = jetonParId.get(p.id) || null;
      const derniere = derniereParId.get(p.id) || null;
      const { etat, branche, portee, permissionsCompletes, joursDepuisDerniere } = evaluerBranchement({
        stravaAthleteId: p.strava_athlete_id,
        jeton,
        derniereActivite: derniere,
      });

      return {
        id: p.id,
        nom: p.nom,
        email: p.email,
        actif: p.actif,
        etat,
        branche,
        stravaAthleteId: p.strava_athlete_id || null,
        profilStrava: p.strava_athlete_id ? `https://www.strava.com/athletes/${p.strava_athlete_id}` : null,
        portee,
        permissionsCompletes,
        jetonExpireLe: jeton?.expires_at || null,
        nbActivitesMois: nbMoisParId.get(p.id) || 0,
        totalMoisFormate: formatDuree(totalMoisParId.get(p.id) || 0),
        derniereActivite: derniere,
        joursDepuisDerniere,
      };
    });

    return res.status(200).json({
      moisIso,
      moisLisible: formatMoisLisible(moisIso),
      joursAvantSoupcon: JOURS_AVANT_SOUPCON,
      participants: lignes,
    });
  } catch (err) {
    console.error('Erreur admin-participants:', err); // eslint-disable-line no-console
    return res.status(500).json({ error: err.message || 'Erreur inconnue.' });
  }
}

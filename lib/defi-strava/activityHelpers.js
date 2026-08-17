import { toDateISO } from './weekUtils';

// Une activité a 2 horodatages possibles :
//  - date_debut          : UTC (activity.start_date de Strava)
//  - date_debut_locale    : heure locale (activity.start_date_local de
//                           Strava) — n'existe que pour les activités
//                           captées après l'ajout de cette colonne.
// Pour tout ce qui dépend du JOUR ou de l'HEURE (semaine du mois, "après
// 22h", "3h-7h du matin"), il faut utiliser l'heure LOCALE, sinon une
// activité commencée tard le soir peut se faire attribuer au mauvais
// jour/à la mauvaise semaine selon le fuseau UTC.
export function dateEffective(activite) {
  return new Date(activite.date_debut_locale || activite.date_debut);
}

// Récupère toutes les activités dont la date effective (locale) tombe
// entre `debut` et `fin` (inclusifs, journées complètes). La requête
// Supabase élargit la fenêtre de ±1 jour en UTC (pour ne rien manquer à
// cause du décalage de fuseau), puis le filtre précis se fait en JS avec
// la date locale.
export async function fetchActivitesEntre(supabase, debut, fin, colonnes = 'participant_id, duree_secondes, date_debut, date_debut_locale, total_photo_count, type') {
  const debutPad = new Date(debut);
  debutPad.setDate(debutPad.getDate() - 1);
  const finPad = new Date(fin);
  finPad.setDate(finPad.getDate() + 2); // +2 pour couvrir toute la journée de fin en UTC

  const { data, error } = await supabase
    .from('activities')
    .select(colonnes)
    .gte('date_debut', debutPad.toISOString())
    .lte('date_debut', finPad.toISOString());

  if (error) throw new Error(`Erreur récupération activités: ${error.message}`);

  const debutISO = toDateISO(debut);
  const finISO = toDateISO(fin);

  return (data || []).filter((a) => {
    const effISO = toDateISO(dateEffective(a));
    return effISO >= debutISO && effISO <= finISO;
  });
}

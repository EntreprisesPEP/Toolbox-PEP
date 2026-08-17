import { getSupabaseAdmin } from './supabaseAdmin';
import { fetchActivitesEntre } from './activityHelpers';
import { formatDuree } from './format';

// Classement pour une plage de dates [debut, fin] (objets Date, inclusifs),
// agrégé directement depuis `activities` — remplace l'ancienne vue
// `weekly_totals` (basée sur semaine_iso) puisque les semaines sont
// maintenant "du mois" et peuvent chevaucher deux semaines ISO.
export async function getRankingPourPeriode(debut, fin) {
  const supabase = getSupabaseAdmin();

  const { data: participants, error: eParticipants } = await supabase
    .from('participants')
    .select('id, nom')
    .eq('actif', true);
  if (eParticipants) throw new Error(`Erreur récupération participants: ${eParticipants.message}`);

  const activites = await fetchActivitesEntre(supabase, debut, fin);

  const totaux = {};
  for (const a of activites) {
    totaux[a.participant_id] = (totaux[a.participant_id] || 0) + a.duree_secondes;
  }

  const classement = (participants || [])
    .map((p) => ({ participantId: p.id, nom: p.nom, total: totaux[p.id] || 0 }))
    .sort((a, b) => b.total - a.total)
    .map((r, i) => ({ ...r, rang: i + 1 }));

  const maxTotal = classement.length > 0 ? classement[0].total : 0;

  return classement.map((r) => ({
    rang: r.rang,
    participantId: r.participantId,
    nom: r.nom,
    total: r.total,
    totalFormate: formatDuree(r.total),
    diffLeaderFormate: r.rang === 1 ? null : formatDuree(Math.max(0, maxTotal - r.total)),
  }));
}

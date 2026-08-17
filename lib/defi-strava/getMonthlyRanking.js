import { getSupabaseAdmin } from './supabaseAdmin';
import { fetchActivitesEntre } from './activityHelpers';
import { formatDuree } from './format';
import { getCurrentIsoMonth } from './monthUtils';

// Classement du mois calendaire — inchangé par le passage aux "semaines
// du mois" (un mois reste un mois), mais agrégé désormais directement
// depuis `activities` (heure locale) plutôt que via la vue `monthly_totals`,
// pour rester cohérent avec getRanking.js.
export async function getMonthlyRanking(moisIso) {
  const supabase = getSupabaseAdmin();
  const mois = moisIso || getCurrentIsoMonth();
  const [annee, moisNum] = mois.split('-').map(Number);
  const debut = new Date(annee, moisNum - 1, 1);
  const fin = new Date(annee, moisNum, 0);

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

// Vérifie si le meneur du mois a changé depuis la dernière vérification.
// Retourne le nom du nouveau meneur SEULEMENT si ça vient de changer,
// sinon retourne null. Enregistre aussi la PAIRE (ancien → nouveau) dans
// meneur_changements, pour "Le duel légendaire" du Hall of Fame.
export async function detecterChangementMeneur() {
  const supabase = getSupabaseAdmin();
  const moisIso = getCurrentIsoMonth();
  const classement = await getMonthlyRanking(moisIso);

  if (classement.length === 0) return null;
  const nouveauMeneur = classement[0];

  const { data: state } = await supabase
    .from('defi_state')
    .select('valeur')
    .eq('cle', 'leader_actuel_mois')
    .maybeSingle();

  const ancienMeneurNom = state?.valeur || null;

  if (ancienMeneurNom === nouveauMeneur.nom) {
    return null; // pas de changement, pas de notification
  }

  await supabase
    .from('defi_state')
    .update({ valeur: nouveauMeneur.nom, updated_at: new Date().toISOString() })
    .eq('cle', 'leader_actuel_mois');

  // Ne pas notifier ni tracker de "duel" lors du tout premier meneur
  // (personne à dépasser encore, donc pas vraiment un échange de tête).
  if (!ancienMeneurNom) return null;

  const { data: ancienParticipant } = await supabase
    .from('participants')
    .select('id')
    .eq('nom', ancienMeneurNom)
    .maybeSingle();

  await supabase.from('meneur_changements').insert({
    mois_iso: moisIso,
    ancien_meneur_id: ancienParticipant?.id || null,
    nouveau_meneur_id: nouveauMeneur.participantId,
  });

  return nouveauMeneur.nom;
}

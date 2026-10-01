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
// Retourne { nom, classement } SEULEMENT si ça vient de changer (le
// classement complet permet de bâtir une notification plus riche que
// juste le nom du meneur), sinon retourne null. Enregistre aussi la
// PAIRE (ancien → nouveau) dans meneur_changements, pour "Le duel
// légendaire" du Hall of Fame.
const CLE_MENEUR = 'leader_actuel_mois';
const CLE_MENEUR_MOIS = 'leader_mois_iso';

async function lireEtat(supabase, cle) {
  const { data } = await supabase.from('defi_state').select('valeur').eq('cle', cle).maybeSingle();
  return data?.valeur || null;
}

// `upsert` et non `update` : la ligne `leader_mois_iso` n'existe pas encore
// la première fois. `cle` porte déjà une contrainte d'unicité — les deux
// crons s'en servent de la même façon.
async function ecrireEtat(supabase, cle, valeur) {
  await supabase
    .from('defi_state')
    .upsert({ cle, valeur, updated_at: new Date().toISOString() }, { onConflict: 'cle' });
}

export async function detecterChangementMeneur() {
  const supabase = getSupabaseAdmin();
  const moisIso = getCurrentIsoMonth();
  const classement = await getMonthlyRanking(moisIso);

  if (classement.length === 0) return null;
  const nouveauMeneur = classement[0];

  const ancienMeneurNom = await lireEtat(supabase, CLE_MENEUR);
  const moisEnregistre = await lireEtat(supabase, CLE_MENEUR_MOIS);

  // Le mois affiché a changé depuis la dernière vérification. L'état retenu
  // parle du mois d'avant : le comparer au classement du mois en cours
  // reviendrait à annoncer un dépassement entre deux classements différents.
  //
  // `null` au premier passage (la clé n'existe pas encore) est traité comme
  // un nouveau mois — ce qui est le bon défaut : on se contente d'enregistrer
  // la situation, sans rien annoncer.
  const moisADebute = moisEnregistre !== moisIso;

  // -------------------------------------------------------------------------
  // ON NE MÈNE PAS AVEC ZÉRO
  //
  // Revision 57. Tant que personne n'a enregistré une seule minute, il n'y a
  // pas de meneur : le tri place simplement en tête celui que la base a
  // renvoyé en premier, ce qui n'est l'exploit de personne. Sans cette règle,
  // le début de chaque mois produit « X (0 min) vient de dépasser Y (0 min) ».
  //
  // On en profite pour remettre l'état à zéro, sinon le premier à bouger
  // « dépasserait » le gagnant du mois précédent.
  // -------------------------------------------------------------------------
  if (nouveauMeneur.total <= 0) {
    if (moisADebute) await ecrireEtat(supabase, CLE_MENEUR_MOIS, moisIso);
    if (ancienMeneurNom) await ecrireEtat(supabase, CLE_MENEUR, '');
    return null;
  }

  if (!moisADebute && ancienMeneurNom === nouveauMeneur.nom) {
    return null; // pas de changement, pas de notification
  }

  await ecrireEtat(supabase, CLE_MENEUR, nouveauMeneur.nom);
  if (moisADebute) await ecrireEtat(supabase, CLE_MENEUR_MOIS, moisIso);

  // Ne pas notifier ni tracker de "duel" lors du tout premier meneur
  // (personne à dépasser encore, donc pas vraiment un échange de tête) —
  // ni au premier relevé d'un nouveau mois, où l'on ne sait pas qui menait.
  if (moisADebute || !ancienMeneurNom) return null;

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

  return { nom: nouveauMeneur.nom, classement, ancienMeneurNom };
}

// Compte combien de mois D'AFFILÉE (en remontant à partir du mois donné,
// lui inclus) le même nom a fini #1 — pour la mention spéciale "3e mois
// de suite !" dans le courriel de fin de mois. Plafonné à 24 mois en
// arrière par précaution.
export async function calculerStreakMensuelle(nomGagnant, moisIso) {
  if (!nomGagnant) return 0;
  let streak = 1;
  let [annee, moisNum] = moisIso.split('-').map(Number);

  for (let i = 0; i < 24; i++) {
    moisNum -= 1;
    if (moisNum < 1) { moisNum = 12; annee -= 1; }
    const moisPrecIso = `${annee}-${String(moisNum).padStart(2, '0')}`;
    const classement = await getMonthlyRanking(moisPrecIso);
    if (classement.length === 0 || classement[0]?.nom !== nomGagnant) break;
    streak++;
  }

  return streak;
}

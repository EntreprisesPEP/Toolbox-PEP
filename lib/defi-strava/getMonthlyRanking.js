import { getSupabaseAdmin } from './supabaseAdmin';
import { getCurrentIsoMonth } from './monthUtils';
import { formatDuree } from './format';

export async function getMonthlyRanking(moisIso) {
  const supabase = getSupabaseAdmin();
  const mois = moisIso || getCurrentIsoMonth();

  const { data, error } = await supabase
    .from('monthly_totals')
    .select('*')
    .eq('mois_iso', mois)
    .order('rang', { ascending: true });

  if (error) throw new Error(`Erreur récupération classement mensuel: ${error.message}`);

  return (data || []).map((row) => ({
    rang: row.rang,
    nom: row.nom,
    totalFormate: formatDuree(row.total_secondes),
    diffLeaderFormate: row.rang === 1 ? null : formatDuree(row.diff_leader_secondes || 0),
  }));
}

// Vérifie si le meneur du mois a changé depuis la dernière vérification.
// Retourne le nom du nouveau meneur SEULEMENT si ça vient de changer,
// sinon retourne null (pour ne pas re-notifier à chaque activité).
export async function detecterChangementMeneur() {
  const supabase = getSupabaseAdmin();
  const classement = await getMonthlyRanking();

  if (classement.length === 0) return null;
  const nouveauMeneur = classement[0].nom;

  const { data: state } = await supabase
    .from('defi_state')
    .select('valeur')
    .eq('cle', 'leader_actuel_mois')
    .single();

  const ancienMeneur = state?.valeur || null;

  if (ancienMeneur === nouveauMeneur) {
    return null; // pas de changement, pas de notification
  }

  await supabase
    .from('defi_state')
    .update({ valeur: nouveauMeneur, updated_at: new Date().toISOString() })
    .eq('cle', 'leader_actuel_mois');

  // Ne pas notifier lors du tout premier meneur (personne à dépasser encore)
  if (!ancienMeneur) return null;

  return nouveauMeneur;
}

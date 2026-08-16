import { getSupabaseAdmin } from './supabaseAdmin';
import { getCurrentIsoWeek } from './weekUtils';
import { formatDuree } from './format';

export async function getWeeklyRanking(semaineIso) {
  const supabase = getSupabaseAdmin();
  const semaine = semaineIso || getCurrentIsoWeek();

  const { data, error } = await supabase
    .from('weekly_totals')
    .select('*')
    .eq('semaine_iso', semaine)
    .order('rang', { ascending: true });

  if (error) throw new Error(`Erreur récupération classement: ${error.message}`);

  return (data || []).map((row) => ({
    rang: row.rang,
    nom: row.nom,
    totalFormate: formatDuree(row.total_secondes),
    diffLeaderFormate: row.rang === 1 ? null : formatDuree(row.diff_leader_secondes || 0),
  }));
}

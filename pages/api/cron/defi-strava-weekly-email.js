import { getSupabaseAdmin } from '../../../lib/defi-strava/supabaseAdmin';
import { getWeeklyRanking } from '../../../lib/defi-strava/getRanking';
import { sendWeeklyRankingEmail } from '../../../lib/defi-strava/emailTemplate';
import { getCurrentIsoWeek } from '../../../lib/defi-strava/weekUtils';

export default async function handler(req, res) {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ error: 'Non autorisé' });
    return;
  }

  const supabase = getSupabaseAdmin();
  const semaine = getCurrentIsoWeek();

  const [classement, { data: participants }] = await Promise.all([
    getWeeklyRanking(semaine),
    supabase.from('participants').select('email').eq('actif', true),
  ]);

  const destinataires = (participants || []).map((p) => p.email);
  await sendWeeklyRankingEmail(destinataires, semaine, classement);

  res.status(200).json({ envoye_a: destinataires.length, semaine });
}

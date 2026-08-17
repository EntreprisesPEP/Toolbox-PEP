import { getSupabaseAdmin } from '../../../lib/defi-strava/supabaseAdmin';
import { getRankingPourPeriode } from '../../../lib/defi-strava/getRanking';
import { getMonthlyRanking } from '../../../lib/defi-strava/getMonthlyRanking';
import { sendResumeHebdomadaire } from '../../../lib/defi-strava/emailTemplate';
import { envoyerPushATous } from '../../../lib/defi-strava/push';
import { semaineFinieLaPlusRecente, labelSemaine } from '../../../lib/defi-strava/weekUtils';
import { getCurrentIsoMonth, formatMoisLisible } from '../../../lib/defi-strava/monthUtils';

export default async function handler(req, res) {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ error: 'Non autorisé' });
    return;
  }

  const supabase = getSupabaseAdmin();

  // La semaine qui vient de se terminer — jamais celle en cours (même
  // logique que le vote). Corrige au passage un bug pré-existant qui
  // utilisait la semaine ISO COURANTE (celle qui vient de commencer le
  // lundi matin même, au moment où ce cron tourne) au lieu de la
  // précédente.
  const { semaine, annee, moisIndex0 } = semaineFinieLaPlusRecente();
  const { texte: semaineLabel } = labelSemaine(semaine, annee, moisIndex0);

  const moisIso = getCurrentIsoMonth();
  const moisLisible = formatMoisLisible(moisIso);

  const [classementSemaine, classementMois, { data: participants }] = await Promise.all([
    getRankingPourPeriode(semaine.debut, semaine.fin),
    getMonthlyRanking(moisIso),
    supabase.from('participants').select('email').eq('actif', true),
  ]);

  const top3Semaine = classementSemaine.slice(0, 3);
  const destinataires = (participants || []).map((p) => p.email);

  await sendResumeHebdomadaire(destinataires, {
    semaine: semaineLabel,
    top3Semaine,
    moisLisible,
    classementMois,
  });

  const resultatPush = await envoyerPushATous({
    title: `📅 Résumé du Défi Strava — ${moisLisible}`,
    body:
      classementMois.length > 0
        ? `En tête ce mois-ci : ${classementMois[0].nom} (${classementMois[0].totalFormate}). Regarde le classement complet !`
        : "Personne n'a encore bougé ce mois-ci — sois le premier !",
    url: `${process.env.NEXT_PUBLIC_APP_URL}/defi-strava/`,
  });

  res.status(200).json({
    courriel_envoye_a: destinataires.length,
    push: resultatPush,
    semaine: semaineLabel,
    mois: moisIso,
  });
}

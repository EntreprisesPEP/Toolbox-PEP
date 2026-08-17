import { getSupabaseAdmin } from '../../../lib/defi-strava/supabaseAdmin';
import { getMonthlyRanking } from '../../../lib/defi-strava/getMonthlyRanking';
import { envoyerPushATous, envoyerPushAUnParticipant } from '../../../lib/defi-strava/push';
import { getMoisPrecedent, formatMoisLisible } from '../../../lib/defi-strava/monthUtils';
import { heureActuelleEst, jourDuMoisEst, dateDuJourEst } from '../../../lib/defi-strava/timezone';

const CLE_ETAT = 'dernier_envoi_fin_mois';

// Annonce les résultats FINAUX du mois qui vient de se terminer — se
// déclenche le 1er du mois suivant à 8h heure de l'Est. Distincte du
// résumé hebdomadaire du lundi (qui, lui, porte sur la semaine).
export default async function handler(req, res) {
  const authHeader = req.headers.authorization;
  const secretQuery = req.query.secret;
  const autorise = authHeader === `Bearer ${process.env.CRON_SECRET}` || secretQuery === process.env.CRON_SECRET;
  if (!autorise) {
    res.status(401).json({ error: 'Non autorisé' });
    return;
  }

  const forcer = req.query.forcer === '1';
  const destinataireTest = req.query.destinataireTest || null;

  // Ne procède que le 1er du mois à 8h heure de l'Est (peu importe
  // l'heure d'été/hiver) — sauf si on force un test manuel.
  if (!forcer && (jourDuMoisEst() !== 1 || heureActuelleEst() !== 8)) {
    res.status(200).json({ ignore: true, raison: "Ce n'est ni le 1er du mois, ni 8h heure de l'Est." });
    return;
  }

  const moisIso = getMoisPrecedent();
  const moisLisible = formatMoisLisible(moisIso);

  const supabase = getSupabaseAdmin();

  // Évite un double envoi si jamais plus d'un essai horaire du cron
  // tombe sur la bonne heure le même jour, pour le même mois.
  if (!forcer) {
    try {
      const { data: etat } = await supabase.from('defi_state').select('valeur').eq('cle', CLE_ETAT).maybeSingle();
      if (etat?.valeur === moisIso) {
        res.status(200).json({ ignore: true, raison: `Déjà annoncé pour ${moisIso}.` });
        return;
      }
    } catch (err) {
      console.error('Erreur lecture dernier_envoi_fin_mois:', err); // eslint-disable-line no-console
    }
  }

  const classementFinal = await getMonthlyRanking(moisIso);

  let participantTestId = null;
  if (destinataireTest) {
    const { data: participantTest } = await supabase
      .from('participants').select('id').eq('email', destinataireTest).maybeSingle();
    participantTestId = participantTest?.id || null;
  }

  const [premier, deuxieme, troisieme] = classementFinal;
  const medailleTexte = (r, medaille) => (r ? `${medaille} ${r.nom} avec ${r.totalFormate}` : null);

  const corps = classementFinal.length === 0
    ? "Personne n'a bougé ce mois-ci — le prochain mois nous appartient !"
    : [medailleTexte(premier, '🥇'), medailleTexte(deuxieme, '🥈'), medailleTexte(troisieme, '🥉')]
        .filter(Boolean)
        .join('\n') + '\n\nFélicitations à tout le monde d\'avoir participé ! Cliquez pour voir les résultats complets.';

  const payloadPush = {
    title: `🏆 ${moisLisible} est terminé !`,
    body: corps,
    // Lien direct vers le mois qui vient de se terminer (pas le mois en
    // cours, qui vient tout juste de commencer et serait vide) — la page
    // doit lire ce paramètre ?mois= au chargement.
    url: `${process.env.NEXT_PUBLIC_APP_URL}/defi-strava/?mois=${moisIso}`,
  };

  let resultatPush;
  if (destinataireTest) {
    resultatPush = participantTestId
      ? await envoyerPushAUnParticipant(participantTestId, payloadPush)
      : { envoyes: 0, echecs: 0, note: 'Aucun participant trouvé avec ce courriel — push ignoré.' };
  } else {
    resultatPush = await envoyerPushATous(payloadPush);
  }

  if (!forcer) {
    try {
      await supabase.from('defi_state').upsert(
        { cle: CLE_ETAT, valeur: moisIso, updated_at: new Date().toISOString() },
        { onConflict: 'cle' }
      );
    } catch (err) {
      console.error('Erreur enregistrement dernier_envoi_fin_mois:', err); // eslint-disable-line no-console
    }
  }

  res.status(200).json({
    push: resultatPush,
    mois_annonce: moisIso,
    classement: classementFinal,
    modeTest: !!destinataireTest,
  });
}

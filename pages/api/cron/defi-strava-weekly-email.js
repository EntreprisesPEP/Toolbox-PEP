import { getSupabaseAdmin } from '../../../lib/defi-strava/supabaseAdmin';
import { getRankingPourPeriode, calculerStreakHebdomadaire } from '../../../lib/defi-strava/getRanking';
import { getMonthlyRanking } from '../../../lib/defi-strava/getMonthlyRanking';
import { sendResumeHebdomadaire } from '../../../lib/defi-strava/emailTemplate';
import { envoyerPushATous, envoyerPushAUnParticipant } from '../../../lib/defi-strava/push';
import { semaineFinieLaPlusRecente, labelSemaine } from '../../../lib/defi-strava/weekUtils';
import { getCurrentIsoMonth, formatMoisLisible, moisAvecPreposition } from '../../../lib/defi-strava/monthUtils';
import { texteClassementLignes } from '../../../lib/defi-strava/format';
import { heureActuelleEst, dateDuJourEst } from '../../../lib/defi-strava/timezone';

const CLE_ETAT = 'dernier_envoi_hebdo';

export default async function handler(req, res) {
  // Accepte soit l'en-tête Authorization (vrai déclenchement automatique
  // par Vercel Cron), soit ?secret=... dans l'URL — pour pouvoir déclencher
  // un test manuel directement depuis le navigateur.
  const authHeader = req.headers.authorization;
  const secretQuery = req.query.secret;
  const autorise = authHeader === `Bearer ${process.env.CRON_SECRET}` || secretQuery === process.env.CRON_SECRET;
  if (!autorise) {
    res.status(401).json({ error: 'Non autorisé' });
    return;
  }

  const forcer = req.query.forcer === '1';
  const destinataireTest = req.query.destinataireTest || null;

  const supabase = getSupabaseAdmin();

  // Le cron Vercel (vercel.json) déclenche cette route à plusieurs heures
  // UTC candidates chaque lundi (voir commentaire dans vercel.json) — on
  // ne procède réellement que si c'est actuellement 8h heure de l'Est,
  // peu importe si on est en heure avancée ou normale. C'est ÇA qui rend
  // l'ajustement automatique au changement d'heure, plutôt qu'un horaire
  // UTC fixe qui, lui, ne s'ajuste jamais tout seul.
  if (!forcer && heureActuelleEst() !== 8) {
    res.status(200).json({ ignore: true, raison: "Pas encore 8h heure de l'Est — ce n'est qu'un des essais horaires du cron." });
    return;
  }

  // Évite un double envoi si jamais plus d'un essai horaire du cron tombe
  // sur 8h (ne devrait normalement pas arriver, mais ne coûte rien).
  const aujourdHuiEst = dateDuJourEst();
  if (!forcer) {
    try {
      const { data: etat } = await supabase.from('defi_state').select('valeur').eq('cle', CLE_ETAT).maybeSingle();
      if (etat?.valeur === aujourdHuiEst) {
        res.status(200).json({ ignore: true, raison: 'Déjà envoyé aujourd\'hui.' });
        return;
      }
    } catch (err) {
      // Si la clé n'existe pas encore, on continue simplement l'envoi.
      console.error('Erreur lecture dernier_envoi_hebdo:', err); // eslint-disable-line no-console
    }
  }

  // La semaine qui vient de se terminer — jamais celle en cours (même
  // logique que le vote).
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

  // Combien de semaines d'affilée le gagnant de cette semaine vient-il
  // de remporter ?
  let streakSemaine = 1;
  try {
    if (top3Semaine[0]?.nom) {
      streakSemaine = await calculerStreakHebdomadaire(top3Semaine[0].nom, semaine);
    }
  } catch (err) {
    console.error('Erreur calcul streak hebdomadaire:', err); // eslint-disable-line no-console
  }

  // Mode test sécuritaire : si ?destinataireTest=... est fourni, le
  // courriel ET le push partent UNIQUEMENT à cette personne, plutôt qu'à
  // tous les participants actifs / tous les abonnés — utile pour tester
  // sans jamais déranger qui que ce soit d'autre.
  let destinataires;
  let participantTestId = null;
  if (destinataireTest) {
    destinataires = [destinataireTest];
    const { data: participantTest } = await supabase
      .from('participants').select('id').eq('email', destinataireTest).maybeSingle();
    participantTestId = participantTest?.id || null;
  } else {
    destinataires = (participants || []).map((p) => p.email);
  }

  let resultatEmail;
  try {
    resultatEmail = await sendResumeHebdomadaire(destinataires, {
      semaine: semaineLabel,
      semaineNumero: semaine.numero,
      top3Semaine,
      moisLisible,
      classementMois,
      streakSemaine,
    });
  } catch (err) {
    console.error('Erreur envoi courriel Resend:', err); // eslint-disable-line no-console
    res.status(500).json({ error: `Envoi du courriel échoué : ${err.message}` });
    return;
  }

  const mentionBravoSemaine = top3Semaine[0]
    ? `🎉 Bravo ${top3Semaine[0].nom} qui remporte la première place de la semaine${streakSemaine >= 2 ? `, une ${streakSemaine}e fois de suite` : ''} !!\n\n`
    : '';

  const payloadPush = {
    title: `🏅 Résumé de la Semaine ${semaine.numero} ${moisAvecPreposition(moisIndex0)}`,
    body:
      top3Semaine.length > 0
        ? `${mentionBravoSemaine}Cette semaine — Ne lâchez pas !\n${texteClassementLignes(top3Semaine)}\n\nLeaders du mois :\n${texteClassementLignes(classementMois)}`
        : "Personne n'a bougé cette semaine — sois le premier !",
    url: `${process.env.NEXT_PUBLIC_APP_URL}/defi-strava/`,
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
        { cle: CLE_ETAT, valeur: aujourdHuiEst, updated_at: new Date().toISOString() },
        { onConflict: 'cle' }
      );
    } catch (err) {
      // Ne bloque jamais l'envoi réel si cette mémorisation échoue —
      // au pire, un envoi en double est possible mais sans gravité.
      console.error('Erreur enregistrement dernier_envoi_hebdo:', err); // eslint-disable-line no-console
    }
  }

  res.status(200).json({
    courriel_envoye_a: destinataires,
    courriel_resultat: resultatEmail,
    push: resultatPush,
    semaine: semaineLabel,
    mois: moisIso,
    modeTest: !!destinataireTest,
  });
}

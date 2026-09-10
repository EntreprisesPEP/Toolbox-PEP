import { getSupabaseAdmin } from '../../../lib/defi-strava/supabaseAdmin';
import { getRankingPourPeriode, calculerStreakHebdomadaire } from '../../../lib/defi-strava/getRanking';
import { getMonthlyRanking } from '../../../lib/defi-strava/getMonthlyRanking';
import { sendResumeHebdomadaire } from '../../../lib/defi-strava/emailTemplate';
import { envoyerPushATous, envoyerPushAUnParticipant } from '../../../lib/defi-strava/push';
import { semaineFinieLaPlusRecente, labelSemaine } from '../../../lib/defi-strava/weekUtils';
import { getCurrentIsoMonth, formatMoisLisible, moisAvecPreposition } from '../../../lib/defi-strava/monthUtils';
import { texteClassementLignes } from '../../../lib/defi-strava/format';
import { heureActuelleEst, dateDuJourEst, jourDeSemaineEst, LUNDI } from '../../../lib/defi-strava/timezone';

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

  // Le lundi, à partir de 8h heure de l'Est.
  //
  // Revision 47 — CE COURRIEL NE PARTAIT PAS L'HIVER, ET PERSONNE NE LE
  // SAVAIT. Le commentaire qui était ici disait que le cron déclenchait la
  // route « à plusieurs heures UTC candidates chaque lundi ». Ce n'était pas
  // vrai : vercel.json ne contenait qu'une seule entrée, « 0 12 * * 1 ».
  // Douze heures UTC, c'est 8h chez nous l'été — mais 7h l'hiver. La garde
  // « exactement 8h » refusait donc de s'exécuter, en silence, tous les
  // lundis en heure normale. Rejoué sur une année : 34 lundis sur 52 seulement.
  //
  // Le cron appelle maintenant la route toutes les heures le lundi, et c'est
  // elle qui choisit son moment. Il faut aussi vérifier le jour ICI : un
  // lundi UTC commence le dimanche soir chez nous, et sans ça le résumé
  // partirait le dimanche à 19h.
  const HEURE_CIBLE_EST = 8;
  if (!forcer && (jourDeSemaineEst() !== LUNDI || heureActuelleEst() < HEURE_CIBLE_EST)) {
    res.status(200).json({
      ignore: true,
      raison: `Ce n'est pas encore lundi ${HEURE_CIBLE_EST}h heure de l'Est.`,
    });
    return;
  }

  // La journée est marquée comme envoyée AVANT d'envoyer, pas après.
  //
  // Revision 47. Maintenant que la route est appelée toutes les heures le
  // lundi, l'ordre compte : si on marquait après l'envoi et que l'exécution
  // était coupée au milieu, l'heure suivante recommencerait et tout le monde
  // recevrait le courriel deux fois. En réservant d'abord, le pire cas est
  // un lundi manqué, qu'on relance à la main avec « ?forcer=1 ».
  const aujourdHuiEst = dateDuJourEst();
  if (!forcer) {
    let etat;
    try {
      const lecture = await supabase.from('defi_state').select('valeur').eq('cle', CLE_ETAT).maybeSingle();
      etat = lecture.data;
    } catch (err) {
      console.error('Erreur lecture dernier_envoi_hebdo:', err); // eslint-disable-line no-console
      res.status(500).json({ error: "Impossible de lire l'état — rien n'a été envoyé, on réessaiera dans une heure." });
      return;
    }
    if (etat?.valeur === aujourdHuiEst) {
      res.status(200).json({ ignore: true, raison: 'Déjà envoyé aujourd\'hui.' });
      return;
    }

    const { error: erreurReservation } = await supabase.from('defi_state').upsert(
      { cle: CLE_ETAT, valeur: aujourdHuiEst, updated_at: new Date().toISOString() },
      { onConflict: 'cle' }
    );
    if (erreurReservation) {
      console.error('Erreur réservation dernier_envoi_hebdo:', erreurReservation); // eslint-disable-line no-console
      res.status(500).json({ error: "Impossible de réserver la journée — rien n'a été envoyé, on réessaiera dans une heure." });
      return;
    }
  }

  // La semaine qui vient de se terminer — jamais celle en cours (même
  // logique que le vote).
  const { semaine, annee, moisIndex0 } = semaineFinieLaPlusRecente();
  const { texte: semaineLabel } = labelSemaine(semaine, annee, moisIndex0);

  const moisIso = getCurrentIsoMonth();
  const moisLisible = formatMoisLisible(moisIso);

  let classementSemaine, classementMois, participants;
  try {
    const resultats = await Promise.all([
      getRankingPourPeriode(semaine.debut, semaine.fin),
      getMonthlyRanking(moisIso),
      supabase.from('participants').select('email').eq('actif', true),
    ]);
    classementSemaine = resultats[0];
    classementMois = resultats[1];
    participants = resultats[2].data;
  } catch (err) {
    console.error('Erreur récupération des classements:', err); // eslint-disable-line no-console
    res.status(500).json({ error: `Erreur récupération des classements : ${err.message}` });
    return;
  }

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
  try {
    if (destinataireTest) {
      destinataires = [destinataireTest];
      const { data: participantTest } = await supabase
        .from('participants').select('id').eq('email', destinataireTest).maybeSingle();
      participantTestId = participantTest?.id || null;
    } else {
      destinataires = (participants || []).map((p) => p.email);
    }
  } catch (err) {
    console.error('Erreur résolution destinataires:', err); // eslint-disable-line no-console
    res.status(500).json({ error: `Erreur résolution destinataires : ${err.message}` });
    return;
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
  try {
    if (destinataireTest) {
      resultatPush = participantTestId
        ? await envoyerPushAUnParticipant(participantTestId, payloadPush)
        : { envoyes: 0, echecs: 0, note: 'Aucun participant trouvé avec ce courriel — push ignoré.' };
    } else {
      resultatPush = await envoyerPushATous(payloadPush);
    }
  } catch (err) {
    console.error('Erreur envoi push:', err); // eslint-disable-line no-console
    resultatPush = { envoyes: 0, echecs: 0, erreur: err.message };
  }

  // (la journee a ete reservee plus haut, avant les envois)

  res.status(200).json({
    courriel_envoye_a: destinataires,
    courriel_resultat: resultatEmail,
    push: resultatPush,
    semaine: semaineLabel,
    mois: moisIso,
    modeTest: !!destinataireTest,
  });
}

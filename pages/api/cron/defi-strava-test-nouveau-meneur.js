import { getSupabaseAdmin } from '../../../lib/defi-strava/supabaseAdmin';
import { getMonthlyRanking } from '../../../lib/defi-strava/getMonthlyRanking';
import { getCurrentIsoMonth } from '../../../lib/defi-strava/monthUtils';
import { envoyerPushATous, envoyerPushAUnParticipant } from '../../../lib/defi-strava/push';
import { texteNouveauMeneur } from '../../../lib/defi-strava/format';
import { sendNouveauMeneur } from '../../../lib/defi-strava/emailTemplate';

// Route de TEST UNIQUEMENT pour la notification "nouveau meneur" — elle
// ne détecte JAMAIS un vrai changement de tête (aucune écriture dans
// defi_state), donc elle ne peut pas fausser la vraie détection en
// production. Simule un dépassement en utilisant le vrai classement
// actuel du mois : le 1er reste le "nouveau meneur", et le 2e (ou une
// personne précisée) sert d'"ancien meneur" simulé.
export default async function handler(req, res) {
  const authHeader = req.headers.authorization;
  const secretQuery = req.query.secret;
  const autorise = authHeader === `Bearer ${process.env.CRON_SECRET}` || secretQuery === process.env.CRON_SECRET;
  if (!autorise) {
    res.status(401).json({ error: 'Non autorisé' });
    return;
  }

  const destinataireTest = req.query.destinataireTest || null;
  const ancienForce = req.query.ancien || null; // nom exact, optionnel

  try {
    const moisIso = getCurrentIsoMonth();
    const classement = await getMonthlyRanking(moisIso);

    if (classement.length === 0) {
      res.status(200).json({ ignore: true, raison: "Aucune activité enregistrée ce mois-ci — rien à simuler." });
      return;
    }

    const ancienMeneurNom = ancienForce || classement[1]?.nom || null;
    if (!ancienMeneurNom) {
      res.status(200).json({ ignore: true, raison: "Une seule personne dans le classement ce mois-ci — impossible de simuler un dépassement (il faut au moins 2 personnes, ou précise ?ancien=Nom)." });
      return;
    }

    const payloadPush = {
      title: '🥇 Nouveau meneur du Défi Strava !',
      body: texteNouveauMeneur(classement, ancienMeneurNom),
      url: `${process.env.NEXT_PUBLIC_APP_URL}/defi-strava/`,
    };

    const supabase = getSupabaseAdmin();
    let participantTestId = null;
    if (destinataireTest) {
      const { data: p } = await supabase.from('participants').select('id').eq('email', destinataireTest).maybeSingle();
      participantTestId = p?.id || null;
    }

    let resultatPush;
    try {
      resultatPush = destinataireTest
        ? (participantTestId
          ? await envoyerPushAUnParticipant(participantTestId, payloadPush)
          : { envoyes: 0, echecs: 0, note: 'Aucun participant trouvé avec ce courriel — push ignoré.' })
        : await envoyerPushATous(payloadPush);
    } catch (err) {
      resultatPush = { envoyes: 0, echecs: 0, erreur: err.message };
    }

    let resultatEmail;
    try {
      let destinatairesEmail;
      if (destinataireTest) {
        destinatairesEmail = [destinataireTest];
      } else {
        const { data: participantsActifs } = await supabase.from('participants').select('email').eq('actif', true);
        destinatairesEmail = (participantsActifs || []).map((p) => p.email).filter(Boolean);
      }
      resultatEmail = await sendNouveauMeneur(destinatairesEmail, { classement, ancienMeneurNom });
    } catch (err) {
      resultatEmail = { envoye: false, erreur: err.message };
    }

    res.status(200).json({
      test: true,
      note: "Ceci est un TEST — aucun changement de tête réel n'a été vérifié, l'état de détection (defi_state) n'a pas été touché.",
      nouveauMeneurSimule: classement[0]?.nom,
      ancienMeneurSimule: ancienMeneurNom,
      push: resultatPush,
      email: resultatEmail,
    });
  } catch (err) {
    console.error('Erreur test nouveau meneur:', err); // eslint-disable-line no-console
    res.status(500).json({ error: err.message || 'Erreur inconnue' });
  }
}

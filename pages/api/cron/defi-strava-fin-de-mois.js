import { getSupabaseAdmin } from '../../../lib/defi-strava/supabaseAdmin';
import { getMonthlyRanking, calculerStreakMensuelle } from '../../../lib/defi-strava/getMonthlyRanking';
import { fetchDonneesHallOfFame, calculerHallOfFameDepuisDonnees } from '../../../lib/defi-strava/hallOfFame';
import { envoyerPushATous, envoyerPushAUnParticipant } from '../../../lib/defi-strava/push';
import { sendFinDeMois } from '../../../lib/defi-strava/emailTemplate';
import { getMoisPrecedent, formatMoisLisible } from '../../../lib/defi-strava/monthUtils';
import { heureActuelleEst, jourDuMoisEst, dateDuJourEst } from '../../../lib/defi-strava/timezone';

const CLE_ETAT = 'dernier_envoi_fin_mois';

// Annonce les résultats FINAUX du mois qui vient de se terminer — se
// déclenche le 1er du mois suivant à 8h heure de l'Est. Distincte du
// résumé hebdomadaire du lundi (qui, lui, porte sur la semaine).
export default async function handler(req, res) {
  const debutExecution = Date.now();
  const authHeader = req.headers.authorization;
  const secretQuery = req.query.secret;
  const autorise = authHeader === `Bearer ${process.env.CRON_SECRET}` || secretQuery === process.env.CRON_SECRET;
  if (!autorise) {
    res.status(401).json({ error: 'Non autorisé' });
    return;
  }

  const forcer = req.query.forcer === '1';
  const destinataireTest = req.query.destinataireTest || null;
  // Interrupteurs de diagnostic temporaires — permettent d'isoler
  // exactement quelle section cause le problème sans deviner davantage.
  const sansHof = req.query.sansHof === '1';
  const sansEmail = req.query.sansEmail === '1';
  const sansPush = req.query.sansPush === '1';

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

  let classementFinal;
  try {
    classementFinal = await getMonthlyRanking(moisIso);
  } catch (err) {
    console.error('Erreur récupération classement final:', err); // eslint-disable-line no-console
    res.status(500).json({ error: `Erreur récupération classement final : ${err.message}` });
    return;
  }

  // Compare le Hall of Fame "tel qu'il était" à la fin de ce mois-ci vs
  // à la fin du mois précédent, pour savoir quels records viennent de
  // changer ce mois-ci précisément.
  const [annee, moisNum] = moisIso.split('-').map(Number);
  const dateFinMoisEcoule = `${annee}-${String(moisNum).padStart(2, '0')}-${String(new Date(annee, moisNum, 0).getDate()).padStart(2, '0')}`;
  const dateFinMoisPrecedent = (() => {
    const d = new Date(annee, moisNum - 1, 0); // dernier jour du mois précédent
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  let categoriesChangees = [];
  if (!sansHof) {
    try {
      // Une seule récupération des données depuis Supabase, puis 2 calculs
      // en mémoire (rapide) — au lieu de récupérer ET calculer 2 fois, ce
      // qui doublait le temps d'exécution et risquait un dépassement de
      // temps sur Vercel.
      const donneesHof = await fetchDonneesHallOfFame();
      const hofActuel = calculerHallOfFameDepuisDonnees(donneesHof, dateFinMoisEcoule);
      const hofAvant = calculerHallOfFameDepuisDonnees(donneesHof, dateFinMoisPrecedent);
      if (!hofActuel.pretePasEncore) {
        categoriesChangees = hofActuel.categories
          .map((cat, i) => {
            const avant = hofAvant.pretePasEncore ? null : hofAvant.categories[i];
            const aChange = !avant || avant.detenteur !== cat.detenteur || avant.valeur !== cat.valeur;
            if (!aChange) return null;
            const avantValide = avant && avant.detenteur !== 'Personne encore';
            return {
              icone: cat.icone,
              titre: cat.titre,
              detenteur: cat.detenteur,
              valeur: cat.valeur,
              ancienDetenteur: avantValide ? avant.detenteur : null,
              ancienneValeur: avantValide ? avant.valeur : null,
            };
          })
          .filter(Boolean);
      }
    } catch (err) {
      console.error('Erreur calcul comparaison Hall of Fame:', err); // eslint-disable-line no-console
    }
  }

  // Combien de mois d'affilée le gagnant du mois vient-il de remporter ?
  let streakMois = 1;
  try {
    if (classementFinal[0]?.nom) {
      streakMois = await calculerStreakMensuelle(classementFinal[0].nom, moisIso);
    }
  } catch (err) {
    console.error('Erreur calcul streak mensuelle:', err); // eslint-disable-line no-console
  }

  let participantTestId = null;
  try {
    if (destinataireTest) {
      const { data: participantTest } = await supabase
        .from('participants').select('id').eq('email', destinataireTest).maybeSingle();
      participantTestId = participantTest?.id || null;
    }
  } catch (err) {
    console.error('Erreur résolution participant test:', err); // eslint-disable-line no-console
  }

  const [premier, deuxieme, troisieme] = classementFinal;
  const medailleTexte = (r, medaille) => (r ? `${medaille} ${r.nom} avec ${r.totalFormate}` : null);
  const mentionBravo = premier
    ? `🎉 Bravo ${premier.nom} qui remporte la première place du mois${streakMois >= 2 ? `, une ${streakMois}e fois de suite` : ''} !!`
    : '';

  const corps = classementFinal.length === 0
    ? "Personne n'a bougé ce mois-ci — le prochain mois nous appartient !"
    : mentionBravo + '\n\n' + [medailleTexte(premier, '🥇'), medailleTexte(deuxieme, '🥈'), medailleTexte(troisieme, '🥉')]
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

  let resultatPush = { ignore: true, raison: 'sansPush=1' };
  if (!sansPush) {
    try {
      if (destinataireTest) {
        resultatPush = participantTestId
          ? await envoyerPushAUnParticipant(participantTestId, payloadPush)
          : { envoyes: 0, echecs: 0, note: 'Aucun participant trouvé avec ce courriel — push ignoré.' };
      } else {
        resultatPush = await envoyerPushATous(payloadPush);
      }
    } catch (err) {
      console.error('Erreur envoi push fin de mois:', err); // eslint-disable-line no-console
      resultatPush = { envoyes: 0, echecs: 0, erreur: err.message };
    }
  }

  let resultatEmail = { ignore: true, raison: 'sansEmail=1' };
  if (!sansEmail) {
    try {
      let destinatairesEmail;
      if (destinataireTest) {
        destinatairesEmail = [destinataireTest];
      } else {
        const { data: participantsActifs } = await supabase.from('participants').select('email').eq('actif', true);
        destinatairesEmail = (participantsActifs || []).map((p) => p.email).filter(Boolean);
      }
      resultatEmail = await sendFinDeMois(destinatairesEmail, { moisLisible, moisIso, classementFinal, categoriesChangees, streakMois });
    } catch (err) {
      console.error('Erreur envoi courriel fin de mois:', err); // eslint-disable-line no-console
      resultatEmail = { envoye: false, erreur: err.message };
    }
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
    email: resultatEmail,
    mois_annonce: moisIso,
    classement: classementFinal,
    modeTest: !!destinataireTest,
    dureeMs: Date.now() - debutExecution,
    interrupteurs: { sansHof, sansEmail, sansPush },
  });
}

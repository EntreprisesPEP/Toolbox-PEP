import { getSupabaseAdmin } from './supabaseAdmin';
import { formatDuree } from './format';
import { semainesDuMois, toDateISO } from './weekUtils';
import { dateEffective } from './activityHelpers';
import { estWeekendOuFerie } from './joursFeries';

// ============================================================================
// Hall of Fame / Shame — 16 catégories, calculées depuis les vraies
// données (activities, participants, meneur_changements, votes).
//
// ⚠️ Catégories dont la précision dépend des données historiques :
// les activités captées AVANT l'ajout de date_debut_locale/total_photo_count
// (voir sql/defi-strava-05-votes-et-hall-of-fame.sql) n'ont pas ces champs
// — elles sont donc exclues des calculs "après 22h", "3h-7h" et "photos"
// jusqu'à un éventuel backfill.
// ============================================================================

function classementDescendant(map, participantsParId) {
  return Object.entries(map)
    .map(([participantId, valeur]) => ({
      nom: participantsParId[participantId]?.nom || '?',
      valeur,
    }))
    .sort((a, b) => b.valeur - a.valeur);
}

function carte(icone, titre, sousTitre, contexte, classement, formatValeur, citron = false) {
  const classementFiltre = classement.filter((c) => c.valeur > 0);
  if (classementFiltre.length === 0) {
    return { icone, titre, sousTitre, contexte, citron, valeur: '—', detenteur: 'Personne encore', classement: [] };
  }
  return {
    icone,
    titre,
    sousTitre,
    contexte,
    citron,
    valeur: formatValeur(classementFiltre[0].valeur),
    detenteur: classementFiltre[0].nom,
    classement: classementFiltre.map((c) => ({ nom: c.nom, v: formatValeur(c.valeur) })),
  };
}

export async function calculerHallOfFame() {
  const supabase = getSupabaseAdmin();

  const [{ data: participants }, { data: activites }, { data: meneurChangements }, { data: votes }] =
    await Promise.all([
      supabase.from('participants').select('id, nom').eq('actif', true),
      supabase
        .from('activities')
        .select('participant_id, duree_secondes, date_debut, date_debut_locale, total_photo_count'),
      supabase.from('meneur_changements').select('ancien_meneur_id, nouveau_meneur_id'),
      supabase.from('votes').select('votant_participant_id, vote_pour_participant_id, semaine_debut'),
    ]);

  const participantsParId = {};
  (participants || []).forEach((p) => { participantsParId[p.id] = p; });

  const acts = (activites || []).map((a) => ({ ...a, eff: dateEffective(a) }));

  if (acts.length === 0) {
    return { pretePasEncore: true, categories: [] };
  }

  // Bornes temporelles du défi (première activité connue -> aujourd'hui)
  const premiereDate = acts.reduce((min, a) => (a.eff < min ? a.eff : min), acts[0].eff);
  const aujourdHui = new Date();

  // -- 1) Le jour de gloire : meilleure journée (participant, jour) --------
  const parJour = {}; // `${participantId}|${YYYY-MM-DD}` -> secondes
  for (const a of acts) {
    const cle = `${a.participant_id}|${toDateISO(a.eff)}`;
    parJour[cle] = (parJour[cle] || 0) + a.duree_secondes;
  }
  const meilleurJourParParticipant = {};
  for (const [cle, secondes] of Object.entries(parJour)) {
    const [pid] = cle.split('|');
    if (!meilleurJourParParticipant[pid] || secondes > meilleurJourParParticipant[pid]) {
      meilleurJourParParticipant[pid] = secondes;
    }
  }

  // -- Regroupe toutes les activités par MOIS calendaire présent -----------
  const moisPresents = new Set();
  for (const a of acts) moisPresents.add(`${a.eff.getFullYear()}-${String(a.eff.getMonth() + 1).padStart(2, '0')}`);
  const listeMois = [...moisPresents].sort();

  // -- 2) Semaine en feu + 5) L'habitué du podium (rang1 hebdo) ------------
  const meilleureSemaineParParticipant = {};
  const semainesGagneesParParticipant = {};
  // -- 3) Le mois royal + 6) Le monarque (rang1 mensuel) + 12) L'éternel 2e -
  const meilleurMoisParParticipant = {};
  const moisGagnesParParticipant = {};
  const foisRang2Mensuel = {};
  const dejaRang1Mensuel = new Set();

  for (const moisCle of listeMois) {
    const [anneeStr, moisStr] = moisCle.split('-');
    const annee = parseInt(anneeStr, 10);
    const moisIndex0 = parseInt(moisStr, 10) - 1;
    const actsDuMois = acts.filter(
      (a) => a.eff.getFullYear() === annee && a.eff.getMonth() === moisIndex0
    );

    // Total du mois par participant
    const totalMoisParParticipant = {};
    for (const a of actsDuMois) {
      totalMoisParParticipant[a.participant_id] = (totalMoisParParticipant[a.participant_id] || 0) + a.duree_secondes;
    }
    for (const [pid, total] of Object.entries(totalMoisParParticipant)) {
      if (!meilleurMoisParParticipant[pid] || total > meilleurMoisParParticipant[pid]) {
        meilleurMoisParParticipant[pid] = total;
      }
    }
    const classementMois = Object.entries(totalMoisParParticipant).sort((a, b) => b[1] - a[1]);
    if (classementMois.length > 0) {
      const [gagnantPid] = classementMois[0];
      moisGagnesParParticipant[gagnantPid] = (moisGagnesParParticipant[gagnantPid] || 0) + 1;
      dejaRang1Mensuel.add(gagnantPid);
    }
    if (classementMois.length > 1) {
      const [deuxiemePid] = classementMois[1];
      foisRang2Mensuel[deuxiemePid] = (foisRang2Mensuel[deuxiemePid] || 0) + 1;
    }

    // Semaines du mois
    const semaines = semainesDuMois(annee, moisIndex0);
    for (const s of semaines) {
      const debutISO = toDateISO(s.debut);
      const finISO = toDateISO(s.fin);
      const actsDeCetteSemaine = actsDuMois.filter((a) => {
        const iso = toDateISO(a.eff);
        return iso >= debutISO && iso <= finISO;
      });
      const totalSemaineParParticipant = {};
      for (const a of actsDeCetteSemaine) {
        totalSemaineParParticipant[a.participant_id] = (totalSemaineParParticipant[a.participant_id] || 0) + a.duree_secondes;
      }
      for (const [pid, total] of Object.entries(totalSemaineParParticipant)) {
        if (!meilleureSemaineParParticipant[pid] || total > meilleureSemaineParParticipant[pid]) {
          meilleureSemaineParParticipant[pid] = total;
        }
      }
      const classementSemaine = Object.entries(totalSemaineParParticipant).sort((a, b) => b[1] - a[1]);
      if (classementSemaine.length > 0) {
        const [gagnantPid] = classementSemaine[0];
        semainesGagneesParParticipant[gagnantPid] = (semainesGagneesParParticipant[gagnantPid] || 0) + 1;
      }
    }
  }
  // "Jamais 1er" pour l'éternel deuxième : exclut qui a déjà gagné un mois
  const foisRang2SansJamaisRang1 = {};
  for (const [pid, compte] of Object.entries(foisRang2Mensuel)) {
    if (!dejaRang1Mensuel.has(pid)) foisRang2SansJamaisRang1[pid] = compte;
  }
  // Si personne ne qualifie (tout le monde a déjà gagné au moins un mois),
  // retombe sur le classement brut de rang2 (moins strict, mais évite une
  // catégorie vide).
  const donneesRang2 = Object.keys(foisRang2SansJamaisRang1).length > 0 ? foisRang2SansJamaisRang1 : foisRang2Mensuel;

  // -- 4) La machine increvable : plus longue séquence de jours consécutifs
  const joursActifsParParticipant = {};
  for (const a of acts) {
    const pid = a.participant_id;
    if (!joursActifsParParticipant[pid]) joursActifsParParticipant[pid] = new Set();
    joursActifsParParticipant[pid].add(toDateISO(a.eff));
  }
  const meilleureSequenceParParticipant = {};
  for (const [pid, joursSet] of Object.entries(joursActifsParParticipant)) {
    const jours = [...joursSet].sort();
    let meilleure = 1;
    let courante = 1;
    for (let i = 1; i < jours.length; i++) {
      const prec = new Date(jours[i - 1]);
      const courant = new Date(jours[i]);
      const diffJours = Math.round((courant - prec) / 86400000);
      if (diffJours === 1) { courante++; meilleure = Math.max(meilleure, courante); }
      else courante = 1;
    }
    meilleureSequenceParParticipant[pid] = jours.length > 0 ? meilleure : 0;
  }

  // -- 7) La légende vivante : temps total cumulé depuis le début ----------
  const totalCumuleParParticipant = {};
  for (const a of acts) {
    totalCumuleParParticipant[a.participant_id] = (totalCumuleParParticipant[a.participant_id] || 0) + a.duree_secondes;
  }

  // -- 8) Le duel légendaire : paire qui échange la tête le plus souvent --
  const comptePaires = {}; // "nomA↔nomB" (ordre alphabétique) -> compte
  for (const mc of meneurChangements || []) {
    if (!mc.ancien_meneur_id || !mc.nouveau_meneur_id) continue;
    const nomA = participantsParId[mc.ancien_meneur_id]?.nom;
    const nomB = participantsParId[mc.nouveau_meneur_id]?.nom;
    if (!nomA || !nomB || nomA === nomB) continue;
    const cle = [nomA, nomB].sort().join(' ↔ ');
    comptePaires[cle] = (comptePaires[cle] || 0) + 1;
  }
  const classementPaires = Object.entries(comptePaires)
    .map(([nom, valeur]) => ({ nom, valeur }))
    .sort((a, b) => b.valeur - a.valeur);

  // -- 9) Plus Instagram qu'athlète : total de photos -----------------------
  const photosParParticipant = {};
  for (const a of acts) {
    photosParParticipant[a.participant_id] = (photosParParticipant[a.participant_id] || 0) + (a.total_photo_count || 0);
  }

  // -- 10) Mode hibernation : plus long jeûne d'activité --------------------
  const plusLongJeuneParParticipant = {};
  for (const [pid, joursSet] of Object.entries(joursActifsParParticipant)) {
    const jours = [...joursSet].sort().map((j) => new Date(j));
    let plusLong = 0;
    for (let i = 1; i < jours.length; i++) {
      const diffJours = Math.round((jours[i] - jours[i - 1]) / 86400000) - 1;
      if (diffJours > plusLong) plusLong = diffJours;
    }
    // Jeûne en cours (depuis la dernière activité jusqu'à aujourd'hui)
    if (jours.length > 0) {
      const diffDepuisDerniere = Math.round((aujourdHui - jours[jours.length - 1]) / 86400000) - 1;
      if (diffDepuisDerniere > plusLong) plusLong = diffDepuisDerniere;
    }
    plusLongJeuneParParticipant[pid] = Math.max(0, plusLong);
  }

  // -- 11) Le noctambule : heures après 22h (approximation : activités
  //        DÉBUTÉES après 22h, compte la durée totale de l'activité) ------
  // -- 13) Le coq du bureau : heures entre 3h et 7h du matin ---------------
  const nocturneParParticipant = {};
  const coqDuBureauParParticipant = {};
  for (const a of acts) {
    if (!a.date_debut_locale) continue; // pas fiable sans heure locale connue
    const heure = a.eff.getHours();
    if (heure >= 22) {
      nocturneParParticipant[a.participant_id] = (nocturneParParticipant[a.participant_id] || 0) + a.duree_secondes;
    }
    if (heure >= 3 && heure < 7) {
      coqDuBureauParParticipant[a.participant_id] = (coqDuBureauParParticipant[a.participant_id] || 0) + a.duree_secondes;
    }
  }

  // -- 14) L'idole populaire : total de votes reçus, à vie -----------------
  const votesRecusParParticipant = {};
  for (const v of votes || []) {
    votesRecusParParticipant[v.vote_pour_participant_id] = (votesRecusParParticipant[v.vote_pour_participant_id] || 0) + 1;
  }

  // -- 15) Le chouchou du groupe : semaines de vote remportées -------------
  const votesParSemaine = {}; // semaine_debut -> { participantId: compte }
  for (const v of votes || []) {
    if (!votesParSemaine[v.semaine_debut]) votesParSemaine[v.semaine_debut] = {};
    votesParSemaine[v.semaine_debut][v.vote_pour_participant_id] =
      (votesParSemaine[v.semaine_debut][v.vote_pour_participant_id] || 0) + 1;
  }
  const semainesVoteGagneesParParticipant = {};
  for (const compteParPersonne of Object.values(votesParSemaine)) {
    const classementSemaineVote = Object.entries(compteParPersonne).sort((a, b) => b[1] - a[1]);
    if (classementSemaineVote.length > 0) {
      const [gagnantPid] = classementSemaineVote[0];
      semainesVoteGagneesParParticipant[gagnantPid] = (semainesVoteGagneesParParticipant[gagnantPid] || 0) + 1;
    }
  }

  // -- 16) No Days Off : moyenne heures/jour les fins de semaine + fériés --
  // Dénominateur = nombre de jours de weekend/férié écoulés depuis la
  // première activité connue jusqu'à aujourd'hui (récompense la vraie
  // constance, pas juste "a bougé quelques fins de semaine").
  let joursWeekendFerieEcoules = 0;
  {
    const curseur = new Date(premiereDate);
    curseur.setHours(0, 0, 0, 0);
    const fin = new Date(aujourdHui);
    fin.setHours(0, 0, 0, 0);
    while (curseur <= fin) {
      if (estWeekendOuFerie(curseur)) joursWeekendFerieEcoules++;
      curseur.setDate(curseur.getDate() + 1);
    }
  }
  const secondesWeekendFerieParParticipant = {};
  for (const a of acts) {
    if (estWeekendOuFerie(a.eff)) {
      secondesWeekendFerieParParticipant[a.participant_id] =
        (secondesWeekendFerieParParticipant[a.participant_id] || 0) + a.duree_secondes;
    }
  }
  const moyenneWeekendFerieParParticipant = {};
  for (const [pid, secondes] of Object.entries(secondesWeekendFerieParParticipant)) {
    moyenneWeekendFerieParParticipant[pid] = joursWeekendFerieEcoules > 0 ? secondes / joursWeekendFerieEcoules : 0;
  }

  // ==========================================================================
  const formatH = (s) => formatDuree(Math.round(s));
  const formatJours = (n) => `${n} jour${n > 1 ? 's' : ''}`;
  const formatFois = (n) => `${n} fois`;
  const formatCompte = (n) => `${n}`;
  const formatMoyenneJour = (s) => `${formatDuree(Math.round(s))} / jour`;

  const categories = [
    carte('🚀', 'Le jour de gloire', 'Meilleure journée', 'Depuis le début du défi',
      classementDescendant(meilleurJourParParticipant, participantsParId), formatH),
    carte('🔥', 'Semaine en feu', 'Meilleure semaine', 'Depuis le début du défi',
      classementDescendant(meilleureSemaineParParticipant, participantsParId), formatH),
    carte('👑', 'Le mois royal', 'Meilleur mois', 'Depuis le début du défi',
      classementDescendant(meilleurMoisParParticipant, participantsParId), formatH),
    {
      icone: '⚔️', titre: 'Le duel légendaire', sousTitre: 'Meilleure rivalité',
      contexte: 'Changements de tête les plus fréquents entre 2 personnes',
      citron: false,
      valeur: classementPaires.length > 0 ? `${classementPaires[0].valeur} échange${classementPaires[0].valeur > 1 ? 's' : ''}` : '—',
      detenteur: classementPaires.length > 0 ? classementPaires[0].nom : 'Personne encore',
      classement: classementPaires.map((p) => ({ nom: p.nom, v: `${p.valeur} échange${p.valeur > 1 ? 's' : ''}` })),
    },
    carte('⚙️', 'La machine increvable', 'Meilleure séquence', 'Jours consécutifs avec une activité',
      classementDescendant(meilleureSequenceParParticipant, participantsParId), formatJours),
    carte('🎖️', 'L\u2019habitué du podium', 'Plus de semaines gagnées', 'Depuis le début du défi',
      classementDescendant(semainesGagneesParParticipant, participantsParId), formatCompte),
    carte('🏰', 'Le monarque du classement', 'Plus de mois gagnés', 'Depuis le début du défi',
      classementDescendant(moisGagnesParParticipant, participantsParId), formatCompte),
    carte('🐎', 'La légende vivante', 'Temps total cumulé', 'Depuis le début du défi',
      classementDescendant(totalCumuleParParticipant, participantsParId), formatH),

    carte('📸', 'Plus Instagram qu\u2019athlète', 'Photographie 101',
      'Le plus de photos publiées avec ses activités Strava',
      classementDescendant(photosParParticipant, participantsParId), (n) => `${n} photo${n > 1 ? 's' : ''}`, true),
    carte('🛌', 'Mode hibernation activé', 'Plus long jeûne d\u2019activité', 'Repos bien mérité (ou pas)',
      classementDescendant(plusLongJeuneParParticipant, participantsParId), formatJours, true),
    carte('🦇', 'Le noctambule officiel', 'Le classique tard en soirée', 'Total d\u2019heures faites après 22 h',
      classementDescendant(nocturneParParticipant, participantsParId), formatH, true),
    carte('🥈', 'L\u2019éternel deuxième', 'Presqu\u2019une légende', '2e place, jamais 1er — mensuel',
      classementDescendant(donneesRang2, participantsParId), formatFois, true),
    carte('🐓', 'Le coq du bureau', 'Early Riser', 'Total d\u2019heures faites entre 3 h et 7 h du matin',
      classementDescendant(coqDuBureauParParticipant, participantsParId), formatH, true),
    carte('🌟', 'L\u2019idole populaire', 'Plus de votes cumulés', 'Total de votes reçus à vie',
      classementDescendant(votesRecusParParticipant, participantsParId), formatCompte, true),
    carte('❤️', 'Le chouchou du groupe', 'Plus de semaines de vote remportées', 'Votes du groupe, depuis le début',
      classementDescendant(semainesVoteGagneesParParticipant, participantsParId), formatCompte, true),
    carte('🚫🛌', 'No Days Off', 'Meilleure moyenne les fins de semaine et jours fériés',
      'Moyenne sur tous les jours de weekend/férié écoulés depuis le début',
      classementDescendant(moyenneWeekendFerieParParticipant, participantsParId), formatMoyenneJour, true),
  ];

  return { pretePasEncore: false, categories };
}

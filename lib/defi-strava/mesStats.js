// Calcule les statistiques personnelles d'UN participant (onglet "Mes
// stats") — jamais montrées à personne d'autre, contrairement au Hall of
// Fame qui est un classement collectif. Réutilise les mêmes conventions
// que hallOfFame.js (dateEffective, semainesDuMois, un seul fetch).
import { getSupabaseAdmin } from './supabaseAdmin';
import { dateEffective } from './activityHelpers';
import { toDateISO, semainesDuMois } from './weekUtils';
import { joursFeriesQuebec } from './joursFeries';
import { formatDuree } from './format';

const NOMS_JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

function formatHeure(h) {
  const heureEntiere = Math.floor(h);
  const minutes = Math.round((h - heureEntiere) * 60);
  return `${heureEntiere} h ${String(minutes).padStart(2, '0')}`;
}

function joursEntreDates(a, b) {
  return Math.round((b - a) / (1000 * 60 * 60 * 24)) + 1; // inclusif
}

export async function calculerMesStats(participantId) {
  const supabase = getSupabaseAdmin();

  const [{ data: activites }] = await Promise.all([
    supabase.from('activities').select('participant_id, duree_secondes, date_debut, date_debut_locale, type'),
  ]);

  const toutesActs = (activites || []).map((a) => ({ ...a, eff: dateEffective(a) }));
  const mesActs = toutesActs.filter((a) => a.participant_id === participantId).sort((a, b) => a.eff - b.eff);

  if (mesActs.length === 0) {
    return { pasEncoreActif: true };
  }

  const maintenant = new Date();
  const aujourdHuiISO = toDateISO(maintenant);
  const premiereDate = mesActs[0].eff;
  const premiereISO = toDateISO(premiereDate);
  const joursDepuisDebut = Math.max(1, joursEntreDates(new Date(premiereISO), new Date(aujourdHuiISO)));

  // ==========================================================================
  // 1) MOYENNES ET VOLUMES
  // ==========================================================================
  const totalSecondesDepuisDebut = mesActs.reduce((s, a) => s + a.duree_secondes, 0);
  const moyenneMinutesParJour = Math.round((totalSecondesDepuisDebut / 60) / joursDepuisDebut);
  const semainesDepuisDebut = Math.max(1, joursDepuisDebut / 7);
  const moyenneSecondesParSemaine = Math.round(totalSecondesDepuisDebut / semainesDepuisDebut);

  const moisActuelCle = `${maintenant.getFullYear()}-${String(maintenant.getMonth() + 1).padStart(2, '0')}`;
  const actsCeMois = mesActs.filter((a) => `${a.eff.getFullYear()}-${String(a.eff.getMonth() + 1).padStart(2, '0')}` === moisActuelCle);
  const totalSecondesCeMois = actsCeMois.reduce((s, a) => s + a.duree_secondes, 0);

  const nombreActivites = mesActs.length;
  const nombreActivitesCeMois = actsCeMois.length;
  const dureeMoyenneParActivite = Math.round(totalSecondesDepuisDebut / nombreActivites);
  const nombreSportsDifferents = new Set(mesActs.map((a) => a.type).filter(Boolean)).size;

  // ==========================================================================
  // 2) RÉGULARITÉ
  // ==========================================================================
  const joursActifsSet = new Set(mesActs.map((a) => toDateISO(a.eff)));

  const dernierJourMoisActuel = new Date(maintenant.getFullYear(), maintenant.getMonth() + 1, 0).getDate();
  let joursActifsCeMois = 0;
  for (let j = 1; j <= dernierJourMoisActuel; j++) {
    const iso = toDateISO(new Date(maintenant.getFullYear(), maintenant.getMonth(), j));
    if (iso > aujourdHuiISO) break;
    if (joursActifsSet.has(iso)) joursActifsCeMois++;
  }
  const joursEcoulesCeMois = maintenant.getDate();

  const pourcentageJoursActifsDepuisDebut = Math.round((joursActifsSet.size / joursDepuisDebut) * 100);

  const joursTriesISO = [...joursActifsSet].sort();
  let meilleureSequence = 1;
  let sequenceCourante = 1;
  let plusLongJeune = 0;
  for (let i = 1; i < joursTriesISO.length; i++) {
    const diffJours = Math.round((new Date(joursTriesISO[i]) - new Date(joursTriesISO[i - 1])) / (1000 * 60 * 60 * 24));
    if (diffJours === 1) {
      sequenceCourante++;
      meilleureSequence = Math.max(meilleureSequence, sequenceCourante);
    } else {
      plusLongJeune = Math.max(plusLongJeune, diffJours - 1);
      sequenceCourante = 1;
    }
  }

  let sequenceActuelle = 0;
  {
    const curseur = new Date(aujourdHuiISO);
    if (!joursActifsSet.has(toDateISO(curseur))) curseur.setDate(curseur.getDate() - 1);
    while (joursActifsSet.has(toDateISO(curseur))) {
      sequenceActuelle++;
      curseur.setDate(curseur.getDate() - 1);
    }
  }

  const anneeDebut = premiereDate.getFullYear();
  const anneeActuelle = maintenant.getFullYear();
  let feriesDepuisDebut = [];
  for (let an = anneeDebut; an <= anneeActuelle; an++) feriesDepuisDebut.push(...joursFeriesQuebec(an));
  feriesDepuisDebut = feriesDepuisDebut.filter((d) => {
    const iso = toDateISO(d);
    return iso >= premiereISO && iso <= aujourdHuiISO;
  });
  const feriesActifs = feriesDepuisDebut.filter((d) => joursActifsSet.has(toDateISO(d))).length;

  // ==========================================================================
  // 3) RECORDS PERSONNELS
  // ==========================================================================
  const parJour = {};
  for (const a of mesActs) parJour[toDateISO(a.eff)] = (parJour[toDateISO(a.eff)] || 0) + a.duree_secondes;
  let meilleureJourneeSecondes = 0;
  let meilleureJourneeDateISO = null;
  for (const [iso, sec] of Object.entries(parJour)) {
    if (sec > meilleureJourneeSecondes) { meilleureJourneeSecondes = sec; meilleureJourneeDateISO = iso; }
  }

  const moisPresentsPerso = new Set(mesActs.map((a) => `${a.eff.getFullYear()}-${String(a.eff.getMonth() + 1).padStart(2, '0')}`));
  let meilleureSemaineSecondes = 0;
  let meilleurMoisSecondes = 0;
  for (const moisCle of moisPresentsPerso) {
    const [anneeStr, moisStr] = moisCle.split('-');
    const annee = parseInt(anneeStr, 10);
    const moisIndex0 = parseInt(moisStr, 10) - 1;
    const actsDuMois = mesActs.filter((a) => a.eff.getFullYear() === annee && a.eff.getMonth() === moisIndex0);
    const totalMois = actsDuMois.reduce((s, a) => s + a.duree_secondes, 0);
    if (totalMois > meilleurMoisSecondes) meilleurMoisSecondes = totalMois;

    for (const s of semainesDuMois(annee, moisIndex0)) {
      const debutISO = toDateISO(s.debut);
      const finISO = toDateISO(s.fin);
      const totalSemaine = actsDuMois
        .filter((a) => { const iso = toDateISO(a.eff); return iso >= debutISO && iso <= finISO; })
        .reduce((s2, a) => s2 + a.duree_secondes, 0);
      if (totalSemaine > meilleureSemaineSecondes) meilleureSemaineSecondes = totalSemaine;
    }
  }

  const activitePlusLongue = mesActs.reduce((max, a) => (a.duree_secondes > (max?.duree_secondes || 0) ? a : max), null);

  // ==========================================================================
  // 4) CLASSEMENT — nécessite le classement de TOUS les participants, pour
  // chaque mois/semaine passé, afin de compter les 1res places / podiums.
  // ==========================================================================
  const moisPresentsTous = new Set(toutesActs.map((a) => `${a.eff.getFullYear()}-${String(a.eff.getMonth() + 1).padStart(2, '0')}`));
  let foisPremierMois = 0;
  let foisPremierSemaine = 0;
  let foisPodiumMois = 0;

  for (const moisCle of moisPresentsTous) {
    const [anneeStr, moisStr] = moisCle.split('-');
    const annee = parseInt(anneeStr, 10);
    const moisIndex0 = parseInt(moisStr, 10) - 1;
    const actsDuMoisTous = toutesActs.filter((a) => a.eff.getFullYear() === annee && a.eff.getMonth() === moisIndex0);

    const totalMoisParParticipant = {};
    for (const a of actsDuMoisTous) totalMoisParParticipant[a.participant_id] = (totalMoisParParticipant[a.participant_id] || 0) + a.duree_secondes;
    const classementMois = Object.entries(totalMoisParParticipant).sort((a, b) => b[1] - a[1]);
    const rangMois = classementMois.findIndex(([pid]) => pid === participantId);
    if (rangMois === 0) foisPremierMois++;
    if (rangMois >= 0 && rangMois < 3) foisPodiumMois++;

    for (const s of semainesDuMois(annee, moisIndex0)) {
      const debutISO = toDateISO(s.debut);
      const finISO = toDateISO(s.fin);
      const actsSemaineTous = actsDuMoisTous.filter((a) => { const iso = toDateISO(a.eff); return iso >= debutISO && iso <= finISO; });
      const totalSemaineParParticipant = {};
      for (const a of actsSemaineTous) totalSemaineParParticipant[a.participant_id] = (totalSemaineParParticipant[a.participant_id] || 0) + a.duree_secondes;
      const classementSemaine = Object.entries(totalSemaineParParticipant).sort((a, b) => b[1] - a[1]);
      const rangSemaine = classementSemaine.findIndex(([pid]) => pid === participantId);
      if (rangSemaine === 0) foisPremierSemaine++;
    }
  }

  // ==========================================================================
  // 5) HABITUDES HORAIRES
  // ==========================================================================
  const heures = mesActs.map((a) => a.eff.getHours() + a.eff.getMinutes() / 60);
  const heureMoyenne = heures.reduce((s, h) => s + h, 0) / heures.length;

  let matin = 0;
  let midi = 0;
  let soir = 0;
  for (const h of heures) {
    if (h >= 5 && h < 12) matin++;
    else if (h >= 12 && h < 17) midi++;
    else soir++;
  }
  const pctMatin = Math.round((matin / heures.length) * 100);
  const pctMidi = Math.round((midi / heures.length) * 100);
  const pctSoir = Math.round((soir / heures.length) * 100);

  const activitesApres22h = heures.filter((h) => h >= 22).length;
  const activitesEntre3h7h = heures.filter((h) => h >= 3 && h < 7).length;

  const secondesParJourSemaine = [0, 0, 0, 0, 0, 0, 0];
  for (const a of mesActs) secondesParJourSemaine[a.eff.getDay()] += a.duree_secondes;
  let jourPlusActifIndex = 0;
  for (let i = 1; i < 7; i++) {
    if (secondesParJourSemaine[i] > secondesParJourSemaine[jourPlusActifIndex]) jourPlusActifIndex = i;
  }
  const joursAvecActivite = [0, 1, 2, 3, 4, 5, 6].filter((i) => secondesParJourSemaine[i] > 0);
  const jourMoinsActifIndex = joursAvecActivite.length > 0
    ? joursAvecActivite.reduce((min, i) => (secondesParJourSemaine[i] < secondesParJourSemaine[min] ? i : min), joursAvecActivite[0])
    : jourPlusActifIndex;

  return {
    pasEncoreActif: false,
    moyennesEtVolumes: {
      moyenneMinutesParJour: `${moyenneMinutesParJour} min`,
      moyenneHeuresParSemaine: formatDuree(moyenneSecondesParSemaine),
      totalCumule: formatDuree(totalSecondesDepuisDebut),
      totalCumuleCeMois: formatDuree(totalSecondesCeMois),
      nombreActivites: String(nombreActivites),
      nombreActivitesCeMois: String(nombreActivitesCeMois),
      dureeMoyenneParActivite: formatDuree(dureeMoyenneParActivite),
      nombreSportsDifferents: String(nombreSportsDifferents),
    },
    regularite: {
      joursActifsCeMois: `${joursActifsCeMois} / ${joursEcoulesCeMois} jours`,
      pourcentageJoursActifsDepuisDebut: `${pourcentageJoursActifsDepuisDebut} %`,
      meilleureSequence: `${meilleureSequence} jour${meilleureSequence > 1 ? 's' : ''}`,
      sequenceActuelle: `${sequenceActuelle} jour${sequenceActuelle > 1 ? 's' : ''}`,
      plusLongJeune: `${plusLongJeune} jour${plusLongJeune > 1 ? 's' : ''}`,
      feriesActifs: `${feriesActifs} / ${feriesDepuisDebut.length}`,
    },
    recordsPersonnels: {
      meilleureJournee: formatDuree(meilleureJourneeSecondes),
      meilleureSemaine: formatDuree(meilleureSemaineSecondes),
      meilleurMois: formatDuree(meilleurMoisSecondes),
      dateMeilleureJournee: meilleureJourneeDateISO,
      activitePlusLongue: activitePlusLongue ? `${formatDuree(activitePlusLongue.duree_secondes)} (${activitePlusLongue.type || 'Inconnu'})` : '—',
    },
    classement: {
      foisPremierMois: String(foisPremierMois),
      foisPremierSemaine: String(foisPremierSemaine),
      foisPodiumMois: String(foisPodiumMois),
    },
    habitudesHoraires: {
      heureMoyenneDebut: formatHeure(heureMoyenne),
      repartitionMatinMidiSoir: `${pctMatin} % / ${pctMidi} % / ${pctSoir} %`,
      activitesApres22h: String(activitesApres22h),
      activitesEntre3h7h: String(activitesEntre3h7h),
      jourPlusActif: NOMS_JOURS[jourPlusActifIndex],
      jourMoinsActif: NOMS_JOURS[jourMoinsActifIndex],
    },
  };
}

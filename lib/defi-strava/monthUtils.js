// Calcule l'identifiant de mois (ex. '2026-08') pour une date donnée.
// Sert à regrouper les activités par mois — c'est la vraie unité du défi
// (le but est de finir le mois avec le plus d'heures possible).

import { dateDuJourEst } from '../commun/planification';

export function getIsoMonth(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

// ---------------------------------------------------------------------------
// « QUEL MOIS EST-ON? » — EN HEURE DE L'EST, PAS EN HEURE DU SERVEUR
//
// Revision 57. Cette fonction faisait `getIsoMonth(new Date())`. Une fonction
// Vercel tourne en UTC : le 30 septembre à 20 h 01 chez nous, il est déjà le
// 1er octobre pour le serveur. Pendant les quatre dernières heures de chaque
// mois, tout le Défi Strava croyait donc le mois suivant commencé.
//
// Le 30 septembre 2026 à 20 h 01, c'est exactement ce qui est arrivé : la
// synchro bihoraire a calculé le classement d'octobre — vide —, y a vu un
// « nouveau meneur » à 0 min, et l'a annoncé à toute l'équipe.
//
// Les quatre dernières heures du mois comptaient bien dans les totaux (le
// filtrage des activités, lui, se fait sur l'heure locale — voir
// activityHelpers.js). C'est seulement « quel mois est en cours » qui
// basculait trop tôt. Rien à rattraper dans les données, donc.
//
// `dateDuJourEst()` est la même définition de « quel jour on est ici » que
// celle qui sert aux rappels de l'Ordre du jour depuis la revision 55. Une
// seule définition pour les deux apps.
// ---------------------------------------------------------------------------
export function getCurrentIsoMonth() {
  return dateDuJourEst().slice(0, 7); // 'AAAA-MM-JJ' -> 'AAAA-MM'
}

// Le mois qui vient de se terminer, par rapport à une date de référence
// (par défaut le mois en cours ici) — utilisé le 1er du mois pour annoncer
// les résultats FINAUX du mois précédent, jamais le mois en cours.
export function getMoisPrecedent(reference = null) {
  const base = reference ? getIsoMonth(reference) : getCurrentIsoMonth();
  const [annee, mois] = base.split('-').map(Number);
  // mois - 2 : -1 pour passer en index 0, -1 pour reculer d'un mois. Un index
  // négatif recule d'une année tout seul (janvier -> décembre précédent).
  return getIsoMonth(new Date(annee, mois - 2, 1));
}

const NOMS_MOIS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

export function formatMoisLisible(moisIso) {
  const [annee, mois] = moisIso.split('-').map(Number);
  return `${NOMS_MOIS[mois - 1]} ${annee}`;
}

// Retourne "d'août" / "de septembre" — la bonne préposition française
// selon que le mois commence par une voyelle (ou un h muet) ou non.
// moisIndex0 : janvier = 0.
export function moisAvecPreposition(moisIndex0) {
  const nom = NOMS_MOIS[moisIndex0];
  const commenceParVoyelle = /^[aeiouhéèêàâ]/i.test(nom);
  const nomCapitalise = nom.charAt(0).toUpperCase() + nom.slice(1);
  return commenceParVoyelle ? `d'${nomCapitalise}` : `de ${nomCapitalise}`;
}

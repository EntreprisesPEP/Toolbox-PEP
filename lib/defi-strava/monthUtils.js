// Calcule l'identifiant de mois (ex. '2026-08') pour une date donnée.
// Sert à regrouper les activités par mois — c'est la vraie unité du défi
// (le but est de finir le mois avec le plus d'heures possible).

export function getIsoMonth(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function getCurrentIsoMonth() {
  return getIsoMonth(new Date());
}

// Le mois qui vient de se terminer, par rapport à une date de référence
// (par défaut aujourd'hui) — utilisé le 1er du mois pour annoncer les
// résultats FINAUX du mois précédent, jamais le mois en cours.
export function getMoisPrecedent(reference = new Date()) {
  const d = new Date(reference.getFullYear(), reference.getMonth() - 1, 1);
  return getIsoMonth(d);
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

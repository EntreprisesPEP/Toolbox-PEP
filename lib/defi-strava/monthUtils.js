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

const NOMS_MOIS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

export function formatMoisLisible(moisIso) {
  const [annee, mois] = moisIso.split('-').map(Number);
  return `${NOMS_MOIS[mois - 1]} ${annee}`;
}

// Jours fériés, chômés et payés au Québec (calculés, valides pour
// n'importe quelle année — pas une liste figée à mettre à jour chaque
// an). Utilisé par la catégorie "No Days Off" du Hall of Fame.

function calculerPaques(annee) {
  // Algorithme de Meeus/Jones/Butcher (calendrier grégorien)
  const a = annee % 19;
  const b = Math.floor(annee / 100);
  const c = annee % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31);
  const jour = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(annee, mois - 1, jour);
}

function nEmeLundi(annee, moisIndex0, n) {
  const d = new Date(annee, moisIndex0, 1);
  let compte = 0;
  while (true) {
    if (d.getDay() === 1) {
      compte++;
      if (compte === n) return new Date(d);
    }
    d.setDate(d.getDate() + 1);
  }
}

// Liste des jours fériés "chômés et payés" reconnus au Québec (CNESST).
export function joursFeriesQuebec(annee) {
  const paques = calculerPaques(annee);
  const vendrediSaint = new Date(paques);
  vendrediSaint.setDate(paques.getDate() - 2);

  return [
    new Date(annee, 0, 1), // Jour de l'An
    vendrediSaint, // Vendredi saint
    new Date(annee, 5, 24), // Fête nationale du Québec
    new Date(annee, 6, 1), // Fête du Canada
    nEmeLundi(annee, 8, 1), // Fête du Travail (1er lundi de septembre)
    nEmeLundi(annee, 9, 2), // Action de grâce (2e lundi d'octobre)
    new Date(annee, 11, 25), // Noël
  ];
}

export function estWeekendOuFerie(date) {
  const jourSemaine = date.getDay();
  if (jourSemaine === 0 || jourSemaine === 6) return true;
  const feries = joursFeriesQuebec(date.getFullYear()).map((d) => d.toDateString());
  return feries.includes(date.toDateString());
}

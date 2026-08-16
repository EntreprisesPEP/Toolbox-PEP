// Calcule l'identifiant de semaine ISO (ex. '2026-W07') pour une date donnée.
// Sert à regrouper les activités par semaine, comme les colonnes
// "Week 1", "Week 2"... du fichier Excel.

export function getIsoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7; // lundi = 0 ... dimanche = 6
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const weekNumber =
    1 +
    Math.round(
      ((d.getTime() - firstThursday.getTime()) / 86400000 -
        3 +
        ((firstThursday.getUTCDay() + 6) % 7)) /
        7
    );
  return `${d.getUTCFullYear()}-W${String(weekNumber).padStart(2, '0')}`;
}

export function getCurrentIsoWeek() {
  return getIsoWeek(new Date());
}

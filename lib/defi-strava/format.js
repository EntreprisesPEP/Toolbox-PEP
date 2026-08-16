// Formate des secondes en texte lisible, ex. "3 h 25 min" (comme l'affichage
// de durée dans le fichier Excel).

export function formatDuree(secondes) {
  const heures = Math.floor(secondes / 3600);
  const minutes = Math.round((secondes % 3600) / 60);
  if (heures === 0) return `${minutes} min`;
  if (minutes === 0) return `${heures} h`;
  return `${heures} h ${minutes} min`;
}

// Formate des secondes en texte lisible, ex. "3 h 25 min" (comme l'affichage
// de durée dans le fichier Excel).

export function formatDuree(secondes) {
  const heures = Math.floor(secondes / 3600);
  const minutes = Math.round((secondes % 3600) / 60);
  if (heures === 0) return `${minutes} min`;
  if (minutes === 0) return `${heures} h`;
  return `${heures} h ${minutes} min`;
}

// Construit un texte de notification enrichi à partir d'un classement
// complet — une ligne par personne (🥇/🥈/🥉), pour bien séparer chaque
// rang visuellement dans une notification ou un courriel.
export function texteClassementLignes(classement, maxAffiches = 3) {
  if (!classement || classement.length === 0) return '';
  const medailles = { 1: '🥇', 2: '🥈', 3: '🥉' };
  return classement
    .slice(0, maxAffiches)
    .map((r) => `${medailles[r.rang] || `#${r.rang}`} ${r.nom} (${r.totalFormate})`)
    .join('\n');
}

// Phrase pour la notification "nouveau meneur" — nomme qui vient de
// dépasser qui, avec les temps des 2, plutôt qu'un simple classement.
export function texteNouveauMeneur(classement, ancienMeneurNom) {
  const nouveauMeneur = classement[0];
  if (!nouveauMeneur) return '';
  const ancien = classement.find((r) => r.nom === ancienMeneurNom);
  if (!ancien) {
    return `${nouveauMeneur.nom} (${nouveauMeneur.totalFormate}) prend la tête du Défi Strava !`;
  }
  return `${nouveauMeneur.nom} (${nouveauMeneur.totalFormate}) a dépassé ${ancien.nom} (${ancien.totalFormate}) pour prendre le lead !`;
}

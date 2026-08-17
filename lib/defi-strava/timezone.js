// Vérifie l'heure ACTUELLE à Montréal/Toronto (America/Toronto), en
// tenant compte automatiquement du changement d'heure (heure avancée /
// heure normale) — contrairement à un cron Vercel qui, lui, est toujours
// fixé en UTC et ne s'ajuste jamais tout seul.
export function heureActuelleEst() {
  const formatteur = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Toronto',
    hour: 'numeric',
    hour12: false,
  });
  return parseInt(formatteur.format(new Date()), 10);
}

export function dateDuJourEst() {
  const formatteur = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return formatteur.format(new Date()); // en-CA donne directement YYYY-MM-DD
}

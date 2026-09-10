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

// Le quantieme du mois, heure de l'Est. Sert a la tache de fin de mois, qui
// ne doit s'executer que le 1er.
//
// Revision 46 : cette fonction MANQUAIT. pages/api/cron/defi-strava-fin-de-mois.js
// l'importait depuis toujours, et le build le signalait a chaque fois
// (« jourDuMoisEst is not exported »). La route entiere plantait donc des
// l'import — mais personne ne s'en apercevait, parce qu'elle n'est inscrite
// dans aucun cron de vercel.json : elle n'a jamais ete appelee une seule fois.
//
// On la calcule a partir de dateDuJourEst() plutot qu'avec un deuxieme
// Intl.DateTimeFormat : une seule definition de « quel jour on est ici »,
// donc pas de risque que les deux se contredisent autour de minuit.
export function jourDuMoisEst() {
  return parseInt(dateDuJourEst().slice(8, 10), 10);
}

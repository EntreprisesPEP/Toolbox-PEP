// ---------------------------------------------------------------------------
// QUAND UNE TÂCHE PLANIFIÉE DOIT S'EXÉCUTER, ET COMMENT ELLE SURVIT À UN HOQUET
//
// Revision 55. Deux choses qui vont toujours ensemble, donc réunies ici.
//
// 1. L'HEURE. Un cron Vercel est en UTC fixe et ne connaît pas l'heure
//    avancée : une entrée unique vise six mois par année et se décale d'une
//    heure les six autres. Le motif correct est « le cron réveille souvent,
//    la route choisit son moment en heure de l'Est ».
//
// 2. LE HOQUET. Le 14 septembre 2026, le résumé hebdomadaire du Défi Strava
//    est parti à 10 h au lieu de 8 h. Les journaux Vercel sont sans
//    ambiguïté : à 8 h 00 et à 9 h 00, l'écriture de réservation dans
//    Supabase a répondu « Gateway Timeout », la route a refusé d'envoyer
//    (correctement — mieux vaut rien qu'un doublon), et c'est le réveil de
//    10 h qui a fait le travail. Le filet a joué son rôle, mais deux heures
//    en retard pour une coupure de quelques secondes, c'est cher payé.
//
// D'où `avecReessais` : une panne passagère se règle en deux secondes, pas
// en attendant le prochain réveil.
// ---------------------------------------------------------------------------

const FUSEAU = 'America/Toronto';

// L'heure qu'il est ICI, de 0 à 23.
//
// Le « % 24 » n'est pas décoratif. Avec `hour12: false`, Intl en locale en-US
// rend minuit « 24 » et non « 0 » sur plusieurs moteurs. Une garde du genre
// « heure >= 16 » serait alors VRAIE à minuit — et le rappel de 16 h partirait
// en pleine nuit.
export function heureActuelleEst() {
  const formatteur = new Intl.DateTimeFormat('en-US', {
    timeZone: FUSEAU,
    hour: 'numeric',
    hour12: false,
  });
  return parseInt(formatteur.format(new Date()), 10) % 24;
}

// La date du jour ici, en AAAA-MM-JJ (en-CA donne directement ce format).
export function dateDuJourEst() {
  const formatteur = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSEAU,
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return formatteur.format(new Date());
}

// Le quantième du mois, ici. Calculé à partir de dateDuJourEst() plutôt qu'avec
// un deuxième Intl.DateTimeFormat : une seule définition de « quel jour on est
// ici », donc pas de risque que les deux se contredisent autour de minuit.
export function jourDuMoisEst() {
  return parseInt(dateDuJourEst().slice(8, 10), 10);
}

// Le jour de la semaine ici : 0 = dimanche, 1 = lundi, ... 6 = samedi.
//
// Indispensable avec un réveil horaire : un lundi UTC commence le dimanche
// soir à 19 h ou 20 h chez nous. Sans cette garde, le résumé du lundi matin
// partirait le dimanche soir.
export function jourDeSemaineEst() {
  const [a, m, j] = dateDuJourEst().split('-').map(Number);
  return new Date(a, m - 1, j).getDay();
}

export const LUNDI = 1;

// ---------------------------------------------------------------------------
// LE CRÉNEAU COURANT
//
// Pour une tâche qui doit partir à plusieurs heures fixes dans la journée
// (les rappels de l'Ordre du jour : midi et 16 h), réveillée toutes les heures.
//
// Renvoie la plus TARDIVE des heures cibles déjà atteintes, ou null s'il est
// trop tôt. « La plus tardive » et non « la première » est un choix délibéré :
// si le créneau de midi a échoué tout l'après-midi, on ne veut pas envoyer le
// rappel de midi à 17 h alors que celui de 16 h est déjà dû. Entre les deux,
// on retente bien le créneau de midi à 13 h, 14 h, 15 h.
//
// `toleranceHeures` borne le rattrapage, et ce n'est pas un détail : sans
// elle, un créneau de 16 h que trois pannes d'affilée auraient fait rater
// serait encore « dû » à 23 h, et le rappel partirait en pleine soirée. Un
// rappel « soumets ta requête pour demain » qui arrive à 23 h ne sert plus
// personne — mieux vaut ne rien envoyer. Quatre heures couvrent largement un
// incident passager tout en gardant le message utile.
// ---------------------------------------------------------------------------
export function creneauCourant(heuresCibles, heure = heureActuelleEst(), toleranceHeures = 4) {
  const servables = heuresCibles.filter((h) => heure >= h && heure < h + toleranceHeures);
  return servables.length > 0 ? Math.max(...servables) : null;
}

// ---------------------------------------------------------------------------
// RÉESSAYER UNE OPÉRATION FRAGILE
//
// Un client Supabase ne lance pas d'exception : il renvoie { data, error }.
// Un échec doit donc être détecté des DEUX façons — c'est précisément un
// `{ error: { message: 'Gateway Timeout' } }`, pas une exception, qui a
// retardé le résumé du 14 septembre.
//
// Attente croissante entre les tentatives (700 ms, puis 1400 ms) : au pire
// deux secondes de plus, largement sous la limite de temps d'une fonction.
// ---------------------------------------------------------------------------
export async function avecReessais(operation, options = {}) {
  const { essais = 3, attenteMs = 700, nom = 'opération' } = options;
  let dernierEchec = null;

  for (let tentative = 1; tentative <= essais; tentative += 1) {
    try {
      const resultat = await operation();
      if (resultat && resultat.error) {
        dernierEchec = resultat.error;
      } else {
        return resultat;
      }
    } catch (err) {
      dernierEchec = err;
    }
    if (tentative < essais) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => { setTimeout(r, attenteMs * tentative); });
    }
  }

  const detail = dernierEchec?.message || String(dernierEchec);
  const erreur = new Error(`${nom} : ${essais} tentatives échouées — ${detail}`);
  erreur.cause = dernierEchec;
  throw erreur;
}

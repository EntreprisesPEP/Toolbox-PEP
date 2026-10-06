export const JOURS = ['DIM', 'LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM'];

// Revision 73 : les accents sont revenus. Ils s'affichaient deja correctement a
// l'ecran, et le PDF les rend aussi (verifie sur « Depot », « Ecole »,
// « Residence Les Erables ») — ils etaient simplement absents du code.
export const MOIS_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

// Forme courte pour les en-tetes de colonnes du PDF, ou « 5 septembre 2026 »
// ne tient pas. Pas de point apres « mai » et « juin » : ce ne sont pas des
// abreviations.
export const MOIS_COURT = [
  'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juill.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
];

export function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

export function dateKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function today() {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
}

export function mondayOf(d) {
  const m = new Date(d);
  const day = m.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  m.setDate(m.getDate() + diff);
  return m;
}

export function fmtDateLong(d) {
  return `${d.getDate()} ${MOIS_FR[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatDateFr(iso) {
  if (!iso) return 'Choisir une date';
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  if (!m || !d) return iso;
  return `${d} ${MOIS_FR[m - 1]} ${y}`;
}

export function weekDates(startIso) {
  const start = startIso ? new Date(startIso + 'T00:00:00') : mondayOf(today());
  const arr = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    arr.push(d);
  }
  return arr;
}

export function twoWeekDates(startIso) {
  const start = startIso ? new Date(startIso + 'T00:00:00') : mondayOf(today());
  const arr = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    arr.push(d);
  }
  return arr;
}

// ---------------------------------------------------------------------------
// JOURS OUVRABLES ENTRE DEUX DATES (revision 72)
//
// Compte les jours du lundi au vendredi, bornes incluses. Sert a l'onglet
// Vacances / Conges : on saisit « du 14 au 25 juillet » et la colonne se
// remplit toute seule.
//
// Le chiffre n'est PAS enregistre en base : il se recalcule a l'affichage a
// partir des deux dates. Une colonne stockee finirait par contredire les dates
// le jour ou quelqu'un corrige une borne sans y penser.
//
// Les jours feries ne sont PAS deduits. Le calendrier de la construction n'est
// pas le calendrier civil, et un ferie retranche a tort vaut pire qu'un ferie
// oublie — on compte les jours de calendrier ouvrables, point.
// ---------------------------------------------------------------------------
export function joursOuvrables(debutIso, finIso) {
  if (!debutIso || !finIso) return null;
  const debut = new Date(debutIso + 'T00:00:00');
  const fin = new Date(finIso + 'T00:00:00');
  if (isNaN(debut.getTime()) || isNaN(fin.getTime())) return null;
  if (fin < debut) return null; // dates inversees : on n'invente pas un nombre

  let n = 0;
  const curseur = new Date(debut);
  while (curseur <= fin) {
    const j = curseur.getDay();
    if (j !== 0 && j !== 6) n += 1;
    curseur.setDate(curseur.getDate() + 1);
  }
  return n;
}

// « 5 oct. » — sous les JOURS, dans les en-tetes de colonnes du PDF.
export function fmtJourCourt(d) {
  return `${d.getDate()} ${MOIS_COURT[d.getMonth()]}`;
}

// « 5 au 11 octobre 2026 », ou « 28 septembre au 4 octobre 2026 » quand la
// semaine change de mois : on ne repete le mois et l'annee que si c'est utile.
export function fmtIntervalle(a, b) {
  const memeAnnee = a.getFullYear() === b.getFullYear();
  const memeMois = memeAnnee && a.getMonth() === b.getMonth();
  if (memeMois) return `${a.getDate()} au ${b.getDate()} ${MOIS_FR[b.getMonth()]} ${b.getFullYear()}`;
  if (memeAnnee) return `${a.getDate()} ${MOIS_FR[a.getMonth()]} au ${b.getDate()} ${MOIS_FR[b.getMonth()]} ${b.getFullYear()}`;
  return `${fmtDateLong(a)} au ${fmtDateLong(b)}`;
}

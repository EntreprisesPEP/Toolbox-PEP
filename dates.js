export const JOURS = ['DIM', 'LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM'];
export const MOIS_FR = [
  'janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre',
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

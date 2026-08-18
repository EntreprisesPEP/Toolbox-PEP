// ============================================================================
// Semaines "du mois" — lundi→dimanche, mais ancrées sur le mois affiché
// (pas sur l'année ISO). Si le 1er du mois tombe un samedi, la "1re
// semaine" ne fait que 2 jours (sam-dim), la "2e semaine" est la première
// semaine complète lundi-dimanche, etc.
//
// Algorithme porté tel quel du prototype approuvé
// (defi-strava-prototype-FINAL.html) pour garantir un comportement
// identique entre la maquette et la vraie version.
// ============================================================================

// Découpe un mois donné (année, moisIndex0 = janvier=0) en semaines
// lundi→dimanche, la 1re et la dernière pouvant être partielles.
export function semainesDuMois(annee, moisIndex0) {
  const premier = new Date(annee, moisIndex0, 1);
  const dernier = new Date(annee, moisIndex0 + 1, 0);
  const resultats = [];
  let curseur = new Date(premier);
  let n = 1;
  while (curseur <= dernier) {
    const jourSemaine = curseur.getDay(); // 0=dim ... 6=sam
    const diffDimanche = (7 - jourSemaine) % 7;
    let fin = new Date(curseur);
    fin.setDate(fin.getDate() + diffDimanche);
    if (fin > dernier) fin = new Date(dernier);
    resultats.push({ debut: new Date(curseur), fin: new Date(fin), numero: n });
    curseur = new Date(fin);
    curseur.setDate(curseur.getDate() + 1);
    n++;
  }
  return resultats;
}

// Identifiant de semaine ISO (ex. '2026-W07') — conservé pour la
// rétrocompatibilité (colonne semaine_iso toujours peuplée à l'ingestion),
// mais n'est PLUS utilisé pour agréger les classements (voir getRanking.js).
export function getIsoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
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

const NOMS_MOIS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

export function ordinalFem(n) {
  return n === 1 ? '1re' : `${n}e`;
}

export function formatJourMois(date) {
  return `${date.getDate()} ${NOMS_MOIS[date.getMonth()].slice(0, 3)}.`;
}

// Construit le libellé affiché pour une semaine du mois, ex:
// { texte: "2e semaine d'août (2026-W32)", plage: "10–16 août." }
export function labelSemaine(semaine, annee, moisIndex0) {
  const isoDebut = getIsoWeek(semaine.debut);
  const texte = `${ordinalFem(semaine.numero)} semaine de ${NOMS_MOIS[moisIndex0]} (${isoDebut})`;
  const plage = semaine.debut.getTime() === semaine.fin.getTime()
    ? formatJourMois(semaine.debut)
    : `${semaine.debut.getDate()}–${formatJourMois(semaine.fin)}`;
  return { texte, plage };
}

// Convertit une Date JS en chaîne 'YYYY-MM-DD' (sans décalage de fuseau,
// contrairement à toISOString() qui repasse par UTC).
export function toDateISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Retrouve, pour une date donnée, dans quelle "semaine du mois" (au sens
// ci-dessus) elle tombe. Utile pour savoir où se trouve "aujourd'hui" par
// défaut à l'ouverture de la page, et pour déterminer la dernière semaine
// TERMINÉE (pour le vote).
export function trouverSemaineDuMois(date, annee, moisIndex0) {
  const semaines = semainesDuMois(annee, moisIndex0);
  const iso = toDateISO(date);
  const idx = semaines.findIndex((s) => toDateISO(s.debut) <= iso && iso <= toDateISO(s.fin));
  return { semaines, index: idx === -1 ? semaines.length - 1 : idx };
}

// La semaine "qui vient de se terminer" par rapport à une date de
// référence (par défaut : maintenant) — utilisée pour le vote hebdomadaire
// et le courriel du lundi, qui portent TOUJOURS sur la semaine précédente,
// jamais sur celle en cours. Gère le cas où on est tout début de mois (la
// dernière semaine terminée appartient alors au mois précédent).
export function semaineFinieLaPlusRecente(reference = new Date()) {
  const annee = reference.getFullYear();
  const moisIndex0 = reference.getMonth();
  const aujourdHuiISO = toDateISO(reference);

  const semaines = semainesDuMois(annee, moisIndex0);
  const terminees = semaines.filter((s) => toDateISO(s.fin) < aujourdHuiISO);
  if (terminees.length > 0) {
    return { semaine: terminees[terminees.length - 1], annee, moisIndex0 };
  }

  // Aucune semaine terminée ce mois-ci encore (ex: 1er ou 2 du mois) —
  // on retombe sur la dernière semaine du mois précédent.
  const dernierJourMoisPrec = new Date(annee, moisIndex0, 0);
  const anneePrec = dernierJourMoisPrec.getFullYear();
  const moisPrecIndex0 = dernierJourMoisPrec.getMonth();
  const semainesPrec = semainesDuMois(anneePrec, moisPrecIndex0);
  return {
    semaine: semainesPrec[semainesPrec.length - 1],
    annee: anneePrec,
    moisIndex0: moisPrecIndex0,
  };
}

// La semaine juste AVANT une semaine donnée — gère le passage d'un mois à
// l'autre (une semaine du mois peut chevaucher la fin d'un mois et le
// début du suivant). Utilisée pour calculer les séquences de victoires
// consécutives (streaks) sur plusieurs semaines, peu importe si elles
// traversent un changement de mois.
export function semainePrecedente(semaine) {
  const jourAvant = new Date(semaine.debut);
  jourAvant.setDate(jourAvant.getDate() - 1); // dernier jour de la semaine précédente
  const anneePrec = jourAvant.getFullYear();
  const moisPrecIndex0 = jourAvant.getMonth();
  const semainesPrec = semainesDuMois(anneePrec, moisPrecIndex0);
  const iso = toDateISO(jourAvant);
  const s = semainesPrec.find((sem) => toDateISO(sem.debut) <= iso && iso <= toDateISO(sem.fin));
  return { semaine: s, annee: anneePrec, moisIndex0: moisPrecIndex0 };
}

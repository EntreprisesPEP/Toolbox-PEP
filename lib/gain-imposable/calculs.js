// ============================================================================
// GAIN IMPOSABLE — AVANTAGE RELATIF À UNE AUTOMOBILE FOURNIE PAR L'EMPLOYEUR
//
// Toute l'arithmétique et toutes les règles fiscales vivent ici, sans React et
// sans Supabase, pour qu'elles soient testables et que l'écran, le PDF et le
// Excel ne puissent pas se contredire.
//
// Les règles suivies sont celles de Revenu Québec :
//   « Calcul de la valeur du droit d'usage d'une automobile »
//   « Calcul de la valeur de l'avantage relatif aux frais de fonctionnement »
//   « Avantages accordés au personnel salarié » (TPS/TVQ à remettre)
//
// L'argent circule en CENTS ENTIERS. Un dollar flottant traîne des miettes
// (0,1 + 0,2 = 0,30000000000000004) et deux additions faites dans un ordre
// différent finissent par ne plus donner le même total. On arrondit au cent
// une seule fois, à la sortie de chaque composante.
// ============================================================================

// ---------------------------------------------------------------------------
// 1. LES TAUX, PAR ANNÉE D'IMPOSITION
//
// Ce sont des valeurs publiées : elles ne se devinent pas et elles changent.
// Ce bloc est le repli — la vraie table est en base (gain_imposable.taux) et
// c'est elle qui gagne. Le repli sert quand la base n'a pas encore l'année.
//
// « fonctionnement » : le montant prescrit au kilomètre pour la partie
// personnelle des frais de fonctionnement.
// « fonctionnementVendeur » / « droitUsageVendeur » : taux réduits réservés
// aux gens dont l'emploi principal est de vendre ou louer des automobiles.
// Personne chez PEP n'est dans ce cas, mais le champ existe pour que la
// question ait une réponse le jour où quelqu'un la pose.
// ---------------------------------------------------------------------------

export const TAUX_PAR_DEFAUT = {
  2023: { fonctionnement: 0.33, fonctionnementVendeur: 0.30 },
  2024: { fonctionnement: 0.33, fonctionnementVendeur: 0.30 },
  2025: { fonctionnement: 0.34, fonctionnementVendeur: 0.31 },
  2026: { fonctionnement: 0.34, fonctionnementVendeur: 0.31 },
};

// Ceux-là ne bougent pas d'une année à l'autre — ils sont dans la loi, pas
// dans un communiqué annuel.
export const CONSTANTES = {
  droitUsage: 0.02,          // 2 % du coût, par période de 30 jours
  droitUsageVendeur: 0.015,  // 1,5 %, sur choix, pour les vendeurs d'autos
  fractionLocation: 2 / 3,   // les deux tiers du coût de location
  kmParPeriode: 1667,        // plafond de km personnels par période de 30 jours
  moitieDroitUsage: 0.5,     // méthode facultative des frais de fonctionnement
  tpsDroitUsage: 4 / 104,
  tvqDroitUsage: 9.975 / 109.975,
  tpsFonctionnement: 0.03,
  tvqFonctionnement: 0.06,
};

export const ANNEE_MIN = 2023;

/** Les taux d'une année : la base d'abord, le repli ensuite, jamais rien d'inventé. */
export function tauxDeLAnnee(annee, tauxEnBase = null) {
  const enBase = tauxEnBase && tauxEnBase[annee];
  const repli = TAUX_PAR_DEFAUT[annee];
  const source = enBase || repli || null;
  if (!source) return null;
  return {
    annee,
    fonctionnement: nombreOuNull(source.fonctionnement),
    fonctionnementVendeur: nombreOuNull(source.fonctionnementVendeur),
    ...CONSTANTES,
    provenance: enBase ? 'base' : 'repli',
  };
}

function nombreOuNull(v) {
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// 2. LES MODES
// ---------------------------------------------------------------------------

export const MODES = [
  {
    id: 'achat',
    libelle: 'Véhicule acheté',
    resume: "L'employeur est propriétaire. Le droit d'usage vaut 2 % du coût du véhicule par période de 30 jours.",
  },
  {
    id: 'location',
    libelle: 'Véhicule loué',
    resume: "L'employeur est locataire. Le droit d'usage vaut les deux tiers du coût de location, assurances exclues.",
  },
];

export function modeDe(id) {
  return MODES.find((m) => m.id === id) || MODES[0];
}

// ---------------------------------------------------------------------------
// 3. LES PÉRIODES DE 30 JOURS
//
// Le chiffrier demandait un « nombre de mois » tapé à la main. La règle ne
// parle pas de mois : elle parle du nombre de jours de mise à disposition
// divisé par 30, arrondi. On le calcule à partir des dates, qui sont de toute
// façon déjà saisies pour les relevés d'odomètre — une donnée de moins à
// entrer, et une occasion de moins de se tromper.
//
// L'arrondi n'est pas l'arrondi ordinaire. Revenu Québec écrit : « arrondissez
// au nombre entier le plus près s'il est supérieur à 1 [...] 7,5 doit être
// arrondi à 7, et 7,6 doit être arrondi à 8 ». Donc la demie descend, alors
// que Math.round() la ferait monter. En bas de 1, on n'arrondit pas du tout.
// ---------------------------------------------------------------------------

export function joursEntre(debut, fin) {
  const d = enDate(debut);
  const f = enDate(fin);
  if (!d || !f) return null;
  const ms = f.getTime() - d.getTime();
  if (ms < 0) return null;
  return Math.round(ms / 86400000) + 1; // les deux bornes comptent
}

export function periodesDe30Jours(jours) {
  if (!Number.isFinite(jours) || jours <= 0) return 0;
  const brut = jours / 30;
  if (brut <= 1) return brut;           // en bas de 1, on garde la fraction
  return Math.ceil(brut - 0.5);          // la demie descend : 7,5 -> 7 ; 7,6 -> 8
}

export function periodesEntre(debut, fin) {
  const j = joursEntre(debut, fin);
  if (j === null) return null;
  return periodesDe30Jours(j);
}

function enDate(v) {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const s = String(v).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

// ---------------------------------------------------------------------------
// 4. LIRE LES NOMBRES TAPÉS PAR UN HUMAIN
//
// Repris de l'app des extras, où « 10 % » lu comme null avait fait disparaître
// dix pour cent de majoration sans que rien ne paraisse. Un champ illisible
// doit donner null — surtout pas zéro, qui a l'air d'une réponse.
// ---------------------------------------------------------------------------

export function analyserNombre(brut) {
  if (brut === null || brut === undefined) return null;
  if (typeof brut === 'number') return Number.isFinite(brut) ? brut : null;
  let s = String(brut).trim();
  if (!s) return null;
  s = s.replace(/[$%]/g, '');
  s = s.replace(/[\s    ]/g, ''); // espaces de toutes sortes
  s = s.replace(/,/g, '.');
  if (!/^-?\d*\.?\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Dollars saisis -> cents entiers. */
export function enCents(brut) {
  const n = analyserNombre(brut);
  if (n === null) return null;
  return Math.round(n * 100);
}

export function enDollars(cents) {
  if (!Number.isFinite(cents)) return 0;
  return cents / 100;
}

export function formaterArgent(cents, avecSymbole = true) {
  const v = enDollars(Number.isFinite(cents) ? cents : 0);
  const s = v.toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return avecSymbole ? `${s} $` : s;
}

export function formaterKm(km) {
  if (!Number.isFinite(km)) return '—';
  return `${km.toLocaleString('fr-CA', { minimumFractionDigits: 0, maximumFractionDigits: 1 })} km`;
}

/** Un taux au kilomètre, à la française : « 0,34 $ », pas « 0.34 $ ». */
export function formaterTaux(taux) {
  if (!Number.isFinite(taux)) return '—';
  return `${taux.toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} $`;
}

export function formaterPourcent(fraction) {
  if (!Number.isFinite(fraction)) return '—';
  return `${(fraction * 100).toLocaleString('fr-CA', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}

// ---------------------------------------------------------------------------
// 5. LE CALCUL
// ---------------------------------------------------------------------------

/**
 * @param {object} e  l'entrée, telle que saisie
 *   annee                  année d'imposition
 *   mode                   'achat' | 'location'
 *   date_debut, date_fin   période de mise à disposition (AAAA-MM-JJ)
 *   odo_debut, odo_fin     relevés d'odomètre
 *   km_total               facultatif : remplace odo_fin - odo_debut
 *   km_personnel           kilomètres parcourus à des fins personnelles
 *   cout_cents             ACHAT : coût du véhicule, taxes incluses
 *   mensualite_cents       LOCATION : mensualité, taxes incluses
 *   mois_location          LOCATION : nombre de mensualités payées
 *   assurances_cents       LOCATION : assurances comprises dans la mensualité
 *   exige_par_employeur    l'employeur exige-t-il l'usage du véhicule ?
 *   vendeur_automobiles    emploi principal = vendre ou louer des autos
 *   methode_fonctionnement 'moindre' | 'kilometrique' | 'moitie'
 *   rembourse_usage_cents  somme remboursée par l'employé (droit d'usage)
 *   rembourse_fonct_cents  somme remboursée par l'employé (frais de fonctionnement)
 * @param {object} taux  le résultat de tauxDeLAnnee()
 */
export function calculer(e = {}, taux = null) {
  // Une année sans taux connu ne doit SURTOUT PAS retomber en silence sur ceux
  // d'une autre année : le calcul aurait l'air normal et serait faux. On garde
  // un taux nul, ce qui fait remonter des montants nuls, et valider() bloque.
  const t = taux || tauxDeLAnnee(e.annee) || {
    annee: e.annee, fonctionnement: null, fonctionnementVendeur: null,
    ...CONSTANTES, provenance: 'inconnu',
  };
  const mode = modeDe(e.mode);

  // --- Kilométrage ---------------------------------------------------------
  const odoDebut = analyserNombre(e.odo_debut);
  const odoFin = analyserNombre(e.odo_fin);
  const kmTotalSaisi = analyserNombre(e.km_total);
  const kmTotal = kmTotalSaisi !== null
    ? kmTotalSaisi
    : (odoDebut !== null && odoFin !== null ? odoFin - odoDebut : null);
  const kmPersonnel = analyserNombre(e.km_personnel);
  const kmAffaires = (kmTotal !== null && kmPersonnel !== null) ? kmTotal - kmPersonnel : null;

  const partPersonnelle = (kmTotal && kmTotal > 0 && kmPersonnel !== null)
    ? kmPersonnel / kmTotal : null;
  const partAffaires = partPersonnelle === null ? null : 1 - partPersonnelle;

  // --- Périodes de 30 jours ------------------------------------------------
  const jours = joursEntre(e.date_debut, e.date_fin);
  const periodes = jours === null ? null : periodesDe30Jours(jours);

  // --- Droit d'usage complet ----------------------------------------------
  const tauxUsage = e.vendeur_automobiles ? t.droitUsageVendeur : t.droitUsage;
  let usageCompletCents = null;
  let coutLocationCents = null;
  let assurancesTotalCents = null;

  if (mode.id === 'achat') {
    const cout = enCents(e.cout_cents ?? e.cout);
    if (cout !== null && periodes !== null) {
      usageCompletCents = Math.round(cout * tauxUsage * periodes);
    }
  } else {
    const mensualite = enCents(e.mensualite_cents ?? e.mensualite);
    const moisLoc = analyserNombre(e.mois_location);
    const assurancesMois = enCents(e.assurances_cents ?? e.assurances) ?? 0;
    if (mensualite !== null && moisLoc !== null) {
      coutLocationCents = Math.round(mensualite * moisLoc);
      assurancesTotalCents = Math.round(assurancesMois * moisLoc);
      usageCompletCents = Math.round((coutLocationCents - assurancesTotalCents) * t.fractionLocation);
    }
  }

  // --- Le droit d'usage réduit --------------------------------------------
  // Trois conditions, toutes obligatoires. Le chiffrier comparait les km
  // personnels à un 20 000 fixe ; la règle est 1 667 km PAR PÉRIODE. Sur onze
  // périodes le plafond est 18 337, pas 20 000 — et avec l'ancien test un
  // employé à 19 000 km personnels obtenait une fraction de réduction
  // supérieure à 1, ce qui GONFLAIT son droit d'usage au lieu de le réduire.
  const plafondKmPersonnel = periodes === null ? null : Math.round(t.kmParPeriode * periodes);
  const conditionExige = !!e.exige_par_employeur;
  const conditionAffaires = partAffaires !== null && partAffaires > 0.5;
  const conditionKm = kmPersonnel !== null && plafondKmPersonnel !== null
    && kmPersonnel <= plafondKmPersonnel;
  const reductionAdmissible = conditionExige && conditionAffaires && conditionKm;

  const fractionReduction = (reductionAdmissible && plafondKmPersonnel > 0)
    ? kmPersonnel / plafondKmPersonnel
    : null;

  let usageCents = usageCompletCents;
  if (usageCompletCents !== null && reductionAdmissible) {
    usageCents = Math.round(usageCompletCents * fractionReduction);
  }

  // --- Sommes remboursées sur le droit d'usage -----------------------------
  // Revenu Québec : « Si les sommes remboursées dépassent la valeur du droit
  // d'usage, vous ne pouvez pas vous servir de l'excédent pour réduire la
  // valeur de l'avantage relatif aux frais de fonctionnement. » Le chiffrier
  // soustrayait le remboursement du TOTAL, ce qui laissait l'excédent grignoter
  // les frais de fonctionnement. Ici il s'arrête à zéro.
  const rembUsage = enCents(e.rembourse_usage_cents ?? e.rembourse_usage) ?? 0;
  const usageNetCents = usageCents === null ? null : Math.max(0, usageCents - rembUsage);
  const rembUsageExcedent = usageCents === null ? 0 : Math.max(0, rembUsage - usageCents);

  // --- Frais de fonctionnement --------------------------------------------
  const tauxKm = e.vendeur_automobiles ? t.fonctionnementVendeur : t.fonctionnement;
  const parKmCents = (kmPersonnel === null || tauxKm === null)
    ? null : Math.round(kmPersonnel * tauxKm * 100);

  // La méthode de la moitié du droit d'usage n'est ouverte que si le véhicule
  // sert à plus de 50 % aux affaires (et l'employé doit en aviser l'employeur
  // par écrit avant la fin de l'année).
  //
  // La moitié se prend sur le droit d'usage AVANT les sommes remboursées.
  // Autrement, un employé qui rembourse tout son droit d'usage verrait ses
  // frais de fonctionnement tomber à zéro du même coup — deux avantages
  // effacés pour un seul remboursement.
  const moitieDisponible = conditionAffaires && usageCents !== null;
  const moitieCents = moitieDisponible
    ? Math.round(usageCents * t.moitieDroitUsage)
    : null;

  const methode = e.methode_fonctionnement || 'moindre';
  let fonctBrutCents = parKmCents;
  let methodeRetenue = 'kilometrique';
  if (methode === 'moitie' && moitieCents !== null) {
    fonctBrutCents = moitieCents;
    methodeRetenue = 'moitie';
  } else if (methode === 'moindre' && moitieCents !== null && parKmCents !== null) {
    if (moitieCents < parKmCents) { fonctBrutCents = moitieCents; methodeRetenue = 'moitie'; }
  }

  const rembFonct = enCents(e.rembourse_fonct_cents ?? e.rembourse_fonct) ?? 0;
  const fonctNetCents = fonctBrutCents === null ? null : Math.max(0, fonctBrutCents - rembFonct);

  // --- Total et taxes ------------------------------------------------------
  const totalCents = (usageNetCents === null || fonctNetCents === null)
    ? null : usageNetCents + fonctNetCents;

  const tpsCents = (usageNetCents === null || fonctNetCents === null) ? null : Math.round(
    usageNetCents * t.tpsDroitUsage + fonctNetCents * t.tpsFonctionnement,
  );
  const tvqCents = (usageNetCents === null || fonctNetCents === null) ? null : Math.round(
    usageNetCents * t.tvqDroitUsage + fonctNetCents * t.tvqFonctionnement,
  );

  return {
    taux: t,
    mode: mode.id,

    kmTotal, kmPersonnel, kmAffaires, partPersonnelle, partAffaires,
    jours, periodes,

    tauxUsage,
    coutLocationCents, assurancesTotalCents,
    usageCompletCents,

    plafondKmPersonnel,
    conditionExige, conditionAffaires, conditionKm,
    reductionAdmissible, fractionReduction,
    usageCents,
    rembUsageCents: rembUsage, rembUsageExcedent,
    usageNetCents,

    tauxKm, parKmCents, moitieDisponible, moitieCents,
    methodeRetenue, fonctBrutCents,
    rembFonctCents: rembFonct, fonctNetCents,

    totalCents, tpsCents, tvqCents,
  };
}

// ---------------------------------------------------------------------------
// 6. CE QUI EMPÊCHE D'ENREGISTRER, ET CE QUI MÉRITE UN AVERTISSEMENT
//
// Un calcul qui part au comptable avec un champ vide est pire qu'un calcul
// refusé. Les « bloquants » arrêtent l'enregistrement ; les « avertissements »
// laissent passer mais se voient.
// ---------------------------------------------------------------------------

export function valider(e = {}, r = null) {
  const res = r || calculer(e);
  const bloquants = [];
  const avertissements = [];

  if (!e.employe_nom || !String(e.employe_nom).trim()) bloquants.push("Il manque l'employé.");
  if (!e.annee) bloquants.push("Il manque l'année d'imposition.");
  if (!res.taux || res.taux.fonctionnement === null) {
    bloquants.push(`Aucun taux connu pour ${e.annee}. Ajoute-le dans l'onglet « Taux ».`);
  }
  if (!e.date_debut || !e.date_fin) {
    bloquants.push('Il manque les dates de mise à disposition du véhicule.');
  } else if (res.jours === null) {
    bloquants.push('La date de fin est avant la date de début.');
  }

  if (res.kmTotal === null) {
    bloquants.push("Il manque le kilométrage : les deux relevés d'odomètre, ou le total.");
  } else if (res.kmTotal <= 0) {
    bloquants.push('Le kilométrage total doit être supérieur à zéro.');
  }
  if (res.kmPersonnel === null) {
    bloquants.push('Il manque le kilométrage personnel.');
  } else if (res.kmPersonnel < 0) {
    bloquants.push('Le kilométrage personnel ne peut pas être négatif.');
  } else if (res.kmTotal !== null && res.kmPersonnel > res.kmTotal) {
    bloquants.push('Le kilométrage personnel dépasse le kilométrage total.');
  }

  if (res.mode === 'achat') {
    if (enCents(e.cout_cents ?? e.cout) === null) bloquants.push("Il manque le coût du véhicule.");
  } else {
    if (enCents(e.mensualite_cents ?? e.mensualite) === null) bloquants.push('Il manque la mensualité de location.');
    if (analyserNombre(e.mois_location) === null) bloquants.push('Il manque le nombre de mensualités.');
  }

  // --- Avertissements ------------------------------------------------------
  if (res.taux && res.taux.provenance === 'repli') {
    avertissements.push(
      `Le taux de ${e.annee} n'est pas dans la table : l'app utilise sa valeur de secours `
      + `(${res.taux.fonctionnement} $/km). Vérifie-la dans l'onglet « Taux ».`,
    );
  }
  if (res.kmPersonnel === 0) {
    avertissements.push("Le kilométrage personnel est à zéro : l'avantage sera nul. C'est voulu ?");
  }
  if (res.partAffaires !== null && res.partAffaires > 0.5 && !res.conditionExige) {
    avertissements.push(
      "Le véhicule sert à plus de 50 % aux affaires, mais la case « l'employeur exige l'usage du "
      + "véhicule » n'est pas cochée — sans elle, pas de droit d'usage réduit.",
    );
  }
  if (res.conditionExige && res.conditionAffaires && !res.conditionKm && res.plafondKmPersonnel !== null) {
    avertissements.push(
      `Pas de réduction : ${formaterKm(res.kmPersonnel)} personnels dépassent le plafond de `
      + `${formaterKm(res.plafondKmPersonnel)} (1 667 km × ${arrondi(res.periodes)} périodes).`,
    );
  }
  if (res.rembUsageExcedent > 0) {
    avertissements.push(
      `Le remboursement dépasse le droit d'usage de ${formaterArgent(res.rembUsageExcedent)}. `
      + "L'excédent ne peut pas réduire les frais de fonctionnement : il est ignoré.",
    );
  }
  if (res.periodes !== null && res.periodes > 12) {
    avertissements.push(
      `${arrondi(res.periodes)} périodes de 30 jours, c'est plus qu'une année. Vérifie les dates.`,
    );
  }
  if (res.mode === 'location' && res.assurancesTotalCents === 0) {
    avertissements.push(
      "Aucune assurance déduite du coût de location. Si la mensualité en comprend, elle doit être "
      + "retirée du droit d'usage.",
    );
  }

  return { bloquants, avertissements };
}

function arrondi(n) {
  if (!Number.isFinite(n)) return '—';
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

// ---------------------------------------------------------------------------
// 7. NOM DE FICHIER
// ---------------------------------------------------------------------------

export function nomFichier(e = {}, extension = 'pdf') {
  const nom = String(e.employe_nom || 'employe')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `Gain-imposable-${nom}-${e.annee || ''}.${extension}`;
}

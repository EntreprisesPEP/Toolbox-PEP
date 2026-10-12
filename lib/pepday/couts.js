// ---------------------------------------------------------------------------
// PEPDAY — CALCUL DES COSTS
//
// Le cost d'une ligne = quantité × taux (+ heures supp × taux supp pour la
// main-d'œuvre). Tout le reste — par rapport, par jour, par projet, par
// catégorie, par mois — n'est qu'une somme de lignes. Le taux utilisé est
// celui figé dans la ligne, jamais le preset courant.
//
// Fonctions pures, sans base de données : elles servent au rapport, à la
// fiche projet et aux rapports globaux, en démo comme avec Supabase.
// ---------------------------------------------------------------------------

import { CATEGORIES, CATEGORIES_BUDGET } from './constantes';

const arrondi2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export function montantLigne(l) {
  if (!l) return 0;
  const base = (Number(l.quantite) || 0) * (Number(l.taux) || 0);
  const supp = (Number(l.quantite_supp) || 0) * (Number(l.taux_supp) || 0);
  return arrondi2(base + supp);
}

export function heuresLigne(l) {
  // RV02 : une prime n'est pas du temps travaillé.
  if (!l || l.prime_id || (l.categorie !== 'main_oeuvre' && l.categorie !== 'equipement')) return 0;
  return (Number(l.quantite) || 0) + (Number(l.quantite_supp) || 0);
}

export function categoriesVides() {
  return Object.fromEntries(CATEGORIES_BUDGET.map((c) => [c.code, 0]));
}

// Somme par catégorie d'une liste de lignes.
export function totauxParCategorie(lignes) {
  const t = categoriesVides();
  for (const l of lignes || []) t[l.categorie] = arrondi2((t[l.categorie] || 0) + montantLigne(l));
  t.total = arrondi2(CATEGORIES.reduce((s, c) => s + (t[c.code] || 0), 0));
  return t;
}

// Groupe des lignes par une clé calculée, avec les totaux par catégorie de
// chaque groupe.
export function grouperLignes(lignes, cle) {
  const groupes = new Map();
  for (const l of lignes || []) {
    const k = cle(l);
    if (!groupes.has(k)) groupes.set(k, []);
    groupes.get(k).push(l);
  }
  return [...groupes.entries()].map(([k, ls]) => ({ cle: k, lignes: ls, totaux: totauxParCategorie(ls) }));
}

// Joint à chaque ligne la date et le projet de son rapport — c'est ce qui
// permet de grouper par jour, par mois ou par projet.
export function enrichirLignes(lignes, rapportsParId) {
  return (lignes || [])
    .map((l) => {
      const r = rapportsParId[l.rapport_id];
      // RV02 : un rapport abandonné ne compte dans aucun cost.
      if (!r || r.abandonne) return null;
      return { ...l, date: r.date, projet_id: r.projet_id, etape: r.etape, mois: String(r.date).slice(0, 7) };
    })
    .filter(Boolean);
}

// Budget du projet par catégorie (pepday.budgets).
export function budgetDuProjet(projetId, budgets) {
  const b = categoriesVides();
  for (const x of budgets || []) {
    if (x.projet_id === projetId) b[x.categorie] = arrondi2((b[x.categorie] || 0) + (Number(x.montant) || 0));
  }
  b.total = arrondi2(CATEGORIES_BUDGET.reduce((s, c) => s + (b[c.code] || 0), 0));
  return b;
}

// Comparaison cost / budget, catégorie par catégorie.
export function comparerAuBudget(totaux, budget) {
  return [...CATEGORIES_BUDGET, { code: 'total', libelle: 'Total' }].map((c) => {
    const reel = totaux[c.code] || 0;
    const prevu = budget[c.code] || 0;
    return {
      code: c.code,
      libelle: c.libelle,
      reel,
      budget: prevu,
      ecart: arrondi2(prevu - reel),
      pourcentage: prevu > 0 ? reel / prevu : null,
    };
  });
}

// ---------------------------------------------------------------------------
// Mise en forme — format canadien français.
// ---------------------------------------------------------------------------
const fmtArgent = new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 2 });
const fmtArgent0 = new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });
const fmtNombre = new Intl.NumberFormat('fr-CA', { maximumFractionDigits: 2 });
const fmtPct = new Intl.NumberFormat('fr-CA', { style: 'percent', maximumFractionDigits: 0 });

export const argent = (n) => fmtArgent.format(Number(n) || 0);
export const argent0 = (n) => fmtArgent0.format(Number(n) || 0);
export const nombre = (n) => fmtNombre.format(Number(n) || 0);
export const pct = (n) => (n == null ? '—' : fmtPct.format(n));

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

export function dateLongue(iso) {
  if (!iso) return '';
  const [a, m, j] = String(iso).slice(0, 10).split('-').map(Number);
  const d = new Date(a, m - 1, j);
  return `${JOURS[d.getDay()]} ${j} ${MOIS[m - 1]} ${a}`;
}

// Abréviations usuelles en français (« 11 oct. 2026 », « 3 juil. 2026 »).
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

export function dateCourte(iso) {
  if (!iso) return '';
  const [a, m, j] = String(iso).slice(0, 10).split('-').map(Number);
  return `${j} ${MOIS_COURTS[m - 1]} ${a}`;
}

export function moisLong(cle) {
  const [a, m] = String(cle).split('-').map(Number);
  return `${MOIS[m - 1]} ${a}`;
}

export function horodatage(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('fr-CA', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function aujourdhui() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Cost cumulatif de chaque projet, toutes étapes confondues, et la part déjà
// confirmée (rapports verrouillés).
export function coutsParProjet(rapports, lignes) {
  const rapportsParId = {};
  for (const r of rapports || []) if (!r.abandonne) rapportsParId[r.id] = r;
  const res = {};
  for (const l of lignes || []) {
    const r = rapportsParId[l.rapport_id];
    if (!r) continue;
    const p = (res[r.projet_id] = res[r.projet_id] || { ...categoriesVides(), total: 0, confirme: 0, heuresMO: 0, heuresEquip: 0 });
    const m = montantLigne(l);
    p[l.categorie] = arrondi2((p[l.categorie] || 0) + m);
    p.total = arrondi2(p.total + m);
    if (r.etape >= 6) p.confirme = arrondi2(p.confirme + m);
    if (l.categorie === 'main_oeuvre') p.heuresMO += heuresLigne(l);
    if (l.categorie === 'equipement') p.heuresEquip += heuresLigne(l);
  }
  return res;
}

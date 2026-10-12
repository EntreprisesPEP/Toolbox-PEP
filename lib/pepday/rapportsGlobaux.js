// ---------------------------------------------------------------------------
// PEPDAY — RAPPORTS GLOBAUX (pour le directeur construction)
//
// Chaque rapport est une fonction pure qui reçoit les données filtrées et
// renvoie { colonnes, lignes, total? } : le même objet sert à l'affichage
// et à l'export Excel. Aucun rapport ne lit la base lui-même.
//
// colonnes : [{ entete, cle, format: 'argent'|'nombre'|'pct'|'texte' }]
// ---------------------------------------------------------------------------

import { CATEGORIES, ETAPES, etape as infoEtape, statutProjet } from './constantes';
import { montantLigne, heuresLigne, budgetDuProjet, moisLong, enrichirLignes } from './couts';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const somme = (liste, f) => (liste || []).reduce((s, x) => s + (Number(f(x)) || 0), 0);

export const LISTE_RAPPORTS = [
  { code: 'mensuel', libelle: 'Suivi mensuel des costs', groupe: 'Costs' },
  { code: 'mensuel_projet', libelle: 'Costs mensuels par projet', groupe: 'Costs' },
  { code: 'categories', libelle: 'Costs par catégorie et par projet', groupe: 'Costs' },
  { code: 'resume_projets', libelle: 'Résumé des projets depuis le début', groupe: 'Projets' },
  { code: 'performance', libelle: 'Budget consommé contre temps écoulé', groupe: 'Projets' },
  { code: 'employes', libelle: 'Heures par employé', groupe: 'Ressources' },
  { code: 'equipements', libelle: 'Utilisation des équipements', groupe: 'Ressources' },
  { code: 'fournisseurs', libelle: 'Matériaux par fournisseur', groupe: 'Ressources' },
  { code: 'sous_traitants', libelle: 'Sous-traitants', groupe: 'Ressources' },
  { code: 'primes', libelle: 'Primes', groupe: 'Ressources' },
  { code: 'hors_catalogue', libelle: 'Ressources hors catalogue', groupe: 'Ressources' },
  { code: 'productivite_equipe', libelle: 'Productivité d’équipe (MH)', groupe: 'Productivité' },
  { code: 'productivite_employe', libelle: 'Productivité d’employé (MH)', groupe: 'Productivité' },
  { code: 'custom', libelle: 'Taux custom utilisés', groupe: 'Contrôle' },
  { code: 'attente', libelle: 'Rapports en attente par étape', groupe: 'Contrôle' },
  { code: 'delais', libelle: 'Délais de validation', groupe: 'Contrôle' },
  { code: 'flags', libelle: 'Lectures obligatoires non lues', groupe: 'Contrôle' },
  { code: 'manquants', libelle: 'Rapports manquants', groupe: 'Contrôle' },
  { code: 'abandonnes', libelle: 'Rapports abandonnés', groupe: 'Contrôle' },
];

// ---------------------------------------------------------------------------
// Filtrage commun : période, projet, chargé de projet, surintendant, étapes.
// ---------------------------------------------------------------------------
export function filtrer(db, f) {
  const projetsOk = new Set(db.projets
    .filter((p) => (!f.projet || p.id === f.projet)
      && (!f.cp || p.charge_projet_id === f.cp)
      && (!f.surint || p.surintendant_id === f.surint))
    .map((p) => p.id));
  const rapports = db.rapports.filter((r) => !r.abandonne && projetsOk.has(r.projet_id)
    && (!f.du || r.date >= f.du) && (!f.au || r.date <= f.au)
    && (f.etapes === 'confirmes' ? r.etape >= 6 : f.etapes === 'validation' ? r.etape < 6 : true));
  const rapportsParId = Object.fromEntries(rapports.map((r) => [r.id, r]));
  const lignes = enrichirLignes(db.lignes.filter((l) => rapportsParId[l.rapport_id]), rapportsParId);
  return { projetsOk, rapports, rapportsParId, lignes };
}

function colonnesCategories() {
  return CATEGORIES.map((c) => ({ entete: c.libelle, cle: c.code, format: 'argent' }));
}

function totalCategories(lignes) {
  const t = Object.fromEntries(CATEGORIES.map((c) => [c.code, 0]));
  for (const l of lignes) t[l.categorie] += montantLigne(l);
  CATEGORIES.forEach((c) => { t[c.code] = r2(t[c.code]); });
  t.total = r2(somme(CATEGORIES, (c) => t[c.code]));
  return t;
}

const nomProjet = (index, id) => {
  const p = index.projets[id];
  return p ? `${p.numero} — ${p.nom}` : '?';
};

function joursOuvrables(du, au) {
  if (!du || !au || au < du) return [];
  const res = [];
  const d = new Date(`${du}T12:00:00`);
  const fin = new Date(`${au}T12:00:00`);
  while (d <= fin) {
    if (d.getDay() !== 0 && d.getDay() !== 6) res.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return res;
}

// ---------------------------------------------------------------------------
export function calculerRapport(code, { db, index, f, aujourdhui }) {
  const { projetsOk, rapports, lignes } = filtrer(db, f);

  switch (code) {
    case 'mensuel': {
      const mois = {};
      for (const l of lignes) (mois[l.mois] = mois[l.mois] || []).push(l);
      const res = Object.keys(mois).sort().map((m) => ({ mois: moisLong(m), ...totalCategories(mois[m]) }));
      return {
        colonnes: [{ entete: 'Mois', cle: 'mois' }, ...colonnesCategories(), { entete: 'Total', cle: 'total', format: 'argent' }],
        lignes: res,
        total: { mois: 'Total', ...totalCategories(lignes) },
        graphique: { cle: 'total', etiquette: 'mois' },
      };
    }

    case 'mensuel_projet': {
      const moisListe = [...new Set(lignes.map((l) => l.mois))].sort();
      const parProjet = {};
      for (const l of lignes) {
        const p = (parProjet[l.projet_id] = parProjet[l.projet_id] || {});
        p[l.mois] = (p[l.mois] || 0) + montantLigne(l);
      }
      const res = Object.entries(parProjet).map(([pid, m]) => {
        const row = { projet: nomProjet(index, pid) };
        moisListe.forEach((x) => { row[x] = r2(m[x] || 0); });
        row.total = r2(somme(moisListe, (x) => m[x] || 0));
        return row;
      }).sort((a, b) => a.projet.localeCompare(b.projet, 'fr', { numeric: true }));
      const total = { projet: 'Total' };
      moisListe.forEach((x) => { total[x] = r2(somme(res, (r) => r[x])); });
      total.total = r2(somme(res, (r) => r.total));
      return {
        colonnes: [{ entete: 'Projet', cle: 'projet' }, ...moisListe.map((m) => ({ entete: moisLong(m), cle: m, format: 'argent' })), { entete: 'Total', cle: 'total', format: 'argent' }],
        lignes: res,
        total,
      };
    }

    case 'categories': {
      const parProjet = {};
      for (const l of lignes) (parProjet[l.projet_id] = parProjet[l.projet_id] || []).push(l);
      const res = Object.entries(parProjet).map(([pid, ls]) => {
        const t = totalCategories(ls);
        const b = budgetDuProjet(pid, db.budgets);
        return { projet: nomProjet(index, pid), ...t, budget: b.total, pct: b.total ? t.total / b.total : null };
      }).sort((a, b) => b.total - a.total);
      const tot = totalCategories(lignes);
      return {
        colonnes: [{ entete: 'Projet', cle: 'projet' }, ...colonnesCategories(), { entete: 'Total période', cle: 'total', format: 'argent' }, { entete: 'Budget total', cle: 'budget', format: 'argent' }, { entete: '% du budget', cle: 'pct', format: 'pct' }],
        lignes: res,
        total: { projet: 'Total', ...tot, budget: r2(somme(res, (r) => r.budget)) },
        resumeCategories: CATEGORIES.map((c) => ({ libelle: c.libelle, montant: tot[c.code], part: tot.total ? tot[c.code] / tot.total : 0 })),
      };
    }

    case 'resume_projets': {
      // Depuis le début : on ignore la période, on garde les autres filtres.
      const toutesLignes = enrichirLignes(db.lignes, index.rapports).filter((l) => projetsOk.has(l.projet_id));
      const res = db.projets.filter((p) => projetsOk.has(p.id) && p.statut !== 'soumission').map((p) => {
        const ls = toutesLignes.filter((l) => l.projet_id === p.id);
        const t = totalCategories(ls);
        const b = budgetDuProjet(p.id, db.budgets);
        const rp = db.rapports.filter((r) => r.projet_id === p.id);
        const dates = rp.map((r) => r.date).sort();
        return {
          projet: `${p.numero} — ${p.nom}`, statut: statutProjet(p.statut).libelle,
          cp: index.membres[p.charge_projet_id]?.nom || '', contrat: Number(p.montant_contrat) || 0, budget: b.total,
          cout: t.total, pct: b.total ? t.total / b.total : null, reste: r2(b.total - t.total),
          heures_mo: r2(somme(ls.filter((l) => l.categorie === 'main_oeuvre'), heuresLigne)),
          heures_eq: r2(somme(ls.filter((l) => l.categorie === 'equipement'), heuresLigne)),
          main_oeuvre: t.main_oeuvre, equipement: t.equipement, materiau: t.materiau, sous_traitant: t.sous_traitant,
          rapports: rp.length, premier: dates[0] || '', dernier: dates[dates.length - 1] || '',
        };
      }).sort((a, b) => a.projet.localeCompare(b.projet, 'fr', { numeric: true }));
      return {
        colonnes: [
          { entete: 'Projet', cle: 'projet' }, { entete: 'Statut', cle: 'statut' }, { entete: 'Chargé de projet', cle: 'cp' },
          { entete: 'Contrat', cle: 'contrat', format: 'argent' }, { entete: 'Budget', cle: 'budget', format: 'argent' },
          { entete: 'Cost cumulatif', cle: 'cout', format: 'argent' }, { entete: '% budget', cle: 'pct', format: 'pct' },
          { entete: 'Reste au budget', cle: 'reste', format: 'argent' }, { entete: 'Heures M.-O.', cle: 'heures_mo', format: 'nombre' },
          { entete: 'Heures équip.', cle: 'heures_eq', format: 'nombre' }, { entete: 'Main-d’œuvre', cle: 'main_oeuvre', format: 'argent' },
          { entete: 'Équipements', cle: 'equipement', format: 'argent' }, { entete: 'Matériaux', cle: 'materiau', format: 'argent' },
          { entete: 'Sous-traitants', cle: 'sous_traitant', format: 'argent' }, { entete: 'Rapports', cle: 'rapports', format: 'nombre' },
          { entete: 'Premier rapport', cle: 'premier' }, { entete: 'Dernier rapport', cle: 'dernier' },
        ],
        lignes: res,
        total: {
          projet: 'Total', contrat: r2(somme(res, (r) => r.contrat)), budget: r2(somme(res, (r) => r.budget)), cout: r2(somme(res, (r) => r.cout)),
          reste: r2(somme(res, (r) => r.reste)), heures_mo: r2(somme(res, (r) => r.heures_mo)), heures_eq: r2(somme(res, (r) => r.heures_eq)),
          main_oeuvre: r2(somme(res, (r) => r.main_oeuvre)), equipement: r2(somme(res, (r) => r.equipement)), materiau: r2(somme(res, (r) => r.materiau)),
          sous_traitant: r2(somme(res, (r) => r.sous_traitant)), rapports: somme(res, (r) => r.rapports),
        },
        note: 'Depuis le début de chaque projet : la période choisie est ignorée pour ce rapport.',
      };
    }

    case 'performance': {
      const toutesLignes = enrichirLignes(db.lignes, index.rapports).filter((l) => projetsOk.has(l.projet_id));
      const res = db.projets.filter((p) => projetsOk.has(p.id) && ['en_cours', 'suspendu', 'termine'].includes(p.statut) && p.date_debut && p.date_fin).map((p) => {
        const b = budgetDuProjet(p.id, db.budgets).total;
        const cout = somme(toutesLignes.filter((l) => l.projet_id === p.id), montantLigne);
        const duree = (new Date(p.date_fin) - new Date(p.date_debut)) / 86400000;
        const ecoule = Math.min(1, Math.max(0, (new Date(aujourdhui) - new Date(p.date_debut)) / 86400000 / (duree || 1)));
        const pctBudget = b ? cout / b : null;
        const indice = pctBudget != null && ecoule > 0 ? pctBudget / ecoule : null;
        return {
          projet: `${p.numero} — ${p.nom}`, debut: p.date_debut, fin: p.date_fin, temps: ecoule, budget: b, cout: r2(cout), pctBudget,
          indice, alerte: indice == null ? '' : indice > 1.15 ? 'Cost en avance sur le temps' : indice < 0.7 ? 'Cost en retard sur le temps (saisie incomplète ?)' : 'Normal',
        };
      }).sort((a, b) => (b.indice || 0) - (a.indice || 0));
      return {
        colonnes: [
          { entete: 'Projet', cle: 'projet' }, { entete: 'Début', cle: 'debut' }, { entete: 'Fin prévue', cle: 'fin' },
          { entete: '% du temps écoulé', cle: 'temps', format: 'pct' }, { entete: 'Budget', cle: 'budget', format: 'argent' },
          { entete: 'Cost à date', cle: 'cout', format: 'argent' }, { entete: '% du budget', cle: 'pctBudget', format: 'pct' },
          { entete: 'Indice (budget ÷ temps)', cle: 'indice', format: 'nombre' }, { entete: 'Lecture', cle: 'alerte' },
        ],
        lignes: res,
        note: 'Indice > 1 : le budget se consomme plus vite que le calendrier avance. Indicateur grossier (dépense linéaire supposée), à lire avec le chargé de projet. Période ignorée.',
      };
    }

    case 'employes': {
      const parEmp = {};
      for (const l of lignes.filter((x) => x.categorie === 'main_oeuvre')) {
        const k = l.ref_id || l.libelle;
        const emp = index.employes[l.ref_id];
        const e = (parEmp[k] = parEmp[k] || { nom: emp?.nom || l.libelle, classe: index.metiers[emp?.metier_id]?.nom || (l.ressource_provisoire_id ? 'Hors catalogue' : ''), reg: 0, supp: 0, cout: 0, primes: 0, jours: new Set(), projets: new Set() });
        if (l.prime_id) { e.primes += montantLigne(l); e.cout += montantLigne(l); continue; }
        e.reg += Number(l.quantite) || 0;
        e.supp += Number(l.quantite_supp) || 0;
        e.cout += montantLigne(l);
        e.jours.add(l.date);
        e.projets.add(l.projet_id);
      }
      const res = Object.values(parEmp).map((e) => ({
        nom: e.nom, classe: e.classe, reg: r2(e.reg), supp: r2(e.supp), total: r2(e.reg + e.supp), cout: r2(e.cout), primes: r2(e.primes),
        jours: e.jours.size, moyenne: e.jours.size ? r2((e.reg + e.supp) / e.jours.size) : 0,
        projets: [...e.projets].map((pid) => index.projets[pid]?.numero).filter(Boolean).join(', '),
      })).sort((a, b) => b.total - a.total);
      return {
        colonnes: [
          { entete: 'Employé', cle: 'nom' }, { entete: 'Métier', cle: 'classe' }, { entete: 'Heures rég.', cle: 'reg', format: 'nombre' },
          { entete: 'Heures supp.', cle: 'supp', format: 'nombre' }, { entete: 'Total heures', cle: 'total', format: 'nombre' },
          { entete: 'Jours travaillés', cle: 'jours', format: 'nombre' }, { entete: 'Moyenne h/jour', cle: 'moyenne', format: 'nombre' },
          { entete: 'Dont primes', cle: 'primes', format: 'argent' }, { entete: 'Cost (avec primes)', cle: 'cout', format: 'argent' }, { entete: 'Projets', cle: 'projets' },
        ],
        lignes: res,
        total: { nom: 'Total', reg: r2(somme(res, (r) => r.reg)), supp: r2(somme(res, (r) => r.supp)), total: r2(somme(res, (r) => r.total)), primes: r2(somme(res, (r) => r.primes)), cout: r2(somme(res, (r) => r.cout)) },
      };
    }

    case 'equipements': {
      const jours = joursOuvrables(f.du || (rapports.map((r) => r.date).sort()[0]), f.au || aujourdhui).length;
      const parEq = {};
      for (const l of lignes.filter((x) => x.categorie === 'equipement')) {
        const k = l.ref_id || l.libelle;
        const e = (parEq[k] = parEq[k] || { nom: l.libelle, categorie: index.equipements[l.ref_id]?.categorie || '', heures: 0, cout: 0, jours: new Set(), projets: new Set() });
        e.heures += heuresLigne(l);
        e.cout += montantLigne(l);
        e.jours.add(l.date);
        e.projets.add(l.projet_id);
      }
      const res = Object.values(parEq).map((e) => ({
        nom: e.nom, categorie: e.categorie, heures: r2(e.heures), jours: e.jours.size, cout: r2(e.cout),
        taux_moyen: e.heures ? r2(e.cout / e.heures) : 0,
        utilisation: jours ? e.jours.size / jours : null,
        projets: [...e.projets].map((pid) => index.projets[pid]?.numero).filter(Boolean).join(', '),
      })).sort((a, b) => b.heures - a.heures);
      return {
        colonnes: [
          { entete: 'Équipement', cle: 'nom' }, { entete: 'Catégorie', cle: 'categorie' }, { entete: 'Heures', cle: 'heures', format: 'nombre' },
          { entete: 'Jours utilisés', cle: 'jours', format: 'nombre' }, { entete: 'Utilisation (jours / jours ouvrables)', cle: 'utilisation', format: 'pct' },
          { entete: 'Cost', cle: 'cout', format: 'argent' }, { entete: 'Taux moyen', cle: 'taux_moyen', format: 'argent' }, { entete: 'Projets', cle: 'projets' },
        ],
        lignes: res,
        total: { nom: 'Total', heures: r2(somme(res, (r) => r.heures)), cout: r2(somme(res, (r) => r.cout)) },
        note: `Utilisation calculée sur ${jours} jours ouvrables dans la période.`,
      };
    }

    case 'fournisseurs': {
      const parCle = {};
      for (const l of lignes.filter((x) => x.categorie === 'materiau')) {
        const four = l.organisation_id ? index.organisations[l.organisation_id]?.nom || '?' : 'Non précisé';
        const k = `${four}|${l.libelle}|${l.unite}`;
        const e = (parCle[k] = parCle[k] || { fournisseur: four, materiau: l.libelle, unite: l.unite, quantite: 0, cout: 0 });
        e.quantite += Number(l.quantite) || 0;
        e.cout += montantLigne(l);
      }
      const res = Object.values(parCle).map((e) => ({ ...e, quantite: r2(e.quantite), cout: r2(e.cout), prix_moyen: e.quantite ? r2(e.cout / e.quantite) : 0 }))
        .sort((a, b) => a.fournisseur.localeCompare(b.fournisseur, 'fr') || b.cout - a.cout);
      return {
        colonnes: [
          { entete: 'Fournisseur', cle: 'fournisseur' }, { entete: 'Matériau', cle: 'materiau' }, { entete: 'Unité', cle: 'unite' },
          { entete: 'Quantité', cle: 'quantite', format: 'nombre' }, { entete: 'Prix moyen', cle: 'prix_moyen', format: 'argent' }, { entete: 'Cost', cle: 'cout', format: 'argent' },
        ],
        lignes: res,
        total: { fournisseur: 'Total', cout: r2(somme(res, (r) => r.cout)) },
      };
    }

    case 'sous_traitants': {
      const parCle = {};
      for (const l of lignes.filter((x) => x.categorie === 'sous_traitant')) {
        const st = index.organisations[l.ref_id]?.nom || l.libelle;
        const k = `${st}|${l.projet_id}`;
        const e = (parCle[k] = parCle[k] || { sous_traitant: st, projet: nomProjet(index, l.projet_id), cout: 0, lignes: 0 });
        e.cout += montantLigne(l);
        e.lignes += 1;
      }
      const res = Object.values(parCle).map((e) => ({ ...e, cout: r2(e.cout) })).sort((a, b) => a.sous_traitant.localeCompare(b.sous_traitant, 'fr') || b.cout - a.cout);
      return {
        colonnes: [{ entete: 'Sous-traitant', cle: 'sous_traitant' }, { entete: 'Projet', cle: 'projet' }, { entete: 'Lignes', cle: 'lignes', format: 'nombre' }, { entete: 'Cost', cle: 'cout', format: 'argent' }],
        lignes: res,
        total: { sous_traitant: 'Total', cout: r2(somme(res, (r) => r.cout)) },
      };
    }

    case 'custom': {
      const res = lignes.filter((l) => l.taux_source === 'custom').map((l) => {
        const effet = r2(montantLigne(l) - montantLigne({ ...l, taux: l.taux_preset ?? l.taux, taux_supp: l.taux_supp_preset ?? l.taux_supp }));
        return {
          date: l.date, projet: nomProjet(index, l.projet_id), rapport: index.rapports[l.rapport_id]?.numero,
          element: l.libelle, preset: l.taux_preset, custom: l.taux, effet, raison: l.custom_raison, par: l.custom_par_nom,
          le: l.custom_le ? l.custom_le.slice(0, 16).replace('T', ' ') : '',
        };
      }).sort((a, b) => b.date.localeCompare(a.date));
      return {
        colonnes: [
          { entete: 'Date', cle: 'date' }, { entete: 'Projet', cle: 'projet' }, { entete: 'Rapport', cle: 'rapport' },
          { entete: 'Élément', cle: 'element' }, { entete: 'Preset', cle: 'preset', format: 'argent' }, { entete: 'Custom', cle: 'custom', format: 'argent' },
          { entete: 'Effet sur le cost', cle: 'effet', format: 'argent' }, { entete: 'Raison', cle: 'raison' }, { entete: 'Mis par', cle: 'par' }, { entete: 'Le', cle: 'le' },
        ],
        lignes: res,
        total: { date: 'Total', effet: r2(somme(res, (r) => r.effet)) },
      };
    }

    case 'attente': {
      const enAttente = rapports.filter((r) => r.etape < 6);
      const res = ETAPES.filter((e) => e.no < 6).map((e) => {
        const rs = enAttente.filter((r) => r.etape === e.no);
        const ages = rs.map((r) => Math.floor((new Date(aujourdhui) - new Date(r.date)) / 86400000));
        return {
          etape: `${e.no}. ${e.libelle}`, nombre: rs.length,
          cout: r2(somme(rs, (r) => somme(db.lignes.filter((l) => l.rapport_id === r.id), montantLigne))),
          age_moyen: ages.length ? r2(somme(ages, (a) => a) / ages.length) : 0, plus_vieux: ages.length ? Math.max(...ages) : 0,
        };
      });
      const detail = enAttente.sort((a, b) => a.etape - b.etape || a.date.localeCompare(b.date)).map((r) => {
        const p = index.projets[r.projet_id];
        const attendu = r.etape === 1 ? 'Dispatch' : r.etape === 2 ? index.membres[r.contremaitre_id]?.nom
          : r.etape === 3 ? index.membres[p?.surintendant_id]?.nom : r.etape === 4 ? index.membres[p?.coordonnateur_id]?.nom : index.membres[p?.charge_projet_id]?.nom;
        return { id: r.id, numero: r.numero, date: r.date, projet: nomProjet(index, r.projet_id), etape: infoEtape(r.etape).libelle, attendu: attendu || '—', age: Math.floor((new Date(aujourdhui) - new Date(r.date)) / 86400000) };
      });
      return {
        colonnes: [{ entete: 'Étape', cle: 'etape' }, { entete: 'Rapports', cle: 'nombre', format: 'nombre' }, { entete: 'Cost en attente', cle: 'cout', format: 'argent' }, { entete: 'Âge moyen (jours)', cle: 'age_moyen', format: 'nombre' }, { entete: 'Plus vieux (jours)', cle: 'plus_vieux', format: 'nombre' }],
        lignes: res,
        total: { etape: 'Total', nombre: somme(res, (r) => r.nombre), cout: r2(somme(res, (r) => r.cout)) },
        detail: {
          titre: 'Détail des rapports en attente',
          colonnes: [{ entete: 'No', cle: 'numero' }, { entete: 'Date', cle: 'date' }, { entete: 'Projet', cle: 'projet' }, { entete: 'Étape', cle: 'etape' }, { entete: 'Attend', cle: 'attendu' }, { entete: 'Âge (jours)', cle: 'age', format: 'nombre' }],
          lignes: detail,
        },
      };
    }

    case 'delais': {
      // Temps passé à chaque étape, calculé avec l'historique horodaté.
      const durees = {};
      const ids = new Set(rapports.map((r) => r.id));
      const parRapport = {};
      for (const h of db.historique) if (ids.has(h.rapport_id)) (parRapport[h.rapport_id] = parRapport[h.rapport_id] || []).push(h);
      Object.values(parRapport).forEach((hs) => {
        hs.sort((a, b) => a.le.localeCompare(b.le));
        for (let i = 1; i < hs.length; i += 1) {
          const etapeQuittee = hs[i].de_etape;
          if (!etapeQuittee) continue;
          const heures = (new Date(hs[i].le) - new Date(hs[i - 1].le)) / 3600000;
          (durees[etapeQuittee] = durees[etapeQuittee] || []).push(heures);
        }
      });
      const renvois = {};
      for (const h of db.historique) if (ids.has(h.rapport_id) && h.action === 'renvoyer') renvois[h.de_etape] = (renvois[h.de_etape] || 0) + 1;
      const res = ETAPES.filter((e) => e.no < 6).map((e) => {
        const d = (durees[e.no] || []).sort((a, b) => a - b);
        return {
          etape: `${e.no}. ${e.libelle}`, passages: d.length,
          moyenne: d.length ? r2(somme(d, (x) => x) / d.length) : null, mediane: d.length ? r2(d[Math.floor(d.length / 2)]) : null,
          max: d.length ? r2(d[d.length - 1]) : null, renvois: renvois[e.no] || 0,
        };
      });
      return {
        colonnes: [{ entete: 'Étape', cle: 'etape' }, { entete: 'Passages', cle: 'passages', format: 'nombre' }, { entete: 'Moyenne (heures)', cle: 'moyenne', format: 'nombre' }, { entete: 'Médiane (heures)', cle: 'mediane', format: 'nombre' }, { entete: 'Maximum (heures)', cle: 'max', format: 'nombre' }, { entete: 'Renvois depuis l’étape', cle: 'renvois', format: 'nombre' }],
        lignes: res,
        note: 'Temps écoulé entre l’arrivée du rapport à l’étape et sa sortie (validation ou renvoi), en heures de calendrier.',
      };
    }

    case 'flags': {
      const ids = new Set(rapports.map((r) => r.id));
      const res = db.commentaires.filter((c) => c.lecture_obligatoire && !c.lu_le && ids.has(c.rapport_id)).map((c) => {
        const r = index.rapports[c.rapport_id];
        const p = index.projets[r.projet_id];
        return {
          id: r.id, date: r.date, projet: nomProjet(index, r.projet_id), rapport: r.numero, auteur: c.auteur_nom, texte: c.texte,
          cp: index.membres[p?.charge_projet_id]?.nom || '', depuis: Math.floor((new Date(aujourdhui) - new Date(c.created_at)) / 86400000),
        };
      }).sort((a, b) => b.depuis - a.depuis);
      return {
        colonnes: [{ entete: 'Date', cle: 'date' }, { entete: 'Projet', cle: 'projet' }, { entete: 'Rapport', cle: 'rapport' }, { entete: 'Auteur', cle: 'auteur' }, { entete: 'Commentaire', cle: 'texte' }, { entete: 'Chargé de projet', cle: 'cp' }, { entete: 'Non lu depuis (jours)', cle: 'depuis', format: 'nombre' }],
        lignes: res,
      };
    }

    case 'manquants': {
      // Jours ouvrables où un contremaître assigné à un projet en cours n'a
      // pas de rapport. Limité aux dates du projet et à la période.
      const fin = f.au && f.au < aujourdhui ? f.au : aujourdhui;
      const debutParDefaut = (() => { const d = new Date(`${fin}T12:00:00`); d.setDate(d.getDate() - 14); return d.toISOString().slice(0, 10); })();
      const du = f.du || debutParDefaut;
      const existe = new Set(db.rapports.map((r) => `${r.projet_id}|${r.contremaitre_id}|${r.date}`));
      const res = [];
      db.projets.filter((p) => projetsOk.has(p.id) && p.statut === 'en_cours').forEach((p) => {
        const jours = joursOuvrables(p.date_debut && p.date_debut > du ? p.date_debut : du, p.date_fin && p.date_fin < fin ? p.date_fin : fin);
        (p.contremaitre_ids || []).forEach((cm) => {
          const manquants = jours.filter((j) => !existe.has(`${p.id}|${cm}|${j}`));
          if (manquants.length) {
            res.push({ projet: `${p.numero} — ${p.nom}`, contremaitre: index.membres[cm]?.nom || '?', nombre: manquants.length, jours: manquants.slice(-10).join(', ') + (manquants.length > 10 ? '…' : '') });
          }
        });
      });
      return {
        colonnes: [{ entete: 'Projet', cle: 'projet' }, { entete: 'Contremaître', cle: 'contremaitre' }, { entete: 'Jours sans rapport', cle: 'nombre', format: 'nombre' }, { entete: 'Derniers jours manquants', cle: 'jours' }],
        lignes: res.sort((a, b) => b.nombre - a.nombre),
        note: `Jours ouvrables du ${du} au ${fin}. Un contremaître peut avoir été affecté ailleurs ou un congé : à valider avec le dispatch.`,
      };
    }

    case 'primes': {
      const parCle = {};
      for (const l of lignes.filter((x) => x.prime_id)) {
        const prime = index.primes[l.prime_id];
        const emp = index.employes[l.ref_id];
        const k = `${l.prime_id}|${l.ref_id}`;
        const e = (parCle[k] = parCle[k] || { prime: prime?.nom || 'Prime', code: prime?.code || '', employe: emp?.nom || '', quantite: 0, unite: l.unite, montant: 0, rapports: new Set() });
        e.quantite += Number(l.quantite) || 0;
        e.montant += montantLigne(l);
        e.rapports.add(l.rapport_id);
      }
      const res = Object.values(parCle).map((e) => ({ ...e, quantite: r2(e.quantite), montant: r2(e.montant), rapports: e.rapports.size }))
        .sort((a, b) => a.prime.localeCompare(b.prime, 'fr') || a.employe.localeCompare(b.employe, 'fr'));
      return {
        colonnes: [{ entete: 'Prime', cle: 'prime' }, { entete: 'Code paie', cle: 'code' }, { entete: 'Employé', cle: 'employe' }, { entete: 'Quantité', cle: 'quantite', format: 'nombre' }, { entete: 'Unité', cle: 'unite' }, { entete: 'Rapports', cle: 'rapports', format: 'nombre' }, { entete: 'Montant', cle: 'montant', format: 'argent' }],
        lignes: res,
        total: { prime: 'Total', montant: r2(somme(res, (r) => r.montant)) },
        note: 'Les primes comptent dans le cost de main-d’œuvre; elles sont détaillées ici pour la paie.',
      };
    }

    case 'hors_catalogue': {
      const ids = new Set(rapports.map((r) => r.id));
      const res = (db.ressources_provisoires || []).filter((x) => ids.has(x.rapport_id)).map((x) => {
        const r = index.rapports[x.rapport_id];
        const ls = lignes.filter((l) => l.ressource_provisoire_id === x.id);
        const cible = x.regularise_ref_id ? (x.categorie === 'main_oeuvre' ? index.employes[x.regularise_ref_id]?.nom : index.equipements[x.regularise_ref_id]?.nom) : '';
        return {
          id: r.id, date: r.date, rapport: r.numero, projet: nomProjet(index, r.projet_id), categorie: x.categorie === 'main_oeuvre' ? 'Main-d’œuvre' : 'Équipement',
          nom: x.nom, type: x.type || '', heures: r2(somme(ls, heuresLigne)), cout: r2(somme(ls, montantLigne)),
          statut: cible ? `Rattaché à ${cible}` : 'À régulariser',
        };
      }).sort((a, b) => (a.statut === 'À régulariser' ? -1 : 1) - (b.statut === 'À régulariser' ? -1 : 1) || b.date.localeCompare(a.date));
      return {
        colonnes: [{ entete: 'Date', cle: 'date' }, { entete: 'Rapport', cle: 'rapport' }, { entete: 'Projet', cle: 'projet' }, { entete: 'Catégorie', cle: 'categorie' }, { entete: 'Nom saisi', cle: 'nom' }, { entete: 'Type', cle: 'type' }, { entete: 'Heures', cle: 'heures', format: 'nombre' }, { entete: 'Cost', cle: 'cout', format: 'argent' }, { entete: 'Régularisation', cle: 'statut' }],
        lignes: res,
        total: { date: 'Total', heures: r2(somme(res, (r) => r.heures)), cout: r2(somme(res, (r) => r.cout)) },
        note: 'Ressources inscrites à la volée sur un rapport, sans fiche au catalogue. Le bureau les rattache dans Répertoires > Hors catalogue.',
      };
    }

    case 'productivite_equipe':
    case 'productivite_employe': {
      // Heures-personnes (MH) par unité réalisée, par sous-tâche. Une ligne
      // de main-d'œuvre compte pour la sous-tâche qu'elle indique, ou pour
      // la seule activité du rapport s'il n'y en a qu'une.
      const actsParRapport = {};
      const idsRapports = new Set(rapports.map((r) => r.id));
      for (const a of db.activites || []) if (idsRapports.has(a.rapport_id)) (actsParRapport[a.rapport_id] = actsParRapport[a.rapport_id] || []).push(a);
      const parEmploye = code === 'productivite_employe';
      const groupes = {};
      for (const r of rapports) {
        const acts = (actsParRapport[r.id] || []).filter((a) => Number(a.quantite_realisee) > 0 && a.unite);
        if (!acts.length) continue;
        const ls = lignes.filter((l) => l.rapport_id === r.id && l.categorie === 'main_oeuvre' && !l.prime_id);
        for (const a of acts) {
          const lsAct = ls.filter((l) => l.sous_tache_id === a.sous_tache_id || (acts.length === 1 && !l.sous_tache_id));
          if (!lsAct.length) continue;
          const st = index.sous_taches[a.sous_tache_id];
          const qui = parEmploye ? lsAct.map((l) => ({ k: l.ref_id || l.libelle, nom: index.employes[l.ref_id]?.nom || l.libelle, ls: [l] }))
            : [{ k: r.equipe_id || r.contremaitre_id, nom: index.equipes?.[r.equipe_id]?.nom || index.membres[r.contremaitre_id]?.nom || '?', ls: lsAct }];
          for (const x of qui) {
            const cle = `${x.k}|${a.sous_tache_id}|${a.unite}`;
            const g = (groupes[cle] = groupes[cle] || { qui: x.nom, sousTache: st ? `${st.code || ''} ${st.nom}`.trim() : '?', unite: a.unite, mh: 0, quantite: 0, rapports: new Set() });
            g.mh += somme(x.ls, heuresLigne);
            if (!g.rapports.has(r.id)) { g.quantite += Number(a.quantite_realisee); g.rapports.add(r.id); }
          }
        }
      }
      const res = Object.values(groupes).map((g) => ({ ...g, mh: r2(g.mh), quantite: r2(g.quantite), rapports: g.rapports.size, mhUnite: g.quantite ? r2(g.mh / g.quantite) : null, uniteHeure: g.mh ? r2(g.quantite / g.mh) : null }))
        .sort((a, b) => a.sousTache.localeCompare(b.sousTache, 'fr', { numeric: true }) || (a.mhUnite || 0) - (b.mhUnite || 0));
      return {
        colonnes: [
          { entete: parEmploye ? 'Employé' : 'Équipe', cle: 'qui' }, { entete: 'Sous-tâche', cle: 'sousTache' }, { entete: 'Unité', cle: 'unite' },
          { entete: 'Quantité réalisée', cle: 'quantite', format: 'nombre' }, { entete: 'Heures-personnes (MH)', cle: 'mh', format: 'nombre' },
          { entete: 'MH par unité', cle: 'mhUnite', format: 'nombre' }, { entete: 'Unités par MH', cle: 'uniteHeure', format: 'nombre' }, { entete: 'Rapports', cle: 'rapports', format: 'nombre' },
        ],
        lignes: res,
        note: parEmploye
          ? 'Heures de l’employé sur la sous-tâche ÷ quantité réalisée par son équipe ces jours-là (la quantité est mesurée pour l’équipe, pas par personne). Plus le MH par unité est bas, plus c’est productif.'
          : 'Heures-personnes de l’équipe sur la sous-tâche ÷ quantité réalisée. Plus le MH par unité est bas, plus c’est productif. Seules les activités avec une quantité et une unité comptent.',
      };
    }

    case 'abandonnes': {
      const res = db.rapports.filter((r) => r.abandonne && projetsOk.has(r.projet_id) && (!f.du || r.date >= f.du) && (!f.au || r.date <= f.au)).map((r) => ({
        id: r.id, date: r.date, numero: r.numero, projet: nomProjet(index, r.projet_id), equipe: index.equipes?.[r.equipe_id]?.nom || index.membres[r.contremaitre_id]?.nom || '',
        raison: r.abandonne_raison || '', le: r.abandonne_le ? r.abandonne_le.slice(0, 16).replace('T', ' ') : '',
      })).sort((a, b) => b.date.localeCompare(a.date));
      return {
        colonnes: [{ entete: 'Date', cle: 'date' }, { entete: 'No', cle: 'numero' }, { entete: 'Projet', cle: 'projet' }, { entete: 'Équipe', cle: 'equipe' }, { entete: 'Raison', cle: 'raison' }, { entete: 'Abandonné le', cle: 'le' }],
        lignes: res,
        note: 'Rapports fermés sans avoir été remplis (fermeture automatique après le délai, ou abandon par le dispatch). Ils ne comptent dans aucun cost.',
      };
    }

    default:
      return { colonnes: [], lignes: [] };
  }
}

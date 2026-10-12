// ---------------------------------------------------------------------------
// PEPDAY RV02 — INDICATEURS PAR PROJET (Vue Direction, accueil, projets)
//
// Calculés une fois par changement de données (AppPepday les met dans le
// contexte). Fonctions pures, sans base de données.
//
// « Temps non validés » (repris du Hub de Civalgo) = nombre de rapports du
// projet qui ne sont pas au statut Validé (abandonnés exclus).
// « Retard » : la formule reste à confirmer avec William (question 2 du
// devis); on n'affiche donc pas de chiffre inventé.
// ---------------------------------------------------------------------------

import { montantLigne, heuresLigne } from './couts';
import { flagsNonLus } from './workflow';

export const RETARD_A_DEFINIR = 'À définir';

const isoDe = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function indicateursProjets(db, aujourdhuiIso, nbJours = 14) {
  const jours = [];
  const fin = new Date(`${aujourdhuiIso}T12:00:00`);
  for (let i = nbJours - 1; i >= 0; i -= 1) { const d = new Date(fin); d.setDate(d.getDate() - i); jours.push(isoDe(d)); }
  const debutFenetre = jours[0];
  const debutSemaine = jours[Math.max(0, jours.length - 7)];

  const res = {};
  const base = (pid) => (res[pid] = res[pid] || {
    nonValides: 0, aPlanifier: 0, rapports: 0, dernierRapport: null, flags: 0, heuresSemaine: 0,
    coutParJour: Object.fromEntries(jours.map((j) => [j, 0])), coutFenetre: 0, horsCatalogue: 0,
  });
  const rapportsParId = {};
  for (const r of db.rapports) {
    if (r.abandonne || !r.projet_id) continue;
    rapportsParId[r.id] = r;
    const x = base(r.projet_id);
    x.rapports += 1;
    if (r.etape < 6) x.nonValides += 1;
    if (!x.dernierRapport || r.date > x.dernierRapport) x.dernierRapport = r.date;
  }
  for (const l of db.lignes) {
    const r = rapportsParId[l.rapport_id];
    if (!r) continue;
    const x = res[r.projet_id];
    if (r.date >= debutFenetre && r.date <= aujourdhuiIso) {
      const m = montantLigne(l);
      x.coutParJour[r.date] = (x.coutParJour[r.date] || 0) + m;
      x.coutFenetre += m;
    }
    if (r.date >= debutSemaine && r.date <= aujourdhuiIso && l.categorie === 'main_oeuvre') x.heuresSemaine += heuresLigne(l);
    if (l.ressource_provisoire_id) x.horsCatalogue += 1;
  }
  for (const c of flagsNonLus(db.commentaires)) {
    const r = rapportsParId[c.rapport_id];
    if (r) res[r.projet_id].flags += 1;
  }
  return { parProjet: res, jours };
}

import { useMemo, useState } from 'react';
import { Plus, Download } from 'lucide-react';
import ChampListe from '../commun/ChampListe';
import { usePepday, Champ, PastilleStatut, Jauge, optionsDe , RailFiltres, useFiltresAGauche } from './ui';
import FormProjet from './FormProjet';
import { STATUTS_PROJET, statutProjet, DEPARTEMENTS } from '../../lib/pepday/constantes';
import { RETARD_A_DEFINIR } from '../../lib/pepday/direction';
import { budgetDuProjet, argent0, pct } from '../../lib/pepday/couts';
import { peutGererProjets } from '../../lib/pepday/workflow';
import { exporterExcel } from '../../lib/pepday/exportExcel';

// ---------------------------------------------------------------------------
// PEPDAY — LISTE DES PROJETS (tableau 1300 px, cartes sur cellulaire)
// ---------------------------------------------------------------------------

function membresDuRole(db, role) {
  return db.membres.filter((m) => (m.roles || []).includes(role));
}

export default function VueProjets() {
  const { db, index, moi, naviguer, derive } = usePepday();
  const [f, setF] = useState({ statut: 'actifs', cp: '', surint: '', departement: '', q: '' });
  const [creation, setCreation] = useState(false);

  const lignes = useMemo(() => {
    const q = f.q.trim().toLowerCase();
    return db.projets
      .filter((p) => f.statut === 'tous' || (f.statut === 'actifs' ? ['en_cours', 'a_venir', 'suspendu'].includes(p.statut) : p.statut === f.statut))
      .filter((p) => !f.cp || p.charge_projet_id === f.cp)
      .filter((p) => !f.surint || p.surintendant_id === f.surint)
      .filter((p) => !f.departement || p.departement === f.departement)
      .filter((p) => !q || [p.numero, p.nom, p.client, p.adresse].some((v) => (v || '').toLowerCase().includes(q)))
      .map((p) => {
        const budget = budgetDuProjet(p.id, db.budgets);
        const c = derive.coutsProjet[p.id] || { total: 0, confirme: 0 };
        return { p, budget, cout: c.total, confirme: c.confirme, ratio: budget.total > 0 ? c.total / budget.total : null, nonValides: derive.indicateurs.parProjet[p.id]?.nonValides || 0 };
      })
      .sort((a, b) => String(b.p.numero).localeCompare(String(a.p.numero), 'fr', { numeric: true }));
  }, [db, f, derive]);

  const totContrat = lignes.reduce((s, x) => s + (Number(x.p.montant_contrat) || 0), 0);
  const totBudget = lignes.reduce((s, x) => s + x.budget.total, 0);
  const totCout = lignes.reduce((s, x) => s + x.cout, 0);

  function exporter() {
    exporterExcel('PEPday - projets', [{
      nom: 'Projets',
      titre: 'Projets',
      sousTitre: `Extrait le ${new Date().toLocaleString('fr-CA')}`,
      colonnes: [
        { entete: 'Numéro', cle: 'numero', largeur: 10 }, { entete: 'Nom', cle: 'nom', largeur: 40 },
        { entete: 'Client', cle: 'client', largeur: 26 }, { entete: 'Statut', cle: 'statut', largeur: 14 },
        { entete: 'Chargé de projet', cle: 'cp', largeur: 20 }, { entete: 'Surintendant', cle: 'su', largeur: 20 },
        { entete: 'Début', cle: 'debut', largeur: 12 }, { entete: 'Fin prévue', cle: 'fin', largeur: 12 },
        { entete: 'Contrat', cle: 'contrat', format: 'argent' }, { entete: 'Budget', cle: 'budget', format: 'argent' },
        { entete: 'Cost à date', cle: 'cout', format: 'argent' }, { entete: 'Dont confirmé', cle: 'confirme', format: 'argent' },
        { entete: '% du budget', cle: 'ratio', format: 'pct' }, { entete: 'Temps non validés', cle: 'nv', format: 'nombre' },
        { entete: 'Retard', cle: 'retard' }, { entete: 'Département', cle: 'dep' },
      ],
      lignes: lignes.map((x) => ({
        numero: x.p.numero, nom: x.p.nom, client: x.p.client, statut: statutProjet(x.p.statut).libelle,
        cp: index.membres[x.p.charge_projet_id]?.nom || '', su: index.membres[x.p.surintendant_id]?.nom || '',
        debut: x.p.date_debut, fin: x.p.date_fin, contrat: Number(x.p.montant_contrat) || 0, budget: x.budget.total,
        cout: x.cout, confirme: x.confirme, ratio: x.ratio, nv: x.nonValides, retard: RETARD_A_DEFINIR, dep: x.p.departement || '',
      })),
      total: { nom: 'Total', contrat: totContrat, budget: totBudget, cout: totCout },
    }]);
  }

  const aGauche = useFiltresAGauche();
  // Les filtres sont montés une seule fois et placés soit dans le rail de
  // gauche, soit dans la carte de tête — jamais les deux.
  const blocFiltres = (
    <div className="pd-filtres">
      <Champ label="Statut">
        <select className="pd-input" value={f.statut} onChange={(e) => setF({ ...f, statut: e.target.value })}>
          <option value="actifs">Actifs (en cours, à venir, suspendus)</option>
          <option value="tous">Tous</option>
          {STATUTS_PROJET.map((s) => <option key={s.code} value={s.code}>{s.libelle}</option>)}
        </select>
      </Champ>
      <Champ label="Chargé de projet">
        <ChampListe options={optionsDe(membresDuRole(db, 'charge_projet'))} valeur={f.cp} onChange={(v) => setF({ ...f, cp: v })} videLabel="Tous" placeholder="Tous" />
      </Champ>
      <Champ label="Surintendant">
        <ChampListe options={optionsDe(membresDuRole(db, 'surintendant'))} valeur={f.surint} onChange={(v) => setF({ ...f, surint: v })} videLabel="Tous" placeholder="Tous" />
      </Champ>
      <Champ label="Département">
        <select className="pd-input" value={f.departement} onChange={(e) => setF({ ...f, departement: e.target.value })}>
          <option value="">Tous</option>
          {DEPARTEMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </Champ>
      <Champ label="Recherche">
        <input className="pd-input" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Numéro, nom, client, adresse…" />
      </Champ>
    </div>
  );

  return (
    <main className={`pd-main pd-l1300${aGauche ? ' pd-avec-rail' : ''}`}>
      {aGauche && <RailFiltres>{blocFiltres}</RailFiltres>}
      <div className="pd-carte">
        <div className="pd-carte-titre">
          <h2>Projets</h2>
          <div className="pd-actions">
            <button className="pd-btn fantome" onClick={exporter}><Download size={15} /> Excel</button>
            {peutGererProjets(moi) && <button className="pd-btn" onClick={() => setCreation(true)}><Plus size={15} /> Nouveau projet</button>}
          </div>
        </div>
        <div className="pd-kpis">
          <div className="pd-kpi"><div className="pd-kpi-val">{lignes.length}</div><div className="pd-kpi-lib">Projets affichés</div></div>
          <div className="pd-kpi"><div className="pd-kpi-val">{argent0(totContrat)}</div><div className="pd-kpi-lib">Valeur des contrats</div></div>
          <div className="pd-kpi"><div className="pd-kpi-val">{argent0(totCout)}</div><div className="pd-kpi-lib">Cost à date</div></div>
          <div className="pd-kpi"><div className="pd-kpi-val">{pct(totBudget ? totCout / totBudget : null)}</div><div className="pd-kpi-lib">Du budget consommé</div></div>
        </div>
        {!aGauche && blocFiltres}
      </div>

      <div className="pd-liste pd-cache-bureau">
        {lignes.map(({ p, budget, cout, ratio }) => (
          <button key={p.id} className="pd-item" style={{ borderLeftColor: statutProjet(p.statut).couleur }} onClick={() => naviguer('projet', p.id)}>
            <div className="pd-item-haut">
              <div style={{ minWidth: 0 }}>
                <div className="pd-item-titre">{p.numero} — {p.nom}</div>
                <div className="pd-item-sous">{p.client} · {index.membres[p.charge_projet_id]?.nom || 'Sans chargé'}</div>
              </div>
              <PastilleStatut code={p.statut} />
            </div>
            <div className="pd-item-bas" style={{ justifyContent: 'space-between' }}>
              <span className="pd-petit">{argent0(cout)} / {argent0(budget.total)}</span>
              <span style={{ flex: 1, maxWidth: 160 }}><Jauge ratio={ratio} /></span>
            </div>
          </button>
        ))}
      </div>

      <div className="pd-cache-mobile">
        <div className="pd-table-wrap">
          <table className="pd-table">
            <thead>
              <tr><th>Numéro</th><th>Projet</th><th>Client</th><th>Statut</th><th>Chargé de projet</th><th>Surintendant</th><th className="num">Contrat</th><th className="num">Budget</th><th className="num">Cost à date</th><th>% budget</th><th className="num">Non validés</th><th>Retard</th></tr>
            </thead>
            <tbody>
              {lignes.map(({ p, budget, cout, ratio, nonValides }) => (
                <tr key={p.id} className="cliquable" onClick={() => naviguer('projet', p.id)}>
                  <td className="pd-gras">{p.numero}</td>
                  <td>{p.nom}</td>
                  <td>{p.client}</td>
                  <td><PastilleStatut code={p.statut} /></td>
                  <td>{index.membres[p.charge_projet_id]?.nom || ''}</td>
                  <td>{index.membres[p.surintendant_id]?.nom || ''}</td>
                  <td className="num">{argent0(p.montant_contrat)}</td>
                  <td className="num">{argent0(budget.total)}</td>
                  <td className={`num ${ratio > 1 ? 'depasse' : ''}`}>{argent0(cout)}</td>
                  <td style={{ minWidth: 110 }}><div className="pd-flex" style={{ flexWrap: 'nowrap' }}><Jauge ratio={ratio} /><span className="pd-petit">{pct(ratio)}</span></div></td>
                  <td className="num">{nonValides}</td>
                  <td className="pd-dim" title="Formule à confirmer avec William">{RETARD_A_DEFINIR}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td colSpan={6}>Total ({lignes.length})</td><td className="num">{argent0(totContrat)}</td><td className="num">{argent0(totBudget)}</td><td className="num">{argent0(totCout)}</td><td>{pct(totBudget ? totCout / totBudget : null)}</td><td className="num">{lignes.reduce((s, x) => s + x.nonValides, 0)}</td><td /></tr>
            </tfoot>
          </table>
        </div>
      </div>
      {lignes.length === 0 && <div className="pd-section-vide">Aucun projet ne correspond aux filtres.</div>}

      {creation && <FormProjet onFermer={() => setCreation(false)} onEnregistre={(p) => { setCreation(false); naviguer('projet', p.id); }} />}
    </main>
  );
}

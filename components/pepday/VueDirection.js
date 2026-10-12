import { useMemo, useState } from 'react';
import { Download, LayoutGrid, Table2, Map as IconeCarte, Flag, Clock, PackagePlus } from 'lucide-react';
import ChampListe from '../commun/ChampListe';
import { usePepday, Champ, Jauge, PastilleStatut, optionsDe , RailFiltres, useFiltresAGauche } from './ui';
import CarteLeaflet from './CarteLeaflet';
import { STATUTS_PROJET, statutProjet, DEPARTEMENTS } from '../../lib/pepday/constantes';
import { budgetDuProjet, argent0, argent, pct, nombre, dateCourte, aujourdhui } from '../../lib/pepday/couts';
import { RETARD_A_DEFINIR } from '../../lib/pepday/direction';
import { exporterExcel } from '../../lib/pepday/exportExcel';

// ---------------------------------------------------------------------------
// PEPDAY RV02 — VUE DIRECTION
//
// Tous les projets d'un coup d'œil : cost contre budget, temps non validés,
// lectures obligatoires en attente, activité des 14 derniers jours, dernier
// rapport. Cartes, tableau ou carte géographique; un clic ouvre la fiche.
//
// « Retard » : colonne prévue (relevé Civalgo), mais la formule est une
// décision de William — on affiche « À définir » plutôt qu'un chiffre inventé.
// ---------------------------------------------------------------------------

const TRIS = [
  { code: 'numero', libelle: 'Numéro' },
  { code: 'pct', libelle: '% du budget (le plus haut d’abord)' },
  { code: 'non_valides', libelle: 'Temps non validés' },
  { code: 'activite', libelle: 'Cost des 14 derniers jours' },
  { code: 'dernier', libelle: 'Dernier rapport (le plus ancien d’abord)' },
];

function joursDepuis(iso, auj) {
  if (!iso) return null;
  return Math.round((new Date(`${auj}T12:00:00`) - new Date(`${iso}T12:00:00`)) / 86400000);
}

function Sparkline({ jours, valeurs }) {
  const max = Math.max(1, ...jours.map((j) => valeurs[j] || 0));
  return (
    <div className="pd-sparkline" aria-label="Cost par jour, 14 derniers jours">
      {jours.map((j) => {
        const v = valeurs[j] || 0;
        return <i key={j} className={v ? '' : 'vide'} style={{ height: `${v ? Math.max(8, (v / max) * 100) : 4}%` }} title={`${dateCourte(j)} : ${argent0(v)}`} />;
      })}
    </div>
  );
}

export default function VueDirection() {
  const { db, index, naviguer, derive } = usePepday();
  const [f, setF] = useState({ statut: 'actifs', cp: '', surint: '', departement: '' });
  const [tri, setTri] = useState('pct');
  const [affichage, setAffichage] = useState('cartes');
  const auj = aujourdhui();
  const { parProjet, jours } = derive.indicateurs;

  const lignes = useMemo(() => db.projets
    .filter((p) => f.statut === 'tous' || (f.statut === 'actifs' ? ['en_cours', 'a_venir', 'suspendu'].includes(p.statut) : p.statut === f.statut))
    .filter((p) => !f.cp || p.charge_projet_id === f.cp)
    .filter((p) => !f.surint || p.surintendant_id === f.surint)
    .filter((p) => !f.departement || p.departement === f.departement)
    .map((p) => {
      const budget = budgetDuProjet(p.id, db.budgets).total;
      const cout = derive.coutsProjet[p.id]?.total || 0;
      const ind = parProjet[p.id] || { nonValides: 0, flags: 0, coutFenetre: 0, coutParJour: {}, dernierRapport: null, heuresSemaine: 0, horsCatalogue: 0 };
      return { p, budget, cout, ratio: budget ? cout / budget : null, ind, depuis: joursDepuis(ind.dernierRapport, auj) };
    })
    .sort((a, b) => {
      if (tri === 'pct') return (b.ratio ?? -1) - (a.ratio ?? -1);
      if (tri === 'non_valides') return b.ind.nonValides - a.ind.nonValides;
      if (tri === 'activite') return b.ind.coutFenetre - a.ind.coutFenetre;
      if (tri === 'dernier') return (b.depuis ?? -1) - (a.depuis ?? -1);
      return String(b.p.numero).localeCompare(String(a.p.numero), 'fr', { numeric: true });
    }), [db, f, tri, derive, parProjet, auj]);

  const tot = {
    contrat: lignes.reduce((s, x) => s + (Number(x.p.montant_contrat) || 0), 0),
    budget: lignes.reduce((s, x) => s + x.budget, 0),
    cout: lignes.reduce((s, x) => s + x.cout, 0),
    nonValides: lignes.reduce((s, x) => s + x.ind.nonValides, 0),
    flags: lignes.reduce((s, x) => s + x.ind.flags, 0),
    heures: lignes.reduce((s, x) => s + x.ind.heuresSemaine, 0),
    fenetre: lignes.reduce((s, x) => s + x.ind.coutFenetre, 0),
  };
  const horsCatalogue = (db.ressources_provisoires || []).filter((x) => !x.regularise_ref_id).length;
  const membres = (role) => optionsDe(db.membres.filter((m) => (m.roles || []).includes(role)));

  function exporter() {
    exporterExcel('PEPday - vue direction', [{
      nom: 'Vue direction',
      titre: 'Vue direction — tous les projets',
      sousTitre: `Extrait le ${new Date().toLocaleString('fr-CA')}`,
      colonnes: [
        { entete: 'Numéro', cle: 'numero', largeur: 10 }, { entete: 'Projet', cle: 'nom', largeur: 38 }, { entete: 'Statut', cle: 'statut' },
        { entete: 'Département', cle: 'dep' }, { entete: 'Chargé de projet', cle: 'cp', largeur: 20 }, { entete: 'Surintendant', cle: 'su', largeur: 20 },
        { entete: 'Contrat', cle: 'contrat', format: 'argent' }, { entete: 'Budget', cle: 'budget', format: 'argent' }, { entete: 'Cost à date', cle: 'cout', format: 'argent' },
        { entete: '% budget', cle: 'ratio', format: 'pct' }, { entete: 'Temps non validés', cle: 'nv', format: 'nombre' }, { entete: 'Retard', cle: 'retard' },
        { entete: 'Lectures oblig. non lues', cle: 'flags', format: 'nombre' }, { entete: 'Cost 14 jours', cle: 'fenetre', format: 'argent' },
        { entete: 'Heures M.-O. 7 jours', cle: 'heures', format: 'nombre' }, { entete: 'Dernier rapport', cle: 'dernier' },
      ],
      lignes: lignes.map((x) => ({
        numero: x.p.numero, nom: x.p.nom, statut: statutProjet(x.p.statut).libelle, dep: x.p.departement || '',
        cp: index.membres[x.p.charge_projet_id]?.nom || '', su: index.membres[x.p.surintendant_id]?.nom || '',
        contrat: Number(x.p.montant_contrat) || 0, budget: x.budget, cout: x.cout, ratio: x.ratio, nv: x.ind.nonValides, retard: RETARD_A_DEFINIR,
        flags: x.ind.flags, fenetre: Math.round(x.ind.coutFenetre * 100) / 100, heures: x.ind.heuresSemaine, dernier: x.ind.dernierRapport || '',
      })),
      total: { nom: 'Total', contrat: tot.contrat, budget: tot.budget, cout: tot.cout, nv: tot.nonValides, flags: tot.flags, fenetre: tot.fenetre, heures: tot.heures },
    }]);
  }

  const aGauche = useFiltresAGauche();
  // Les filtres sont montés une seule fois et placés soit dans le rail de
  // gauche, soit dans la carte de tête — jamais les deux.
  const blocFiltres = (
    <div className="pd-filtres">
      <Champ label="Statut">
        <select className="pd-input" value={f.statut} onChange={(e) => setF({ ...f, statut: e.target.value })}>
          <option value="actifs">Actifs</option>
          <option value="tous">Tous</option>
          {STATUTS_PROJET.map((s) => <option key={s.code} value={s.code}>{s.libelle}</option>)}
        </select>
      </Champ>
      <Champ label="Département">
        <select className="pd-input" value={f.departement} onChange={(e) => setF({ ...f, departement: e.target.value })}>
          <option value="">Tous</option>
          {DEPARTEMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </Champ>
      <Champ label="Chargé de projet"><ChampListe options={membres('charge_projet')} valeur={f.cp} onChange={(v) => setF({ ...f, cp: v })} videLabel="Tous" placeholder="Tous" /></Champ>
      <Champ label="Surintendant"><ChampListe options={membres('surintendant')} valeur={f.surint} onChange={(v) => setF({ ...f, surint: v })} videLabel="Tous" placeholder="Tous" /></Champ>
      <Champ label="Trier par" style={{ gridColumn: 'span 2' }}>
        <select className="pd-input" value={tri} onChange={(e) => setTri(e.target.value)}>
          {TRIS.map((t) => <option key={t.code} value={t.code}>{t.libelle}</option>)}
        </select>
      </Champ>
    </div>
  );

  return (
    <main className={`pd-main pd-l1300${aGauche ? ' pd-avec-rail' : ''}`}>
      {aGauche && <RailFiltres>{blocFiltres}</RailFiltres>}
      <div className="pd-carte">
        <div className="pd-carte-titre">
          <h2>Vue Direction</h2>
          <div className="pd-actions">
            <button className={`pd-btn petit ${affichage === 'cartes' ? '' : 'fantome'}`} onClick={() => setAffichage('cartes')}><LayoutGrid size={14} /> Cartes</button>
            <button className={`pd-btn petit ${affichage === 'tableau' ? '' : 'fantome'}`} onClick={() => setAffichage('tableau')}><Table2 size={14} /> Tableau</button>
            <button className={`pd-btn petit ${affichage === 'carte' ? '' : 'fantome'}`} onClick={() => setAffichage('carte')}><IconeCarte size={14} /> Carte</button>
            <button className="pd-btn fantome petit" onClick={exporter}><Download size={14} /> Excel</button>
          </div>
        </div>
        <div className="pd-kpis">
          <div className="pd-kpi"><div className="pd-kpi-val">{lignes.length}</div><div className="pd-kpi-lib">Projets · {argent0(tot.contrat)} de contrats</div></div>
          <div className="pd-kpi"><div className="pd-kpi-val">{argent0(tot.cout)}</div><div className="pd-kpi-lib">Cost à date · {pct(tot.budget ? tot.cout / tot.budget : null)} du budget</div></div>
          <div className="pd-kpi"><div className="pd-kpi-val" style={{ color: tot.nonValides ? 'var(--pd-avis-texte)' : undefined }}>{tot.nonValides}</div><div className="pd-kpi-lib">Temps non validés</div></div>
          <div className="pd-kpi"><div className="pd-kpi-val" style={{ color: tot.flags ? 'var(--pd-rouge)' : undefined }}>{tot.flags}</div><div className="pd-kpi-lib">Lectures obligatoires non lues</div></div>
        </div>
        <div className="pd-kpis">
          <div className="pd-kpi"><div className="pd-kpi-val">{argent0(tot.fenetre)}</div><div className="pd-kpi-lib">Cost des 14 derniers jours</div></div>
          <div className="pd-kpi"><div className="pd-kpi-val">{nombre(tot.heures)} h</div><div className="pd-kpi-lib">Main-d’œuvre, 7 derniers jours</div></div>
          <div className="pd-kpi"><div className="pd-kpi-val">{horsCatalogue}</div><div className="pd-kpi-lib">Ressources hors catalogue à régulariser</div></div>
          <div className="pd-kpi"><div className="pd-kpi-val" style={{ fontSize: 16, paddingTop: 4 }}>{RETARD_A_DEFINIR}</div><div className="pd-kpi-lib">Retard (formule à confirmer)</div></div>
        </div>
        {!aGauche && blocFiltres}
      </div>

      {affichage === 'cartes' && (
        <div className="pd-dir-grille">
          {lignes.map(({ p, budget, cout, ratio, ind, depuis }) => {
            const enRetardDeSaisie = p.statut === 'en_cours' && depuis != null && depuis > 3;
            return (
              <button key={p.id} className="pd-dir-carte" style={{ borderTopColor: statutProjet(p.statut).couleur }} onClick={() => naviguer('projet', p.id)}>
                <div className="pd-item-haut">
                  <div style={{ minWidth: 0 }}>
                    <div className="pd-item-titre">{p.numero} — {p.nom}</div>
                    <div className="pd-item-sous">{index.membres[p.charge_projet_id]?.nom || 'Sans chargé'} · {index.membres[p.surintendant_id]?.nom || 'sans surintendant'}{p.departement ? ` · ${p.departement}` : ''}</div>
                  </div>
                  <PastilleStatut code={p.statut} />
                </div>
                <div className="pd-dir-chiffres">
                  <div><b className={ratio > 1 ? 'depasse' : ''} style={{ color: ratio > 1 ? 'var(--pd-err-texte)' : undefined }}>{pct(ratio)}</b><span>du budget</span></div>
                  <div><b style={{ color: ind.nonValides ? 'var(--pd-avis-texte)' : undefined }}>{ind.nonValides}</b><span>Temps non validés</span></div>
                  <div><b style={{ fontSize: 12.5 }}>{RETARD_A_DEFINIR}</b><span>Retard</span></div>
                </div>
                <div className="pd-flex" style={{ flexWrap: 'nowrap', marginBottom: 8 }}>
                  <span style={{ flex: 1 }}><Jauge ratio={ratio} /></span>
                  <span className="pd-petit" style={{ whiteSpace: 'nowrap' }}>{argent0(cout)} / {argent0(budget)}</span>
                </div>
                <Sparkline jours={jours} valeurs={ind.coutParJour} />
                <div className="pd-dim pd-petit" style={{ marginTop: 2 }}>14 derniers jours · {argent0(ind.coutFenetre)}</div>
                <div className="pd-flex" style={{ marginTop: 8, gap: 6 }}>
                  {ind.flags > 0 && <span className="pd-alerte rouge"><Flag size={12} /> {ind.flags} à lire</span>}
                  {enRetardDeSaisie && <span className="pd-alerte orange"><Clock size={12} /> Aucun rapport depuis {depuis} jours</span>}
                  {ind.horsCatalogue > 0 && <span className="pd-alerte gris"><PackagePlus size={12} /> {ind.horsCatalogue} hors catalogue</span>}
                  <span className="pd-dim pd-petit">{ind.dernierRapport ? `Dernier rapport : ${dateCourte(ind.dernierRapport)}` : 'Aucun rapport'}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {affichage === 'tableau' && (
        <div className="pd-table-wrap">
          <table className="pd-table">
            <thead>
              <tr><th>Projet</th><th>Statut</th><th>Chargé</th><th className="num">Budget</th><th className="num">Cost</th><th>% budget</th><th className="num">Non validés</th><th>Retard</th><th className="num">À lire</th><th className="num">Cost 14 j</th><th>Dernier rapport</th></tr>
            </thead>
            <tbody>
              {lignes.map(({ p, budget, cout, ratio, ind }) => (
                <tr key={p.id} className="cliquable" onClick={() => naviguer('projet', p.id)}>
                  <td><strong>{p.numero}</strong> — {p.nom}</td>
                  <td><PastilleStatut code={p.statut} /></td>
                  <td>{index.membres[p.charge_projet_id]?.nom || ''}</td>
                  <td className="num">{argent0(budget)}</td>
                  <td className={`num ${ratio > 1 ? 'depasse' : ''}`}>{argent0(cout)}</td>
                  <td style={{ minWidth: 110 }}><div className="pd-flex" style={{ flexWrap: 'nowrap' }}><Jauge ratio={ratio} /><span className="pd-petit">{pct(ratio)}</span></div></td>
                  <td className="num">{ind.nonValides}</td>
                  <td className="pd-dim">{RETARD_A_DEFINIR}</td>
                  <td className="num" style={{ color: ind.flags ? 'var(--pd-rouge)' : undefined }}>{ind.flags}</td>
                  <td className="num">{argent(ind.coutFenetre)}</td>
                  <td>{ind.dernierRapport ? dateCourte(ind.dernierRapport) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {affichage === 'carte' && (
        <CarteLeaflet
          regrouper
          marqueurs={lignes.filter((x) => x.p.lat != null).map(({ p, ratio, ind }) => ({
            id: p.id, lat: p.lat, lng: p.lng, couleur: statutProjet(p.statut).couleur,
            titre: `${p.numero} — ${p.nom} · ${pct(ratio)} du budget · ${ind.nonValides} non validés`,
            onClick: () => naviguer('projet', p.id),
          }))}
          cleAjustement={`${f.statut}-${f.cp}-${f.surint}-${f.departement}`}
        />
      )}
      {lignes.length === 0 && <div className="pd-section-vide">Aucun projet ne correspond aux filtres.</div>}
    </main>
  );
}

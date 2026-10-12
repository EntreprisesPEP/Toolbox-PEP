import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import ChampListe from '../commun/ChampListe';
import { usePepday, Champ, Encadre, optionsDe , RailFiltres, useFiltresAGauche } from './ui';
import { LISTE_RAPPORTS, calculerRapport } from '../../lib/pepday/rapportsGlobaux';
import { argent, nombre, pct, aujourdhui } from '../../lib/pepday/couts';
import { exporterExcel } from '../../lib/pepday/exportExcel';

// ---------------------------------------------------------------------------
// PEPDAY — RAPPORTS GLOBAUX
// Filtres communs (période, projet, chargé de projet, surintendant, étapes),
// un rapport à la fois, export Excel du rapport affiché ou de tous.
// ---------------------------------------------------------------------------

function periode(code) {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const iso = (x) => `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
  if (code === 'mois') return { du: iso(new Date(d.getFullYear(), d.getMonth(), 1)), au: iso(d) };
  if (code === 'mois_prec') return { du: iso(new Date(d.getFullYear(), d.getMonth() - 1, 1)), au: iso(new Date(d.getFullYear(), d.getMonth(), 0)) };
  if (code === 'trimestre') return { du: iso(new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1)), au: iso(d) };
  if (code === 'annee') return { du: `${d.getFullYear()}-01-01`, au: iso(d) };
  if (code === '30j') { const x = new Date(d); x.setDate(x.getDate() - 30); return { du: iso(x), au: iso(d) }; }
  return { du: '', au: '' };
}

function formater(v, format) {
  if (v == null || v === '') return '';
  if (format === 'argent') return argent(v);
  if (format === 'nombre') return nombre(v);
  if (format === 'pct') return pct(v);
  return String(v);
}

function Tableau({ resultat, onLigne }) {
  const max = resultat.graphique ? Math.max(1, ...resultat.lignes.map((l) => Number(l[resultat.graphique.cle]) || 0)) : 0;
  return (
    <div className="pd-table-wrap">
      <table className="pd-table">
        <thead>
          <tr>
            {resultat.colonnes.map((c) => <th key={c.cle} className={c.format && c.format !== 'texte' ? 'num' : ''}>{c.entete}</th>)}
            {resultat.graphique && <th style={{ minWidth: 140 }} />}
          </tr>
        </thead>
        <tbody>
          {resultat.lignes.map((l, i) => (
            <tr key={l.id || i} className={onLigne && l.id ? 'cliquable' : ''} onClick={onLigne && l.id ? () => onLigne(l) : undefined}>
              {resultat.colonnes.map((c) => (
                <td key={c.cle} className={`${c.format && c.format !== 'texte' ? 'num' : ''} ${c.format === 'pct' && Number(l[c.cle]) > 1 ? 'depasse' : ''}`} style={c.cle === 'texte' ? { minWidth: 260, whiteSpace: 'normal' } : undefined}>
                  {formater(l[c.cle], c.format)}
                </td>
              ))}
              {resultat.graphique && (
                <td>
                  <div className="pd-jauge" style={{ height: 12 }}><span style={{ width: `${(Number(l[resultat.graphique.cle]) || 0) / max * 100}%`, background: 'var(--pd-btn)' }} /></div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
        {resultat.total && (
          <tfoot>
            <tr>
              {resultat.colonnes.map((c) => <td key={c.cle} className={c.format && c.format !== 'texte' ? 'num' : ''}>{formater(resultat.total[c.cle], c.format)}</td>)}
              {resultat.graphique && <td />}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

export default function VueGlobaux() {
  const { db, index, naviguer } = usePepday();
  const [code, setCode] = useState('mensuel');
  const [per, setPer] = useState('annee');
  const [f, setF] = useState(() => ({ ...periode('annee'), projet: '', cp: '', surint: '', etapes: 'toutes' }));
  const auj = aujourdhui();

  const resultat = useMemo(() => calculerRapport(code, { db, index, f, aujourdhui: auj }), [code, db, index, f, auj]);
  const infos = LISTE_RAPPORTS.find((r) => r.code === code);
  const groupes = [...new Set(LISTE_RAPPORTS.map((r) => r.groupe))];

  const descriptionFiltres = () => {
    const morceaux = [f.du || f.au ? `Période : ${f.du || 'début'} au ${f.au || 'aujourd’hui'}` : 'Toutes les dates'];
    if (f.projet) morceaux.push(`Projet ${index.projets[f.projet]?.numero}`);
    if (f.cp) morceaux.push(`Chargé de projet : ${index.membres[f.cp]?.nom}`);
    if (f.surint) morceaux.push(`Surintendant : ${index.membres[f.surint]?.nom}`);
    morceaux.push(f.etapes === 'confirmes' ? 'Rapports confirmés seulement' : f.etapes === 'validation' ? 'Rapports en validation seulement' : 'Toutes les étapes');
    return morceaux.join(' · ');
  };

  const feuille = (c, r) => {
    const info = LISTE_RAPPORTS.find((x) => x.code === c);
    return [{ nom: info.libelle, titre: info.libelle, sousTitre: `${descriptionFiltres()} · extrait le ${new Date().toLocaleString('fr-CA')}`, colonnes: r.colonnes, lignes: r.lignes, total: r.total },
      ...(r.detail ? [{ nom: `${info.libelle} (détail)`.slice(0, 31), titre: r.detail.titre, colonnes: r.detail.colonnes, lignes: r.detail.lignes }] : [])];
  };

  function exporterUn() {
    exporterExcel(`PEPday - ${infos.libelle}`, feuille(code, resultat));
  }
  function exporterTous() {
    const feuilles = LISTE_RAPPORTS.flatMap((x) => feuille(x.code, calculerRapport(x.code, { db, index, f, aujourdhui: auj })));
    exporterExcel('PEPday - rapports globaux', feuilles);
  }

  const membres = (role) => optionsDe(db.membres.filter((m) => (m.roles || []).includes(role)));

  const aGauche = useFiltresAGauche();
  // Les filtres sont montés une seule fois et placés soit dans le rail de
  // gauche, soit dans la carte de tête — jamais les deux.
  const blocFiltres = (
    <div className="pd-filtres">
      <Champ label="Période">
        <select className="pd-input" value={per} onChange={(e) => { setPer(e.target.value); if (e.target.value !== 'perso') setF({ ...f, ...periode(e.target.value) }); }}>
          <option value="mois">Ce mois-ci</option>
          <option value="mois_prec">Le mois dernier</option>
          <option value="30j">30 derniers jours</option>
          <option value="trimestre">Ce trimestre</option>
          <option value="annee">Cette année</option>
          <option value="tout">Depuis le début</option>
          <option value="perso">Personnalisée</option>
        </select>
      </Champ>
      <Champ label="Du"><input className="pd-input" type="date" value={f.du} onChange={(e) => { setPer('perso'); setF({ ...f, du: e.target.value }); }} /></Champ>
      <Champ label="Au"><input className="pd-input" type="date" value={f.au} onChange={(e) => { setPer('perso'); setF({ ...f, au: e.target.value }); }} /></Champ>
      <Champ label="Projet"><ChampListe options={optionsDe(db.projets, { libelle: (p) => `${p.numero} — ${p.nom}` })} valeur={f.projet} onChange={(v) => setF({ ...f, projet: v })} videLabel="Tous" placeholder="Tous" /></Champ>
      <Champ label="Chargé de projet"><ChampListe options={membres('charge_projet')} valeur={f.cp} onChange={(v) => setF({ ...f, cp: v })} videLabel="Tous" placeholder="Tous" /></Champ>
      <Champ label="Surintendant"><ChampListe options={membres('surintendant')} valeur={f.surint} onChange={(v) => setF({ ...f, surint: v })} videLabel="Tous" placeholder="Tous" /></Champ>
    </div>
  );

  return (
    <main className={`pd-main pd-l1300${aGauche ? ' pd-avec-rail' : ''}`}>
      {aGauche && <RailFiltres>{blocFiltres}</RailFiltres>}
      <div className="pd-carte">
        <div className="pd-carte-titre">
          <h2>Rapports globaux</h2>
          <div className="pd-actions">
            <button className="pd-btn fantome" onClick={exporterTous}><Download size={15} /> Tous en Excel</button>
            <button className="pd-btn" onClick={exporterUn}><Download size={15} /> Ce rapport en Excel</button>
          </div>
        </div>
        {!aGauche && blocFiltres}
        <div className="pd-flex">
          <span className="pd-etiquette">Rapports inclus :</span>
          {[['toutes', 'Toutes les étapes'], ['confirmes', 'Cost final confirmé'], ['validation', 'En validation']].map(([v, l]) => (
            <label key={v} className="pd-case"><input type="radio" name="etapes" checked={f.etapes === v} onChange={() => setF({ ...f, etapes: v })} /> {l}</label>
          ))}
        </div>
      </div>

      <div className="pd-carte">
        <Champ label="Rapport">
          <select className="pd-input" value={code} onChange={(e) => setCode(e.target.value)} style={{ fontWeight: 700 }}>
            {groupes.map((g) => (
              <optgroup key={g} label={g}>
                {LISTE_RAPPORTS.filter((r) => r.groupe === g).map((r) => <option key={r.code} value={r.code}>{r.libelle}</option>)}
              </optgroup>
            ))}
          </select>
        </Champ>
        <div className="pd-dim pd-petit" style={{ marginBottom: 10 }}>{descriptionFiltres()}</div>
        {resultat.note && <Encadre type="info">{resultat.note}</Encadre>}
        {resultat.resumeCategories && (
          <div className="pd-kpis">
            {resultat.resumeCategories.map((c) => (
              <div key={c.libelle} className="pd-kpi"><div className="pd-kpi-val">{argent(c.montant)}</div><div className="pd-kpi-lib">{c.libelle} · {pct(c.part)}</div></div>
            ))}
          </div>
        )}
        {resultat.lignes.length === 0 ? <div className="pd-section-vide">Aucune donnée pour ces filtres.</div> : (
          <Tableau resultat={resultat} onLigne={(l) => naviguer('rapport', l.id)} />
        )}
        {resultat.detail && resultat.detail.lignes.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <h3>{resultat.detail.titre}</h3>
            <Tableau resultat={resultat.detail} onLigne={(l) => naviguer('rapport', l.id)} />
          </div>
        )}
      </div>
    </main>
  );
}

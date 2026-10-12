import { useMemo, useState } from 'react';
import { Plus, CalendarPlus, Download, ChevronLeft, ChevronRight, CalendarDays, List, Flag } from 'lucide-react';
import ChampListe from '../commun/ChampListe';
import { usePepday, Champ, BadgeFlag, optionsDe, RailFiltres, useFiltresAGauche } from './ui';
import { ItemRapport, NouveauRapport, DispatchJournee, peutCreerRapport, PastilleStatut } from './ElementsRapport';
import { STATUTS_RAPPORT, codeStatut, statutRapport, etape as infoEtape } from '../../lib/pepday/constantes';
import { peutVoirRapport, voitTout } from '../../lib/pepday/workflow';
import { argent, argent0, dateCourte, aujourdhui } from '../../lib/pepday/couts';
import { exporterExcel } from '../../lib/pepday/exportExcel';

// ---------------------------------------------------------------------------
// PEPDAY — RAPPORTS : CALENDRIER ET LISTE (RV02)
//
// Calendrier : une semaine, une rangée par équipe, une colonne par jour. Une
// cellule peut contenir plusieurs rapports (deux projets le même jour). En
// tête de chaque jour, les compteurs par statut, comme dans Civalgo.
// Liste : tableau filtrable (période, projet, équipe, statut, chargé de
// projet, surintendant) avec export Excel.
// ---------------------------------------------------------------------------

const PAR_PAGE = 60;
const JOURS_COURTS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];

const isoDe = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function lundiDe(iso) {
  const d = new Date(`${iso}T12:00:00`);
  const decalage = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - decalage);
  return isoDe(d);
}
function plusJours(iso, n) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return isoDe(d);
}

export default function VueRapports() {
  const { nav, naviguer } = usePepday();
  const vue = nav.onglet === 'liste' ? 'liste' : 'calendrier';
  const [creation, setCreation] = useState(null);
  const [dispatch, setDispatch] = useState(false);
  // Le rail n'existe que sur l'onglet Liste : le calendrier n'a pas de filtres.
  const avecRail = useFiltresAGauche() && vue === 'liste';
  return (
    <main className={`pd-main pd-l1300${avecRail ? ' pd-avec-rail' : ''}`}>
      <div className="pd-flex" style={{ marginBottom: 12 }}>
        <div className="pd-onglets" style={{ paddingBottom: 0 }}>
          <button className={`pd-onglet ${vue === 'calendrier' ? 'actif' : ''}`} onClick={() => naviguer('rapports', null, { onglet: 'calendrier' })}><CalendarDays size={15} /> Calendrier</button>
          <button className={`pd-onglet ${vue === 'liste' ? 'actif' : ''}`} onClick={() => naviguer('rapports', null, { onglet: 'liste' })}><List size={15} /> Liste</button>
        </div>
      </div>
      {vue === 'calendrier'
        ? <Calendrier onCreer={setCreation} onDispatch={() => setDispatch(true)} />
        : <Liste onCreer={setCreation} onDispatch={() => setDispatch(true)} />}
      {creation && <NouveauRapport {...creation} onFermer={() => setCreation(null)} />}
      {dispatch && <DispatchJournee onFermer={() => setDispatch(false)} />}
    </main>
  );
}

function BoutonsCreation({ onCreer, onDispatch }) {
  const { moi } = usePepday();
  if (!peutCreerRapport(moi)) return null;
  return (
    <>
      <button className="pd-btn fantome" onClick={onDispatch}><CalendarPlus size={15} /> Dispatch</button>
      <button className="pd-btn" onClick={() => onCreer({})}><Plus size={15} /> Nouveau</button>
    </>
  );
}

// ---------------------------------------------------------------------------
function Calendrier({ onCreer, onDispatch }) {
  const { db, index, moi, naviguer, derive } = usePepday();
  const [lundi, setLundi] = useState(() => lundiDe(aujourdhui()));
  const [weekend, setWeekend] = useState(false);
  const jours = Array.from({ length: weekend ? 7 : 5 }, (_, i) => plusJours(lundi, i));
  const auj = aujourdhui();
  const peutCreer = peutCreerRapport(moi);

  const visibles = useMemo(() => db.rapports.filter((r) => peutVoirRapport(moi, r) && r.date >= lundi && r.date <= plusJours(lundi, 6)), [db.rapports, moi, lundi]);

  // Les rangées : les équipes actives (un contremaître seul ne voit que les
  // siennes), plus une rangée « Sans équipe » s'il le faut.
  const equipes = (db.equipes || []).filter((e) => e.actif !== false && (voitTout(moi) || e.contremaitre_id === moi.membreId));
  const sansEquipe = visibles.filter((r) => !r.equipe_id || !index.equipes[r.equipe_id]);
  const rangees = [...equipes.map((e) => ({ id: e.id, equipe: e })), ...(sansEquipe.length ? [{ id: '_', equipe: null }] : [])];
  const cellule = (rangee, jour) => visibles.filter((r) => r.date === jour && (rangee.equipe ? r.equipe_id === rangee.id : (!r.equipe_id || !index.equipes[r.equipe_id])))
    .sort((a, b) => a.numero - b.numero);

  const compteurs = (jour) => {
    const rs = visibles.filter((r) => r.date === jour && !r.abandonne);
    const parStatut = Object.fromEntries(STATUTS_RAPPORT.map((s) => [s.code, 0]));
    rs.forEach((r) => { parStatut[codeStatut(r)] += 1; });
    return { total: rs.length, parStatut };
  };

  return (
    <>
      <div className="pd-carte">
        <div className="pd-carte-titre">
          <div className="pd-flex">
            <button className="pd-btn fantome petit" onClick={() => setLundi(plusJours(lundi, -7))} aria-label="Semaine précédente"><ChevronLeft size={16} /></button>
            <h2 style={{ margin: 0 }}>Semaine du {dateCourte(lundi)}</h2>
            <button className="pd-btn fantome petit" onClick={() => setLundi(plusJours(lundi, 7))} aria-label="Semaine suivante"><ChevronRight size={16} /></button>
            <button className="pd-btn lien" onClick={() => setLundi(lundiDe(auj))}>Aujourd’hui</button>
          </div>
          <div className="pd-actions">
            <label className="pd-case"><input type="checkbox" checked={weekend} onChange={(e) => setWeekend(e.target.checked)} /> Fin de semaine</label>
            <BoutonsCreation onCreer={onCreer} onDispatch={onDispatch} />
          </div>
        </div>
        <div className="pd-flex pd-petit">
          {STATUTS_RAPPORT.filter((s) => s.code !== 'abandonne').map((s) => <span key={s.code} className="pd-legende"><i style={{ background: s.couleur }} />{s.libelle}</span>)}
        </div>
      </div>

      <div className="pd-table-wrap">
        <table className="pd-table pd-calendrier">
          <thead>
            <tr>
              <th className="pd-cal-equipe">Équipe</th>
              {jours.map((j) => {
                const c = compteurs(j);
                const d = new Date(`${j}T12:00:00`);
                return (
                  <th key={j} className={j === auj ? 'pd-cal-auj' : ''}>
                    <div>{JOURS_COURTS[d.getDay()]} {d.getDate()}</div>
                    <div className="pd-cal-compteurs" title="Validés / total">
                      <span>{c.parStatut.valide}/{c.total}</span>
                      {STATUTS_RAPPORT.filter((s) => !['valide', 'abandonne'].includes(s.code) && c.parStatut[s.code]).map((s) => (
                        <span key={s.code} className="pd-cal-pastille" style={{ background: s.couleur }} title={s.libelle}>{c.parStatut[s.code]}</span>
                      ))}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rangees.map((rg) => (
              <tr key={rg.id}>
                <td className="pd-cal-equipe">
                  <div className="pd-gras">{rg.equipe ? rg.equipe.nom : 'Sans équipe'}</div>
                  {rg.equipe && <div className="pd-dim pd-petit">{index.membres[rg.equipe.contremaitre_id]?.nom} · {index.quarts[rg.equipe.quart_id]?.nom || '—'}</div>}
                </td>
                {jours.map((j) => {
                  const rs = cellule(rg, j);
                  return (
                    <td key={j} className={`pd-cal-cellule ${j === auj ? 'pd-cal-auj' : ''}`}>
                      {rs.map((r) => {
                        const s = statutRapport(r);
                        const p = index.projets[r.projet_id];
                        const fl = derive.flagsParRapport[r.id]?.nonLus || 0;
                        return (
                          <button key={r.id} className="pd-cal-carte" style={{ borderLeftColor: s.couleur, opacity: r.abandonne ? 0.5 : 1 }} onClick={() => naviguer('rapport', r.id)} title={`${s.libelle} — ${infoEtape(r.etape).libelle}`}>
                            <div className="pd-gras">{p ? p.numero : 'À planifier'} {fl > 0 && <Flag size={11} color="#c41230" />}</div>
                            <div className="pd-dim">{s.libelle}</div>
                            <div>{argent0(derive.totalParRapport[r.id] || 0)}</div>
                          </button>
                        );
                      })}
                      {peutCreer && rg.equipe && (
                        <button className="pd-cal-ajout" onClick={() => onCreer({ equipeId: rg.id, date: j })} title={rs.length ? 'Ajouter un deuxième rapport' : 'Créer un rapport'}>
                          <Plus size={12} /> {rs.length ? 'Autre rapport' : ''}
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rangees.length === 0 && <div className="pd-section-vide">Aucune équipe. Crée les équipes dans Répertoires &gt; Équipes.</div>}
    </>
  );
}

// ---------------------------------------------------------------------------
function Liste({ onCreer, onDispatch }) {
  const { db, index, moi, naviguer, derive } = usePepday();
  const [f, setF] = useState({ du: '', au: '', projet: '', equipe: '', statut: '', cp: '', surint: '', flags: false, abandonnes: false, q: '' });
  const [limite, setLimite] = useState(PAR_PAGE);

  const visibles = useMemo(() => {
    const q = f.q.trim().toLowerCase();
    return db.rapports
      .filter((r) => peutVoirRapport(moi, r))
      .filter((r) => f.abandonnes || !r.abandonne)
      .filter((r) => (!f.du || r.date >= f.du) && (!f.au || r.date <= f.au))
      .filter((r) => !f.projet || r.projet_id === f.projet)
      .filter((r) => !f.equipe || r.equipe_id === f.equipe)
      .filter((r) => !f.statut || codeStatut(r) === f.statut)
      .filter((r) => !f.cp || index.projets[r.projet_id]?.charge_projet_id === f.cp)
      .filter((r) => !f.surint || index.projets[r.projet_id]?.surintendant_id === f.surint)
      .filter((r) => !f.flags || (derive.flagsParRapport[r.id]?.nonLus || 0) > 0)
      .filter((r) => {
        if (!q) return true;
        const p = index.projets[r.projet_id];
        return [r.titre, r.description, String(r.numero), p?.nom, p?.numero, index.membres[r.contremaitre_id]?.nom, index.equipes?.[r.equipe_id]?.nom]
          .some((v) => (v || '').toLowerCase().includes(q));
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.numero - a.numero);
  }, [db.rapports, moi, f, derive, index]);

  const total = visibles.reduce((s, r) => s + (derive.totalParRapport[r.id] || 0), 0);
  const membresRole = (role) => optionsDe(db.membres.filter((m) => (m.roles || []).includes(role)));

  function exporter() {
    exporterExcel('PEPday - rapports journaliers', [{
      nom: 'Rapports',
      titre: 'Rapports journaliers',
      sousTitre: `${visibles.length} rapports · extrait le ${new Date().toLocaleString('fr-CA')}`,
      colonnes: [
        { entete: 'No', cle: 'numero', largeur: 8 }, { entete: 'Date', cle: 'date', largeur: 12 },
        { entete: 'Projet', cle: 'projet', largeur: 40 }, { entete: 'Titre', cle: 'titre', largeur: 30 },
        { entete: 'Équipe', cle: 'equipe', largeur: 20 }, { entete: 'Contremaître', cle: 'cm', largeur: 20 },
        { entete: 'Quart', cle: 'quart', largeur: 12 }, { entete: 'Statut', cle: 'statut', largeur: 14 },
        { entete: 'Étape', cle: 'etape', largeur: 28 }, { entete: 'Chargé de projet', cle: 'cp', largeur: 20 },
        { entete: 'Surintendant', cle: 'su', largeur: 20 }, { entete: 'Flags non lus', cle: 'flags', largeur: 12, format: 'nombre' },
        { entete: 'Cost', cle: 'cost', largeur: 14, format: 'argent' },
      ],
      lignes: visibles.map((r) => {
        const p = index.projets[r.projet_id];
        return {
          numero: r.numero, date: r.date, projet: p ? `${p.numero} — ${p.nom}` : 'À planifier', titre: r.titre,
          equipe: index.equipes?.[r.equipe_id]?.nom || '', cm: index.membres[r.contremaitre_id]?.nom || '', quart: index.quarts?.[r.quart_id]?.nom || '',
          statut: statutRapport(r).libelle, etape: infoEtape(r.etape).libelle,
          cp: index.membres[p?.charge_projet_id]?.nom || '', su: index.membres[p?.surintendant_id]?.nom || '',
          flags: derive.flagsParRapport[r.id]?.nonLus || 0, cost: Math.round((derive.totalParRapport[r.id] || 0) * 100) / 100,
        };
      }),
      total: { projet: 'Total', cost: Math.round(total * 100) / 100 },
    }]);
  }

  const aGauche = useFiltresAGauche();
  // Les filtres sont montés une seule fois et placés soit dans le rail de
  // gauche, soit dans la carte de tête — jamais les deux.
  const blocFiltres = (
    <div className="pd-filtres">
      <Champ label="Du"><input className="pd-input" type="date" value={f.du} onChange={(e) => setF({ ...f, du: e.target.value })} /></Champ>
      <Champ label="Au"><input className="pd-input" type="date" value={f.au} onChange={(e) => setF({ ...f, au: e.target.value })} /></Champ>
      <Champ label="Projet"><ChampListe options={optionsDe(db.projets, { libelle: (p) => `${p.numero} — ${p.nom}` })} valeur={f.projet} onChange={(v) => setF({ ...f, projet: v })} placeholder="Tous" videLabel="Tous les projets" /></Champ>
      <Champ label="Équipe"><ChampListe options={optionsDe(db.equipes || [])} valeur={f.equipe} onChange={(v) => setF({ ...f, equipe: v })} placeholder="Toutes" videLabel="Toutes" /></Champ>
      <Champ label="Statut">
        <select className="pd-input" value={f.statut} onChange={(e) => setF({ ...f, statut: e.target.value, abandonnes: e.target.value === 'abandonne' || f.abandonnes })}>
          <option value="">Tous</option>
          {STATUTS_RAPPORT.map((s) => <option key={s.code} value={s.code}>{s.libelle}</option>)}
        </select>
      </Champ>
      <Champ label="Recherche"><input className="pd-input" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Titre, no, projet…" /></Champ>
      <Champ label="Chargé de projet"><ChampListe options={membresRole('charge_projet')} valeur={f.cp} onChange={(v) => setF({ ...f, cp: v })} placeholder="Tous" videLabel="Tous" /></Champ>
      <Champ label="Surintendant"><ChampListe options={membresRole('surintendant')} valeur={f.surint} onChange={(v) => setF({ ...f, surint: v })} placeholder="Tous" videLabel="Tous" /></Champ>
    </div>
  );

  return (
    <>
      {aGauche && <RailFiltres>{blocFiltres}</RailFiltres>}
      <div className="pd-carte">
        <div className="pd-carte-titre">
          <h2>Liste des rapports</h2>
          <div className="pd-actions">
            <button className="pd-btn fantome" onClick={exporter}><Download size={15} /> Excel</button>
            <BoutonsCreation onCreer={onCreer} onDispatch={onDispatch} />
          </div>
        </div>
        {!aGauche && blocFiltres}
        <div className="pd-flex" style={{ justifyContent: 'space-between' }}>
          <span className="pd-flex">
            <label className="pd-case"><input type="checkbox" checked={f.flags} onChange={(e) => setF({ ...f, flags: e.target.checked })} /> « Lecture obligatoire » non lue</label>
            <label className="pd-case"><input type="checkbox" checked={f.abandonnes} onChange={(e) => setF({ ...f, abandonnes: e.target.checked })} /> Inclure les abandonnés</label>
          </span>
          <span className="pd-dim pd-petit">{visibles.length} rapport{visibles.length > 1 ? 's' : ''} · {argent(total)}</span>
        </div>
      </div>

      <div className="pd-liste pd-cache-bureau">
        {visibles.slice(0, limite).map((r) => <ItemRapport key={r.id} rapport={r} />)}
      </div>

      <div className="pd-cache-mobile">
        <div className="pd-table-wrap">
          <table className="pd-table">
            <thead>
              <tr><th>No</th><th>Date</th><th>Projet</th><th>Titre</th><th>Équipe</th><th>Quart</th><th>Statut</th><th>Flags</th><th className="num">Cost</th></tr>
            </thead>
            <tbody>
              {visibles.slice(0, limite).map((r) => {
                const p = index.projets[r.projet_id];
                const fl = derive.flagsParRapport[r.id] || { nonLus: 0 };
                return (
                  <tr key={r.id} className="cliquable" onClick={() => naviguer('rapport', r.id)} style={{ opacity: r.abandonne ? 0.6 : 1 }}>
                    <td className="pd-dim">{r.numero}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{dateCourte(r.date)}</td>
                    <td>{p ? `${p.numero} — ${p.nom}` : <span className="pd-dim">À planifier</span>}</td>
                    <td>{r.titre || <span className="pd-dim">—</span>}</td>
                    <td>{index.equipes?.[r.equipe_id]?.nom || index.membres[r.contremaitre_id]?.nom || ''}</td>
                    <td>{index.quarts?.[r.quart_id]?.nom || ''}</td>
                    <td><PastilleStatut rapport={r} /></td>
                    <td><BadgeFlag nonLus={fl.nonLus} /></td>
                    <td className="num">{argent(derive.totalParRapport[r.id] || 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {visibles.length === 0 && <div className="pd-section-vide">Aucun rapport ne correspond aux filtres.</div>}
      {visibles.length > limite && (
        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <button className="pd-btn fantome" onClick={() => setLimite(limite + PAR_PAGE)}>Afficher plus ({visibles.length - limite} autres)</button>
        </div>
      )}
    </>
  );
}

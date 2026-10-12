import { useMemo, useState } from 'react';
import { Route, Plus, Pencil, Trash2, ArrowUp, ArrowDown, X, Phone, Mail, ExternalLink } from 'lucide-react';
import ChampListe from '../commun/ChampListe';
import { usePepday, Modal, Champ, Encadre, PastilleStatut, Jauge, optionsDe } from './ui';
import CarteLeaflet from './CarteLeaflet';
import {
  STATUTS_PROJET, statutProjet, TYPES_ORGANISATION, typeOrganisation, COULEUR_EMPLOYE, COULEUR_EQUIPEMENT,
} from '../../lib/pepday/constantes';
import { budgetDuProjet, argent0, pct } from '../../lib/pepday/couts';
import { peutGererRepertoires } from '../../lib/pepday/workflow';
import { aPosition, lienApplePlans, lienGoogleMaps, distanceKm } from '../../lib/pepday/geo';

// ---------------------------------------------------------------------------
// PEPDAY — CARTE INTERACTIVE ET TRAJETS
//
// RV02 — Quatre couches : projets (couleur selon le statut), organisations
// (par type : clients, fournisseurs, carrières, sous-traitants…), employés et
// équipements (placés sur le projet de leur rapport du jour), avec
// regroupement des marqueurs. Chaque couche a son filtre. Un clic ouvre le
// résumé sous la carte. Les trajets enregistrés s'ouvrent dans Apple Plans ou Google Maps
// avec départ, arrêts et arrivée.
// ---------------------------------------------------------------------------

const TYPES_POINTS = [
  { code: 'projet', libelle: 'Chantier' },
  { code: 'organisation', libelle: 'Organisation' },
];

// Un point de trajet ({ type, ref_id }) avec son nom et sa position actuels.
// On garde la référence plutôt qu'une copie des coordonnées : si l'épingle
// d'un chantier est corrigée, ses trajets suivent.
export function resoudrePoint(p, index) {
  if (!p) return null;
  // « fournisseur » et « sous_traitant » : anciens types de la v1, devenus des organisations.
  const table = p.type === 'projet' ? 'projets' : ['organisation', 'fournisseur', 'sous_traitant'].includes(p.type) ? 'organisations' : null;
  const fiche = table ? index[table][p.ref_id] : null;
  if (!fiche) return p.lat != null ? { nom: p.nom || 'Point', lat: p.lat, lng: p.lng, type: p.type } : null;
  return { nom: p.type === 'projet' ? `${fiche.numero} — ${fiche.nom}` : fiche.nom, lat: fiche.lat, lng: fiche.lng, type: p.type, fiche };
}

// Où se trouvent les employés et les équipements un jour donné : sur le
// projet du rapport où ils sont inscrits (lignes), ou à défaut sur le projet
// du rapport de leur équipe. Décalés en petit cercle autour du chantier pour
// qu'on puisse les distinguer une fois zoomé.
function positionsDuJour(db, index, jour) {
  const rapports = db.rapports.filter((r) => r.date === jour && !r.abandonne && r.projet_id && index.projets[r.projet_id]?.lat != null);
  const emp = new Map();
  const eqp = new Map();
  rapports.forEach((r) => {
    const lignes = db.lignes.filter((l) => l.rapport_id === r.id && l.ref_id && !l.prime_id);
    const placer = (m, id) => { if (!m.has(id)) m.set(id, r); };
    lignes.filter((l) => l.categorie === 'main_oeuvre').forEach((l) => placer(emp, l.ref_id));
    lignes.filter((l) => l.categorie === 'equipement').forEach((l) => placer(eqp, l.ref_id));
    if (!lignes.length && r.equipe_id) {
      db.employes.filter((e) => e.equipe_id === r.equipe_id).forEach((e) => placer(emp, e.id));
      db.equipements.filter((q) => q.equipe_id === r.equipe_id).forEach((q) => placer(eqp, q.id));
    }
  });
  const autour = (map) => {
    const parProjet = {};
    const res = [];
    map.forEach((r, id) => {
      const p = index.projets[r.projet_id];
      const k = (parProjet[p.id] = (parProjet[p.id] || 0) + 1);
      const angle = k * 2.4;
      const rayon = 0.00018 * (1 + Math.floor(k / 8));
      res.push({ id, rapport: r, projet: p, lat: Number(p.lat) + rayon * Math.sin(angle), lng: Number(p.lng) + rayon * 1.4 * Math.cos(angle) });
    });
    return res;
  };
  return { employes: autour(emp), equipements: autour(eqp) };
}

export default function VueCarte() {
  const { db, index, nav, naviguer, moi } = usePepday();
  const [onglet, setOnglet] = useState(nav.onglet === 'trajets' ? 'trajets' : 'carte');
  const [couches, setCouches] = useState({ projets: true, organisations: true, employes: false, equipements: false });
  const [statuts, setStatuts] = useState(() => new Set(['a_venir', 'en_cours', 'suspendu']));
  const [types, setTypes] = useState(() => new Set(['fournisseur', 'carriere', 'sous_traitant', 'signalisation', 'transporteur']));
  const [regrouper, setRegrouper] = useState(true);
  // Jour des couches employés / équipements : le dernier jour qui a des rapports.
  const dernierJour = useMemo(() => {
    const auj = new Date().toISOString().slice(0, 10);
    return db.rapports.filter((r) => r.date <= auj && r.projet_id && !r.abandonne).map((r) => r.date).sort().pop() || auj;
  }, [db.rapports]);
  const [jour, setJour] = useState(dernierJour);
  const [selection, setSelection] = useState(null); // { type, id }
  const [trajetAffiche, setTrajetAffiche] = useState(null);
  const [editionTrajet, setEditionTrajet] = useState(null);

  const positions = useMemo(() => positionsDuJour(db, index, jour), [db, index, jour]);

  const marqueurs = useMemo(() => {
    const m = [];
    if (couches.projets) {
      db.projets.filter((p) => statuts.has(p.statut) && aPosition(p)).forEach((p) => m.push({
        id: `p-${p.id}`, lat: p.lat, lng: p.lng, couleur: statutProjet(p.statut).couleur, titre: `${p.numero} — ${p.nom}`,
        onClick: () => setSelection({ type: 'projet', id: p.id }),
      }));
    }
    if (couches.organisations) {
      (db.organisations || []).filter((x) => x.actif !== false && aPosition(x) && types.has(x.type)).forEach((x) => m.push({
        id: `o-${x.id}`, lat: x.lat, lng: x.lng, couleur: typeOrganisation(x.type).couleur, forme: 'carre', titre: `${x.nom} (${typeOrganisation(x.type).libelle})`,
        onClick: () => setSelection({ type: 'organisation', id: x.id }),
      }));
    }
    if (couches.employes) {
      positions.employes.forEach((x) => {
        const e = index.employes[x.id];
        if (!e) return;
        m.push({ id: `e-${x.id}`, lat: x.lat, lng: x.lng, couleur: COULEUR_EMPLOYE, titre: `${e.nom} — ${x.projet.numero}`, onClick: () => setSelection({ type: 'employe', id: x.id }) });
      });
    }
    if (couches.equipements) {
      positions.equipements.forEach((x) => {
        const q = index.equipements[x.id];
        if (!q) return;
        m.push({ id: `q-${x.id}`, lat: x.lat, lng: x.lng, couleur: COULEUR_EQUIPEMENT, forme: 'carre', titre: `${q.code} — ${x.projet.numero}`, onClick: () => setSelection({ type: 'equipement', id: x.id }) });
      });
    }
    return m;
  }, [db, index, couches, statuts, types, positions]);

  const traces = useMemo(() => {
    if (!trajetAffiche) return [];
    const t = index.trajets[trajetAffiche];
    if (!t) return [];
    return [{ id: t.id, points: (t.points || []).map((p) => resoudrePoint(p, index)).filter(Boolean) }];
  }, [trajetAffiche, index]);

  const sansPosition = db.projets.filter((p) => statuts.has(p.statut) && !aPosition(p));
  const basculer = (setter) => (code) => setter((s) => { const n = new Set(s); if (n.has(code)) n.delete(code); else n.add(code); return n; });
  const basculerStatut = basculer(setStatuts);
  const basculerType = basculer(setTypes);

  return (
    <main className="pd-main pd-l1300">
      <div className="pd-carte">
        <div className="pd-carte-titre">
          <h2>Carte</h2>
          <div className="pd-actions">
            <button className={`pd-btn petit ${onglet === 'carte' ? '' : 'fantome'}`} onClick={() => setOnglet('carte')}>Couches</button>
            <button className={`pd-btn petit ${onglet === 'trajets' ? '' : 'fantome'}`} onClick={() => setOnglet('trajets')}><Route size={14} /> Trajets ({db.trajets.length})</button>
          </div>
        </div>

        {onglet === 'carte' && (
          <>
            <div className="pd-carte-couches">
              <label className="pd-case"><input type="checkbox" checked={couches.projets} onChange={(e) => setCouches({ ...couches, projets: e.target.checked })} /> <strong>Projets</strong></label>
              <label className="pd-case"><input type="checkbox" checked={couches.organisations} onChange={(e) => setCouches({ ...couches, organisations: e.target.checked })} /> <strong>Organisations</strong></label>
              <label className="pd-case"><input type="checkbox" checked={couches.employes} onChange={(e) => setCouches({ ...couches, employes: e.target.checked })} /> <span className="pd-legende"><i style={{ background: COULEUR_EMPLOYE }} /></span><strong>Employés</strong></label>
              <label className="pd-case"><input type="checkbox" checked={couches.equipements} onChange={(e) => setCouches({ ...couches, equipements: e.target.checked })} /> <span className="pd-legende"><i style={{ background: COULEUR_EQUIPEMENT, borderRadius: 2 }} /></span><strong>Équipements</strong></label>
              <span className="pd-espace" />
              <label className="pd-case"><input type="checkbox" checked={regrouper} onChange={(e) => setRegrouper(e.target.checked)} /> Regrouper les marqueurs</label>
            </div>
            {couches.projets && (
              <div className="pd-carte-couches">
                <span className="pd-etiquette">Statuts :</span>
                {STATUTS_PROJET.map((s) => (
                  <label key={s.code} className="pd-case pd-legende"><input type="checkbox" checked={statuts.has(s.code)} onChange={() => basculerStatut(s.code)} /><i style={{ background: s.couleur }} />{s.libelle}</label>
                ))}
              </div>
            )}
            {couches.organisations && (
              <div className="pd-carte-couches">
                <span className="pd-etiquette">Organisations :</span>
                {TYPES_ORGANISATION.map((t) => (
                  <label key={t.code} className="pd-case pd-legende"><input type="checkbox" checked={types.has(t.code)} onChange={() => basculerType(t.code)} /><i style={{ background: t.couleur, borderRadius: 2 }} />{t.libelle}</label>
                ))}
              </div>
            )}
            {(couches.employes || couches.equipements) && (
              <div className="pd-carte-couches">
                <span className="pd-etiquette">Employés et équipements du</span>
                <input className="pd-input" type="date" value={jour} onChange={(e) => setJour(e.target.value || dernierJour)} style={{ width: 180 }} />
                <span className="pd-dim pd-petit">{positions.employes.length} employés · {positions.equipements.length} équipements, placés sur le projet de leur rapport</span>
              </div>
            )}
          </>
        )}

        {onglet === 'trajets' && (
          <ListeTrajets
            trajetAffiche={trajetAffiche}
            onAfficher={(id) => setTrajetAffiche(id === trajetAffiche ? null : id)}
            onModifier={(t) => setEditionTrajet(t)}
            peutModifier={peutGererRepertoires(moi)}
          />
        )}
      </div>

      <CarteLeaflet
        marqueurs={marqueurs}
        traces={traces}
        regrouper={regrouper}
        cleAjustement={`${onglet}-${trajetAffiche || ''}-${Object.values(couches).join('')}-${[...statuts].join()}-${[...types].join()}-${jour}`}
      />

      {selection && <Resume selection={selection} positions={positions} onFermer={() => setSelection(null)} naviguer={naviguer} />}

      {onglet === 'carte' && couches.projets && sansPosition.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <Encadre type="avis">
            {sansPosition.length} projet{sansPosition.length > 1 ? 's' : ''} sans position ne {sansPosition.length > 1 ? 'sont' : 'est'} pas sur la carte :{' '}
            {sansPosition.map((p, i) => (
              <span key={p.id}>{i > 0 && ', '}<button className="pd-btn lien" style={{ padding: 0 }} onClick={() => naviguer('projet', p.id)}>{p.numero}</button></span>
            ))}
          </Encadre>
        </div>
      )}

      {editionTrajet && <FormTrajet trajet={editionTrajet.id ? editionTrajet : null} onFermer={() => setEditionTrajet(null)} onEnregistre={(t) => { setEditionTrajet(null); setTrajetAffiche(t.id); }} />}
    </main>
  );
}

function Resume({ selection, positions, onFermer, naviguer }) {
  const { db, index, derive } = usePepday();
  let contenu = null;
  if (selection.type === 'projet') {
    const p = index.projets[selection.id];
    if (!p) return null;
    const budget = budgetDuProjet(p.id, db.budgets);
    const cout = derive.coutsProjet[p.id]?.total || 0;
    const ratio = budget.total ? cout / budget.total : null;
    const enAttente = db.rapports.filter((r) => r.projet_id === p.id && r.etape < 6).length;
    contenu = (
      <>
        <div className="pd-carte-titre">
          <div><div className="pd-dim pd-petit">Projet {p.numero}</div><h3 style={{ margin: 0 }}>{p.nom}</h3></div>
          <PastilleStatut code={p.statut} />
        </div>
        <div className="pd-grille c3 pd-petit">
          <div><span className="pd-etiquette">Client</span><br />{p.client || '—'}</div>
          <div><span className="pd-etiquette">Chargé de projet</span><br />{index.membres[p.charge_projet_id]?.nom || '—'}</div>
          <div><span className="pd-etiquette">Surintendant</span><br />{index.membres[p.surintendant_id]?.nom || '—'}</div>
        </div>
        <div className="pd-flex" style={{ margin: '10px 0' }}>
          <span>Cost {argent0(cout)} / budget {argent0(budget.total)} ({pct(ratio)})</span>
          <span style={{ flex: 1, maxWidth: 200 }}><Jauge ratio={ratio} /></span>
          <span className="pd-dim pd-petit">{enAttente} rapport{enAttente > 1 ? 's' : ''} en validation</span>
        </div>
        <div className="pd-actions">
          <button className="pd-btn" onClick={() => naviguer('projet', p.id)}>Ouvrir la fiche du projet</button>
          <a className="pd-btn fantome" href={`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`} target="_blank" rel="noreferrer">Itinéraire</a>
        </div>
      </>
    );
  } else if (selection.type === 'employe' || selection.type === 'equipement') {
    const estEmp = selection.type === 'employe';
    const x = estEmp ? index.employes[selection.id] : index.equipements[selection.id];
    const pos = (estEmp ? positions.employes : positions.equipements).find((y) => y.id === selection.id);
    if (!x) return null;
    contenu = (
      <>
        <div className="pd-carte-titre">
          <div><div className="pd-dim pd-petit">{estEmp ? `Employé · ${index.metiers[x.metier_id]?.nom || ''}` : `Équipement · ${x.type || ''}${x.titulaire === 'location_externe' ? ' · location externe' : ''}`}</div><h3 style={{ margin: 0 }}>{estEmp ? x.nom : `${x.code} — ${x.nom}`}</h3></div>
        </div>
        <div className="pd-petit" style={{ lineHeight: 1.7 }}>
          <div>Équipe : {index.equipes[x.equipe_id]?.nom || '—'}</div>
          {pos && <div>Projet du jour : <strong>{pos.projet.numero} — {pos.projet.nom}</strong></div>}
        </div>
        {pos && (
          <div className="pd-actions" style={{ marginTop: 8 }}>
            <button className="pd-btn" onClick={() => naviguer('rapport', pos.rapport.id)}>Ouvrir le rapport</button>
            <button className="pd-btn fantome" onClick={() => naviguer('projet', pos.projet.id)}>Fiche du projet</button>
          </div>
        )}
      </>
    );
  } else {
    const x = index.organisations[selection.id];
    if (!x) return null;
    contenu = (
      <>
        <div className="pd-carte-titre">
          <div><div className="pd-dim pd-petit">{typeOrganisation(x.type).libelle}</div><h3 style={{ margin: 0 }}>{x.nom}</h3></div>
        </div>
        <div className="pd-petit" style={{ lineHeight: 1.7 }}>
          {x.adresse && <div>{x.adresse}</div>}
          {x.contact_nom && <div>Contact : {x.contact_nom}</div>}
          {x.telephone && <div><Phone size={12} /> <a href={`tel:${x.telephone.replace(/[^0-9+]/g, '')}`}>{x.telephone}</a></div>}
          {x.courriel && <div><Mail size={12} /> <a href={`mailto:${x.courriel}`}>{x.courriel}</a></div>}
          {x.notes && <div className="pd-dim">{x.notes}</div>}
        </div>
        <div className="pd-actions" style={{ marginTop: 8 }}>
          <a className="pd-btn fantome" href={`https://maps.apple.com/?daddr=${x.lat},${x.lng}&dirflg=d`} target="_blank" rel="noreferrer">Apple Plans</a>
          <a className="pd-btn fantome" href={`https://www.google.com/maps/dir/?api=1&destination=${x.lat},${x.lng}`} target="_blank" rel="noreferrer">Google Maps</a>
          <button className="pd-btn lien" onClick={() => naviguer('repertoires', null, { onglet: 'organisations' })}>Voir le répertoire</button>
        </div>
      </>
    );
  }
  return (
    <div className="pd-carte" style={{ marginTop: 12, position: 'relative' }}>
      <button className="pd-btn fantome petit" style={{ position: 'absolute', top: 10, right: 10 }} onClick={onFermer} aria-label="Fermer"><X size={14} /></button>
      <div style={{ paddingRight: 40 }}>{contenu}</div>
    </div>
  );
}

function ListeTrajets({ trajetAffiche, onAfficher, onModifier, peutModifier }) {
  const { db, index, actions } = usePepday();
  const [filtreProjet, setFiltreProjet] = useState('');
  const trajets = db.trajets.filter((t) => !filtreProjet || t.projet_id === filtreProjet);
  return (
    <div>
      <div className="pd-flex" style={{ marginBottom: 10, justifyContent: 'space-between' }}>
        <div style={{ minWidth: 220, flex: 1, maxWidth: 380 }}>
          <ChampListe options={optionsDe(db.projets, { libelle: (p) => `${p.numero} — ${p.nom}` })} valeur={filtreProjet} onChange={setFiltreProjet} videLabel="Tous les projets" placeholder="Filtrer par projet" />
        </div>
        {peutModifier && <button className="pd-btn petit" onClick={() => onModifier({})}><Plus size={14} /> Nouveau trajet</button>}
      </div>
      {trajets.length === 0 && <div className="pd-section-vide">Aucun trajet.</div>}
      {trajets.map((t) => {
        const pts = (t.points || []).map((p) => resoudrePoint(p, index));
        const valides = pts.filter(aPosition);
        let km = 0;
        for (let i = 1; i < valides.length; i += 1) km += distanceKm(valides[i - 1], valides[i]) || 0;
        const apple = lienApplePlans(pts);
        const google = lienGoogleMaps(pts);
        return (
          <div key={t.id} className="pd-ligne" style={{ borderColor: trajetAffiche === t.id ? 'var(--pd-rouge)' : undefined }}>
            <div className="pd-ligne-haut">
              <div style={{ minWidth: 0 }}>
                <div className="pd-ligne-nom">{t.nom}</div>
                <div className="pd-ligne-detail">{pts.map((p) => p?.nom || 'point introuvable').join(' → ')}</div>
                <div className="pd-ligne-detail">{t.projet_id && index.projets[t.projet_id] ? `Projet ${index.projets[t.projet_id].numero} · ` : ''}≈ {Math.round(km)} km à vol d’oiseau{t.notes ? ` · ${t.notes}` : ''}</div>
              </div>
            </div>
            <div className="pd-actions" style={{ marginTop: 8 }}>
              {apple ? <a className="pd-btn petit" href={apple} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Ouvrir dans Apple Plans</a> : null}
              {google ? <a className="pd-btn petit" href={google} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Ouvrir dans Google Maps</a> : null}
              {!apple && <span className="pd-dim pd-petit">Il faut au moins deux points positionnés.</span>}
              <button className="pd-btn fantome petit" onClick={() => onAfficher(t.id)}>{trajetAffiche === t.id ? 'Masquer' : 'Voir sur la carte'}</button>
              {peutModifier && <button className="pd-btn fantome petit" onClick={() => onModifier(t)} aria-label="Modifier"><Pencil size={13} /></button>}
              {peutModifier && (
                <button className="pd-btn fantome petit" aria-label="Supprimer" onClick={async () => {
                  if (!window.confirm(`Supprimer le trajet « ${t.nom} » ?`)) return;
                  await actions.supprimer('trajets', t.id);
                }}
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FormTrajet({ trajet, onFermer, onEnregistre }) {
  const { db, index, actions, moi } = usePepday();
  const [f, setF] = useState(() => ({ nom: trajet?.nom || '', projet_id: trajet?.projet_id || '', notes: trajet?.notes || '', points: trajet?.points ? [...trajet.points] : [] }));
  const [ajout, setAjout] = useState({ type: 'projet', ref_id: '' });
  const [erreur, setErreur] = useState('');

  const optionsAjout = ajout.type === 'projet'
    ? optionsDe(db.projets.filter((p) => aPosition(p)), { libelle: (p) => `${p.numero} — ${p.nom}` })
    : optionsDe((db.organisations || []).filter((x) => aPosition(x) && x.actif !== false), { detail: (x) => typeOrganisation(x.type).libelle });

  const deplacer = (i, d) => setF((x) => {
    const pts = [...x.points];
    const j = i + d;
    if (j < 0 || j >= pts.length) return x;
    [pts[i], pts[j]] = [pts[j], pts[i]];
    return { ...x, points: pts };
  });

  async function enregistrer() {
    if (!f.nom.trim()) { setErreur('Donne un nom au trajet.'); return; }
    if (f.points.length < 2) { setErreur('Un trajet a au moins un départ et une arrivée.'); return; }
    try {
      const row = { nom: f.nom.trim(), projet_id: f.projet_id || null, notes: f.notes.trim(), points: f.points };
      const t = trajet ? await actions.modifier('trajets', trajet.id, row) : await actions.inserer('trajets', { ...row, created_by: moi.membreId });
      actions.notifier('Trajet enregistré.');
      onEnregistre(t);
    } catch (e) { setErreur(e.message || String(e)); }
  }

  return (
    <Modal titre={trajet ? 'Modifier le trajet' : 'Nouveau trajet'} onFermer={onFermer}>
      <Champ label="Nom"><input className="pd-input" value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} placeholder="Ex. : Chantier → site de disposition" /></Champ>
      <Champ label="Projet (facultatif)">
        <ChampListe options={optionsDe(db.projets, { libelle: (p) => `${p.numero} — ${p.nom}` })} valeur={f.projet_id} onChange={(v) => setF({ ...f, projet_id: v })} />
      </Champ>
      <div className="pd-etiquette" style={{ marginBottom: 6 }}>Points, dans l’ordre (départ, arrêts, arrivée)</div>
      {f.points.map((p, i) => {
        const r = resoudrePoint(p, index);
        return (
          <div key={`${p.type}-${p.ref_id}-${i}`} className="pd-flex" style={{ flexWrap: 'nowrap', padding: '6px 0', borderBottom: '1px solid var(--pd-ligne)' }}>
            <span className="pd-tag">{i === 0 ? 'Départ' : i === f.points.length - 1 ? 'Arrivée' : `Arrêt ${i}`}</span>
            <span style={{ flex: 1, minWidth: 0 }}>{r?.nom || 'Point introuvable'}</span>
            <button className="pd-btn fantome petit" onClick={() => deplacer(i, -1)} aria-label="Monter"><ArrowUp size={13} /></button>
            <button className="pd-btn fantome petit" onClick={() => deplacer(i, 1)} aria-label="Descendre"><ArrowDown size={13} /></button>
            <button className="pd-btn fantome petit" onClick={() => setF({ ...f, points: f.points.filter((_, k) => k !== i) })} aria-label="Retirer"><X size={13} /></button>
          </div>
        );
      })}
      <div className="pd-grille c2" style={{ marginTop: 10 }}>
        <Champ label="Type de point">
          <select className="pd-input" value={ajout.type} onChange={(e) => setAjout({ type: e.target.value, ref_id: '' })}>
            {TYPES_POINTS.map((t) => <option key={t.code} value={t.code}>{t.libelle}</option>)}
          </select>
        </Champ>
        <Champ label="Lieu">
          <ChampListe options={optionsAjout} valeur={ajout.ref_id} onChange={(v) => { if (v) { setF((x) => ({ ...x, points: [...x.points, { type: ajout.type, ref_id: v }] })); setAjout({ ...ajout, ref_id: '' }); } }} placeholder="Choisir pour ajouter…" />
        </Champ>
      </div>
      <Champ label="Notes (consignes, limite de charge…)"><textarea className="pd-input" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Champ>
      {erreur && <Encadre type="err">{erreur}</Encadre>}
      <div className="pd-actions droite">
        <button className="pd-btn fantome" onClick={onFermer}>Annuler</button>
        <button className="pd-btn" onClick={enregistrer}>Enregistrer</button>
      </div>
    </Modal>
  );
}

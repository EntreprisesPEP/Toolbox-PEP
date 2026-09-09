import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import GardeConnexion from '../../components/commun/GardeConnexion';
import EnTeteApp from '../../components/commun/EnTeteApp';
import { PALETTES, useModePep } from '../../components/commun/ThemeToolbox';
import {
  Plus, Trash2, X, ChevronLeft, ChevronRight, CheckCircle2,
  Info, RotateCcw, Download, Truck,
} from 'lucide-react';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Client sur le schema transport (journees, camions, journal, taux, objectifs)
const supabaseT = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { db: { schema: 'transport' } });
// Client sur liste_projets — la liste des projets se maintient toute seule,
// on ne la recopie plus dans le code comme dans le prototype.
const supabaseLP = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { db: { schema: 'liste_projets' } });

const THEMES = PALETTES;

const BRAND_RED = '#c41230';
const VERT = '#019155';

// ---------------------------------------------------------------------------
// LES TROIS TYPES DE CAMION. L'ordre est aussi celui d'affichage partout.
// ---------------------------------------------------------------------------
const TYPES = ['12 roues', '2 essieux', '3 essieux'];
// Ces trois couleurs doivent rester lisibles en texte blanc SUR FOND CLAIR
// ET SUR FOND FONCE — les etiquettes servent dans les deux modes. Le navy
// du Toolbox (#14213d) disparaissait sur le fond de nuit : d'ou le bleu
// ardoise plus clair pour les 12 roues.
const COULEUR_TYPE = {
  '12 roues': '#3d5a80',
  '2 essieux': '#2e86c1',
  '3 essieux': '#c41230',
};

const NB_COLONNES_DEFAUT = 10;
const NB_LIGNES_DEFAUT = 10;

// Fenetre chargee au demarrage. Au-dela, l'onglet Analyse va rechercher
// lui-meme ce qu'il lui faut — inutile de tirer trois ans de donnees pour
// afficher la semaine courante.
const JOURS_CHARGES = 400;

// ---------------------------------------------------------------------------
// DATES
// ---------------------------------------------------------------------------
function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function aujourdhuiISO() {
  return toISO(new Date());
}
function deISO(iso) {
  const [y, m, d] = (iso || '').split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
function ajouterJours(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}
function lundiDe(date) {
  const d = new Date(date);
  const jour = d.getDay(); // 0 = dimanche
  d.setDate(d.getDate() + (jour === 0 ? -6 : 1 - jour));
  d.setHours(0, 0, 0, 0);
  return d;
}
// « 7 sept. » plutot que « 09-07 » : en fr-CA le format court sort en
// mois-jour, ce qui se lit comme une date americaine et prete a confusion.
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
function formatDateCourte(date) {
  return `${date.getDate()} ${MOIS_COURTS[date.getMonth()]}`;
}
function formatDateLongue(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function formatHorodatage(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('fr-CA', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// HEURES ET DUREES
//
// On saisit l'heure a laquelle le camion QUITTE le chantier. La duree d'un
// voyage, c'est l'ecart entre deux departs consecutifs du meme camion —
// rien a calculer sur le terrain. Un depart seul ne donne donc aucune duree :
// il faut le suivant pour boucler le voyage.
// ---------------------------------------------------------------------------
function heureEnMinutes(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function formatDuree(minutes) {
  if (minutes === null || minutes === undefined) return '—';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}h${String(m).padStart(2, '0')}`;
}

// Accepte plusieurs facons d'ecrire une heure : 7:05, 7 05, 7.05, 7,05,
// 0705, ou juste 7 pour 7:00. Renvoie null si c'est illisible.
function normaliserHeure(brut) {
  const v = String(brut || '').trim();
  if (v === '') return '';
  let candidat = v;
  if (/^[0-9]+$/.test(v)) {
    if (v.length <= 2) candidat = `${v}:00`;
    else if (v.length === 3) candidat = `${v[0]}:${v.slice(1)}`;
    else if (v.length === 4) candidat = `${v.slice(0, 2)}:${v.slice(2)}`;
  } else {
    candidat = v.replace(/[.,\s]+/g, ':');
  }
  const m = candidat.match(/^([0-9]{1,2}):([0-9]{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h > 23 || min > 59) return null;
  return `${h}:${String(min).padStart(2, '0')}`;
}

// Durees des voyages boucles d'un camion, dans l'ordre.
function dureesCamion(camion) {
  const remplies = [];
  (camion.heures || []).forEach((h) => {
    const min = heureEnMinutes(h);
    if (min !== null) remplies.push(min);
  });
  const durees = [];
  for (let i = 1; i < remplies.length; i++) {
    let ecart = remplies[i] - remplies[i - 1];
    if (ecart < 0) ecart += 24 * 60; // passage de minuit
    durees.push(ecart);
  }
  return durees;
}

// ---------------------------------------------------------------------------
// LES TAUX EN VIGUEUR A UNE DATE
//
// Un taux n'est pas une valeur, c'est une valeur avec une date de debut. On
// prend la version la plus recente dont la date ne depasse pas la journee
// saisie. Consequence voulue : une renegociation de contrat ne reecrit pas
// l'historique — les journees d'avant gardent leurs anciens chiffres.
// ---------------------------------------------------------------------------
function tauxALaDate(lignesTaux, dateISO) {
  const resultat = {};
  TYPES.forEach((type) => {
    const candidates = lignesTaux
      .filter((t) => t.type === type && (!dateISO || t.date_effet <= dateISO))
      .sort((a, b) => (a.date_effet < b.date_effet ? 1 : -1));
    const choisie = candidates[0] || null;
    resultat[type] = choisie
      ? {
          taux: Number(choisie.taux_horaire),
          tonnage: Number(choisie.tonnage),
          peage: Number(choisie.peage),
          dateEffet: choisie.date_effet,
        }
      : { taux: 0, tonnage: 0, peage: 0, dateEffet: null };
  });
  return resultat;
}

function multiplicateurPeage(peage) {
  if (peage === 'aller-retour') return 2;
  if (peage === 'aller') return 1;
  return 0;
}

// ---------------------------------------------------------------------------
// LE CALCUL
//
//   cout d'un voyage    = (duree en heures) x taux horaire + peage
//   $ / Tm              = cout moyen du voyage / tonnage moyen
//
// `parDate` : quand on agrege plusieurs journees, chacune doit etre calculee
// avec le taux de SA date. On passe donc une fonction qui rend les taux pour
// une date donnee, pas un jeu de taux fige.
// ---------------------------------------------------------------------------
function calculerResume(entrees, tauxPourDate, filtreType = 'tous') {
  const parType = {};
  TYPES.forEach((t) => { parType[t] = []; });

  entrees.forEach(({ dateISO, camions }) => {
    const params = tauxPourDate(dateISO);
    (camions || []).forEach((camion) => {
      if (!camion.type || !parType[camion.type]) return;
      if (filtreType !== 'tous' && camion.type !== filtreType) return;
      const p = params[camion.type];
      const peageParVoyage = p.peage * multiplicateurPeage(camion.peage);
      dureesCamion(camion).forEach((duree) => {
        parType[camion.type].push({
          duree, peage: peageParVoyage, taux: p.taux, tonnage: p.tonnage,
        });
      });
    });
  });

  const typesAffiches = filtreType === 'tous' ? TYPES : [filtreType];
  let totalVoyages = 0;
  let coutTotal = 0;
  let tonnageTotal = 0;
  let peageTotal = 0;
  const toutesDurees = [];
  const resultatParType = {};

  typesAffiches.forEach((type) => {
    const liste = parType[type];
    const nb = liste.length;
    let dureeMoy = null;
    let coutParVoyage = null;
    let dollarParTm = null;
    let tonnageMoy = null;

    if (nb > 0) {
      dureeMoy = liste.reduce((a, e) => a + e.duree, 0) / nb;
      const peageMoy = liste.reduce((a, e) => a + e.peage, 0) / nb;
      const tauxMoy = liste.reduce((a, e) => a + e.taux, 0) / nb;
      tonnageMoy = liste.reduce((a, e) => a + e.tonnage, 0) / nb;
      coutParVoyage = (dureeMoy / 60) * tauxMoy + peageMoy;
      dollarParTm = tonnageMoy > 0 ? coutParVoyage / tonnageMoy : null;

      liste.forEach((e) => {
        coutTotal += (e.duree / 60) * e.taux + e.peage;
        tonnageTotal += e.tonnage;
        peageTotal += e.peage;
        toutesDurees.push(e.duree);
      });
      totalVoyages += nb;
    }

    resultatParType[type] = { nb, dureeMoy, coutParVoyage, tonnage: tonnageMoy, dollarParTm };
  });

  return {
    totalVoyages,
    coutTotal,
    tonnageTotal,
    peageTotal,
    dureeMoyGlobale: toutesDurees.length
      ? toutesDurees.reduce((a, b) => a + b, 0) / toutesDurees.length
      : null,
    dollarParTmGlobal: tonnageTotal > 0 ? coutTotal / tonnageTotal : null,
    parType: resultatParType,
    typesAffiches,
  };
}

function argent(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return '$' + n.toFixed(2);
}

// ---------------------------------------------------------------------------
// PETITS MORCEAUX D'INTERFACE
// ---------------------------------------------------------------------------
function Metrique({ th, label, valeur, surligne }) {
  return (
    // th.btnBg est fonce dans les deux modes (#14213d le jour, #33405e la
    // nuit) : le texte blanc de la tuile mise en avant reste lisible partout.
    // th.accent, lui, devient bleu pale la nuit — blanc sur pale, illisible.
    <div style={{
      background: surligne ? th.btnBg : th.panelAlt,
      border: `1px solid ${surligne ? th.btnBg : th.line}`,
      borderRadius: 6, padding: '12px 14px', minWidth: 140, flex: '1 1 140px',
    }}>
      <div style={{
        fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.5,
        color: surligne ? 'rgba(255,255,255,0.8)' : th.textDim, marginBottom: 4,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 21, fontWeight: 700,
        color: surligne ? '#fff' : th.text,
        fontFamily: "Oswald, 'Arial Narrow', sans-serif",
      }}>
        {valeur}
      </div>
    </div>
  );
}

function EtiquetteType({ type }) {
  if (!type) return <span style={{ color: '#8a93a8' }}>—</span>;
  return (
    <span style={{
      background: COULEUR_TYPE[type] || '#6b7488', color: '#fff',
      borderRadius: 12, padding: '2px 10px', fontSize: 11, fontWeight: 700,
      whiteSpace: 'nowrap',
    }}>
      {type}
    </span>
  );
}

function BoutonOnglet({ actif, onClick, children, th }) {
  return (
    <button onClick={onClick} style={{
      background: actif ? BRAND_RED : 'transparent',
      color: actif ? '#fff' : th.textDim,
      border: actif ? 'none' : `1px solid ${th.line}`,
      padding: '8px 16px', borderRadius: 20, fontSize: 12.5,
      textTransform: 'uppercase', letterSpacing: 0.5, cursor: 'pointer', fontWeight: 600,
    }}>
      {children}
    </button>
  );
}

function Avis({ th, ton, children }) {
  const couleurs = ton === 'erreur'
    ? { fond: th.errBg, texte: th.errTexte, bord: th.errTexte }
    : ton === 'ok'
      ? { fond: th.okBg, texte: VERT, bord: th.okLigne }
      : { fond: th.avisBg, texte: th.avisTexte, bord: th.avisTexte };
  return (
    <div style={{
      background: couleurs.fond, color: couleurs.texte,
      border: `1px solid ${couleurs.bord}`, borderRadius: 6,
      padding: '10px 14px', fontSize: 12.5, marginBottom: 14,
    }}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ONGLET 1 — SAISIE DU JOUR
// ---------------------------------------------------------------------------
function GrilleJour({
  th, mode, projets, projetNo, setProjetNo, dateJour, setDateJour,
  camions, setCamions, nbColonnes, setNbColonnes, params, dateEffet,
  onConfirmer, enregistrement, journeeExistante, message,
}) {
  const [erreurHeure, setErreurHeure] = useState('');

  const inputStyle = {
    width: '100%', padding: '7px 9px', border: `1px solid ${th.line}`,
    background: th.inputBg, color: th.text, fontSize: 13, borderRadius: 4,
  };

  function majCamion(id, champ, valeur) {
    setCamions((prev) => prev.map((c) => (c.id === id ? { ...c, [champ]: valeur } : c)));
  }

  function majHeure(id, index, brut) {
    const normalisee = normaliserHeure(brut);
    if (normalisee === null) {
      setErreurHeure("Écris l'heure sur 24 h. Formats acceptés : 7:05, 7 05, 7.05, 0705, ou juste 7 pour 7:00.");
      return;
    }
    setErreurHeure('');
    setCamions((prev) => prev.map((c) => {
      if (c.id !== id) return c;
      const heures = [...c.heures];
      while (heures.length < nbColonnes) heures.push('');
      heures[index] = normalisee;
      return { ...c, heures };
    }));
  }

  function basculerPeage(id, mode2) {
    setCamions((prev) => prev.map((c) => {
      if (c.id !== id) return c;
      return { ...c, peage: c.peage === mode2 ? 'aucun' : mode2 };
    }));
  }

  function ajouterCamion() {
    setCamions((prev) => [...prev, creerCamion(prev.length, nbColonnes)]);
  }

  function retirerCamion(id) {
    const camion = camions.find((c) => c.id === id);
    const aDesDonnees = camion && (
      camion.libelle.trim() !== '' || camion.plaque.trim() !== '' ||
      (camion.heures || []).some((h) => h)
    );
    if (camions.length <= 1) return;
    if (aDesDonnees && !window.confirm('Il y a des données dans cette ligne. La retirer quand même ?')) return;
    setCamions((prev) => prev.filter((c) => c.id !== id));
  }

  function ajouterColonne() {
    setNbColonnes((n) => n + 1);
    setCamions((prev) => prev.map((c) => ({ ...c, heures: [...c.heures, ''] })));
  }

  function retirerColonne(index) {
    if (nbColonnes <= 1) return;
    const aDesDonnees = camions.some((c) => c.heures[index]);
    if (aDesDonnees && !window.confirm('Il y a des données dans cette colonne. La retirer quand même ?')) return;
    setNbColonnes((n) => n - 1);
    setCamions((prev) => prev.map((c) => {
      const heures = [...c.heures];
      heures.splice(index, 1);
      return { ...c, heures };
    }));
  }

  const resume = calculerResume(
    [{ dateISO: dateJour, camions }],
    () => params,
  );

  const projetChoisi = projets.find((p) => p.no === projetNo) || null;

  return (
    <div>
      {message && <Avis th={th} ton={message.ton}>{message.texte}</Avis>}

      {journeeExistante && (
        <Avis th={th} ton="avis">
          Une fiche existe déjà pour ce projet à cette date. En confirmant, tu la remplaces —
          l'ancienne version n'est pas conservée, mais on garde la trace de qui a enregistré quoi.
        </Avis>
      )}

      <div style={{
        background: th.panel, border: `1px solid ${th.line}`, borderRadius: 6,
        padding: 18, marginBottom: 16, boxShadow: th.ombre,
      }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: '2 1 320px' }}>
            <label style={{
              fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5,
              color: th.textDim, display: 'block', marginBottom: 6,
            }}>
              Numéro de projet
            </label>
            <select value={projetNo} onChange={(e) => setProjetNo(e.target.value)} style={inputStyle}>
              <option value="">— Choisir un projet —</option>
              {projets.map((p) => (
                <option key={p.no} value={p.no}>{p.no} — {p.nom}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: '1 1 180px' }}>
            <label style={{
              fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5,
              color: th.textDim, display: 'block', marginBottom: 6,
            }}>
              Date de la journée
            </label>
            <input type="date" value={dateJour} onChange={(e) => setDateJour(e.target.value)}
              style={{ ...inputStyle, colorScheme: mode === 'night' ? 'dark' : 'light' }} />
          </div>
        </div>
        {projetChoisi && (
          <div style={{ marginTop: 12, fontSize: 12.5, color: th.textDim }}>
            {projetChoisi.adresse ? `${projetChoisi.adresse} · ` : ''}
            Chargé de projet : <strong style={{ color: th.text }}>{projetChoisi.charge || '—'}</strong>
            {projetChoisi.surintendant ? <> · Surintendant : <strong style={{ color: th.text }}>{projetChoisi.surintendant}</strong></> : null}
          </div>
        )}
      </div>

      <div style={{
        background: th.panel, border: `1px solid ${th.line}`, borderRadius: 6,
        padding: 18, marginBottom: 16, boxShadow: th.ombre,
      }}>
        <h2 style={{
          fontSize: 15, margin: '0 0 6px', textTransform: 'uppercase',
          letterSpacing: 0.5, fontFamily: "Oswald, 'Arial Narrow', sans-serif",
        }}>
          Voyages par camion
        </h2>
        <p style={{ fontSize: 12.5, color: th.textDim, margin: '0 0 14px' }}>
          Pour chaque camion, note l'heure à laquelle il <strong>quitte le chantier</strong> à chaque voyage.
          La durée se calcule toute seule : c'est l'écart entre deux départs consécutifs.
        </p>

        {erreurHeure && <Avis th={th} ton="erreur">{erreurHeure}</Avis>}

        <div style={{
          background: th.panelAlt, border: `1px solid ${th.line}`, borderRadius: 4,
          padding: '9px 12px', marginBottom: 12, fontSize: 12, color: th.textDim,
        }}>
          <strong style={{ color: th.text }}>Péage A25 :</strong>{' '}
          <em>Aller</em> = chargé une fois par voyage · <em>A-R</em> = chargé deux fois ·
          aucune case cochée = ce camion ne paie pas le péage.
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12.5 }}>
            <thead>
              <tr>
                <th style={enTeteStyle(th, 34)} />
                <th style={enTeteStyle(th, 110)}>Camion</th>
                <th style={enTeteStyle(th, 100)}>Plaque</th>
                <th style={enTeteStyle(th, 120)}>Type</th>
                <th style={enTeteStyle(th, 110)}>Péage A25</th>
                {Array.from({ length: nbColonnes }, (_, i) => (
                  <th key={i} style={{ ...enTeteStyle(th, 82), whiteSpace: 'nowrap' }}>
                    Voyage {i + 1}
                    {nbColonnes > 1 && (
                      <button onClick={() => retirerColonne(i)} title="Retirer cette colonne" style={{
                        background: 'none', border: 'none', color: th.textDim,
                        cursor: 'pointer', padding: '0 0 0 4px', fontSize: 12,
                      }}>
                        <X size={11} style={{ verticalAlign: 'middle' }} />
                      </button>
                    )}
                  </th>
                ))}
                <th style={enTeteStyle(th, 46)}>
                  <button onClick={ajouterColonne} title="Ajouter une colonne voyage" style={{
                    background: 'none', border: `1px solid ${th.line}`, color: th.text,
                    borderRadius: 4, cursor: 'pointer', padding: '2px 6px',
                  }}>
                    <Plus size={12} />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {camions.map((c) => (
                <tr key={c.id}>
                  <td style={celluleStyle(th)}>
                    <button onClick={() => retirerCamion(c.id)} title="Retirer ce camion" style={{
                      background: 'none', border: 'none', color: th.textDim, cursor: 'pointer', padding: 2,
                    }}>
                      <Trash2 size={13} />
                    </button>
                  </td>
                  <td style={celluleStyle(th)}>
                    <input value={c.libelle} placeholder="Camion" style={inputStyle}
                      onChange={(e) => majCamion(c.id, 'libelle', e.target.value)} />
                  </td>
                  <td style={celluleStyle(th)}>
                    <input value={c.plaque} placeholder="Plaque" style={inputStyle}
                      onChange={(e) => majCamion(c.id, 'plaque', e.target.value)} />
                  </td>
                  <td style={celluleStyle(th)}>
                    <select value={c.type || ''} style={inputStyle}
                      onChange={(e) => majCamion(c.id, 'type', e.target.value || null)}>
                      <option value="">— Choisir —</option>
                      {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                  <td style={celluleStyle(th)}>
                    <label style={{ display: 'block', fontSize: 11, color: th.textDim, cursor: 'pointer' }}>
                      <input type="checkbox" checked={c.peage === 'aller'}
                        onChange={() => basculerPeage(c.id, 'aller')} /> Aller
                    </label>
                    <label style={{ display: 'block', fontSize: 11, color: th.textDim, cursor: 'pointer' }}>
                      <input type="checkbox" checked={c.peage === 'aller-retour'}
                        onChange={() => basculerPeage(c.id, 'aller-retour')} /> A-R
                    </label>
                  </td>
                  {Array.from({ length: nbColonnes }, (_, i) => (
                    <td key={i} style={celluleStyle(th)}>
                      <input
                        defaultValue={c.heures[i] || ''}
                        placeholder="—"
                        style={{ ...inputStyle, textAlign: 'center', padding: '7px 4px' }}
                        onBlur={(e) => majHeure(c.id, i, e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                      />
                    </td>
                  ))}
                  <td style={celluleStyle(th)} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button onClick={ajouterCamion} style={{
          marginTop: 12, background: 'none', border: `1px solid ${th.line}`, color: th.text,
          borderRadius: 4, padding: '7px 14px', cursor: 'pointer', fontSize: 12.5,
          display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600,
        }}>
          <Plus size={14} /> Ajouter un camion
        </button>
      </div>

      <ResumeJour th={th} resume={resume} params={params} dateEffet={dateEffet} />

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <button onClick={onConfirmer} disabled={enregistrement} style={{
          background: enregistrement ? th.textDim : BRAND_RED, color: '#fff', border: 'none',
          padding: '13px 26px', borderRadius: 4, cursor: enregistrement ? 'default' : 'pointer',
          fontSize: 14, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase',
          fontFamily: "Oswald, 'Arial Narrow', sans-serif",
          display: 'inline-flex', alignItems: 'center', gap: 9,
        }}>
          <CheckCircle2 size={17} />
          {enregistrement ? 'Enregistrement…' : 'Confirmer la journée'}
        </button>
      </div>
    </div>
  );
}

function enTeteStyle(th, largeur) {
  return {
    fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.5,
    color: th.textDim, fontWeight: 700, textAlign: 'left',
    padding: '6px 5px', borderBottom: `1px solid ${th.line}`,
    minWidth: largeur, whiteSpace: 'nowrap',
  };
}
function celluleStyle(th) {
  return { padding: '4px 5px', borderBottom: `1px solid ${th.line}`, verticalAlign: 'middle' };
}

function ResumeJour({ th, resume, params, dateEffet }) {
  return (
    <div style={{
      background: th.panel, border: `1px solid ${th.line}`, borderRadius: 6,
      padding: 18, boxShadow: th.ombre,
    }}>
      <h2 style={{
        fontSize: 15, margin: '0 0 14px', textTransform: 'uppercase',
        letterSpacing: 0.5, fontFamily: "Oswald, 'Arial Narrow', sans-serif",
      }}>
        Résumé de fin de journée
      </h2>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
        <Metrique th={th} label="Voyages complets" valeur={resume.totalVoyages} />
        <Metrique th={th} label="Temps moyen / voyage" valeur={formatDuree(resume.dureeMoyGlobale)} />
        <Metrique th={th} label="Tonnage transporté (est.)" valeur={resume.tonnageTotal > 0 ? `${resume.tonnageTotal.toFixed(0)} Tm` : '—'} />
        <Metrique th={th} label="Coût transport (est.)" valeur={argent(resume.coutTotal > 0 ? resume.coutTotal : null)} />
        <Metrique th={th} label="Péage A25 (inclus)" valeur={argent(resume.peageTotal > 0 ? resume.peageTotal : null)} />
        <Metrique th={th} label="$ / Tm moyen" valeur={argent(resume.dollarParTmGlobal)} surligne />
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12.5 }}>
          <thead>
            <tr>
              {['Type de camion', 'Voyages', 'Temps moyen', 'Coût moyen / voyage', 'Tonnage moyen', '$ / Tm'].map((h) => (
                <th key={h} style={enTeteStyle(th, 90)}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {resume.typesAffiches.map((type) => {
              const t = resume.parType[type];
              return (
                <tr key={type}>
                  <td style={celluleStyle(th)}><EtiquetteType type={type} /></td>
                  <td style={celluleStyle(th)}>{t.nb}</td>
                  <td style={celluleStyle(th)}>{formatDuree(t.dureeMoy)}</td>
                  <td style={celluleStyle(th)}>{argent(t.coutParVoyage)}</td>
                  <td style={celluleStyle(th)}>{t.tonnage ? `${t.tonnage.toFixed(0)} Tm` : '—'}</td>
                  <td style={celluleStyle(th)}><strong>{argent(t.dollarParTm)}</strong></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 14, fontSize: 11.5, color: th.textDim, lineHeight: 1.7 }}>
        Taux appliqués : ceux en vigueur depuis le <strong style={{ color: th.text }}>{formatDateLongue(dateEffet)}</strong>{' '}
        — {TYPES.map((t) => `${t} ${params[t].taux}$/h · ${params[t].tonnage} Tm · péage ${params[t].peage}$`).join(' | ')}.
        <br />
        <strong style={{ color: th.text }}>Coût d'un voyage</strong> = durée × taux horaire + péage.{' '}
        <strong style={{ color: th.text }}>$ / Tm</strong> = coût moyen du voyage ÷ tonnage moyen.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ONGLET 2 — VUE HEBDOMADAIRE
// ---------------------------------------------------------------------------
function VueSemaine({ th, mode, journees, lignesTaux, onOuvrir, onInfo }) {
  const [lundi, setLundi] = useState(() => lundiDe(new Date()));

  const jours = Array.from({ length: 7 }, (_, i) => ajouterJours(lundi, i));
  const isoJours = jours.map(toISO);
  const dimanche = jours[6];

  const projetsAvecDonnees = useMemo(() => {
    const dedans = journees.filter((j) => isoJours.includes(j.date_jour));
    return [...new Set(dedans.map((j) => j.projet_no))].sort();
  }, [journees, isoJours.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  const boutonNav = {
    background: 'none', border: `1px solid ${th.line}`, color: th.text,
    borderRadius: 4, padding: 6, cursor: 'pointer', display: 'flex', alignItems: 'center',
  };

  return (
    <div style={{
      background: th.panel, border: `1px solid ${th.line}`, borderRadius: 6,
      padding: 18, boxShadow: th.ombre,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, flexWrap: 'wrap', marginBottom: 16,
      }}>
        <h2 style={{
          fontSize: 15, margin: 0, textTransform: 'uppercase', letterSpacing: 0.5,
          fontFamily: "Oswald, 'Arial Narrow', sans-serif",
        }}>
          Vue hebdomadaire
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={() => setLundi(ajouterJours(lundi, -7))} style={boutonNav}><ChevronLeft size={16} /></button>
          <span style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>
            Semaine du {formatDateCourte(lundi)} au {formatDateCourte(dimanche)}
          </span>
          <button onClick={() => setLundi(ajouterJours(lundi, 7))} style={boutonNav}><ChevronRight size={16} /></button>
          <button onClick={() => setLundi(lundiDe(new Date()))} style={{
            background: 'none', border: `1px solid ${th.line}`, color: th.textDim,
            borderRadius: 4, padding: '5px 11px', fontSize: 11.5, cursor: 'pointer',
          }}>
            Cette semaine
          </button>
          <input type="date" onChange={(e) => e.target.value && setLundi(lundiDe(deISO(e.target.value)))}
            title="Aller à une semaine"
            style={{
              padding: '5px 8px', border: `1px solid ${th.line}`, background: th.inputBg,
              color: th.text, fontSize: 12, borderRadius: 4,
              colorScheme: mode === 'night' ? 'dark' : 'light',
            }} />
        </div>
      </div>

      {projetsAvecDonnees.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: th.textDim, fontSize: 13 }}>
          Aucune journée enregistrée cette semaine. Confirme une première journée pour voir apparaître un projet ici.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ ...enTeteStyle(th, 150), position: 'sticky', left: 0, background: th.panel }}>
                  Projets / Dates
                </th>
                {jours.map((j, i) => {
                  const finSemaine = j.getDay() === 0 || j.getDay() === 6;
                  return (
                    <th key={i} style={{
                      ...enTeteStyle(th, 118),
                      textAlign: 'center',
                      background: finSemaine ? th.surligne : 'transparent',
                    }}>
                      {j.toLocaleDateString('fr-CA', { weekday: 'short' })}<br />{formatDateCourte(j)}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {projetsAvecDonnees.map((projet) => (
                <tr key={projet}>
                  <td style={{
                    ...celluleStyle(th), fontWeight: 700, whiteSpace: 'nowrap',
                    position: 'sticky', left: 0, background: th.panel,
                  }}>
                    {projet}
                  </td>
                  {isoJours.map((iso, i) => {
                    const finSemaine = jours[i].getDay() === 0 || jours[i].getDay() === 6;
                    const journee = journees.find((j) => j.date_jour === iso && j.projet_no === projet);
                    if (!journee) {
                      return (
                        <td key={iso} style={{
                          ...celluleStyle(th), textAlign: 'center', color: th.textDim,
                          background: finSemaine ? th.surligne : 'transparent',
                        }}>
                          —
                        </td>
                      );
                    }
                    const resume = calculerResume(
                      [{ dateISO: iso, camions: journee.camions }],
                      (d) => tauxALaDate(lignesTaux, d),
                    );
                    return (
                      <td key={iso} onClick={() => onOuvrir(journee)} title="Cliquer pour ouvrir cette journée"
                        style={{
                          ...celluleStyle(th), cursor: 'pointer',
                          background: finSemaine ? th.surligne : th.panelAlt,
                        }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 1 }}>
                          <button onClick={(e) => { e.stopPropagation(); onInfo(journee); }}
                            title="Qui a enregistré cette journée ?"
                            style={{
                              background: 'none', border: 'none', color: th.textDim,
                              cursor: 'pointer', padding: 0, lineHeight: 0,
                            }}>
                            <Info size={12} />
                          </button>
                        </div>
                        <LigneStat th={th} label="Voyages" valeur={resume.totalVoyages} />
                        <LigneStat th={th} label="Temps moy." valeur={formatDuree(resume.dureeMoyGlobale)} />
                        <LigneStat th={th} label="Coût" valeur={argent(resume.coutTotal > 0 ? resume.coutTotal : null)} />
                        <LigneStat th={th} label="$ / Tm" valeur={argent(resume.dollarParTmGlobal)} fort />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function LigneStat({ th, label, valeur, fort }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', gap: 6,
      fontSize: 10.5, lineHeight: 1.6,
      color: fort ? th.text : th.textDim, fontWeight: fort ? 700 : 400,
    }}>
      <span>{label}</span><span>{valeur}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ONGLET 3 — ANALYSE DE DONNÉES
// ---------------------------------------------------------------------------
function VueAnalyse({ th, mode, journees, lignesTaux, projets, objectifs, onMajObjectif }) {
  const [projetFiltre, setProjetFiltre] = useState('');
  const [typeFiltre, setTypeFiltre] = useState('tous');
  const [debut, setDebut] = useState('');
  const [fin, setFin] = useState('');

  const projetsDisponibles = useMemo(
    () => [...new Set(journees.map((j) => j.projet_no))].sort(),
    [journees],
  );

  const retenues = journees.filter((j) => {
    if (projetFiltre && j.projet_no !== projetFiltre) return false;
    if (debut && j.date_jour < debut) return false;
    if (fin && j.date_jour > fin) return false;
    return true;
  });

  const resume = calculerResume(
    retenues.map((j) => ({ dateISO: j.date_jour, camions: j.camions })),
    (d) => tauxALaDate(lignesTaux, d),
    typeFiltre,
  );

  const inputStyle = {
    padding: '7px 9px', border: `1px solid ${th.line}`, background: th.inputBg,
    color: th.text, fontSize: 13, borderRadius: 4,
  };

  const infoProjet = projets.find((p) => p.no === projetFiltre) || null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{
        background: th.panel, border: `1px solid ${th.line}`, borderRadius: 6,
        padding: 18, boxShadow: th.ombre,
      }}>
        <h2 style={{
          fontSize: 15, margin: '0 0 14px', textTransform: 'uppercase',
          letterSpacing: 0.5, fontFamily: "Oswald, 'Arial Narrow', sans-serif",
        }}>
          Analyse de données
        </h2>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <div>
            <label style={etiquetteFiltre(th)}>Projet</label>
            <select value={projetFiltre} onChange={(e) => setProjetFiltre(e.target.value)}
              style={{ ...inputStyle, minWidth: 220 }}>
              <option value="">Tous les projets</option>
              {projetsDisponibles.map((no) => {
                const p = projets.find((x) => x.no === no);
                return <option key={no} value={no}>{p ? `${no} — ${p.nom}` : no}</option>;
              })}
            </select>
          </div>
          <div>
            <label style={etiquetteFiltre(th)}>Du</label>
            <input type="date" value={debut} onChange={(e) => setDebut(e.target.value)}
              style={{ ...inputStyle, colorScheme: mode === 'night' ? 'dark' : 'light' }} />
          </div>
          <div>
            <label style={etiquetteFiltre(th)}>Au</label>
            <input type="date" value={fin} onChange={(e) => setFin(e.target.value)}
              style={{ ...inputStyle, colorScheme: mode === 'night' ? 'dark' : 'light' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button onClick={() => { setProjetFiltre(''); setTypeFiltre('tous'); setDebut(''); setFin(''); }}
              style={{
                background: 'none', border: `1px solid ${th.line}`, color: th.textDim,
                borderRadius: 4, padding: '7px 12px', fontSize: 12, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}>
              <RotateCcw size={13} /> Réinitialiser
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['tous', ...TYPES].map((t) => (
            <BoutonOnglet key={t} th={th} actif={typeFiltre === t} onClick={() => setTypeFiltre(t)}>
              {t === 'tous' ? 'Tous les types' : t}
            </BoutonOnglet>
          ))}
        </div>

        <p style={{ fontSize: 12, color: th.textDim, margin: '14px 0 0' }}>
          {retenues.length} journée{retenues.length !== 1 ? 's' : ''} retenue{retenues.length !== 1 ? 's' : ''}.
          Chaque journée est calculée avec les taux en vigueur à <em>sa</em> date, même si les taux ont changé depuis.
        </p>
      </div>

      {projetFiltre && (
        <div style={{
          background: th.panel, border: `1px solid ${th.line}`, borderRadius: 6,
          padding: 18, boxShadow: th.ombre,
        }}>
          <h2 style={{
            fontSize: 15, margin: '0 0 4px', textTransform: 'uppercase',
            letterSpacing: 0.5, fontFamily: "Oswald, 'Arial Narrow', sans-serif",
          }}>
            Objectifs — {projetFiltre}{infoProjet ? ` · ${infoProjet.nom}` : ''}
          </h2>
          <p style={{ fontSize: 12, color: th.textDim, margin: '0 0 14px' }}>
            Ce qui était prévu contre ce qui est arrivé. Les valeurs prévues se saisissent ici et sont enregistrées.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12.5 }}>
              <thead>
                <tr>
                  {['Type', 'Temps prévu', 'Temps réel', 'Transport prévu $/Tm', 'Péage prévu $/Tm', 'Total prévu $/Tm', 'Réel $/Tm', 'Écart'].map((h) => (
                    <th key={h} style={enTeteStyle(th, 88)}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TYPES.map((type) => {
                  const obj = objectifs[`${projetFiltre}|${type}`] || {};
                  const reel = resume.parType[type] || {};
                  const totalPrevu = (obj.transport_prevu === null || obj.transport_prevu === undefined) &&
                                     (obj.peage_prevu === null || obj.peage_prevu === undefined)
                    ? null
                    : Number(obj.transport_prevu || 0) + Number(obj.peage_prevu || 0);
                  const ecart = totalPrevu !== null && reel.dollarParTm != null
                    ? reel.dollarParTm - totalPrevu
                    : null;
                  return (
                    <tr key={type}>
                      <td style={celluleStyle(th)}><EtiquetteType type={type} /></td>
                      <td style={celluleStyle(th)}>
                        <input type="text" placeholder="h:mm"
                          defaultValue={obj.temps_prevu_min != null ? formatDuree(obj.temps_prevu_min).replace('h', ':') : ''}
                          style={{ ...inputStyle, width: 80 }}
                          onBlur={(e) => {
                            const n = normaliserHeure(e.target.value);
                            onMajObjectif(projetFiltre, type, 'temps_prevu_min', n ? heureEnMinutes(n) : null);
                          }} />
                      </td>
                      <td style={celluleStyle(th)}>{formatDuree(reel.dureeMoy)}</td>
                      <td style={celluleStyle(th)}>
                        <input type="number" step="0.25" min="0" placeholder="$/Tm"
                          defaultValue={obj.transport_prevu ?? ''}
                          style={{ ...inputStyle, width: 90 }}
                          onBlur={(e) => onMajObjectif(projetFiltre, type, 'transport_prevu', e.target.value === '' ? null : Number(e.target.value))} />
                      </td>
                      <td style={celluleStyle(th)}>
                        <input type="number" step="0.25" min="0" placeholder="$/Tm"
                          defaultValue={obj.peage_prevu ?? ''}
                          style={{ ...inputStyle, width: 90 }}
                          onBlur={(e) => onMajObjectif(projetFiltre, type, 'peage_prevu', e.target.value === '' ? null : Number(e.target.value))} />
                      </td>
                      <td style={celluleStyle(th)}>{argent(totalPrevu)}</td>
                      <td style={celluleStyle(th)}><strong>{argent(reel.dollarParTm)}</strong></td>
                      <td style={{ ...celluleStyle(th), color: ecart === null ? th.textDim : ecart > 0 ? BRAND_RED : VERT, fontWeight: 700 }}>
                        {ecart === null ? '—' : (ecart > 0 ? '+' : '') + ecart.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{
        background: th.panel, border: `1px solid ${th.line}`, borderRadius: 6,
        padding: 18, boxShadow: th.ombre,
      }}>
        {retenues.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: th.textDim, fontSize: 13 }}>
            Aucune journée ne correspond à ces filtres.
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
              <Metrique th={th} label="Journées" valeur={retenues.length} />
              <Metrique th={th} label="Voyages complets" valeur={resume.totalVoyages} />
              <Metrique th={th} label="Temps moyen / voyage" valeur={formatDuree(resume.dureeMoyGlobale)} />
              <Metrique th={th} label="Tonnage (est.)" valeur={resume.tonnageTotal > 0 ? `${resume.tonnageTotal.toFixed(0)} Tm` : '—'} />
              <Metrique th={th} label="Coût transport (est.)" valeur={argent(resume.coutTotal > 0 ? resume.coutTotal : null)} />
              <Metrique th={th} label="$ / Tm moyen" valeur={argent(resume.dollarParTmGlobal)} surligne />
            </div>

            <div style={{ overflowX: 'auto', marginBottom: 20 }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12.5 }}>
                <thead>
                  <tr>
                    {['Type', 'Voyages', 'Temps moyen', 'Coût moyen / voyage', 'Tonnage moyen', '$ / Tm'].map((h) => (
                      <th key={h} style={enTeteStyle(th, 90)}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {resume.typesAffiches.map((type) => {
                    const t = resume.parType[type];
                    return (
                      <tr key={type}>
                        <td style={celluleStyle(th)}><EtiquetteType type={type} /></td>
                        <td style={celluleStyle(th)}>{t.nb}</td>
                        <td style={celluleStyle(th)}>{formatDuree(t.dureeMoy)}</td>
                        <td style={celluleStyle(th)}>{argent(t.coutParVoyage)}</td>
                        <td style={celluleStyle(th)}>{t.tonnage ? `${t.tonnage.toFixed(0)} Tm` : '—'}</td>
                        <td style={celluleStyle(th)}><strong>{argent(t.dollarParTm)}</strong></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <h3 style={{ fontSize: 13, margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: 0.5, color: th.textDim }}>
              Détail par journée
            </h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12.5 }}>
                <thead>
                  <tr>
                    {['Date', 'Projet', 'Voyages', 'Temps moyen', 'Coût', '$ / Tm'].map((h) => (
                      <th key={h} style={enTeteStyle(th, 90)}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...retenues].sort((a, b) => (a.date_jour < b.date_jour ? 1 : -1)).map((j) => {
                    const r = calculerResume(
                      [{ dateISO: j.date_jour, camions: j.camions }],
                      (d) => tauxALaDate(lignesTaux, d),
                      typeFiltre,
                    );
                    return (
                      <tr key={j.id}>
                        <td style={celluleStyle(th)}>{formatDateLongue(j.date_jour)}</td>
                        <td style={celluleStyle(th)}>{j.projet_no}</td>
                        <td style={celluleStyle(th)}>{r.totalVoyages}</td>
                        <td style={celluleStyle(th)}>{formatDuree(r.dureeMoyGlobale)}</td>
                        <td style={celluleStyle(th)}>{argent(r.coutTotal > 0 ? r.coutTotal : null)}</td>
                        <td style={celluleStyle(th)}><strong>{argent(r.dollarParTmGlobal)}</strong></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <button onClick={() => exporterCSV(retenues, lignesTaux, typeFiltre)} style={{
              marginTop: 16, background: 'none', border: `1px solid ${th.line}`, color: th.text,
              borderRadius: 4, padding: '8px 14px', cursor: 'pointer', fontSize: 12.5,
              display: 'inline-flex', alignItems: 'center', gap: 7, fontWeight: 600,
            }}>
              <Download size={14} /> Exporter en CSV
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function etiquetteFiltre(th) {
  return {
    fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5,
    color: th.textDim, display: 'block', marginBottom: 5,
  };
}

function exporterCSV(journees, lignesTaux, typeFiltre) {
  const lignes = [['Date', 'Projet', 'Camion', 'Plaque', 'Type', 'Peage', 'Voyages', 'Temps moyen (min)', 'Cout ($)']];
  journees.forEach((j) => {
    const params = tauxALaDate(lignesTaux, j.date_jour);
    (j.camions || []).forEach((c) => {
      if (!c.type) return;
      if (typeFiltre !== 'tous' && c.type !== typeFiltre) return;
      const durees = dureesCamion(c);
      if (durees.length === 0) return;
      const p = params[c.type];
      const peage = p.peage * multiplicateurPeage(c.peage);
      const cout = durees.reduce((a, d) => a + (d / 60) * p.taux + peage, 0);
      const moy = durees.reduce((a, d) => a + d, 0) / durees.length;
      lignes.push([
        j.date_jour, j.projet_no, c.libelle, c.plaque, c.type, c.peage,
        durees.length, moy.toFixed(0), cout.toFixed(2),
      ]);
    });
  });
  const csv = lignes.map((l) => l.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const lien = document.createElement('a');
  lien.href = URL.createObjectURL(blob);
  lien.download = `suivi-transport-${aujourdhuiISO()}.csv`;
  lien.click();
  URL.revokeObjectURL(lien.href);
}

// ---------------------------------------------------------------------------
// ONGLET 4 — ADMINISTRATEUR
// ---------------------------------------------------------------------------
function VueAdmin({ th, mode, lignesTaux, onAjouterVersion, onMajTaux, onSupprimerVersion, estAdmin }) {
  const dates = [...new Set(lignesTaux.map((t) => t.date_effet))].sort((a, b) => (a < b ? 1 : -1));
  const [nouvelleDate, setNouvelleDate] = useState('');

  const inputStyle = {
    padding: '6px 8px', border: `1px solid ${th.line}`, background: th.inputBg,
    color: th.text, fontSize: 12.5, borderRadius: 4, width: 92,
  };

  if (!estAdmin) {
    return (
      <div style={{
        background: th.panel, border: `1px solid ${th.line}`, borderRadius: 6,
        padding: 30, boxShadow: th.ombre, textAlign: 'center', color: th.textDim, fontSize: 13,
      }}>
        Les taux ne se modifient que par un administrateur du Toolbox.
      </div>
    );
  }

  return (
    <div style={{
      background: th.panel, border: `1px solid ${th.line}`, borderRadius: 6,
      padding: 18, boxShadow: th.ombre,
    }}>
      <h2 style={{
        fontSize: 15, margin: '0 0 6px', textTransform: 'uppercase',
        letterSpacing: 0.5, fontFamily: "Oswald, 'Arial Narrow', sans-serif",
      }}>
        Taux par date d'entrée en vigueur
      </h2>
      <p style={{ fontSize: 12.5, color: th.textDim, margin: '0 0 16px', lineHeight: 1.6 }}>
        Un taux n'est pas une valeur, c'est une valeur <strong style={{ color: th.text }}>avec une date de début</strong>.
        Quand un contrat se renégocie, ajoute une version — ne modifie pas l'ancienne. L'app applique toujours
        la version en vigueur à la date de la journée saisie, donc l'historique ne bouge jamais.
      </p>

      <Avis th={th} ton="avis">
        Les valeurs actuelles viennent du prototype et ne sont pas les vraies. Remplace-les par tes contrats réels.
      </Avis>

      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <label style={etiquetteFiltre(th)}>Nouvelle version à partir du</label>
          <input type="date" value={nouvelleDate} onChange={(e) => setNouvelleDate(e.target.value)}
            style={{ ...inputStyle, width: 150, colorScheme: mode === 'night' ? 'dark' : 'light' }} />
        </div>
        <button onClick={() => { if (nouvelleDate) { onAjouterVersion(nouvelleDate); setNouvelleDate(''); } }}
          style={{
            background: 'none', border: `1px solid ${th.line}`, color: th.text,
            borderRadius: 4, padding: '7px 14px', cursor: 'pointer', fontSize: 12.5,
            display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600,
          }}>
          <Plus size={14} /> Ajouter une version
        </button>
      </div>

      {dates.map((date) => (
        <div key={date} style={{
          border: `1px solid ${th.line}`, borderRadius: 6, padding: 14, marginBottom: 12,
          background: th.panelAlt,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <strong style={{ fontSize: 13 }}>En vigueur depuis le {formatDateLongue(date)}</strong>
            {dates.length > 1 && (
              <button onClick={() => onSupprimerVersion(date)} title="Supprimer cette version"
                style={{ background: 'none', border: 'none', color: th.textDim, cursor: 'pointer' }}>
                <Trash2 size={14} />
              </button>
            )}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12.5 }}>
              <thead>
                <tr>
                  {['Type', 'Taux ($/h)', 'Tonnage moyen (Tm)', 'Péage A25 ($)'].map((h) => (
                    <th key={h} style={enTeteStyle(th, 110)}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TYPES.map((type) => {
                  const ligne = lignesTaux.find((t) => t.date_effet === date && t.type === type);
                  return (
                    <tr key={type}>
                      <td style={celluleStyle(th)}><EtiquetteType type={type} /></td>
                      {[['taux_horaire', ligne?.taux_horaire], ['tonnage', ligne?.tonnage], ['peage', ligne?.peage]].map(([champ, valeur]) => (
                        <td key={champ} style={celluleStyle(th)}>
                          <input type="number" step="0.01" min="0" defaultValue={valeur ?? ''}
                            style={inputStyle}
                            onBlur={(e) => onMajTaux(date, type, champ, Number(e.target.value) || 0)} />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FABRIQUE D'UNE LIGNE DE CAMION
// ---------------------------------------------------------------------------
let compteurCamion = 0;
function creerCamion(position, nbColonnes) {
  compteurCamion += 1;
  return {
    id: `nouveau-${compteurCamion}`,
    position,
    libelle: `Camion ${position + 1}`,
    plaque: '',
    type: null,
    peage: 'aucun',
    heures: new Array(nbColonnes).fill(''),
  };
}
function grilleVierge() {
  return Array.from({ length: NB_LIGNES_DEFAUT }, (_, i) => creerCamion(i, NB_COLONNES_DEFAUT));
}

// ---------------------------------------------------------------------------
// L'APP
// ---------------------------------------------------------------------------
function SuiviTransportApp({ userId, nom, poste, estAdmin }) {
  const [mode, setMode] = useModePep();
  const th = THEMES[mode];

  const [onglet, setOnglet] = useState('jour');
  const [chargement, setChargement] = useState(true);
  const [erreurChargement, setErreurChargement] = useState('');
  const [message, setMessage] = useState(null);
  const [enregistrement, setEnregistrement] = useState(false);

  const [projets, setProjets] = useState([]);
  const [journees, setJournees] = useState([]);
  const [lignesTaux, setLignesTaux] = useState([]);
  const [objectifs, setObjectifs] = useState({});

  const [projetNo, setProjetNo] = useState('');
  const [dateJour, setDateJour] = useState(aujourdhuiISO());
  const [camions, setCamions] = useState(grilleVierge);
  const [nbColonnes, setNbColonnes] = useState(NB_COLONNES_DEFAUT);
  const [journeeInfo, setJourneeInfo] = useState(null);
  const [journalInfo, setJournalInfo] = useState([]);

  const charger = useCallback(async () => {
    setChargement(true);
    setErreurChargement('');
    const depuis = toISO(ajouterJours(new Date(), -JOURS_CHARGES));
    const [
      { data: projetsData, error: eProjets },
      { data: journeesData, error: eJournees },
      { data: tauxData, error: eTaux },
      { data: objData, error: eObj },
    ] = await Promise.all([
      supabaseLP.from('projets').select('no, nom, charge, adresse, surintendant').order('no', { ascending: false }),
      supabaseT.from('journees').select('*, camions(*)').gte('date_jour', depuis).order('date_jour', { ascending: false }),
      supabaseT.from('taux').select('*'),
      supabaseT.from('objectifs').select('*'),
    ]);

    if (eProjets || eJournees || eTaux || eObj) {
      setErreurChargement("Impossible de charger les données. Réessaie dans un instant, ou avertis William si ça persiste.");
      setChargement(false);
      return;
    }

    setProjets(projetsData || []);
    setJournees((journeesData || []).map((j) => ({
      ...j,
      camions: [...(j.camions || [])].sort((a, b) => a.position - b.position),
    })));
    setLignesTaux(tauxData || []);
    const carte = {};
    (objData || []).forEach((o) => { carte[`${o.projet_no}|${o.type}`] = o; });
    setObjectifs(carte);
    setChargement(false);
  }, []);

  useEffect(() => { charger(); }, [charger]);

  const params = useMemo(() => tauxALaDate(lignesTaux, dateJour), [lignesTaux, dateJour]);
  const dateEffet = params[TYPES[0]]?.dateEffet || null;

  const journeeExistante = useMemo(
    () => journees.find((j) => j.date_jour === dateJour && j.projet_no === projetNo) || null,
    [journees, dateJour, projetNo],
  );

  // -------------------------------------------------------------------------
  // Confirmer la journee : on remplace les camions de la fiche (efface puis
  // reinsere), et on ajoute une ligne au journal. On n'ecrase jamais le
  // journal — c'est lui qui repond a « qui a rempli cette fiche ? ».
  // -------------------------------------------------------------------------
  async function confirmerJournee() {
    if (!projetNo) {
      setMessage({ ton: 'erreur', texte: 'Choisis un numéro de projet avant de confirmer.' });
      return;
    }
    if (!dateJour) {
      setMessage({ ton: 'erreur', texte: 'Choisis la date de la journée avant de confirmer.' });
      return;
    }
    const aDesVoyages = camions.some((c) => c.type && dureesCamion(c).length > 0);
    if (!aDesVoyages) {
      setMessage({ ton: 'erreur', texte: "Aucun voyage complet : il faut au moins deux heures de départ sur un camion, et un type de camion choisi." });
      return;
    }

    setEnregistrement(true);
    setMessage(null);

    const { data: journee, error: eJournee } = await supabaseT
      .from('journees')
      .upsert(
        { date_jour: dateJour, projet_no: projetNo, nb_colonnes: nbColonnes, maj_le: new Date().toISOString() },
        { onConflict: 'date_jour,projet_no' },
      )
      .select()
      .single();

    if (eJournee || !journee) {
      setEnregistrement(false);
      setMessage({ ton: 'erreur', texte: "L'enregistrement a échoué. Réessaie dans un instant." });
      return;
    }

    await supabaseT.from('camions').delete().eq('journee_id', journee.id);

    const aInserer = camions
      .filter((c) => c.type || c.libelle.trim() || c.plaque.trim() || c.heures.some((h) => h))
      .map((c, i) => ({
        journee_id: journee.id,
        position: i,
        libelle: c.libelle || '',
        plaque: c.plaque || '',
        type: c.type || null,
        peage: c.peage || 'aucun',
        heures: (c.heures || []).map((h) => h || ''),
      }));

    const { error: eCamions } = await supabaseT.from('camions').insert(aInserer);
    if (eCamions) {
      setEnregistrement(false);
      setMessage({ ton: 'erreur', texte: "La fiche est créée mais les camions n'ont pas pu être enregistrés. Réessaie." });
      return;
    }

    await supabaseT.from('journal').insert({ journee_id: journee.id, user_id: userId, nom });

    await charger();
    setEnregistrement(false);
    setMessage({
      ton: 'ok',
      texte: `Journée du ${formatDateLongue(dateJour)} enregistrée pour le projet ${projetNo}.`,
    });
    setCamions(grilleVierge());
    setNbColonnes(NB_COLONNES_DEFAUT);
    setProjetNo('');
    setDateJour(aujourdhuiISO());
  }

  function ouvrirJournee(journee) {
    setProjetNo(journee.projet_no);
    setDateJour(journee.date_jour);
    setNbColonnes(journee.nb_colonnes || NB_COLONNES_DEFAUT);
    const lignes = (journee.camions || []).map((c, i) => ({
      id: c.id,
      position: i,
      libelle: c.libelle || '',
      plaque: c.plaque || '',
      type: c.type,
      peage: c.peage || 'aucun',
      heures: [...(c.heures || [])],
    }));
    while (lignes.length < NB_LIGNES_DEFAUT) lignes.push(creerCamion(lignes.length, journee.nb_colonnes || NB_COLONNES_DEFAUT));
    setCamions(lignes);
    setOnglet('jour');
    setMessage(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function ouvrirInfo(journee) {
    setJourneeInfo(journee);
    const { data } = await supabaseT
      .from('journal').select('*').eq('journee_id', journee.id).order('fait_le', { ascending: false });
    setJournalInfo(data || []);
  }

  async function majObjectif(projet, type, champ, valeur) {
    const existant = objectifs[`${projet}|${type}`] || {};
    const ligne = {
      projet_no: projet,
      type,
      temps_prevu_min: existant.temps_prevu_min ?? null,
      transport_prevu: existant.transport_prevu ?? null,
      peage_prevu: existant.peage_prevu ?? null,
      [champ]: valeur,
      maj_le: new Date().toISOString(),
    };
    const { error } = await supabaseT.from('objectifs').upsert(ligne, { onConflict: 'projet_no,type' });
    if (!error) setObjectifs((prev) => ({ ...prev, [`${projet}|${type}`]: ligne }));
  }

  async function ajouterVersionTaux(date) {
    const derniere = tauxALaDate(lignesTaux, null);
    const dernierJeu = tauxALaDate(lignesTaux, aujourdhuiISO());
    const source = Object.values(derniere).some((v) => v.taux) ? derniere : dernierJeu;
    const lignes = TYPES.map((type) => ({
      date_effet: date,
      type,
      taux_horaire: source[type].taux || 0,
      tonnage: source[type].tonnage || 0,
      peage: source[type].peage || 0,
    }));
    const { error } = await supabaseT.from('taux').upsert(lignes, { onConflict: 'date_effet,type' });
    if (!error) charger();
  }

  async function majTaux(date, type, champ, valeur) {
    const { error } = await supabaseT
      .from('taux').update({ [champ]: valeur }).eq('date_effet', date).eq('type', type);
    if (!error) {
      setLignesTaux((prev) => prev.map((t) => (
        t.date_effet === date && t.type === type ? { ...t, [champ]: valeur } : t
      )));
    }
  }

  async function supprimerVersionTaux(date) {
    if (!window.confirm(`Supprimer la version de taux du ${formatDateLongue(date)} ? Les journées déjà enregistrées seront recalculées avec la version précédente.`)) return;
    const { error } = await supabaseT.from('taux').delete().eq('date_effet', date);
    if (!error) charger();
  }

  if (chargement) {
    return (
      <div style={{
        minHeight: '100vh', background: th.bg, color: th.text,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "Calibri, 'Segoe UI', Candara, Optima, Arial, sans-serif",
      }}>
        <div style={{ color: th.textDim, fontSize: 13 }}>Chargement…</div>
      </div>
    );
  }

  if (erreurChargement) {
    return (
      <div style={{
        minHeight: '100vh', background: th.bg, color: th.text,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        fontFamily: "Calibri, 'Segoe UI', Candara, Optima, Arial, sans-serif",
      }}>
        <div style={{ color: BRAND_RED, fontSize: 13, textAlign: 'center' }}>{erreurChargement}</div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: th.bg,
      fontFamily: "Calibri, 'Segoe UI', Candara, Optima, Arial, sans-serif",
      color: th.text,
      transition: 'background 0.2s ease, color 0.2s ease',
    }}>
      <EnTeteApp
        titre="Suivi transport quotidien"
        sousTitre="Voyages, temps et coût par camion — 12 roues · 2 essieux · 3 essieux"
        mode={mode}
        onChangerMode={setMode}
        nom={nom}
        poste={poste}
        onAccueil={() => { setOnglet('jour'); setMessage(null); }}
      />

      <div style={{ maxWidth: 1300, margin: '0 auto', padding: '0 16px 40px' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          <BoutonOnglet th={th} actif={onglet === 'jour'} onClick={() => setOnglet('jour')}>Saisie du jour</BoutonOnglet>
          <BoutonOnglet th={th} actif={onglet === 'semaine'} onClick={() => setOnglet('semaine')}>Vue hebdomadaire</BoutonOnglet>
          <BoutonOnglet th={th} actif={onglet === 'analyse'} onClick={() => setOnglet('analyse')}>Analyse de données</BoutonOnglet>
          <BoutonOnglet th={th} actif={onglet === 'admin'} onClick={() => setOnglet('admin')}>Administrateur</BoutonOnglet>
        </div>

        {onglet === 'jour' && (
          <GrilleJour
            th={th} mode={mode} projets={projets}
            projetNo={projetNo} setProjetNo={setProjetNo}
            dateJour={dateJour} setDateJour={setDateJour}
            camions={camions} setCamions={setCamions}
            nbColonnes={nbColonnes} setNbColonnes={setNbColonnes}
            params={params} dateEffet={dateEffet}
            onConfirmer={confirmerJournee}
            enregistrement={enregistrement}
            journeeExistante={!!journeeExistante}
            message={message}
          />
        )}

        {onglet === 'semaine' && (
          <VueSemaine
            th={th} mode={mode} journees={journees} lignesTaux={lignesTaux}
            onOuvrir={ouvrirJournee} onInfo={ouvrirInfo}
          />
        )}

        {onglet === 'analyse' && (
          <VueAnalyse
            th={th} mode={mode} journees={journees} lignesTaux={lignesTaux}
            projets={projets} objectifs={objectifs} onMajObjectif={majObjectif}
          />
        )}

        {onglet === 'admin' && (
          <VueAdmin
            th={th} mode={mode} lignesTaux={lignesTaux} estAdmin={estAdmin}
            onAjouterVersion={ajouterVersionTaux}
            onMajTaux={majTaux}
            onSupprimerVersion={supprimerVersionTaux}
          />
        )}
      </div>

      {journeeInfo && (
        <div onClick={() => setJourneeInfo(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 200,
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            background: th.panel, border: `1px solid ${th.line}`, borderRadius: 6,
            padding: 24, maxWidth: 460, width: '100%',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <h2 style={{ fontSize: 16, margin: '0 0 2px' }}>Détails de la journée</h2>
                <p style={{ margin: 0, fontSize: 12.5, color: th.textDim }}>
                  {journeeInfo.projet_no} · {formatDateLongue(journeeInfo.date_jour)}
                </p>
              </div>
              <button onClick={() => setJourneeInfo(null)} style={{
                background: 'none', border: 'none', color: th.textDim, cursor: 'pointer', padding: 4,
              }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ fontSize: 12.5 }}>
              {journalInfo.length === 0 ? (
                <span style={{ color: th.textDim }}>Aucun enregistrement au journal.</span>
              ) : journalInfo.map((l) => (
                <div key={l.id} style={{ padding: '7px 0', borderBottom: `1px solid ${th.line}` }}>
                  <strong>{l.nom}</strong>
                  <span style={{ color: th.textDim }}> — {formatHorodatage(l.fait_le)}</span>
                </div>
              ))}
            </div>
            <button onClick={() => { ouvrirJournee(journeeInfo); setJourneeInfo(null); }} style={{
              marginTop: 16, width: '100%', background: BRAND_RED, color: '#fff', border: 'none',
              borderRadius: 4, padding: '10px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              <Truck size={15} /> Ouvrir cette journée
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SuiviTransportPage() {
  const [session, setSession] = useState(null);

  if (!session) {
    return <GardeConnexion appSlug="suivi-transport" nomApp="Suivi transport quotidien" onPret={setSession} />;
  }

  return (
    <SuiviTransportApp
      userId={session.userId}
      nom={session.nom}
      poste={session.poste}
      estAdmin={!!session.estAdmin}
    />
  );
}

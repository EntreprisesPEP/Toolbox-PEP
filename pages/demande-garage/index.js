import { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import GardeConnexion from '../../components/commun/GardeConnexion';
import EnTeteApp from '../../components/commun/EnTeteApp';
import { PALETTES, useModePep } from '../../components/commun/ThemeToolbox';
import { DESTINATAIRES_FIXES_RAW } from '../../lib/garage-destinataires';
import {
  Send, CheckCircle2, Users, Upload, Plus, Trash2,
  X, ChevronLeft, ChevronRight, CalendarDays, Wrench,
} from 'lucide-react';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Client sur le schema garage (table demandes)
const supabaseGarage = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { db: { schema: 'garage' } });
// Client sur le schema liste_projets (projets + personnel — déjà en place
// pour l'app Liste des projets, on le réutilise ici en lecture seule)
const supabaseLP = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { db: { schema: 'liste_projets' } });

// ---------------------------------------------------------------------------
// Destinataires fixes sur CHAQUE demande — voir lib/garage-destinataires.js
// ---------------------------------------------------------------------------
const DESTINATAIRES_FIXES = DESTINATAIRES_FIXES_RAW.map(p => `${p.nom} (${p.email})`);
const NOMS_FIXES = DESTINATAIRES_FIXES.map(s => s.replace(/\s*\(.+\)$/, '').trim().toLowerCase());

function dedupeDestinatairesVariables(liste) {
  const vus = new Set();
  const resultat = [];
  for (const nom of liste) {
    const cle = (nom || '').trim().toLowerCase();
    if (!cle || vus.has(cle) || NOMS_FIXES.includes(cle)) continue;
    vus.add(cle);
    resultat.push(nom);
  }
  return resultat;
}

// ---------------------------------------------------------------------------
// PRIORITÉS — l'ordre de la liste est aussi l'ordre de tri du suivi.
// ---------------------------------------------------------------------------
const PRIORITES = ['URGENT', 'SEMI-URGENT', 'NON-URGENT'];
const COULEUR_PRIORITE = {
  'URGENT': '#c41230',
  'SEMI-URGENT': '#f0a202',
  'NON-URGENT': '#6b7488',
};
function rangPriorite(p) {
  const i = PRIORITES.indexOf(p);
  return i === -1 ? PRIORITES.length : i;
}

const BRAND_RED = '#c41230';
const BRAND_GREEN = '#2fa360';
const BRAND_ORANGE = '#f0a202';
const VERT_ACCOMPLIE = '#019155'; // vert PEP (extrait du vrai logo)

const initialForm = {
  nom: '',
  projetNo: '',
  priorite: '',
  dateRequise: '',
  objet: '',
  details: [''],
  infosComplementaires: '',
  photoFiles: [],
};

function creerFormulaireInitial(nom) {
  return { ...initialForm, nom, details: [''] };
}

// ---------------------------------------------------------------------------
// TRI DU SUIVI — l'urgent passe devant ; à priorité égale, la demande la
// plus vieille passe en premier.
// ---------------------------------------------------------------------------
function comparerPriorite(a, b) {
  const ra = rangPriorite(a.priorite);
  const rb = rangPriorite(b.priorite);
  if (ra !== rb) return ra - rb;
  if (a.dateJour !== b.dateJour) return a.dateJour < b.dateJour ? -1 : 1;
  return a.numero - b.numero;
}
function trierParPriorite(liste) {
  return [...liste].sort(comparerPriorite);
}

function filtrerParRecherche(liste, texte) {
  const q = texte.trim().toLowerCase();
  if (!q) return liste;
  return liste.filter(d => {
    const champs = [
      String(d.numero), d.nom, d.objet, d.priorite,
      d.projet?.no, d.projet?.nom, d.projet?.client,
      ...(d.details || []),
    ];
    return champs.some(c => c && c.toLowerCase().includes(q));
  });
}

// ---------------------------------------------------------------------------
// UTILITAIRES DE DATES — pour le calendrier (Jour / Semaine / Mois / Année)
// ---------------------------------------------------------------------------
const JOURS_ABREV = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const JOURS_COMPLETS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const MOIS_NOMS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];

function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}
function addMonths(date, n) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}
function addYears(date, n) {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + n);
  return d;
}
function startOfWeekMonday(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Dim, 1=Lun, ...
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}
function daysInMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}
function getWeeksStartingMonday(refDate, nSemaines) {
  const lundi = startOfWeekMonday(refDate);
  const semaines = [];
  for (let w = 0; w < nSemaines; w++) {
    const debut = addDays(lundi, w * 7);
    semaines.push(Array.from({ length: 7 }, (_, i) => addDays(debut, i)));
  }
  return semaines;
}
function getMonthGridWeeks(refDate) {
  const premier = new Date(refDate.getFullYear(), refDate.getMonth(), 1);
  const dernier = new Date(refDate.getFullYear(), refDate.getMonth(), daysInMonth(refDate));
  const debutGrille = addDays(premier, -((premier.getDay() + 6) % 7));
  const finGrille = addDays(dernier, 7 - ((dernier.getDay() + 6) % 7) - 1);
  const semaines = [];
  let curseur = debutGrille;
  while (curseur <= finGrille) {
    semaines.push(Array.from({ length: 7 }, (_, i) => addDays(curseur, i)));
    curseur = addDays(curseur, 7);
  }
  return semaines;
}

// Couleur d'une demande dans le calendrier et le suivi : le vert de
// l'accompli l'emporte sur la couleur de priorité.
function couleurDemande(d) {
  if (d.statut === 'Accomplie') return VERT_ACCOMPLIE;
  return COULEUR_PRIORITE[d.priorite] || '#6b7488';
}

// ---------------------------------------------------------------------------
// THÈMES — identiques à Demandes d'arpentage et Visite surintendant.
// ---------------------------------------------------------------------------
// Les couleurs viennent de la palette commune du Toolbox. « toggleInactiveText »
// n'existe plus : les bascules propres a l'app utilisent textDim.
const THEMES = PALETTES;

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function formatDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function Field({ label, error, children, th }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{
        fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5,
        color: th.textDim, display: 'block', marginBottom: 6,
      }}>
        {label}
      </label>
      {children}
      {error && <div style={{ color: BRAND_RED, fontSize: 11, marginTop: 4 }}>{error}</div>}
    </div>
  );
}

// Sélecteur de projet avec recherche — tape un numéro ou un nom pour
// réduire la liste. Le projet est optionnel pour une demande de garage :
// le bouton « Aucun projet » vide le champ.
function ComboboxProjet({ value, onChange, projets, th, error }) {
  const [ouvert, setOuvert] = useState(false);
  const [recherche, setRecherche] = useState('');
  const conteneurRef = useRef(null);

  const projetSelectionne = projets.find(p => p.no === value);
  const texteAffiche = ouvert ? recherche : (projetSelectionne ? `${projetSelectionne.no} — ${projetSelectionne.nom}` : '');

  const filtres = projets.filter(p => {
    const q = recherche.trim().toLowerCase();
    if (!q) return true;
    return p.no.toLowerCase().includes(q) || p.nom.toLowerCase().includes(q);
  });

  useEffect(() => {
    function surClicExterieur(e) {
      if (conteneurRef.current && !conteneurRef.current.contains(e.target)) setOuvert(false);
    }
    document.addEventListener('mousedown', surClicExterieur);
    return () => document.removeEventListener('mousedown', surClicExterieur);
  }, []);

  return (
    <div ref={conteneurRef} style={{ position: 'relative' }}>
      <input
        value={texteAffiche}
        onChange={e => { setRecherche(e.target.value); setOuvert(true); }}
        onFocus={() => { setRecherche(''); setOuvert(true); }}
        placeholder="Tape un numéro ou un nom de projet… (optionnel)"
        style={{
          width: '100%', background: th.inputBg, border: `1px solid ${error ? BRAND_RED : th.line}`, color: th.text,
          padding: '9px 12px', borderRadius: 4, fontSize: 13.5, boxSizing: 'border-box',
        }}
      />
      {ouvert && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
          background: th.panel, border: `1px solid ${th.line}`, borderRadius: 4,
          maxHeight: 260, overflowY: 'auto', marginTop: 2, boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
        }}>
          <div
            onMouseDown={() => { onChange(''); setOuvert(false); setRecherche(''); }}
            style={{ padding: '9px 12px', fontSize: 13, cursor: 'pointer', color: th.textDim, borderBottom: `1px solid ${th.line}` }}
          >
            — Aucun projet —
          </div>
          {filtres.length === 0 && (
            <div style={{ padding: '10px 12px', fontSize: 12.5, color: th.textDim }}>Aucun projet trouvé</div>
          )}
          {filtres.map(p => (
            <div key={p.no}
              onMouseDown={() => { onChange(p.no); setOuvert(false); setRecherche(''); }}
              style={{
                padding: '9px 12px', fontSize: 13, cursor: 'pointer',
                background: p.no === value ? `${BRAND_RED}22` : 'transparent',
              }}
            >
              <strong>{p.no}</strong> — {p.nom}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PrioriteBadge({ priorite, small }) {
  return (
    <span style={{
      background: COULEUR_PRIORITE[priorite] || '#6b7488', color: '#fff',
      borderRadius: 12, padding: small ? '3px 10px' : '4px 12px',
      fontSize: small ? 9.5 : 10.5, textTransform: 'uppercase',
      letterSpacing: 0.5, fontWeight: 700, whiteSpace: 'nowrap',
    }}>
      {priorite || '—'}
    </span>
  );
}

function StatutBadge({ demande, th, onToggleStatut, small }) {
  const accomplie = demande.statut === 'Accomplie';
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onToggleStatut(demande.numero); }}
      title={accomplie ? 'Remettre en attente' : 'Marquer comme accomplie'}
      style={{
        background: accomplie ? VERT_ACCOMPLIE : `${th.textDim}26`,
        color: accomplie ? '#ffffff' : th.textDim,
        border: 'none', borderRadius: 12, padding: small ? '3px 10px' : '4px 12px',
        fontSize: small ? 9.5 : 10.5,
        textTransform: 'uppercase', letterSpacing: 0.5, cursor: 'pointer', fontWeight: 700,
        flexShrink: 0,
      }}>
      {accomplie ? '✓ Accomplie' : demande.statut}
    </button>
  );
}

function DemandeCard({ d, th, onOpen, onToggleStatut }) {
  const accomplie = d.statut === 'Accomplie';
  const details = (d.details || []).filter(Boolean);
  return (
    <div onClick={() => onOpen(d)} style={{
      background: accomplie ? VERT_ACCOMPLIE : th.panel,
      border: `1px solid ${accomplie ? VERT_ACCOMPLIE : th.line}`,
      borderLeft: `5px solid ${couleurDemande(d)}`,
      borderRadius: 6, padding: 16,
      display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', cursor: 'pointer',
      transition: 'background 0.15s ease, border-color 0.15s ease',
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: accomplie ? '#fff' : th.text }}>
          #{d.numero} · {d.objet}
        </div>
        <div style={{ fontSize: 12, color: accomplie ? 'rgba(255,255,255,0.85)' : th.textDim, marginTop: 4 }}>
          Par {d.nom} · {formatDate(d.dateJour)}
          {d.dateRequise && d.dateRequise !== d.dateJour ? ` → ${formatDate(d.dateRequise)}` : ''}
          {d.projet ? ` · ${d.projet.no} — ${d.projet.nom}` : ''}
        </div>
        {details.length > 0 && (
          <div style={{ fontSize: 11.5, color: accomplie ? 'rgba(255,255,255,0.85)' : th.textDim, marginTop: 4 }}>
            <Wrench size={11} style={{ display: 'inline', marginRight: 5 }} />
            {details.length === 1 ? details[0] : `${details.length} éléments : ${details[0]}…`}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
        {!accomplie && <PrioriteBadge priorite={d.priorite} />}
        <StatutBadge demande={d} th={th} onToggleStatut={onToggleStatut} />
      </div>
    </div>
  );
}

function DetailRow({ label, value, th }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', gap: 16, padding: '8px 0',
      borderBottom: `1px solid ${th.line}`, fontSize: 12.5,
    }}>
      <span style={{ color: th.textDim, flexShrink: 0 }}>{label}</span>
      <span style={{ textAlign: 'right', color: th.text, fontWeight: 500 }}>{value || '—'}</span>
    </div>
  );
}

function DetailModal({ demande, th, onClose, onToggleStatut }) {
  if (!demande) return null;
  const accomplie = demande.statut === 'Accomplie';
  const details = (demande.details || []).filter(Boolean);
  const tousDestinataires = [...demande.destinataires.fixes, ...demande.destinataires.variables];

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 200,
      }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: th.panel, border: `2px solid ${accomplie ? VERT_ACCOMPLIE : th.line}`, borderRadius: 6,
          padding: 24, maxWidth: 540, width: '100%', maxHeight: '86vh', overflowY: 'auto',
        }}>
        {accomplie && (
          <div style={{
            background: VERT_ACCOMPLIE, color: '#fff', borderRadius: 4, padding: '8px 12px',
            fontSize: 12.5, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <CheckCircle2 size={16} /> Demande accomplie
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <h2 style={{ fontSize: 17, margin: '0 0 2px', color: th.text }}>Demande #{demande.numero}</h2>
            <p style={{ margin: 0, fontSize: 12.5, color: th.textDim }}>{demande.objet}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <StatutBadge demande={demande} th={th} onToggleStatut={onToggleStatut} />
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: th.textDim, cursor: 'pointer', padding: 4 }}>
              <X size={18} />
            </button>
          </div>
        </div>

        <DetailRow th={th} label="Demandeur" value={demande.nom} />
        <DetailRow th={th} label="Date de la demande" value={formatDate(demande.dateJour)} />
        <DetailRow th={th} label="Date idéale requise" value={formatDate(demande.dateRequise)} />
        <DetailRow th={th} label="Niveau de priorité" value={<PrioriteBadge priorite={demande.priorite} small />} />
        <DetailRow th={th} label="Objet de la demande" value={demande.objet} />
        <DetailRow th={th} label="Projet" value={demande.projet ? `${demande.projet.no} — ${demande.projet.nom}` : '—'} />
        <DetailRow th={th} label="Client" value={demande.projet?.client} />
        <DetailRow th={th} label="Chargé de projet"
          value={demande.projet ? `${demande.projet.charge} (${demande.projet.chargeEmail})` : '—'} />

        <div style={{ padding: '8px 0', borderBottom: `1px solid ${th.line}`, fontSize: 12.5 }}>
          <div style={{ color: th.textDim, marginBottom: 6 }}>Détails</div>
          {details.length === 0
            ? <div style={{ color: th.text }}>—</div>
            : (
              <ul style={{ margin: 0, paddingLeft: 18, color: th.text }}>
                {details.map((t, i) => <li key={i} style={{ marginBottom: 3 }}>{t}</li>)}
              </ul>
            )}
        </div>

        <DetailRow th={th} label="Informations complémentaires" value={demande.infosComplementaires} />
        <DetailRow th={th} label="Fichiers / photos"
          value={demande.photoFiles?.length ? demande.photoFiles.map(nomFichier).join(', ') : '—'} />

        <div style={{ marginTop: 18 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 11.5,
            color: BRAND_ORANGE, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5,
          }}>
            <Users size={13} /> Notifiés par courriel
          </div>
          <div style={{ fontSize: 12.5, lineHeight: 1.8 }}>
            {tousDestinataires.map((dest, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{dest}</span>
                <span style={{ fontSize: 10, color: demande.destinataires.fixes.includes(dest) ? th.textDim : BRAND_GREEN }}>
                  {demande.destinataires.fixes.includes(dest) ? 'fixe' : 'lié à cette demande'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Une demande de garage court de sa date de soumission jusqu'à la date
// idéale requise : elle s'affiche en barre continue, comme dans Demandes
// d'arpentage. Les deux bornes sont incluses; si la demande n'a qu'une
// journée, la barre occupe une seule case.
function bornesDemande(d) {
  const debut = d.dateJour;
  const fin = d.dateRequise && d.dateRequise > d.dateJour ? d.dateRequise : d.dateJour;
  return [debut, fin];
}

// Portion visible d'une demande dans une semaine de 7 dates ISO : renvoie
// les colonnes de début/fin (0..6), ou null si la demande ne touche pas
// cette semaine.
function trancheSemaine(demande, isoSemaine) {
  if (!demande.dateJour) return null;
  const [debut, fin] = bornesDemande(demande);
  if (fin < isoSemaine[0] || debut > isoSemaine[6]) return null;
  let colDebut = 0;
  let colFin = 6;
  for (let i = 0; i < 7; i++) {
    if (isoSemaine[i] >= debut) { colDebut = i; break; }
  }
  for (let i = 6; i >= 0; i--) {
    if (isoSemaine[i] <= fin) { colFin = i; break; }
  }
  if (colFin < colDebut) return null;
  return { colDebut, colFin, debutReel: debut >= isoSemaine[0], finReelle: fin <= isoSemaine[6] };
}

function BarreDemande({ d, isoSemaine, th, onOpen }) {
  const tranche = trancheSemaine(d, isoSemaine);
  if (!tranche) return null;
  const couleur = couleurDemande(d);
  const libelle = `#${d.numero} · ${d.objet} · ${d.nom}`;
  const [debut, fin] = bornesDemande(d);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 0, height: 18 }}>
      <div
        onClick={(e) => { e.stopPropagation(); onOpen(d); }}
        title={`${libelle} — ${d.priorite} — du ${formatDate(debut)} au ${formatDate(fin)}`}
        style={{
          gridColumn: `${tranche.colDebut + 1} / ${tranche.colFin + 2}`,
          background: couleur, color: '#fff',
          borderTopLeftRadius: tranche.debutReel ? 4 : 0,
          borderBottomLeftRadius: tranche.debutReel ? 4 : 0,
          borderTopRightRadius: tranche.finReelle ? 4 : 0,
          borderBottomRightRadius: tranche.finReelle ? 4 : 0,
          boxSizing: 'border-box', height: 18,
          display: 'flex', alignItems: 'center',
          paddingLeft: tranche.debutReel ? 6 : 3, paddingRight: 4,
          fontSize: 9.5, fontWeight: 700, cursor: 'pointer',
          overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
        }}>
        {libelle}
      </div>
    </div>
  );
}

function BlocSemaine({ jours, th, onOpen, demandes, moisReference, onJourClick }) {
  const isoSemaine = jours.map(toISODate);
  const ajourdhuiIso = toISODate(new Date());
  const demandesSemaine = demandes.filter(d => trancheSemaine(d, isoSemaine) !== null);

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 0, marginBottom: 4 }}>
        {jours.map((jour, i) => {
          const iso = isoSemaine[i];
          const horsMois = moisReference !== undefined && jour.getMonth() !== moisReference;
          const estAuj = iso === ajourdhuiIso;
          return (
            <div key={i} onClick={() => onJourClick(jour)} style={{
              textAlign: 'center', fontSize: 11, padding: '3px 0', cursor: 'pointer',
              color: horsMois ? `${th.textDim}80` : estAuj ? BRAND_RED : th.text,
              fontWeight: estAuj ? 700 : 400,
            }}>
              {jour.getDate()}
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minHeight: 6 }}>
        {demandesSemaine.map(d => (
          <BarreDemande key={d.numero} d={d} isoSemaine={isoSemaine} th={th} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}

function CalendarView({ demandesTriees, th, onOpen }) {
  const [vue, setVue] = useState('mois');
  const [refDate, setRefDate] = useState(new Date());

  function naviguer(delta) {
    setRefDate(prev => {
      if (vue === 'jour') return addDays(prev, delta);
      if (vue === 'semaine') return addDays(prev, delta * 7);
      if (vue === 'quinzaine') return addDays(prev, delta * 14);
      if (vue === 'mois') return addMonths(prev, delta);
      return addYears(prev, delta);
    });
  }
  function allerA(date, nouvelleVue) {
    setRefDate(date);
    if (nouvelleVue) setVue(nouvelleVue);
  }

  const boutonNav = {
    background: 'none', border: `1px solid ${th.line}`, color: th.text,
    borderRadius: 4, padding: 6, cursor: 'pointer', display: 'flex', alignItems: 'center',
  };

  let titre = '';
  if (vue === 'jour') titre = `${JOURS_COMPLETS[(refDate.getDay() + 6) % 7]} ${refDate.getDate()} ${MOIS_NOMS[refDate.getMonth()]} ${refDate.getFullYear()}`;
  else if (vue === 'semaine' || vue === 'quinzaine') {
    const lundi = startOfWeekMonday(refDate);
    const fin = addDays(lundi, vue === 'quinzaine' ? 13 : 6);
    titre = `${lundi.getDate()} ${MOIS_NOMS[lundi.getMonth()]} — ${fin.getDate()} ${MOIS_NOMS[fin.getMonth()]} ${fin.getFullYear()}`;
  } else if (vue === 'mois') titre = `${MOIS_NOMS[refDate.getMonth()]} ${refDate.getFullYear()}`;
  else titre = `${refDate.getFullYear()}`;

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {[
          { id: 'jour', label: 'Jour' },
          { id: 'semaine', label: 'Semaine' },
          { id: 'quinzaine', label: '2 semaines' },
          { id: 'mois', label: 'Mois' },
          { id: 'annee', label: 'Année' },
        ].map(v => (
          <button key={v.id} onClick={() => setVue(v.id)} style={{
            background: vue === v.id ? BRAND_RED : 'transparent',
            color: vue === v.id ? '#fff' : th.textDim,
            border: vue === v.id ? 'none' : `1px solid ${th.line}`,
            padding: '6px 14px', borderRadius: 20, fontSize: 11.5,
            textTransform: 'uppercase', letterSpacing: 0.5, cursor: 'pointer', fontWeight: 600,
          }}>
            {v.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <button onClick={() => naviguer(-1)} style={boutonNav}><ChevronLeft size={16} /></button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <CalendarDays size={15} color={th.textDim} />
          <span style={{ fontSize: 14, fontWeight: 700 }}>{titre}</span>
          <button onClick={() => setRefDate(new Date())} style={{
            background: 'none', border: `1px solid ${th.line}`, color: th.textDim,
            borderRadius: 4, padding: '4px 10px', fontSize: 11, cursor: 'pointer',
          }}>
            Aujourd'hui
          </button>
        </div>
        <button onClick={() => naviguer(1)} style={boutonNav}><ChevronRight size={16} /></button>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 14, fontSize: 11, color: th.textDim, flexWrap: 'wrap' }}>
        {PRIORITES.map(p => (
          <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: COULEUR_PRIORITE[p], display: 'inline-block' }} />
            {p}
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: VERT_ACCOMPLIE, display: 'inline-block' }} />
          Accomplie
        </div>
      </div>

      {vue === 'jour' && (() => {
        const iso = toISODate(refDate);
        const liste = demandesTriees.filter(d => {
          if (!d.dateJour) return false;
          const [debut, fin] = bornesDemande(d);
          return iso >= debut && iso <= fin;
        });
        return liste.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: th.textDim, fontSize: 13 }}>
            Aucune demande ce jour-là.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {liste.map(d => (
              <div key={d.numero} onClick={() => onOpen(d)} style={{
                background: th.panel, border: `1px solid ${th.line}`, borderLeft: `5px solid ${couleurDemande(d)}`,
                borderRadius: 6, padding: '14px 14px 14px 12px',
                cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap',
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>#{d.numero} · {d.objet}</div>
                  <div style={{ fontSize: 11.5, color: th.textDim, marginTop: 3 }}>
                    {d.nom}{d.projet ? ` · ${d.projet.no}` : ''} · {d.statut === 'Accomplie' ? 'Accomplie' : d.priorite}
                  </div>
                </div>
                <PrioriteBadge priorite={d.priorite} small />
              </div>
            ))}
          </div>
        );
      })()}

      {vue === 'semaine' && (
        <BlocSemaine
          jours={getWeeksStartingMonday(refDate, 1)[0]}
          th={th} onOpen={onOpen} demandes={demandesTriees}
          onJourClick={(jour) => allerA(jour, 'jour')}
        />
      )}

      {vue === 'quinzaine' && (
        getWeeksStartingMonday(refDate, 2).map((semaine, i) => (
          <BlocSemaine
            key={i} jours={semaine}
            th={th} onOpen={onOpen} demandes={demandesTriees}
            onJourClick={(jour) => allerA(jour, 'jour')}
          />
        ))
      )}

      {vue === 'mois' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 6 }}>
            {JOURS_ABREV.map(j => (
              <div key={j} style={{ fontSize: 10.5, color: th.textDim, textAlign: 'center', fontWeight: 600 }}>{j}</div>
            ))}
          </div>
          {getMonthGridWeeks(refDate).map((semaine, i) => (
            <BlocSemaine
              key={i} jours={semaine} moisReference={refDate.getMonth()}
              th={th} onOpen={onOpen} demandes={demandesTriees}
              onJourClick={(jour) => allerA(jour, 'jour')}
            />
          ))}
        </div>
      )}

      {vue === 'annee' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {MOIS_NOMS.map((nomMois, i) => {
            const compte = demandesTriees.filter(d => {
              if (!d.dateJour) return false;
              const dt = new Date(d.dateJour + 'T00:00:00');
              return dt.getFullYear() === refDate.getFullYear() && dt.getMonth() === i;
            }).length;
            return (
              <div key={i}
                onClick={() => allerA(new Date(refDate.getFullYear(), i, 1), 'mois')}
                style={{
                  background: th.panel, border: `1px solid ${th.line}`, borderRadius: 6,
                  padding: 16, cursor: 'pointer', textAlign: 'center',
                }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{nomMois}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: compte > 0 ? BRAND_RED : th.textDim, marginTop: 6 }}>
                  {compte}
                </div>
                <div style={{ fontSize: 10.5, color: th.textDim, marginTop: 2 }}>demande{compte !== 1 ? 's' : ''}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Le chemin de stockage est du genre "104/photo.jpg" — on n'affiche à
// l'écran que le nom du fichier, pas le numéro de dossier.
function nomFichier(chemin) {
  return (chemin || '').split('/').pop();
}

// Nettoie le nom de fichier avant de l'utiliser comme chemin de stockage
// (espaces, accents et caractères spéciaux peuvent causer des soucis).
function sanitizeNomFichier(nom) {
  const idxPoint = nom.lastIndexOf('.');
  const base = idxPoint > 0 ? nom.slice(0, idxPoint) : nom;
  const ext = idxPoint > 0 ? nom.slice(idxPoint) : '';
  const baseNettoyee = base
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_');
  return baseNettoyee + ext;
}

function mapRowToDemande(row, projets) {
  const projet = projets.find(p => p.no === row.projet_no) || null;
  const destinatairesVariables = dedupeDestinatairesVariables(
    [row.nom, projet?.charge].filter(Boolean)
  );
  return {
    numero: row.numero,
    dateJour: row.date_jour,
    dateRequise: row.date_requise || row.date_jour,
    nom: row.nom,
    projetNo: row.projet_no,
    priorite: row.priorite,
    objet: row.objet,
    details: row.details || [],
    infosComplementaires: row.infos_complementaires,
    photoFiles: row.fichiers || [],
    projet,
    destinataires: {
      fixes: DESTINATAIRES_FIXES,
      variables: destinatairesVariables,
    },
    statut: row.statut,
  };
}

function DemandeGarageApp({ userId, nom, poste, email, accessToken }) {
  const [mode, setMode] = useModePep();
  const th = THEMES[mode];

  const [tab, setTab] = useState('nouvelle');
  const [form, setForm] = useState(() => creerFormulaireInitial(nom));
  const [demandes, setDemandes] = useState([]);
  const [projets, setProjets] = useState([]);
  const [personnel, setPersonnel] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreurChargement, setErreurChargement] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [errors, setErrors] = useState({});
  const [detailDemande, setDetailDemande] = useState(null);
  const [recherche, setRecherche] = useState('');
  const [filtrePersonne, setFiltrePersonne] = useState('');
  const [filtrePriorite, setFiltrePriorite] = useState('');
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [erreurNotification, setErreurNotification] = useState('');
  const [erreurFichiers, setErreurFichiers] = useState('');

  useEffect(() => {
    let actif = true;
    async function charger() {
      setChargement(true);
      setErreurChargement('');
      const [{ data: projetsData, error: eProjets }, { data: personnelData, error: ePersonnel }, { data: demandesData, error: eDemandes }] = await Promise.all([
        supabaseLP.from('projets').select('no, nom, client, charge, courriel_cp, adresse').order('no', { ascending: false }),
        supabaseLP.from('personnel').select('nom, courriel, actif').eq('actif', true).order('nom'),
        supabaseGarage.from('demandes').select('*').order('numero', { ascending: false }),
      ]);
      if (!actif) return;
      if (eProjets || ePersonnel || eDemandes) {
        setErreurChargement("Impossible de charger les données. Réessaie dans un instant, ou avertis William si ça persiste.");
        setChargement(false);
        return;
      }
      const projetsMappes = (projetsData || []).map(p => ({
        no: p.no, nom: p.nom, client: p.client, charge: p.charge,
        chargeEmail: p.courriel_cp, lieu: p.adresse,
      }));
      setProjets(projetsMappes);
      setPersonnel((personnelData || []).map(p => p.nom));
      setDemandes((demandesData || []).map(r => mapRowToDemande(r, projetsMappes)));
      setChargement(false);
    }
    charger();
    return () => { actif = false; };
  }, []);

  const projetSelectionne = projets.find(p => p.no === form.projetNo);
  const prochainNumero = demandes.length > 0 ? Math.max(...demandes.map(d => d.numero)) + 1 : 100;

  function updateField(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
    setErrors(prev => ({ ...prev, [field]: undefined }));
  }

  function updateDetail(index, valeur) {
    setForm(prev => {
      const details = [...prev.details];
      details[index] = valeur;
      return { ...prev, details };
    });
    setErrors(prev => ({ ...prev, details: undefined }));
  }
  function ajouterDetail() {
    setForm(prev => ({ ...prev, details: [...prev.details, ''] }));
  }
  function retirerDetail(index) {
    setForm(prev => {
      const details = prev.details.filter((_, i) => i !== index);
      return { ...prev, details: details.length > 0 ? details : [''] };
    });
  }

  function validate() {
    const errs = {};
    if (!form.priorite) errs.priorite = 'Choisis un niveau de priorité';
    if (!form.dateRequise) errs.dateRequise = 'Choisis une date idéale';
    else if (form.dateRequise < todayISO()) errs.dateRequise = 'La date ne peut pas être passée';
    if (!form.objet.trim()) errs.objet = 'Requis';
    if (form.details.filter(d => d.trim()).length === 0) errs.details = 'Décris au moins un problème';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit() {
    if (!validate() || envoiEnCours) return;
    setEnvoiEnCours(true);
    setErreurNotification('');
    setErreurFichiers('');

    const payload = {
      user_id: userId,
      nom: form.nom,
      demandeur_email: email,
      projet_no: form.projetNo || null,
      priorite: form.priorite,
      date_requise: form.dateRequise || null,
      objet: form.objet.trim(),
      details: form.details.map(d => d.trim()).filter(Boolean),
      infos_complementaires: form.infosComplementaires,
      fichiers: [], // rempli après coup une fois le numéro de demande connu
    };

    const { data, error } = await supabaseGarage.from('demandes').insert(payload).select().single();
    if (error) {
      setEnvoiEnCours(false);
      setErrors({ general: "Impossible de soumettre la demande. Réessaie dans un instant." });
      return;
    }

    // Téléversement des fichiers/photos vers Supabase Storage — la demande
    // est déjà enregistrée à ce stade, donc un échec ici n'annule rien.
    let cheminsFichiers = [];
    if (form.photoFiles.length > 0) {
      const resultats = await Promise.all(form.photoFiles.map(async (fichier) => {
        const chemin = `${data.numero}/${sanitizeNomFichier(fichier.name)}`;
        const { error: eUpload } = await supabaseGarage.storage
          .from('garage-fichiers')
          .upload(chemin, fichier, { upsert: true, contentType: fichier.type || undefined });
        if (eUpload) console.error('Erreur téléversement fichier:', fichier.name, eUpload);
        return eUpload ? null : chemin;
      }));
      cheminsFichiers = resultats.filter(Boolean);
      if (cheminsFichiers.length < form.photoFiles.length) {
        setErreurFichiers("La demande est enregistrée, mais un ou plusieurs fichiers n'ont pas pu être téléversés.");
      }
      if (cheminsFichiers.length > 0) {
        await supabaseGarage.from('demandes').update({ fichiers: cheminsFichiers }).eq('numero', data.numero);
      }
    }

    setEnvoiEnCours(false);
    const demande = mapRowToDemande({ ...data, fichiers: cheminsFichiers }, projets);
    setDemandes(prev => [demande, ...prev]);
    setConfirmation(demande);
    setForm(creerFormulaireInitial(nom));

    // Envoi des courriels de notification — la demande est déjà enregistrée
    // à ce stade, donc un échec ici n'annule rien, on informe juste.
    try {
      const reponse = await fetch('/api/demande-garage/notifier/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ numero: data.numero }),
      });
      if (!reponse.ok) {
        const detail = await reponse.json().catch(() => ({}));
        console.error('Notification garage — erreur serveur:', detail.error || reponse.status);
        setErreurNotification("La demande est enregistrée, mais l'envoi des courriels de notification a échoué.");
      } else {
        const resultat = await reponse.json().catch(() => ({}));
        const nonInclues = (resultat.piecesJointes || []).filter(p => p.statut !== 'inclus');
        if (nonInclues.length > 0) {
          console.warn('Pièces jointes non incluses au courriel:', nonInclues);
          setErreurFichiers(
            `Le courriel a été envoyé, mais ${nonInclues.length > 1 ? nonInclues.length + ' pièces jointes n’ont' : 'une pièce jointe n’a'} pas pu être incluse (voir la console pour le détail).`
          );
        }
      }
    } catch (e) {
      console.error('Notification garage — erreur réseau:', e);
      setErreurNotification("La demande est enregistrée, mais l'envoi des courriels de notification a échoué.");
    }
  }

  async function toggleStatut(numero) {
    const courante = demandes.find(d => d.numero === numero);
    if (!courante) return;
    const nouveauStatut = courante.statut === 'En attente' ? 'Accomplie' : 'En attente';
    setDemandes(prev => prev.map(d => d.numero === numero ? { ...d, statut: nouveauStatut } : d));
    const { error } = await supabaseGarage.from('demandes').update({ statut: nouveauStatut }).eq('numero', numero);
    if (error) {
      setDemandes(prev => prev.map(d => d.numero === numero ? { ...d, statut: courante.statut } : d));
    }
  }

  const inputStyle = {
    width: '100%', background: th.inputBg, border: `1px solid ${th.line}`, color: th.text,
    padding: '9px 12px', borderRadius: 4, fontSize: 13.5, boxSizing: 'border-box',
  };
  const uploadBoxStyle = {
    display: 'flex', alignItems: 'center', gap: 8, background: th.inputBg,
    border: `1px dashed ${th.line}`, color: th.textDim, padding: '9px 12px',
    borderRadius: 4, fontSize: 12.5, cursor: 'pointer',
  };

  if (chargement) {
    return (
      <div style={{
        minHeight: '100vh', background: th.bg, display: 'flex', alignItems: 'center',
        justifyContent: 'center', color: th.textDim, fontFamily: "Calibri, 'Segoe UI', Candara, Optima, Arial, sans-serif",
      }}>
        Chargement…
      </div>
    );
  }
  if (erreurChargement) {
    return (
      <div style={{
        minHeight: '100vh', background: th.bg, display: 'flex', alignItems: 'center',
        justifyContent: 'center', color: BRAND_RED, fontFamily: "Calibri, 'Segoe UI', Candara, Optima, Arial, sans-serif",
        textAlign: 'center', padding: 24,
      }}>
        {erreurChargement}
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
        titre="Demande garage"
        sousTitre="Formulaire de demande au garage"
        mode={mode}
        onChangerMode={setMode}
        nom={nom}
        poste={poste}
        onAccueil={() => { setTab('nouvelle'); setConfirmation(null); setDetailDemande(null); }}
      />

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 16px 40px' }}>



        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {[
            { id: 'nouvelle', label: 'Nouvelle demande' },
            { id: 'suivi', label: `Suivi des demandes (${demandes.length})` },
            { id: 'calendrier', label: 'Calendrier' },
          ].map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); setConfirmation(null); }} style={{
              background: tab === t.id ? BRAND_RED : 'transparent',
              color: tab === t.id ? '#fff' : th.textDim,
              border: tab === t.id ? 'none' : `1px solid ${th.line}`,
              padding: '8px 16px', borderRadius: 20, fontSize: 12.5,
              textTransform: 'uppercase', letterSpacing: 0.5, cursor: 'pointer', fontWeight: 600,
            }}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'nouvelle' && !confirmation && (
          <div style={{ background: th.panel, border: `1px solid ${th.line}`, borderRadius: 6, padding: 24 }}>

            <Field th={th} label="Votre nom">
              <input value={form.nom} disabled style={{ ...inputStyle, opacity: 0.7 }} />
            </Field>

            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <Field th={th} label="Date du jour">
                  <input value={formatDate(todayISO())} disabled style={{ ...inputStyle, opacity: 0.6 }} />
                </Field>
              </div>
              <div style={{ flex: 1 }}>
                <Field th={th} label="Numéro demande">
                  <input value={prochainNumero} disabled style={{ ...inputStyle, opacity: 0.6 }} />
                </Field>
              </div>
            </div>

            <Field th={th} label="Projet (non obligatoire)">
              <ComboboxProjet value={form.projetNo} onChange={v => updateField('projetNo', v)} projets={projets} th={th} />
            </Field>

            {projetSelectionne && (
              <div style={{
                background: th.inputBg, border: `1px solid ${th.line}`, borderRadius: 4,
                padding: '10px 14px', marginBottom: 16, fontSize: 12.5, color: th.textDim,
              }}>
                <div>{projetSelectionne.lieu} · Client : {projetSelectionne.client}</div>
                <div style={{ marginTop: 4 }}>Chargé de projet : <strong style={{ color: th.text }}>{projetSelectionne.charge}</strong> ({projetSelectionne.chargeEmail})</div>
              </div>
            )}

            <Field th={th} label="Niveau de priorité" error={errors.priorite}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {PRIORITES.map(p => (
                  <button key={p} type="button" onClick={() => updateField('priorite', p)} style={{
                    background: form.priorite === p ? COULEUR_PRIORITE[p] : th.inputBg,
                    color: form.priorite === p ? '#fff' : th.textDim,
                    border: `1px solid ${form.priorite === p ? COULEUR_PRIORITE[p] : th.line}`,
                    borderRadius: 20, padding: '6px 16px',
                    fontSize: 12, cursor: 'pointer', fontWeight: 700, whiteSpace: 'nowrap',
                  }}>
                    {p}
                  </button>
                ))}
              </div>
            </Field>

            <Field th={th} label="Date idéale requise" error={errors.dateRequise}>
              <input type="date" value={form.dateRequise} min={todayISO()}
                onChange={e => updateField('dateRequise', e.target.value)}
                style={{ ...inputStyle, colorScheme: mode === 'night' ? 'dark' : 'light' }} />
              <div style={{ fontSize: 11, color: th.textDim, marginTop: 5 }}>
                Dans le calendrier, la demande s'étire de la date du jour jusqu'à cette date.
              </div>
            </Field>

            <Field th={th} label="Objet de la demande (numéro du véhicule ou autre)" error={errors.objet}>
              <input value={form.objet} onChange={e => updateField('objet', e.target.value)}
                placeholder="ex : camion 214, pépine JD310, scie à béton…" style={inputStyle} />
            </Field>

            <Field th={th} label="Détails (ajoute une ligne par problème)" error={errors.details}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {form.details.map((valeur, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      value={valeur}
                      onChange={e => updateDetail(i, e.target.value)}
                      placeholder={i === 0 ? 'Décris le problème' : 'Autre problème'}
                      style={inputStyle}
                    />
                    <button type="button" onClick={() => retirerDetail(i)} title="Retirer cette ligne"
                      style={{
                        background: 'none', border: `1px solid ${th.line}`, color: th.textDim,
                        borderRadius: 4, padding: 8, cursor: 'pointer', display: 'flex', alignItems: 'center',
                        flexShrink: 0,
                      }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={ajouterDetail} style={{
                marginTop: 8, background: 'none', border: `1px solid ${th.line}`, color: th.text,
                borderRadius: 4, padding: '7px 14px', cursor: 'pointer', fontSize: 12.5,
                display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600,
              }}>
                <Plus size={14} /> Ajouter un item
              </button>
            </Field>

            <Field th={th} label="Informations complémentaires">
              <textarea value={form.infosComplementaires} onChange={e => updateField('infosComplementaires', e.target.value)}
                rows={3} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
            </Field>

            <Field th={th} label="Fichiers ou photos">
              <label style={uploadBoxStyle}>
                <Upload size={16} />
                <span>Choisir des fichiers…</span>
                <input type="file" multiple style={{ display: 'none' }}
                  onChange={e => updateField('photoFiles', Array.from(e.target.files))} />
              </label>
              {form.photoFiles.length > 0 && (
                <div style={{ fontSize: 11.5, color: th.textDim, marginTop: 6 }}>{form.photoFiles.map(f => f.name).join(', ')}</div>
              )}
            </Field>

            {errors.general && (
              <div style={{ color: BRAND_RED, fontSize: 12.5, marginBottom: 12 }}>{errors.general}</div>
            )}

            <button onClick={handleSubmit} disabled={envoiEnCours} style={{
              width: '100%', background: BRAND_RED, color: '#fff', border: 'none',
              padding: '12px', borderRadius: 4, fontWeight: 700, fontSize: 13,
              textTransform: 'uppercase', letterSpacing: 0.5, cursor: envoiEnCours ? 'default' : 'pointer',
              opacity: envoiEnCours ? 0.7 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8,
            }}>
              <Send size={16} /> {envoiEnCours ? 'Envoi en cours…' : 'Soumettre la demande'}
            </button>
          </div>
        )}

        {tab === 'nouvelle' && confirmation && (
          <div style={{ background: th.panel, border: `1px solid ${th.line}`, borderRadius: 6, padding: 28, textAlign: 'center' }}>
            <CheckCircle2 size={40} color={BRAND_GREEN} style={{ marginBottom: 10 }} />
            <h2 style={{ fontSize: 17, margin: '0 0 4px' }}>Demande #{confirmation.numero} soumise</h2>
            <p style={{ color: th.textDim, fontSize: 12.5, margin: '0 0 20px' }}>
              {confirmation.objet}{confirmation.projet ? ` · ${confirmation.projet.no} — ${confirmation.projet.nom}` : ''}
            </p>

            <div style={{ textAlign: 'left', background: th.inputBg, border: `1px solid ${th.line}`, borderRadius: 4, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 12.5, color: BRAND_ORANGE, fontWeight: 600, textTransform: 'uppercase' }}>
                <Users size={14} /> Courriel de notification envoyé à :
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.7 }}>
                {[...confirmation.destinataires.fixes, ...confirmation.destinataires.variables].map((d, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{d}</span>
                    <span style={{ fontSize: 10.5, color: confirmation.destinataires.fixes.includes(d) ? th.textDim : BRAND_GREEN }}>
                      {confirmation.destinataires.fixes.includes(d) ? 'fixe' : 'lié à cette demande'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {erreurFichiers && (
              <div style={{
                marginTop: 14, background: `${BRAND_RED}18`, color: BRAND_RED, borderRadius: 4,
                padding: '10px 14px', fontSize: 12.5, textAlign: 'left',
              }}>
                ⚠️ {erreurFichiers}
              </div>
            )}

            {erreurNotification && (
              <div style={{
                marginTop: 14, background: `${BRAND_RED}18`, color: BRAND_RED, borderRadius: 4,
                padding: '10px 14px', fontSize: 12.5, textAlign: 'left',
              }}>
                ⚠️ {erreurNotification}
              </div>
            )}

            <button onClick={() => { setConfirmation(null); }} style={{
              marginTop: 20, background: 'transparent', color: th.text, border: `1px solid ${th.line}`,
              padding: '9px 18px', borderRadius: 4, cursor: 'pointer', fontSize: 12.5,
            }}>
              Faire une autre demande
            </button>
          </div>
        )}

        {tab === 'suivi' && (() => {
          let filtrees = filtrerParRecherche(demandes, recherche);
          if (filtrePersonne) filtrees = filtrees.filter(d => d.nom === filtrePersonne);
          if (filtrePriorite) filtrees = filtrees.filter(d => d.priorite === filtrePriorite);
          const enCours = trierParPriorite(filtrees.filter(d => d.statut !== 'Accomplie'));
          const realisees = trierParPriorite(filtrees.filter(d => d.statut === 'Accomplie'));
          return (
            <div>
              <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
                <input
                  value={recherche}
                  onChange={e => setRecherche(e.target.value)}
                  placeholder="Rechercher par nom, objet, détail, projet…"
                  style={{ ...inputStyle, flex: 1, minWidth: 220 }}
                />
                <select value={filtrePersonne} onChange={e => setFiltrePersonne(e.target.value)}
                  style={{ ...inputStyle, width: 'auto', minWidth: 170 }}>
                  <option value="">Toutes les personnes</option>
                  {personnel.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                <select value={filtrePriorite} onChange={e => setFiltrePriorite(e.target.value)}
                  style={{ ...inputStyle, width: 'auto', minWidth: 150 }}>
                  <option value="">Toutes les priorités</option>
                  {PRIORITES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {filtrees.length === 0 && (
                  <div style={{ textAlign: 'center', padding: 40, color: th.textDim, fontSize: 13 }}>
                    {demandes.length === 0 ? "Aucune demande soumise pour l'instant." : 'Aucun résultat pour cette recherche.'}
                  </div>
                )}
                {enCours.map(d => (
                  <DemandeCard key={d.numero} d={d} th={th} onOpen={setDetailDemande} onToggleStatut={toggleStatut} />
                ))}
              </div>

              {realisees.length > 0 && (
                <div style={{ marginTop: 26 }}>
                  <div style={{
                    fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: th.textDim,
                    fontWeight: 700, marginBottom: 10, paddingTop: 14, borderTop: `1px solid ${th.line}`,
                  }}>
                    Réalisées ({realisees.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {realisees.map(d => (
                      <DemandeCard key={d.numero} d={d} th={th} onOpen={setDetailDemande} onToggleStatut={toggleStatut} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {tab === 'calendrier' && (
          <CalendarView demandesTriees={trierParPriorite(demandes)} th={th} onOpen={setDetailDemande} />
        )}

      </div>

      <DetailModal demande={detailDemande} th={th} onClose={() => setDetailDemande(null)} onToggleStatut={toggleStatut} />
    </div>
  );
}

export default function DemandeGaragePage() {
  const [session, setSession] = useState(null);

  if (!session) {
    return <GardeConnexion appSlug="demande-garage" nomApp="Demande garage" onPret={setSession} />;
  }

  return (
    <DemandeGarageApp
      userId={session.userId}
      nom={session.nom}
      poste={session.poste}
      email={session.email}
      accessToken={session.accessToken}
    />
  );
}

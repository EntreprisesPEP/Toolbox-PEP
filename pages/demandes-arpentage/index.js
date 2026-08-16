import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import AuthGate from '../../components/demandes-arpentage/AuthGate';
import {
  Send, CheckCircle2, Users, FileText, Upload, Clock, MapPin, Moon, Sun,
  X, ChevronLeft, ChevronRight, CalendarDays,
} from 'lucide-react';

const LOGO_PEP = '/_static/planification-hebdomadaire/logo-pep.png';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Client sur le schema arpentage (table demandes)
const supabaseArp = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { db: { schema: 'arpentage' } });
// Client sur le schema liste_projets (projets + personnel — déjà en place
// pour l'app Liste des projets, on le réutilise ici en lecture seule)
const supabaseLP = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { db: { schema: 'liste_projets' } });

// ---------------------------------------------------------------------------
// Destinataires fixes sur CHAQUE demande, peu importe le projet — ces 5
// personnes reçoivent toujours la notification. (Les courriels servent
// pour l'instant seulement à l'affichage "qui sera notifié" — voir la
// note sur l'envoi réel des courriels dans LIS-MOI-DABORD.txt.)
// ---------------------------------------------------------------------------
const DESTINATAIRES_FIXES = [
  { nom: 'André Pichette', email: 'apichette@pep2000.com' },
  { nom: 'Anthony Pelliccia', email: 'apelliccia@pep2000.com' },
  { nom: 'François Ouellet', email: 'fouellet@pep2000.com' },
  { nom: 'Tony Moschetta', email: 'amoschetta@pep2000.com' },
  { nom: 'William Dubreuil', email: 'wdubreuil@pep2000.com' },
].map(p => `${p.nom} (${p.email})`);

const TYPES_DEMANDE = [
  'BM', 'Décontamination', 'GPS', 'Implantation',
  'Relevé de roc', 'Relevé du TN', 'Surface', 'TQC'
];

const initialForm = {
  nom: '',
  projetNo: '',
  personnesAdditionnelles: [],
  dateRequise: '',
  dateAutorisee: '',
  typeDemande: 'Implantation',
  endroit: '',
  planMention: '',
  dwgDisponible: false,
  infosComplementaires: '',
  photoFiles: [],
};

function joursEntre(dateA, dateB) {
  // Nombre de jours calendrier entre deux dates ISO (dateB - dateA)
  const a = new Date(dateA + 'T00:00:00');
  const b = new Date(dateB + 'T00:00:00');
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

// ---------------------------------------------------------------------------
// PRIORITÉ — la demande requise le plus tôt passe en premier ; à date
// requise égale, celle soumise depuis le plus longtemps (dateJour la plus
// ancienne) passe en premier.
// ---------------------------------------------------------------------------
function comparerPriorite(a, b) {
  if (a.dateRequise !== b.dateRequise) return a.dateRequise < b.dateRequise ? -1 : 1;
  if (a.dateJour !== b.dateJour) return a.dateJour < b.dateJour ? -1 : 1;
  return a.numero - b.numero;
}
function trierParPriorite(liste) {
  return [...liste].sort(comparerPriorite);
}

// ---------------------------------------------------------------------------
// RECHERCHE ET TRI DU SUIVI — par personne, par numéro de projet, ou
// recherche libre par mots (nom, projet, endroit, type de demande, numéro).
// ---------------------------------------------------------------------------
function filtrerParRecherche(liste, texte) {
  const q = texte.trim().toLowerCase();
  if (!q) return liste;
  return liste.filter(d => {
    const champs = [
      String(d.numero), d.nom, d.projet?.no, d.projet?.nom,
      d.endroit, d.typeDemande, d.projet?.client,
    ];
    return champs.some(c => c && c.toLowerCase().includes(q));
  });
}


// ---------------------------------------------------------------------------
// UTILITAIRES DE DATES — pour le calendrier (vues Jour / Semaine / Mois / Année)
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
const BRAND_RED = '#c41230';
const BRAND_GREEN = '#2fa360';
const BRAND_ORANGE = '#f0a202';
const VERT_ACCOMPLIE = '#019155'; // vert PEP (extrait du vrai logo)

// ---------------------------------------------------------------------------
// LIGNE DE TEMPS PAR DEMANDE — de la date de la demande (soumission) à la
// date requise, en passant par la date autorisée (date à laquelle le site
// est réellement prêt) :
//   - avant la date autorisée : en attente (blanc, contour noir)
//   - à partir de la date autorisée jusqu'à la date requise : urgent
//     (rouge PEP) — si la date autorisée == date de la demande, tout le
//     segment est rouge, il n'y a pas de portion "en attente".
//   - si la demande est marquée Accomplie : tout le segment devient vert
//     PEP, peu importe la phase.
// ---------------------------------------------------------------------------
function demandesActivesLeJour(liste, isoDay) {
  return liste.filter(d => d.dateJour && d.dateRequise && d.dateJour <= isoDay && isoDay <= d.dateRequise);
}
function phaseDuJour(demande, isoDay) {
  if (demande.statut === 'Accomplie') return 'accomplie';
  const dateAutorisee = demande.dateAutorisee || demande.dateJour;
  return isoDay < dateAutorisee ? 'attente' : 'urgent';
}
function couleurPhase(phase) {
  if (phase === 'accomplie') return VERT_ACCOMPLIE;
  if (phase === 'urgent') return BRAND_RED;
  return '#000000'; // attente — représenté par un contour noir ailleurs
}

// ---------------------------------------------------------------------------
// GRILLES DE SEMAINES — pour les vues Semaine / 2 semaines / Mois, toutes
// construites à partir de "blocs" de 7 jours (Lundi à Dimanche), pour que le
// rendu Gantt (barres continues) soit le même code partout.
// ---------------------------------------------------------------------------
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

// Pour une demande et une semaine (7 dates), calcule où placer la barre
// (colonnes de début/fin dans cette semaine), la proportion grise/jaune,
// et si la barre touche vraiment le début/la fin de la demande (pour
// n'arrondir les coins qu'à ces endroits — le reste reste "coupé" pour
// bien montrer que ça continue sur la semaine suivante).
// Découpe la portion d'une demande visible dans une semaine donnée en
// segments contigus de même phase (attente / urgent / accomplie), pour
// pouvoir donner à chacun son propre style (le blanc à contour noir ne
// peut pas se faire avec un dégradé).
function segmentsDemandeSemaine(demande, isoSemaine) {
  if (!demande.dateJour || !demande.dateRequise) return [];
  const debutSemaine = isoSemaine[0];
  const finSemaine = isoSemaine[6];
  if (demande.dateRequise < debutSemaine || demande.dateJour > finSemaine) return [];

  const segments = [];
  let curStart = null;
  let curPhase = null;
  for (let i = 0; i < 7; i++) {
    const iso = isoSemaine[i];
    const actif = iso >= demande.dateJour && iso <= demande.dateRequise;
    const phase = actif ? phaseDuJour(demande, iso) : null;
    if (phase !== curPhase) {
      if (curPhase !== null) segments.push({ start: curStart, end: i - 1, phase: curPhase });
      curStart = i;
      curPhase = phase;
    }
  }
  if (curPhase !== null) segments.push({ start: curStart, end: 6, phase: curPhase });
  return segments;
}

function styleSegment(phase) {
  if (phase === 'accomplie') return { background: VERT_ACCOMPLIE, border: 'none', color: '#ffffff' };
  if (phase === 'urgent') return { background: BRAND_RED, border: 'none', color: '#ffffff' };
  return { background: '#ffffff', border: '1.5px solid #000000', color: '#000000' }; // attente
}

function BarreGantt({ demande, isoSemaine, th, onOpen }) {
  const segments = segmentsDemandeSemaine(demande, isoSemaine);
  if (segments.length === 0) return null;

  const debutSemaine = isoSemaine[0];
  const finSemaine = isoSemaine[6];
  const debutReelDemande = demande.dateJour >= debutSemaine && demande.dateJour <= finSemaine;
  const finReelleDemande = demande.dateRequise >= debutSemaine && demande.dateRequise <= finSemaine;
  const libelle = `#${demande.numero} · ${demande.projet?.no} — ${demande.projet?.nom} · ${demande.nom}`;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0, height: 20 }}>
      {segments.map((seg, si) => {
        const style = styleSegment(seg.phase);
        const estPremier = si === 0;
        const estDernier = si === segments.length - 1;
        const arrondiGauche = estPremier && debutReelDemande;
        const arrondiDroit = estDernier && finReelleDemande;
        return (
          <div
            key={si}
            onClick={() => onOpen(demande)}
            title={libelle}
            style={{
              gridColumn: `${seg.start + 1} / ${seg.end + 2}`,
              background: style.background,
              border: style.border,
              borderTopLeftRadius: arrondiGauche ? 4 : 0,
              borderBottomLeftRadius: arrondiGauche ? 4 : 0,
              borderTopRightRadius: arrondiDroit ? 4 : 0,
              borderBottomRightRadius: arrondiDroit ? 4 : 0,
              boxSizing: 'border-box',
              height: 20,
              display: 'flex', alignItems: 'center',
              paddingLeft: estPremier ? (arrondiGauche ? 7 : 4) : 3,
              paddingRight: 4,
              fontSize: 9.5, fontWeight: 700, color: style.color,
              cursor: 'pointer', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
            }}>
            {estPremier ? libelle : ''}
          </div>
        );
      })}
    </div>
  );
}

function BlocSemaine({ jours, th, onOpen, demandesTriees, moisReference, onJourClick }) {
  const isoSemaine = jours.map(toISODate);
  const demandesSemaine = demandesTriees.filter(d => segmentsDemandeSemaine(d, isoSemaine).length > 0);
  const ajourdhuiIso = toISODate(new Date());

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
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
          <BarreGantt key={d.numero} demande={d} isoSemaine={isoSemaine} th={th} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// THÈMES — mêmes teintes de marque (rouge/vert/orange) dans les 2 modes,
// seuls les fonds/textes changent, comme sur le vrai Toolbox.
// ---------------------------------------------------------------------------
const THEMES = {
  night: {
    bg: '#10192e',
    panel: '#182238',
    inputBg: '#10192e',
    line: '#2c3752',
    text: '#e7eaf0',
    textDim: '#8a93a8',
    toggleInactiveText: '#9aa5c0',
  },
  day: {
    bg: '#eef1f7',
    panel: '#ffffff',
    inputBg: '#f4f6fb',
    line: '#dde1ea',
    text: '#1a2035',
    textDim: '#6b7488',
    toggleInactiveText: '#5c6478',
  },
};

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
  return (
    <div onClick={() => onOpen(d)} style={{
      background: accomplie ? VERT_ACCOMPLIE : th.panel,
      border: `1px solid ${accomplie ? VERT_ACCOMPLIE : th.line}`,
      borderRadius: 6, padding: 16,
      display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', cursor: 'pointer',
      transition: 'background 0.15s ease, border-color 0.15s ease',
    }}>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: accomplie ? '#fff' : th.text }}>
          #{d.numero} · {d.projet?.no} — {d.projet?.nom}
        </div>
        <div style={{ fontSize: 12, color: accomplie ? 'rgba(255,255,255,0.85)' : th.textDim, marginTop: 4 }}>
          Par {d.nom} · Type : {d.typeDemande} · <MapPin size={11} style={{ display: 'inline' }} /> {d.endroit}
        </div>
        <div style={{
          fontSize: 11.5, color: accomplie ? 'rgba(255,255,255,0.85)' : th.textDim, marginTop: 4,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <Clock size={11} /> Requise : {formatDate(d.dateRequise)} · Autorisée : {formatDate(d.dateAutorisee)}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
        <StatutBadge demande={d} th={th} onToggleStatut={onToggleStatut} />
        {d.planMention && (
          <div style={{
            fontSize: 11, color: accomplie ? 'rgba(255,255,255,0.85)' : th.textDim,
            display: 'flex', alignItems: 'center', gap: 4, maxWidth: 220, textAlign: 'right',
          }}>
            <FileText size={11} style={{ flexShrink: 0 }} /> {d.planMention}
          </div>
        )}
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
  const delai = demande.dateRequise ? joursEntre(demande.dateJour, demande.dateRequise) : null;
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
            <p style={{ margin: 0, fontSize: 12.5, color: th.textDim }}>
              {demande.projet?.no} — {demande.projet?.nom}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <StatutBadge demande={demande} th={th} onToggleStatut={onToggleStatut} />
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: th.textDim, cursor: 'pointer', padding: 4 }}>
              <X size={18} />
            </button>
          </div>
        </div>

        <DetailRow th={th} label="Demandeur" value={demande.nom} />
        <DetailRow th={th} label="Date de soumission" value={formatDate(demande.dateJour)} />
        <DetailRow th={th} label="Client" value={demande.projet?.client} />
        <DetailRow th={th} label="Lieu du projet" value={demande.projet?.lieu} />
        <DetailRow th={th} label="Chargé de projet" value={demande.projet ? `${demande.projet.charge} (${demande.projet.chargeEmail})` : '—'} />
        <DetailRow th={th} label="Personnes additionnelles"
          value={demande.personnesAdditionnelles?.length ? demande.personnesAdditionnelles.join(', ') : '—'} />
        <DetailRow th={th} label="Date requise" value={formatDate(demande.dateRequise)} />
        <DetailRow th={th} label="Date autorisée" value={formatDate(demande.dateAutorisee)} />
        <DetailRow th={th} label="Délai de traitement"
          value={delai === null ? '—' : delai < 0 ? `Dépassé de ${Math.abs(delai)} j` : delai === 0 ? "Aujourd'hui même" : `${delai} jour${delai > 1 ? 's' : ''}`} />
        <DetailRow th={th} label="Type de demande" value={demande.typeDemande} />
        <DetailRow th={th} label="Endroit des travaux" value={demande.endroit} />
        <DetailRow th={th} label="Plan" value={demande.planMention} />
        <DetailRow th={th} label="Disponible en DWG" value={demande.dwgDisponible ? 'Oui' : 'Non'} />
        <DetailRow th={th} label="Informations complémentaires" value={demande.infosComplementaires} />
        <DetailRow th={th} label="Fichiers / photos"
          value={demande.photoFiles?.length ? demande.photoFiles.join(', ') : '—'} />

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
            color: vue === v.id ? '#fff' : th.toggleInactiveText,
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: '#fff', border: '1.5px solid #000', display: 'inline-block' }} />
          En attente d'autorisation
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: BRAND_RED, display: 'inline-block' }} />
          Site autorisé, en attente des travaux
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: VERT_ACCOMPLIE, display: 'inline-block' }} />
          Accomplie
        </div>
      </div>

      {vue === 'jour' && (() => {
        const iso = toISODate(refDate);
        const liste = demandesActivesLeJour(demandesTriees, iso);
        return liste.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: th.textDim, fontSize: 13 }}>
            Aucune demande active ce jour-là.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {liste.map(d => {
              const phase = phaseDuJour(d, iso);
              const libellePhase = phase === 'accomplie'
                ? 'Accomplie'
                : phase === 'attente'
                  ? "En attente d'autorisation"
                  : 'Site autorisé — en attente des travaux';
              return (
                <div key={d.numero} onClick={() => onOpen(d)} style={{
                  background: th.panel, border: `1px solid ${th.line}`, borderLeft: `5px solid ${couleurPhase(phase)}`,
                  borderRadius: 6, padding: '14px 14px 14px 12px',
                  cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap',
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>#{d.numero} · {d.projet?.no} · {d.nom}</div>
                    <div style={{ fontSize: 11.5, color: th.textDim, marginTop: 3 }}>
                      {d.projet?.nom} · {d.typeDemande} · {libellePhase}
                    </div>
                  </div>
                  <StatutBadge demande={d} th={th} onToggleStatut={() => {}} small />
                </div>
              );
            })}
          </div>
        );
      })()}

      {vue === 'semaine' && (
        <BlocSemaine
          jours={getWeeksStartingMonday(refDate, 1)[0]}
          th={th} onOpen={onOpen} demandesTriees={demandesTriees}
          onJourClick={(jour) => allerA(jour, 'jour')}
        />
      )}

      {vue === 'quinzaine' && (
        getWeeksStartingMonday(refDate, 2).map((semaine, i) => (
          <BlocSemaine
            key={i} jours={semaine}
            th={th} onOpen={onOpen} demandesTriees={demandesTriees}
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
              th={th} onOpen={onOpen} demandesTriees={demandesTriees}
              onJourClick={(jour) => allerA(jour, 'jour')}
            />
          ))}
        </div>
      )}

      {vue === 'annee' && (() => {
        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {MOIS_NOMS.map((nomMois, i) => {
              const compte = demandesTriees.filter(d => {
                if (!d.dateRequise) return false;
                const dt = new Date(d.dateRequise + 'T00:00:00');
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
        );
      })()}
    </div>
  );
}

function mapRowToDemande(row, projets) {
  const projet = projets.find(p => p.no === row.projet_no) || null;
  const destinatairesVariables = [row.nom, projet?.charge, ...(row.personnes_additionnelles || [])].filter(Boolean);
  return {
    numero: row.numero,
    dateJour: row.date_jour,
    nom: row.nom,
    projetNo: row.projet_no,
    personnesAdditionnelles: row.personnes_additionnelles || [],
    dateRequise: row.date_requise,
    dateAutorisee: row.date_autorisee,
    typeDemande: row.type_demande,
    endroit: row.endroit,
    planMention: row.plan_mention,
    dwgDisponible: row.dwg_disponible,
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

function DemandeArpentageApp({ userId, nom, email }) {
  const [mode, setMode] = useState('night');
  const th = THEMES[mode];

  const [tab, setTab] = useState('nouvelle');
  const [form, setForm] = useState({ ...initialForm, nom });
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
  const [filtreProjet, setFiltreProjet] = useState('');
  const [envoiEnCours, setEnvoiEnCours] = useState(false);

  useEffect(() => {
    let actif = true;
    async function charger() {
      setChargement(true);
      setErreurChargement('');
      const [{ data: projetsData, error: eProjets }, { data: personnelData, error: ePersonnel }, { data: demandesData, error: eDemandes }] = await Promise.all([
        supabaseLP.from('projets').select('no, nom, client, charge, courriel_cp, adresse').order('no'),
        supabaseLP.from('personnel').select('nom, courriel, actif').eq('actif', true).order('nom'),
        supabaseArp.from('demandes').select('*').order('numero', { ascending: false }),
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

  function updateField(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
    setErrors(prev => ({ ...prev, [field]: undefined }));
  }

  function validate() {
    const errs = {};
    if (!form.projetNo) errs.projetNo = 'Requis';
    if (!form.dateRequise) errs.dateRequise = 'Requis';
    if (!form.dateAutorisee) errs.dateAutorisee = 'Requis';
    if (!form.endroit.trim()) errs.endroit = 'Requis';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit() {
    if (!validate() || envoiEnCours) return;
    setEnvoiEnCours(true);

    const payload = {
      user_id: userId,
      nom: form.nom,
      projet_no: form.projetNo,
      personnes_additionnelles: form.personnesAdditionnelles,
      date_requise: form.dateRequise,
      date_autorisee: form.dateAutorisee,
      type_demande: form.typeDemande,
      endroit: form.endroit,
      plan_mention: form.planMention,
      dwg_disponible: form.dwgDisponible,
      infos_complementaires: form.infosComplementaires,
      fichiers: form.photoFiles,
    };

    const { data, error } = await supabaseArp.from('demandes').insert(payload).select().single();
    setEnvoiEnCours(false);
    if (error) {
      setErrors({ general: "Impossible de soumettre la demande. Réessaie dans un instant." });
      return;
    }

    const demande = mapRowToDemande(data, projets);
    setDemandes(prev => [demande, ...prev]);
    setConfirmation(demande);
    setForm({ ...initialForm, nom });
  }

  async function toggleStatut(numero) {
    const courante = demandes.find(d => d.numero === numero);
    if (!courante) return;
    const nouveauStatut = courante.statut === 'En attente' ? 'Accomplie' : 'En attente';
    // Mise à jour optimiste — on remet l'ancien statut si l'appel échoue.
    setDemandes(prev => prev.map(d => d.numero === numero ? { ...d, statut: nouveauStatut } : d));
    const { error } = await supabaseArp.from('demandes').update({ statut: nouveauStatut }).eq('numero', numero);
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
      padding: '24px 16px',
      transition: 'background 0.2s ease, color 0.2s ease',
    }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>

        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <img
              src={LOGO_PEP}
              alt="Les Entreprises PEP"
              style={{ height: 52, width: 'auto', flexShrink: 0 }}
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
            <div>
              <h1 style={{ fontSize: 19, fontWeight: 700, margin: 0, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Demande d'arpentage
              </h1>
              <p style={{ margin: 0, fontSize: 12.5, color: th.textDim }}>Prototype de test — aucune donnée n'est réellement envoyée</p>
            </div>
          </div>

          <div style={{ display: 'flex', border: `1px solid ${th.line}`, borderRadius: 20, overflow: 'hidden' }}>
            {[
              { id: 'night', label: 'Nuit', Icon: Moon },
              { id: 'day', label: 'Jour', Icon: Sun },
            ].map(({ id, label, Icon }) => (
              <button key={id} onClick={() => setMode(id)} style={{
                background: mode === id ? BRAND_RED : 'transparent',
                color: mode === id ? '#fff' : th.toggleInactiveText,
                border: 'none', padding: '7px 14px', fontSize: 11.5,
                textTransform: 'uppercase', letterSpacing: 0.5, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600,
              }}>
                <Icon size={13} /> {label}
              </button>
            ))}
          </div>
        </header>

        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {[
            { id: 'nouvelle', label: 'Nouvelle demande' },
            { id: 'suivi', label: `Suivi des demandes (${demandes.length})` },
            { id: 'calendrier', label: 'Calendrier' },
          ].map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); setConfirmation(null); }} style={{
              background: tab === t.id ? BRAND_RED : 'transparent',
              color: tab === t.id ? '#fff' : th.toggleInactiveText,
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
                  <input value="Généré automatiquement" disabled style={{ ...inputStyle, opacity: 0.6 }} />
                </Field>
              </div>
            </div>

            <Field th={th} label="Projet" error={errors.projetNo}>
              <select value={form.projetNo} onChange={e => updateField('projetNo', e.target.value)} style={inputStyle}>
                <option value="">— Choisir un projet —</option>
                {projets.map(p => <option key={p.no} value={p.no}>{p.no} — {p.nom}</option>)}
              </select>
            </Field>

            {projetSelectionne && (
              <div style={{
                background: th.inputBg, border: `1px solid ${th.line}`, borderRadius: 4,
                padding: '10px 14px', marginBottom: 16, fontSize: 12.5, color: th.textDim,
              }}>
                <div><MapPin size={12} style={{ display: 'inline', marginRight: 6 }} />{projetSelectionne.lieu} · Client : {projetSelectionne.client}</div>
                <div style={{ marginTop: 4 }}>Chargé de projet : <strong style={{ color: th.text }}>{projetSelectionne.charge}</strong> ({projetSelectionne.chargeEmail})</div>
              </div>
            )}

            <Field th={th} label="Ajouter une ou des personnes additionnelles (optionnel)">
              <select value="" onChange={e => {
                const val = e.target.value;
                if (val) updateField('personnesAdditionnelles', [...form.personnesAdditionnelles, val]);
              }} style={inputStyle}>
                <option value="">— Choisir une personne à ajouter —</option>
                {personnel.filter(n => !form.personnesAdditionnelles.includes(n)).map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              {form.personnesAdditionnelles.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {form.personnesAdditionnelles.map(n => (
                    <span key={n} style={{
                      display: 'flex', alignItems: 'center', gap: 6, background: th.inputBg,
                      border: `1px solid ${th.line}`, borderRadius: 14, padding: '4px 6px 4px 10px', fontSize: 12,
                    }}>
                      {n}
                      <button type="button" onClick={() => updateField('personnesAdditionnelles', form.personnesAdditionnelles.filter(x => x !== n))}
                        style={{
                          background: 'none', border: 'none', color: th.textDim, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', padding: 2, lineHeight: 0,
                        }}>
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </Field>

            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <Field th={th} label="Date requise" error={errors.dateRequise}>
                  <input type="date" value={form.dateRequise} onChange={e => updateField('dateRequise', e.target.value)} style={inputStyle} />
                </Field>
              </div>
              <div style={{ flex: 1 }}>
                <Field th={th} label="Date autorisée" error={errors.dateAutorisee}>
                  <input type="date" value={form.dateAutorisee} onChange={e => updateField('dateAutorisee', e.target.value)} style={inputStyle} />
                </Field>
              </div>
            </div>

            {form.dateRequise && (() => {
              const delai = joursEntre(todayISO(), form.dateRequise);
              const enRetard = delai < 0;
              return (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5,
                  color: enRetard ? BRAND_RED : th.textDim,
                  background: th.inputBg, border: `1px solid ${th.line}`, borderRadius: 4,
                  padding: '8px 12px', marginTop: -6, marginBottom: 16,
                }}>
                  <Clock size={13} />
                  {enRetard
                    ? `Date requise déjà dépassée de ${Math.abs(delai)} jour${Math.abs(delai) > 1 ? 's' : ''}`
                    : delai === 0
                      ? "Délai de traitement : aujourd'hui même"
                      : `Délai de traitement : ${delai} jour${delai > 1 ? 's' : ''}`}
                </div>
              );
            })()}

            <Field th={th} label="Type de demande">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {TYPES_DEMANDE.map(t => (
                  <button key={t} type="button" onClick={() => updateField('typeDemande', t)} style={{
                    background: form.typeDemande === t ? BRAND_RED : th.inputBg,
                    color: form.typeDemande === t ? '#fff' : th.textDim,
                    border: `1px solid ${th.line}`, borderRadius: 20, padding: '6px 14px',
                    fontSize: 12, cursor: 'pointer', fontWeight: 600,
                  }}>
                    {t}
                  </button>
                ))}
              </div>
            </Field>

            <Field th={th} label="Endroit des travaux" error={errors.endroit}>
              <input value={form.endroit} onChange={e => updateField('endroit', e.target.value)}
                placeholder="Adresse ou description du lieu" style={inputStyle} />
            </Field>

            <Field th={th} label="Plan">
              <input value={form.planMention} onChange={e => updateField('planMention', e.target.value)}
                placeholder="ex : plan joint par courriel séparé, disponible sur demande, numéro de plan…" style={inputStyle} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 12.5, color: th.textDim }}>
                <input type="checkbox" checked={form.dwgDisponible}
                  onChange={e => updateField('dwgDisponible', e.target.checked)} />
                Disponible en DWG
              </label>
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
                  onChange={e => updateField('photoFiles', Array.from(e.target.files).map(f => f.name))} />
              </label>
              {form.photoFiles.length > 0 && (
                <div style={{ fontSize: 11.5, color: th.textDim, marginTop: 6 }}>{form.photoFiles.join(', ')}</div>
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
              Projet {confirmation.projet?.no} — {confirmation.projet?.nom}
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
          if (filtreProjet) filtrees = filtrees.filter(d => d.projet?.no === filtreProjet);
          const enCours = trierParPriorite(filtrees.filter(d => d.statut !== 'Accomplie'));
          const realisees = trierParPriorite(filtrees.filter(d => d.statut === 'Accomplie'));
          return (
            <div>
              <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
                <input
                  value={recherche}
                  onChange={e => setRecherche(e.target.value)}
                  placeholder="Rechercher par nom, projet, endroit, type…"
                  style={{ ...inputStyle, flex: 1, minWidth: 220 }}
                />
                <select value={filtrePersonne} onChange={e => setFiltrePersonne(e.target.value)}
                  style={{ ...inputStyle, width: 'auto', minWidth: 170 }}>
                  <option value="">Toutes les personnes</option>
                  {personnel.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                <select value={filtreProjet} onChange={e => setFiltreProjet(e.target.value)}
                  style={{ ...inputStyle, width: 'auto', minWidth: 170 }}>
                  <option value="">Tous les projets</option>
                  {projets.map(p => <option key={p.no} value={p.no}>{p.no} — {p.nom}</option>)}
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

export default function DemandesArpentagePage() {
  const [session, setSession] = useState(null);

  if (!session) {
    return <AuthGate onDone={(s) => setSession(s)} />;
  }

  return <DemandeArpentageApp userId={session.userId} nom={session.nom} email={session.email} />;
}

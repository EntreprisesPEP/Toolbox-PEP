import { createContext, useContext, useEffect, useState } from 'react';
import { X, Flag, CheckCircle2, SlidersHorizontal, ChevronDown, ChevronUp } from 'lucide-react';
import { COULEURS_ETAPES, etape as infoEtape, ETAPES, statutProjet } from '../../lib/pepday/constantes';

// ---------------------------------------------------------------------------
// PEPDAY — PETITS BLOCS D'INTERFACE PARTAGÉS PAR TOUS LES ÉCRANS
// ---------------------------------------------------------------------------

// Le contexte de l'app : données, personne connectée, actions, navigation.
// Fourni une fois par AppPepday; chaque écran fait const app = usePepday().
export const ContextePepday = createContext(null);
export function usePepday() {
  return useContext(ContextePepday);
}

// --- Position des filtres ---------------------------------------------------
// Un seul réglage pour toute l'app, tenu par AppPepday. « gauche » sort les
// filtres de la carte de tête et les met dans un rail collant à gauche du
// contenu, comme Civalgo; « haut » les laisse en ligne, la mise en page
// d'origine. Le rail n'existe qu'à partir de 1100 px : plus bas, il redevient
// une carte empilée et repliable, parce qu'une colonne de 264 px n'a pas sa
// place sur le téléphone du contremaître.
export function useFiltresAGauche() {
  const app = useContext(ContextePepday);
  return (app && app.positionFiltres) === 'gauche';
}

export function RailFiltres({ titre = 'Filtres', children }) {
  // Replié au départ : sur le cellulaire, le rail ne prend qu'une ligne tant
  // qu'on n'y touche pas. Au bureau (≥ 1100 px) le corps reste visible de
  // toute façon, « pd-replie » n'y fait rien.
  const [ouvert, setOuvert] = useState(false);
  return (
    <aside className="pd-rail">
      <button
        type="button"
        className="pd-rail-tete"
        onClick={() => setOuvert((o) => !o)}
        aria-expanded={ouvert}
      >
        <SlidersHorizontal size={14} />
        {titre}
        <span className="pd-espace" />
        <span className="pd-rail-chevron">{ouvert ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</span>
      </button>
      {/* Replié seulement sous 1100 px; au bureau le rail reste toujours ouvert. */}
      <div className={`pd-rail-corps ${ouvert ? '' : 'pd-replie'}`}>{children}</div>
    </aside>
  );
}

export function Chargement({ texte = 'Chargement…' }) {
  return (
    <div className="pd-chargement">
      <div className="pd-roue" />
      <div>{texte}</div>
    </div>
  );
}

export function Champ({ label, aide, children, style }) {
  return (
    <div className="pd-champ" style={style}>
      {label && <label>{label}</label>}
      {children}
      {aide && <span className="pd-aide">{aide}</span>}
    </div>
  );
}

export function Encadre({ type = 'info', children, onFermer }) {
  return (
    <div className={`pd-encadre ${type}`}>
      <div className="pd-flex" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
        <div style={{ flex: 1 }}>{children}</div>
        {onFermer && <button className="pd-btn lien" onClick={onFermer} aria-label="Fermer"><X size={14} /></button>}
      </div>
    </div>
  );
}

export function Modal({ titre, onFermer, children, large = false }) {
  // Échap ferme la fenêtre; le défilement de la page est bloqué dessous.
  useEffect(() => {
    const touche = (e) => { if (e.key === 'Escape') onFermer?.(); };
    window.addEventListener('keydown', touche);
    const avant = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', touche); document.body.style.overflow = avant; };
  }, [onFermer]);
  return (
    <div className="pd-voile" onMouseDown={(e) => { if (e.target === e.currentTarget) onFermer?.(); }}>
      <div className={`pd-modal ${large ? 'large' : ''}`} role="dialog" aria-modal="true">
        <div className="pd-modal-tete">
          <h3>{titre}</h3>
          <button className="pd-btn fantome petit" onClick={onFermer} aria-label="Fermer"><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Demande une confirmation, avec un commentaire facultatif ou obligatoire.
export function Confirmation({ titre, message, libelleOk = 'Confirmer', danger = false, commentaire = null, onOk, onAnnuler }) {
  const [texte, setTexte] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState('');
  const requis = commentaire === 'obligatoire';
  async function valider() {
    if (requis && !texte.trim()) { setErreur('Le commentaire est obligatoire.'); return; }
    setEnCours(true);
    setErreur('');
    try {
      await onOk(texte);
    } catch (e) {
      setErreur(e.message || String(e));
      setEnCours(false);
    }
  }
  return (
    <Modal titre={titre} onFermer={onAnnuler}>
      {message && <div style={{ marginBottom: 12, lineHeight: 1.5 }}>{message}</div>}
      {commentaire && (
        <Champ label={requis ? 'Commentaire (obligatoire)' : 'Commentaire (facultatif)'}>
          <textarea className="pd-input" value={texte} onChange={(e) => setTexte(e.target.value)} autoFocus />
        </Champ>
      )}
      {erreur && <Encadre type="err">{erreur}</Encadre>}
      <div className="pd-actions droite">
        <button className="pd-btn fantome" onClick={onAnnuler} disabled={enCours}>Annuler</button>
        <button className={`pd-btn ${danger ? 'rouge' : ''}`} onClick={valider} disabled={enCours}>{enCours ? '…' : libelleOk}</button>
      </div>
    </Modal>
  );
}

export function PastilleEtape({ no, court = false }) {
  const e = infoEtape(no);
  return (
    <span className="pd-pastille" style={{ background: COULEURS_ETAPES[e.no] }}>
      {e.no < 6 ? `${e.no}. ` : ''}{court ? e.court : e.libelle}
    </span>
  );
}

export function PastilleStatut({ code }) {
  const s = statutProjet(code);
  return <span className="pd-pastille" style={{ background: s.couleur }}>{s.libelle}</span>;
}

export function BadgeFlag({ nonLus, lus = 0 }) {
  if (nonLus > 0) {
    return <span className="pd-flag"><Flag size={13} /> Lecture obligatoire{nonLus > 1 ? ` ×${nonLus}` : ''}</span>;
  }
  if (lus > 0) return <span className="pd-flag lu"><CheckCircle2 size={13} /> Lu</span>;
  return null;
}

export function Frise({ etapeCourante }) {
  return (
    <div className="pd-frise" aria-label="Avancement de la validation">
      {ETAPES.filter((e) => e.no < 6).map((e) => (
        <div key={e.no} className={etapeCourante > e.no ? 'fait' : etapeCourante === e.no ? 'courant' : ''}>
          <span />
          {e.court}
        </div>
      ))}
    </div>
  );
}

export function Jauge({ ratio }) {
  if (ratio == null) return <span className="pd-dim">—</span>;
  const w = Math.min(100, Math.max(0, ratio * 100));
  const classe = ratio > 1 ? 'depasse' : ratio > 0.85 ? 'chaud' : '';
  return <div className="pd-jauge" title={`${Math.round(ratio * 100)} %`}><span className={classe} style={{ width: `${w}%` }} /></div>;
}

// Champ numérique qui accepte la virgule (clavier français du cellulaire).
export function ChampNombre({ valeur, onChange, disabled, min = 0, pas = 'any', placeholder, ...reste }) {
  const [texte, setTexte] = useState(valeur == null ? '' : String(valeur).replace('.', ','));
  useEffect(() => {
    const actuel = Number(String(texte).replace(',', '.'));
    if (valeur !== actuel && !(valeur == null && texte === '')) setTexte(valeur == null ? '' : String(valeur).replace('.', ','));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valeur]);
  return (
    <input
      className="pd-input"
      type="text"
      inputMode="decimal"
      value={texte}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => {
        const t = e.target.value.replace(/[^0-9.,-]/g, '');
        setTexte(t);
        const n = Number(t.replace(',', '.'));
        onChange(t === '' ? null : (Number.isFinite(n) ? Math.max(min ?? -Infinity, n) : null));
      }}
      {...reste}
    />
  );
}

// Les options d'un ChampListe à partir d'une liste de fiches.
export function optionsDe(liste, { libelle = (x) => x.nom, detail } = {}) {
  return (liste || []).map((x) => ({ valeur: x.id, libelle: libelle(x), detail: detail ? detail(x) : undefined }));
}

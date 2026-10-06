import { useState, useRef, useEffect, useMemo, useId } from 'react';

// ---------------------------------------------------------------------------
// CHAMP AVEC LISTE FILTRANTE — revision 73
//
// Remplace deux choses qui se comportaient mal :
//
// 1. `<input list="...">` + `<datalist>`. Le navigateur devine : il complete
//    le champ avec son « meilleur candidat » pendant la frappe, et la
//    selection saute. On tape trois lettres et on se retrouve avec un nom
//    qu'on n'a pas choisi.
//
// 2. Les `<select>` longs. Taper une lettre y fait bondir d'option en option
//    au lieu de reduire la liste : avec 43 projets, c'est inutilisable.
//
// Ici : on tape, la liste se REDUIT, rien ne se remplit tout seul, et on
// choisit en cliquant ou avec les fleches. Le champ n'accepte une valeur que
// lorsqu'elle est choisie — pas pendant la frappe.
//
// FILTRAGE : par sous-chaine, accents et casse ignores, sur chaque mot
// separement. « ter » trouve « Depot municipal Terrebonne »; « bern lef »
// trouve « Rue Bernard-Lefebvre » meme dans cet ordre. Chercher « 26-7 »
// trouve le projet par son numero, puisqu'on cherche aussi dans le libelle
// complet.
//
// `libre` : si vrai, on peut garder un texte qui n'est dans aucune option
// (le bottin ne contient pas tout le monde). Si faux, quitter le champ sans
// avoir choisi le remet sur sa derniere valeur valide — un demi-nom tape puis
// abandonne ne doit pas s'enregistrer.
// ---------------------------------------------------------------------------

function sansAccents(t) {
  return String(t == null ? '' : t)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function correspond(texteOption, recherche) {
  const cible = sansAccents(texteOption);
  const mots = sansAccents(recherche).split(/\s+/).filter(Boolean);
  return mots.every((m) => cible.includes(m));
}

/**
 * @param {Array<string|{valeur:string,libelle:string,detail?:string}>} options
 * @param {string}   valeur       la valeur retenue (contrôlée)
 * @param {Function} onChange     reçoit la nouvelle valeur
 * @param {boolean}  libre        autorise une valeur hors liste
 */
export default function ChampListe({
  options,
  valeur,
  onChange,
  placeholder = '',
  libre = false,
  disabled = false,
  className = '',
  style,
  videLabel = '—',
  autoriserVide = true,
  ariaLabel,
}) {
  const idListe = useId();
  const normalisees = useMemo(
    () => (options || []).map((o) => (typeof o === 'string'
      ? { valeur: o, libelle: o }
      : { valeur: o.valeur, libelle: o.libelle ?? o.valeur, detail: o.detail })),
    [options]
  );

  const libelleDe = (v) => normalisees.find((o) => o.valeur === v)?.libelle ?? (v || '');

  const [ouvert, setOuvert] = useState(false);
  const [saisie, setSaisie] = useState('');
  const [survol, setSurvol] = useState(0);
  const racine = useRef(null);
  const champ = useRef(null);
  const listeRef = useRef(null);
  const [pos, setPos] = useState(null);

  // Quand la liste est fermee, le champ montre toujours la valeur retenue.
  // C'est ce qui empeche une saisie abandonnee de rester a l'ecran et de
  // faire croire qu'elle a ete enregistree.
  const affichage = ouvert ? saisie : libelleDe(valeur);

  const filtrees = useMemo(() => {
    const base = saisie.trim() === '' ? normalisees : normalisees.filter((o) => correspond(o.libelle, saisie));
    return base;
  }, [normalisees, saisie]);

  useEffect(() => {
    if (!ouvert) return undefined;
    function dehors(e) {
      if (racine.current && !racine.current.contains(e.target)) fermer(false);
    }
    document.addEventListener('mousedown', dehors);
    return () => document.removeEventListener('mousedown', dehors);
  }); // sans tableau de deps : `fermer` lit l'etat courant

  // ---------------------------------------------------------------------
  // POURQUOI LE MENU EST EN `position: fixed`
  //
  // En `absolute`, il est decoupe par le premier parent qui defile — et les
  // cellules de ces tableaux sont TOUTES dans un conteneur a defilement
  // horizontal. Le menu d'une cellule de Meeting 2 serait coupe a deux
  // lignes, ou invisible. `fixed` sort du conteneur; on calcule la position
  // a l'ouverture, et on la refait au defilement et au redimensionnement.
  //
  // On ouvre vers le HAUT quand il n'y a pas la place en dessous, pour que
  // la derniere ligne d'un tableau ne soit pas condamnee a un menu hors
  // ecran.
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (!ouvert) { setPos(null); return undefined; }
    function placer() {
      const el = champ.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const largeur = Math.max(r.width, 240);
      const dessous = window.innerHeight - r.bottom;
      const hauteurMax = Math.min(280, Math.max(dessous - 12, 0));
      const versLeHaut = dessous < 180 && r.top > dessous;
      setPos({
        left: Math.min(Math.max(8, r.left), Math.max(8, window.innerWidth - largeur - 8)),
        top: versLeHaut ? undefined : r.bottom + 3,
        bottom: versLeHaut ? window.innerHeight - r.top + 3 : undefined,
        width: largeur,
        maxHeight: versLeHaut ? Math.min(280, r.top - 12) : Math.max(hauteurMax, 120),
      });
    }
    placer();
    window.addEventListener('scroll', placer, true);
    window.addEventListener('resize', placer);
    return () => {
      window.removeEventListener('scroll', placer, true);
      window.removeEventListener('resize', placer);
    };
  }, [ouvert]);

  // Garde l'option survolee visible quand on descend au clavier.
  useEffect(() => {
    if (!ouvert || !listeRef.current) return;
    const el = listeRef.current.children[survol];
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  }, [survol, ouvert]);

  function ouvrir() {
    if (disabled) return;
    setSaisie('');
    const i = filtrees.findIndex((o) => o.valeur === valeur);
    setSurvol(i >= 0 ? i : 0);
    setOuvert(true);
  }

  function fermer(valider) {
    setOuvert(false);
    if (!valider && libre && saisie.trim() !== '' && saisie.trim() !== libelleDe(valeur)) {
      // En mode libre, un texte tape et quitte est une vraie saisie : le
      // bottin ne contient pas tout le monde, et refuser le nom obligerait a
      // renoncer ou a mentir.
      onChange(saisie.trim());
    }
    setSaisie('');
  }

  function choisir(opt) {
    onChange(opt.valeur);
    setOuvert(false);
    setSaisie('');
    if (champ.current) champ.current.blur();
  }

  function auClavier(e) {
    if (!ouvert && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      e.preventDefault();
      ouvrir();
      return;
    }
    if (!ouvert) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSurvol((i) => Math.min(i + 1, Math.max(filtrees.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSurvol((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      // Entree ne choisit QUE ce qui est survole. Si le filtre ne laisse rien,
      // on ne devine pas : en mode libre on garde le texte, sinon on annule.
      if (filtrees[survol]) choisir(filtrees[survol]);
      else fermer(false);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOuvert(false);
      setSaisie('');
    } else if (e.key === 'Tab') {
      fermer(false);
    }
  }

  return (
    <div ref={racine} className={`champ-liste ${className}`} style={style}>
      <input
        ref={champ}
        type="text"
        role="combobox"
        aria-expanded={ouvert}
        aria-controls={idListe}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        autoComplete="off"
        disabled={disabled}
        placeholder={placeholder}
        value={affichage}
        onFocus={ouvrir}
        onClick={ouvrir}
        onChange={(e) => { setSaisie(e.target.value); setSurvol(0); if (!ouvert) setOuvert(true); }}
        onKeyDown={auClavier}
        className="champ-liste-input"
      />
      <span className="champ-liste-fleche" aria-hidden="true">▾</span>

      {ouvert && (
        <ul
          className="champ-liste-menu"
          id={idListe}
          role="listbox"
          ref={listeRef}
          style={pos ? {
            left: pos.left, top: pos.top, bottom: pos.bottom,
            width: pos.width, maxHeight: pos.maxHeight,
          } : { visibility: 'hidden' }}
        >
          {autoriserVide && saisie.trim() === '' && (
            <li
              role="option"
              aria-selected={!valeur}
              className={`champ-liste-option vide ${valeur ? '' : 'retenue'}`}
              onMouseDown={(e) => { e.preventDefault(); choisir({ valeur: '', libelle: '' }); }}
            >{videLabel}</li>
          )}

          {filtrees.length === 0 && (
            <li className="champ-liste-rien">
              {libre
                ? 'Aucun résultat — appuie sur Tab pour garder ce que tu as écrit.'
                : 'Aucun résultat.'}
            </li>
          )}

          {filtrees.map((o, i) => (
            <li
              key={o.valeur || `o${i}`}
              role="option"
              aria-selected={o.valeur === valeur}
              className={[
                'champ-liste-option',
                i === survol ? 'survol' : '',
                o.valeur === valeur ? 'retenue' : '',
              ].filter(Boolean).join(' ')}
              onMouseEnter={() => setSurvol(i)}
              onMouseDown={(e) => { e.preventDefault(); choisir(o); }}
            >
              <span className="champ-liste-libelle">{o.libelle}</span>
              {o.detail && <span className="champ-liste-detail">{o.detail}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

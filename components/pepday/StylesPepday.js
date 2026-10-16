import { PALETTES, ROUGE } from '../commun/ThemeToolbox';

// ---------------------------------------------------------------------------
// PEPDAY — LA FEUILLE DE STYLE DE L'APP
//
// Pourquoi pas un fichier styles/pepday.css comme la Planification hebdo :
// une feuille globale doit être importée dans pages/_app.js, un fichier
// commun à tout le Toolbox. Ici la feuille voyage avec l'app : l'import dans
// le Toolbox reste un simple dépôt de fichiers, sans retoucher _app.js.
//
// Toutes les classes sont préfixées « pd- » et écrites sous .pd-scope :
// aucune ne peut déborder sur une autre app du Toolbox.
//
// Les couleurs viennent des deux palettes communes (ThemeToolbox), passées
// en variables CSS sur la racine de l'app. Une couleur manquante s'ajoute
// dans ThemeToolbox, pas ici.
//
// MOBILE D'ABORD : les règles de base visent le cellulaire du contremaître;
// les écrans larges ajoutent des colonnes par min-width.
// ---------------------------------------------------------------------------

export function variablesTheme(mode) {
  const p = PALETTES[mode] || PALETTES.day;
  return {
    '--pd-bg': p.bg,
    '--pd-panel': p.panel,
    '--pd-panel-alt': p.panelAlt,
    '--pd-input': p.inputBg,
    '--pd-ligne': p.line,
    '--pd-texte': p.text,
    '--pd-texte-dim': p.textDim,
    '--pd-surligne': p.surligne,
    '--pd-accent': p.accent,
    '--pd-btn': p.btnBg,
    '--pd-lien': p.lien,
    '--pd-info-bg': p.infoBg,
    '--pd-avis-bg': p.avisBg,
    '--pd-avis-texte': p.avisTexte,
    '--pd-ok-bg': p.okBg,
    '--pd-ok': p.okLigne,
    '--pd-err-bg': p.errBg,
    '--pd-err-texte': p.errTexte,
    '--pd-ombre': p.ombre,
    '--pd-rouge': ROUGE,
    // ChampListe (commun) lit ces deux variables pour son mode « dans un tableau ».
    '--input-bg': p.inputBg,
    '--line': p.line,
  };
}

export const CSS_PEPDAY = `
/* La marge par défaut du navigateur, seulement sur la page qui contient PEPday. */
body:has(.pd-scope) { margin: 0; }
.pd-scope { min-height: 100vh; background: var(--pd-bg); color: var(--pd-texte); font-size: 14px; -webkit-text-size-adjust: 100%; }
.pd-scope *, .pd-scope *::before, .pd-scope *::after { box-sizing: border-box; }
.pd-scope a { color: var(--pd-lien); }
.pd-scope h2 { font-size: 18px; margin: 0 0 12px; color: var(--pd-accent); }
.pd-scope h3 { font-size: 15px; margin: 0 0 10px; color: var(--pd-accent); }
.pd-scope p { line-height: 1.5; }

/* --- Barre d'outils sous le bandeau ------------------------------------ */
.pd-barre { max-width: 1300px; margin: -8px auto 16px; padding: 0 16px; }
.pd-onglets { display: flex; gap: 6px; overflow-x: auto; -webkit-overflow-scrolling: touch; padding-bottom: 4px; scrollbar-width: thin; }
.pd-onglet { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 6px; padding: 9px 13px; border-radius: 6px; border: 1px solid var(--pd-ligne); background: var(--pd-panel); color: var(--pd-texte); font-size: 13.5px; font-weight: 600; cursor: pointer; white-space: nowrap; min-height: 40px; }
.pd-onglet.actif { background: var(--pd-btn); border-color: var(--pd-btn); color: #fff; }
.pd-onglet .pd-compte { background: var(--pd-rouge); color: #fff; border-radius: 10px; padding: 1px 7px; font-size: 11.5px; }
.pd-demo { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 8px; padding: 8px 12px; border-radius: 6px; background: var(--pd-avis-bg); color: var(--pd-avis-texte); font-size: 13px; border: 1px dashed var(--pd-avis-texte); }
.pd-demo select { max-width: 260px; }

/* --- Largeurs -------------------------------------------------------------- */
.pd-main { margin: 0 auto; padding: 0 12px 90px; }
.pd-l900 { max-width: 900px; }
.pd-l1300 { max-width: 1300px; }
@media (min-width: 700px) { .pd-main { padding: 0 16px 60px; } }

/* --- Panneaux --------------------------------------------------------------- */
.pd-carte { background: var(--pd-panel); border: 1px solid var(--pd-ligne); border-radius: 8px; padding: 14px; margin-bottom: 14px; }
@media (min-width: 700px) { .pd-carte { padding: 18px; } }
.pd-carte-titre { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
.pd-carte-titre h2, .pd-carte-titre h3 { margin: 0; }
.pd-section-vide { padding: 18px; text-align: center; color: var(--pd-texte-dim); font-size: 13.5px; }

/* --- Boutons ----------------------------------------------------------------- */
.pd-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; font-family: inherit; background: var(--pd-btn); color: #fff; border: 1px solid var(--pd-btn); border-radius: 6px; padding: 9px 14px; font-size: 14px; font-weight: 600; cursor: pointer; white-space: nowrap; min-height: 42px; text-decoration: none; }
.pd-btn:disabled { opacity: .45; cursor: not-allowed; }
.pd-btn.fantome { background: var(--pd-panel); color: var(--pd-accent); border-color: var(--pd-accent); }
.pd-btn.rouge { background: var(--pd-rouge); border-color: var(--pd-rouge); }
.pd-btn.vert { background: #2e9f58; border-color: #2e9f58; }
.pd-btn.petit { padding: 5px 10px; font-size: 12.5px; min-height: 32px; }
.pd-btn.lien { background: none; border: none; color: var(--pd-lien); padding: 4px; min-height: 0; font-weight: 500; text-decoration: underline; white-space: normal; }
.pd-btn.pleine { width: 100%; }
.pd-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.pd-actions.droite { justify-content: flex-end; }

/* --- Champs -------------------------------------------------------------------- */
.pd-champ { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; min-width: 0; }
.pd-champ > label, .pd-etiquette { font-size: 12px; font-weight: 600; color: var(--pd-texte-dim); text-transform: uppercase; letter-spacing: .03em; }
.pd-input, .pd-scope .champ-liste-input { width: 100%; padding: 10px 11px; border-radius: 6px; border: 1px solid var(--pd-ligne); background: var(--pd-input); color: var(--pd-texte); font-size: 16px; font-family: inherit; min-height: 44px; }
.pd-input:focus, .pd-scope .champ-liste-input:focus { outline: 2px solid var(--pd-lien); outline-offset: -1px; }
.pd-input:disabled { opacity: .7; }
textarea.pd-input { min-height: 90px; resize: vertical; line-height: 1.45; }
@media (min-width: 860px) { .pd-input, .pd-scope .champ-liste-input { font-size: 14px; min-height: 38px; padding: 8px 10px; } }
.pd-aide { font-size: 12px; color: var(--pd-texte-dim); }
.pd-grille { display: grid; grid-template-columns: 1fr; gap: 0 14px; }
.pd-grille > * { min-width: 0; }
@media (min-width: 640px) { .pd-grille.c2 { grid-template-columns: 1fr 1fr; } .pd-grille.c3 { grid-template-columns: 1fr 1fr 1fr; } .pd-grille.c4 { grid-template-columns: repeat(4, 1fr); } }
.pd-case { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; cursor: pointer; min-height: 32px; }
.pd-case input { width: 18px; height: 18px; }

/* --- Pastilles et badges ------------------------------------------------------- */
.pd-pastille { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 12px; font-size: 12px; font-weight: 700; color: #fff; white-space: nowrap; }
.pd-flag { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 6px; background: var(--pd-rouge); color: #fff; font-weight: 800; font-size: 12.5px; letter-spacing: .02em; text-transform: uppercase; white-space: nowrap; animation: pd-pulse 1.6s ease-in-out infinite; }
.pd-flag.lu { background: #2e9f58; animation: none; }
@keyframes pd-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(196,18,48,.55); } 50% { box-shadow: 0 0 0 6px rgba(196,18,48,0); } }
.pd-tag { display: inline-block; padding: 2px 7px; border-radius: 4px; background: var(--pd-surligne); color: var(--pd-texte); font-size: 11.5px; font-weight: 600; }
.pd-tag.custom { background: #d68910; color: #fff; }
.pd-tag.manuel { background: #8a93a8; color: #fff; }

/* --- Encadrés ------------------------------------------------------------------ */
.pd-encadre { padding: 10px 14px; border-radius: 6px; font-size: 13.5px; margin-bottom: 12px; line-height: 1.45; border: 1px solid transparent; }
.pd-encadre.info { background: var(--pd-info-bg); border-color: var(--pd-ligne); }
.pd-encadre.avis { background: var(--pd-avis-bg); color: var(--pd-avis-texte); border-color: var(--pd-avis-texte); }
.pd-encadre.err { background: var(--pd-err-bg); color: var(--pd-err-texte); border-color: var(--pd-err-texte); }
.pd-encadre.ok { background: var(--pd-ok-bg); border-color: var(--pd-ok); }

/* --- Tableaux ------------------------------------------------------------------ */
.pd-table-wrap { width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; border-radius: 6px; border: 1px solid var(--pd-ligne); }
.pd-table { width: 100%; border-collapse: collapse; font-size: 13px; background: var(--pd-panel); }
.pd-table th { position: sticky; top: 0; background: var(--pd-btn); color: #fff; text-align: left; padding: 8px 10px; font-size: 11.5px; text-transform: uppercase; letter-spacing: .03em; white-space: nowrap; font-weight: 600; }
.pd-table td { padding: 7px 10px; border-bottom: 1px solid var(--pd-ligne); vertical-align: middle; }
.pd-table tr:nth-child(even) td { background: var(--pd-panel-alt); }
.pd-table tr.cliquable { cursor: pointer; }
.pd-table tr.cliquable:hover td { background: var(--pd-surligne); }
.pd-table .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.pd-table tfoot td { font-weight: 700; background: var(--pd-surligne) !important; }
.pd-table .depasse { color: var(--pd-err-texte); font-weight: 700; }

/* --- Listes en cartes (mobile) --------------------------------------------------- */
.pd-liste { display: flex; flex-direction: column; gap: 8px; }
.pd-item { display: block; width: 100%; text-align: left; font-family: inherit; background: var(--pd-panel); color: var(--pd-texte); border: 1px solid var(--pd-ligne); border-left: 4px solid var(--pd-ligne); border-radius: 8px; padding: 11px 13px; cursor: pointer; }
.pd-item:hover { background: var(--pd-surligne); }
.pd-item-haut { display: flex; justify-content: space-between; gap: 8px; align-items: flex-start; flex-wrap: wrap; }
.pd-item-titre { font-weight: 700; font-size: 14.5px; }
.pd-item-sous { color: var(--pd-texte-dim); font-size: 12.5px; margin-top: 3px; }
.pd-item-bas { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-top: 7px; }

/* --- Indicateurs ------------------------------------------------------------- */
.pd-kpis { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 14px; }
@media (min-width: 760px) { .pd-kpis { grid-template-columns: repeat(4, 1fr); } }
.pd-kpi { background: var(--pd-panel); border: 1px solid var(--pd-ligne); border-radius: 8px; padding: 12px 14px; }
.pd-kpi-val { font-size: 21px; font-weight: 800; color: var(--pd-accent); font-variant-numeric: tabular-nums; }
.pd-kpi-lib { font-size: 12px; color: var(--pd-texte-dim); text-transform: uppercase; letter-spacing: .03em; margin-top: 2px; }
.pd-jauge { height: 8px; border-radius: 4px; background: var(--pd-surligne); overflow: hidden; min-width: 60px; }
.pd-jauge > span { display: block; height: 100%; background: #2e9f58; }
.pd-jauge > span.chaud { background: #d68910; }
.pd-jauge > span.depasse { background: var(--pd-rouge); }

/* --- Étapes (frise) ------------------------------------------------------------ */
.pd-frise { display: flex; gap: 4px; margin: 4px 0 12px; }
.pd-frise > div { flex: 1; text-align: center; font-size: 10.5px; color: var(--pd-texte-dim); }
.pd-frise > div > span { display: block; height: 6px; border-radius: 3px; background: var(--pd-surligne); margin-bottom: 4px; }
.pd-frise > div.fait > span { background: #2e9f58; }
.pd-frise > div.courant > span { background: var(--pd-rouge); }
.pd-frise > div.courant { color: var(--pd-texte); font-weight: 700; }
@media (max-width: 520px) { .pd-frise > div { font-size: 0; } }

/* --- Lignes de rapport (mobile) ------------------------------------------------- */
.pd-ligne { border: 1px solid var(--pd-ligne); border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; background: var(--pd-panel-alt); }
.pd-ligne-haut { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
.pd-ligne-nom { font-weight: 700; }
.pd-ligne-montant { font-weight: 800; font-variant-numeric: tabular-nums; white-space: nowrap; }
.pd-ligne-detail { color: var(--pd-texte-dim); font-size: 12.5px; margin-top: 2px; }
.pd-ligne-champs { display: grid; grid-template-columns: repeat(auto-fit, minmax(92px, 1fr)); gap: 8px; margin-top: 8px; }
.pd-ligne-champs .pd-champ { margin-bottom: 0; }
.pd-total-cat { display: flex; justify-content: space-between; font-weight: 700; padding: 8px 2px 0; border-top: 1px dashed var(--pd-ligne); margin-top: 4px; }

/* --- Photos -------------------------------------------------------------------- */
.pd-photos { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 8px; }
.pd-photo { position: relative; border-radius: 6px; overflow: hidden; border: 1px solid var(--pd-ligne); aspect-ratio: 1 / 1; background: var(--pd-surligne); }
.pd-photo img { width: 100%; height: 100%; object-fit: cover; display: block; cursor: zoom-in; }
.pd-photo button { position: absolute; top: 4px; right: 4px; }

/* --- Commentaires et historique -------------------------------------------------- */
.pd-comm { border: 1px solid var(--pd-ligne); border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; }
.pd-comm.flag { border: 2px solid var(--pd-rouge); background: var(--pd-err-bg); }
.pd-comm.flag.lu { border-color: #2e9f58; background: var(--pd-ok-bg); }
.pd-comm-tete { display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; font-size: 12.5px; color: var(--pd-texte-dim); margin-bottom: 4px; }
.pd-comm-texte { white-space: pre-wrap; line-height: 1.45; }
.pd-histo { list-style: none; margin: 0; padding: 0; }
.pd-histo li { position: relative; padding: 0 0 12px 18px; border-left: 2px solid var(--pd-ligne); margin-left: 6px; font-size: 13px; }
.pd-histo li::before { content: ''; position: absolute; left: -6px; top: 3px; width: 10px; height: 10px; border-radius: 50%; background: var(--pd-btn); }
.pd-histo li.renvoi::before { background: var(--pd-rouge); }
.pd-histo-quand { color: var(--pd-texte-dim); font-size: 12px; }

/* --- Barre d'action collée en bas (mobile) --------------------------------------- */
.pd-collant-bas { position: sticky; bottom: 0; z-index: 20; background: var(--pd-panel); border-top: 1px solid var(--pd-ligne); box-shadow: 0 -4px 14px rgba(0,0,0,.12); padding: 10px 12px; margin: 0 -12px; display: flex; gap: 8px; flex-wrap: wrap; }
@media (min-width: 700px) { .pd-collant-bas { margin: 0; border-radius: 8px; border: 1px solid var(--pd-ligne); } }
.pd-collant-bas .pd-btn { flex: 1 1 140px; white-space: normal; }

/* --- Fenêtre modale -------------------------------------------------------------- */
.pd-voile { position: fixed; inset: 0; background: rgba(15,33,56,.6); z-index: 1500; display: flex; align-items: flex-end; justify-content: center; }
@media (min-width: 700px) { .pd-voile { align-items: center; padding: 20px; } }
.pd-modal { width: 100%; max-width: 560px; max-height: 92vh; overflow-y: auto; background: var(--pd-panel); color: var(--pd-texte); border-radius: 12px 12px 0 0; padding: 18px; box-shadow: var(--pd-ombre); }
@media (min-width: 700px) { .pd-modal { border-radius: 10px; } }
.pd-modal.large { max-width: 900px; }
.pd-modal-tete { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 12px; }
.pd-modal-tete h3 { margin: 0; }

/* --- Carte --------------------------------------------------------------------- */
.pd-carte-map { width: 100%; height: 62vh; min-height: 360px; border-radius: 8px; border: 1px solid var(--pd-ligne); z-index: 0; }
.pd-carte-map.petite { height: 300px; min-height: 260px; }
.pd-carte-couches { display: flex; flex-wrap: wrap; gap: 10px 16px; align-items: center; margin-bottom: 10px; }
.pd-legende { display: inline-flex; align-items: center; gap: 5px; font-size: 12.5px; }
.pd-legende i { width: 12px; height: 12px; border-radius: 50%; display: inline-block; border: 2px solid #fff; box-shadow: 0 0 0 1px rgba(0,0,0,.25); }
.pd-scope .leaflet-popup-content { font-size: 13px; line-height: 1.4; margin: 10px 12px; }
.pd-scope .leaflet-container { font-family: inherit; }
.pd-epingle { width: 18px; height: 18px; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,.45); }
.pd-epingle.carre { border-radius: 3px; transform: rotate(45deg); width: 14px; height: 14px; }

/* --- Divers ---------------------------------------------------------------------- */
.pd-dim { color: var(--pd-texte-dim); }
.pd-petit { font-size: 12.5px; }
.pd-gras { font-weight: 700; }
.pd-droite { text-align: right; }
.pd-flex { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.pd-espace { flex: 1; }
.pd-sep { border: none; border-top: 1px solid var(--pd-ligne); margin: 14px 0; }
.pd-cache-mobile { display: none; }
@media (min-width: 860px) { .pd-cache-mobile { display: initial; } .pd-cache-bureau { display: none; } }
.pd-filtres { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; }
@media (min-width: 860px) { .pd-filtres { grid-template-columns: repeat(6, 1fr); align-items: end; } }
.pd-filtres .pd-champ { margin-bottom: 0; }

/* --- Filtres dans un rail à gauche -----------------------------------------
   Réglage « Filtres : à gauche / en haut », dans la barre d'onglets. À gauche,
   les filtres sortent de la carte de tête et prennent une colonne collante,
   comme dans Civalgo. Le rail existe dès 760 px : l'iPad en portrait (768 px)
   y a droit, avec une colonne un peu plus étroite. Sous 760 px — le téléphone
   du contremaître — il redevient une carte empilée qu'on peut replier, parce
   qu'à cette largeur deux colonnes ne sont plus lisibles. */
.pd-rail { background: var(--pd-panel); border: 1px solid var(--pd-ligne); border-radius: 8px; padding: 14px; margin-bottom: 14px; min-width: 0; }
.pd-rail-tete { display: flex; align-items: center; gap: 7px; width: 100%; background: none; border: none; padding: 0; margin: 0; color: var(--pd-texte-dim); font: inherit; font-size: 11.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; cursor: pointer; text-align: left; }
.pd-rail-corps { margin-top: 12px; }
.pd-replie { display: none; }
@media (min-width: 760px) { .pd-replie { display: block; } }
.pd-rail .pd-filtres { grid-template-columns: 1fr; gap: 10px; margin-bottom: 0; }
@media (min-width: 760px) {
  /* Le <main> devient la grille : le rail prend la colonne 1, tout le reste
     passe en colonne 2. Pas de row-gap, sinon les rangées vides de la colonne
     de gauche écarteraient le contenu. */
  .pd-main.pd-avec-rail { display: grid; grid-template-columns: 212px minmax(0, 1fr); column-gap: 12px; align-items: start; }
  .pd-main.pd-avec-rail > * { grid-column: 2; min-width: 0; }
  /* Le rail enjambe toutes les rangées : sinon la rangée 1 prendrait sa
     hauteur et laisserait un trou sous la première carte. Les rangées vides
     ne coûtent rien tant qu'il n'y a pas de row-gap. */
  .pd-main.pd-avec-rail > .pd-rail { grid-column: 1; grid-row: 1 / span 99; position: sticky; top: 12px; margin-bottom: 0; max-height: calc(100vh - 24px); overflow-y: auto; align-self: start; }
  .pd-rail-tete { cursor: default; }
}
/* Au bureau, la colonne peut respirer. */
@media (min-width: 1100px) {
  .pd-main.pd-avec-rail { grid-template-columns: 264px minmax(0, 1fr); column-gap: 14px; }
}
.pd-rail-chevron { display: inline-flex; }
@media (min-width: 760px) { .pd-rail-chevron { display: none; } }
/* Le réglage est visible partout, téléphone compris : même quand le rail
   n'est pas possible, voir le bouton explique où sont passés les filtres. */
.pd-reglages { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 8px; color: var(--pd-texte-dim); }
.pd-reglages > span { font-size: 11.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
.pd-bascule { display: inline-flex; align-items: center; gap: 5px; background: none; border: 1px solid var(--pd-ligne); border-radius: 6px; padding: 4px 9px; font: inherit; font-size: 12.5px; color: var(--pd-texte-dim); cursor: pointer; }
.pd-bascule:hover { border-color: var(--pd-accent); color: var(--pd-accent); }
.pd-bascule.actif { background: var(--pd-accent); border-color: var(--pd-accent); color: #fff; }
.pd-chargement { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 80px 20px; color: var(--pd-texte-dim); }
.pd-roue { width: 28px; height: 28px; border-radius: 50%; border: 3px solid var(--pd-ligne); border-top-color: var(--pd-rouge); animation: pd-tourne .8s linear infinite; }
@keyframes pd-tourne { to { transform: rotate(360deg); } }
/* --- RV02 : calendrier des rapports ----------------------------------------- */
.pd-calendrier { table-layout: fixed; min-width: 760px; }
.pd-calendrier th, .pd-calendrier td { vertical-align: top; }
.pd-calendrier th { white-space: normal; }
.pd-cal-equipe { width: 150px; position: sticky; left: 0; z-index: 2; background: var(--pd-panel) !important; border-right: 1px solid var(--pd-ligne); }
.pd-calendrier th.pd-cal-equipe { background: var(--pd-btn) !important; z-index: 3; }
.pd-calendrier td.pd-cal-auj { background: var(--pd-info-bg) !important; }
.pd-calendrier th.pd-cal-auj { background: var(--pd-rouge) !important; }
.pd-cal-compteurs { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 4px; font-weight: 600; text-transform: none; letter-spacing: 0; }
.pd-cal-pastille { display: inline-block; min-width: 18px; padding: 0 5px; border-radius: 9px; color: #fff; text-align: center; font-size: 11px; line-height: 17px; border: 1px solid rgba(255,255,255,.5); }
.pd-cal-cellule { padding: 5px !important; }
.pd-cal-carte { display: block; width: 100%; text-align: left; font-family: inherit; font-size: 12px; line-height: 1.3; color: var(--pd-texte); background: var(--pd-panel); border: 1px solid var(--pd-ligne); border-left: 4px solid; border-radius: 6px; padding: 5px 7px; margin-bottom: 4px; cursor: pointer; }
.pd-cal-carte:hover { background: var(--pd-surligne); }
.pd-cal-ajout { display: inline-flex; align-items: center; gap: 3px; font-family: inherit; font-size: 11.5px; color: var(--pd-lien); background: none; border: 1px dashed var(--pd-ligne); border-radius: 6px; padding: 3px 7px; cursor: pointer; width: 100%; justify-content: center; min-height: 26px; }
.pd-cal-ajout:hover { border-color: var(--pd-lien); }

/* --- RV02 : Vue Direction ---------------------------------------------------- */
.pd-dir-grille { display: grid; grid-template-columns: 1fr; gap: 12px; }
@media (min-width: 700px) { .pd-dir-grille { grid-template-columns: repeat(2, 1fr); } }
@media (min-width: 1100px) { .pd-dir-grille { grid-template-columns: repeat(3, 1fr); } }
.pd-dir-carte { background: var(--pd-panel); border: 1px solid var(--pd-ligne); border-top: 4px solid; border-radius: 8px; padding: 12px 14px; cursor: pointer; text-align: left; font-family: inherit; color: var(--pd-texte); width: 100%; }
.pd-dir-carte:hover { box-shadow: var(--pd-ombre); }
.pd-dir-chiffres { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin: 10px 0 8px; }
.pd-dir-chiffres > div { background: var(--pd-panel-alt); border-radius: 6px; padding: 6px 8px; }
.pd-dir-chiffres b { display: block; font-size: 15px; font-variant-numeric: tabular-nums; }
.pd-dir-chiffres span { font-size: 10.5px; color: var(--pd-texte-dim); text-transform: uppercase; letter-spacing: .03em; }
.pd-sparkline { display: flex; align-items: flex-end; gap: 2px; height: 30px; }
.pd-sparkline > i { flex: 1; background: var(--pd-btn); border-radius: 2px 2px 0 0; min-height: 1px; opacity: .85; }
.pd-sparkline > i.vide { background: var(--pd-ligne); }
.pd-alerte { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 10px; font-size: 11.5px; font-weight: 700; }
.pd-alerte.rouge { background: var(--pd-err-bg); color: var(--pd-err-texte); }
.pd-alerte.orange { background: var(--pd-avis-bg); color: var(--pd-avis-texte); }
.pd-alerte.gris { background: var(--pd-surligne); color: var(--pd-texte-dim); }

/* --- RV02 : regroupement de marqueurs ----------------------------------------- */
.pd-grappe { display: flex; align-items: center; justify-content: center; border-radius: 50%; color: #fff; font-weight: 800; font-size: 12px; border: 3px solid rgba(255,255,255,.9); box-shadow: 0 1px 6px rgba(0,0,0,.4); }
@media print { .pd-barre, .pd-collant-bas, .pd-pas-imprimer { display: none !important; } }
`;

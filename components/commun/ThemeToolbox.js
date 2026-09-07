import { useState, createContext, useContext } from 'react';

// ---------------------------------------------------------------------------
// LES DEUX PALETTES DU TOOLBOX
//
// Un seul endroit décide de quoi a l'air le mode jour et le mode nuit. Une app
// qui a besoin d'une couleur de plus l'ajoute ici, pas chez elle : c'est ce qui
// garde les quatorze apps pareilles.
//
// Chaque page s'ouvre en mode jour. La bascule vaut pour la page en cours.
//
// Usage direct :
//   const [mode, setMode] = useModePep();
//   const th = PALETTES[mode];
//
// Usage par contexte, pour une app a beaucoup de petits composants — evite de
// passer la palette de main en main sur cinq niveaux :
//   <FournisseurPalette mode={mode}> ... </FournisseurPalette>
//   et dans n'importe quel composant en dessous : const th = usePalette();
// ---------------------------------------------------------------------------

export const PALETTES = {
  night: {
    bg: '#10192e',        // fond de page
    panel: '#182238',     // cartes, tableaux, fenêtres
    panelAlt: '#1d2842',  // rangée paire d'un tableau, entête de tableau
    inputBg: '#10192e',   // champs de saisie
    line: '#2c3752',      // filets et bordures
    text: '#e7eaf0',      // texte principal
    textDim: '#8a93a8',   // texte secondaire, étiquettes
    surligne: '#243354',  // rangée survolée ou sélectionnée
    accent: '#aec0f5',    // titres, valeurs mises en avant, liens telephone
    btnBg: '#33405e',     // bouton plein
    lien: '#6db3e8',      // lien courriel
    infoBg: '#132132',    // encadré d'information
    avisBg: '#2a2213',    // encadré d'avertissement
    avisTexte: '#e4a11b',
    okBg: '#12291c',      // encadré de succès
    okLigne: '#2e9f58',
    errBg: '#2d1519',     // encadré d'erreur
    errTexte: '#e06a6a',
    ombre: '0 4px 14px rgba(0,0,0,0.45)',
  },
  day: {
    bg: '#eef1f7',
    panel: '#ffffff',
    panelAlt: '#fafbfc',
    inputBg: '#ffffff',
    line: '#dde1ea',
    text: '#1a2035',
    textDim: '#6b7488',
    surligne: '#e8ecf0',
    accent: '#14213d',
    btnBg: '#14213d',
    lien: '#2e86c1',
    infoBg: '#f7f8fa',
    avisBg: '#fff6e5',
    avisTexte: '#7a5000',
    okBg: '#eaf7ee',
    okLigne: '#2e9f58',
    errBg: '#fdecec',
    errTexte: '#c23b3b',
    ombre: '0 4px 14px rgba(0,0,0,0.12)',
  },
};

// Couleurs de marque — les mêmes de jour comme de nuit.
export const ROUGE = '#c41230';
export const ROUGE_VIF = '#e4022e';
export const NAVY = '#14213d';

export function useModePep() {
  // Chaque page s'ouvre en mode jour, toujours. Le choix vaut pour la page en
  // cours : on change d'app, on repart au soleil. C'est voulu — une app qui
  // s'ouvre en foncé sans qu'on l'ait demandé sur cet écran-là surprend plus
  // qu'elle ne rend service.
  const [mode, setMode] = useState('day');
  return [mode, setMode];
}

// ---------------------------------------------------------------------------
// La palette par contexte. Utile aux apps decoupees en beaucoup de petits
// composants : au lieu de passer « th » en prop a chaque niveau, on entoure
// l'app une fois et chaque composant se sert.
// ---------------------------------------------------------------------------
const ContextePalette = createContext(PALETTES.day);

export function FournisseurPalette({ mode, children }) {
  return (
    <ContextePalette.Provider value={PALETTES[mode] || PALETTES.day}>
      {children}
    </ContextePalette.Provider>
  );
}

export function usePalette() {
  return useContext(ContextePalette);
}

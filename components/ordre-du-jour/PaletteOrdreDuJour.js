import { useEffect } from 'react';

// ---------------------------------------------------------------------------
// LES COULEURS D'ORDRE DU JOUR, EN VARIABLES CSS
//
// Cette app compte plus de quatre cents couleurs posées à même le JSX, dans
// une centaine de composants. Plutôt que de passer une palette de main en main
// partout, chaque couleur est devenue une variable CSS — var(--odj-panel),
// var(--odj-texte), etc. — et ce fichier décide de leur valeur selon le mode.
//
// Les variables vivent sur <html>, pas sur un conteneur : les menus, les
// fenêtres et les bulles de notification sont posés en dehors de l'arbre de
// l'app, et doivent voir les mêmes couleurs.
// ---------------------------------------------------------------------------

const JOUR = {
  bg: '#edeff1',
  panel: '#ffffff',
  panelAlt: '#f7f8f9',
  surligne: '#e8ecf0',
  line: '#d7dbe0',
  lineFaible: '#edeff1',
  texte: '#15181b',
  texte2: '#495260',
  dim: '#8a93a0',
  accent: '#0f2138',
  navy: '#0f2138',
  navyLine: '#4a5a70',
  rouge: '#e4022e',
  err: '#c23b3b',
  ok: '#3c8c5d',
  okBg: '#eaf6ef',
  lien: '#2e86c1',
  violet: '#7c5cbf',
  orange: '#e67e22',
  ambre: '#f0a202',
  avisBg: '#fdf0d8',
  avisTexte: '#8a5a00',
};

const NUIT = {
  bg: '#10192e',
  panel: '#182238',
  panelAlt: '#1d2842',
  surligne: '#243354',
  line: '#2c3752',
  lineFaible: '#222d47',
  texte: '#e7eaf0',
  texte2: '#c3cad8',
  dim: '#8a93a8',
  accent: '#aec0f5',
  navy: '#0f2138',
  navyLine: '#4a5a70',
  rouge: '#e4022e',
  err: '#e06a6a',
  ok: '#4fbe83',
  okBg: '#12291c',
  lien: '#6db3e8',
  violet: '#b39ae6',
  orange: '#e8944a',
  ambre: '#e4a11b',
  avisBg: '#2a2213',
  avisTexte: '#e4a11b',
};

export default function PaletteOrdreDuJour({ mode }) {
  useEffect(() => {
    const table = mode === 'night' ? NUIT : JOUR;
    const racine = document.documentElement.style;
    Object.entries(table).forEach(([cle, valeur]) => {
      racine.setProperty(`--odj-${cle}`, valeur);
    });
    // Le fond ET la couleur de texte par défaut suivent aussi. Le texte
    // compte autant que le fond : les titres et les boutons qui n'ont pas de
    // couleur écrite héritent du noir du navigateur, invisible sur un fond de
    // nuit. En posant la couleur ici, ils suivent tous.
    document.body.style.background = table.bg;
    document.body.style.color = table.texte;
    return () => {
      document.body.style.background = '';
      document.body.style.color = '';
    };
  }, [mode]);

  return null;
}

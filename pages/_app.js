// Ce fichier est UNIQUE pour tout le projet Toolbox 2.0 (Next.js n'en
// permet qu'un seul). Chaque app Next.js interne (Planification hebdomadaire,
// et plus tard Ordre du jour) a son propre fichier CSS "scope" (toutes ses
// classes sont prefixees, ex .ph-scope pour Planification hebdomadaire) afin
// qu'aucune des apps ne puisse affecter visuellement les autres, meme si on
// navigue de l'une a l'autre sans rechargement complet de page.
//
// Pour ajouter une nouvelle app Next.js ici plus tard: creer son propre
// prefixe de scope (.xxx-scope), scoper son CSS avec ce prefixe, puis
// ajouter l'import ci-dessous.
import '../styles/planification-hebdomadaire.css';
import '../styles/defi-strava.css';

export default function App({ Component, pageProps }) {
  return <Component {...pageProps} />;
}

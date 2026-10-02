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
//
// commun.css vient EN PREMIER : il porte la police unique de tout le site
// (revision 61). Les feuilles d'app chargees apres peuvent donc encore
// surcharger un cas particulier, mais aucune ne doit redeclarer de police.
import '../styles/commun.css';
import '../styles/planification-hebdomadaire.css';
import '../styles/defi-strava.css';

export default function App({ Component, pageProps }) {
  return <Component {...pageProps} />;
}

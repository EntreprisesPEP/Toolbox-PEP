/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // IMPORTANT: force le slash final sur toutes les routes. Sans ca, Next.js
  // retire le slash final par defaut, ce qui casse les liens relatifs
  // internes des apps statiques (icon-192.png, manifest.json, etc.)
  // deviennent introuvables) car ces liens sont resolus par rapport au
  // dernier segment de l'URL affichee dans le navigateur.
  trailingSlash: true,

  // Chaque ancienne app statique (Toolbox, To-do-list, Couts-de-projets)
  // vit dans public/_static/<nom>/ et est exposee via une "rewrite" ici.
  // Le chemin source DOIT avoir un slash final pour que les liens relatifs
  // internes (icon-192.png, manifest.json, etc.) continuent de fonctionner.
  //
  // Chaque app statique a 2 regles:
  //   1) le chemin exact avec slash final -> son index.html
  //   2) le chemin + sous-fichiers -> les fichiers statiques associes
  async rewrites() {
    return [
      // Toolbox = page d'accueil, sur le domaine racine
      { source: '/', destination: '/_static/toolbox/index.html' },
      { source: '/toolbox/:path*', destination: '/_static/toolbox/:path*' },

      // Redirection de secours si quelqu'un tape /accueil
      { source: '/accueil', destination: '/_static/toolbox/index.html' },
      { source: '/accueil/', destination: '/_static/toolbox/index.html' },

      // To-do-list (ex Carnet de taches)
      { source: '/to-do-list/', destination: '/_static/to-do-list/index.html' },
      { source: '/to-do-list/:path*', destination: '/_static/to-do-list/:path*' },

      // Couts-de-projets (ex Fichier Cost)
      { source: '/couts-de-projets/', destination: '/_static/couts-de-projets/index.html' },
      { source: '/couts-de-projets/:path*', destination: '/_static/couts-de-projets/:path*' },
    ];
  },
};

module.exports = nextConfig;

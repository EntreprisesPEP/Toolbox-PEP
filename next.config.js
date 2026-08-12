/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

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
    ];
  },
};

module.exports = nextConfig;

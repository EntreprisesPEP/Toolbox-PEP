import dynamic from 'next/dynamic';
import Head from 'next/head';

// PEPday utilise des fonctions propres au navigateur (stockage local de la
// démo, appareil photo, carte Leaflet) qui n'existent pas côté serveur. Comme
// l'Ordre du jour, la page n'est donc rendue qu'une fois dans le navigateur.
const AppPepday = dynamic(() => import('../../components/pepday/AppPepday'), { ssr: false });

export default function PepdayPage() {
  return (
    <>
      <Head>
        <title>PEPday - Toolbox PEP</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="icon" type="image/svg+xml" href="/_static/pepday/icone-app.svg" />
        <meta name="apple-mobile-web-app-title" content="PEPday" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#14213d" />
      </Head>
      <AppPepday />
    </>
  );
}

import dynamic from 'next/dynamic';
import Head from 'next/head';

// Cette app utilise beaucoup de fonctionnalites propres au navigateur
// (window, notifications push, service worker) qui n'existent pas cote
// serveur. On desactive donc completement le rendu serveur pour cette
// page: elle ne s'affiche qu'une fois chargee dans le navigateur.
const OrdreDuJourApp = dynamic(
  () => import('../../components/ordre-du-jour/App'),
  { ssr: false }
);

export default function OrdreDuJourPage() {
  return (
    <>
      <Head>
        <title>PEP2000 — Ordre du jour</title>
        <link rel="apple-touch-icon" href="/_static/ordre-du-jour/icone-app.png" />
        <link rel="icon" type="image/png" href="/_static/ordre-du-jour/icone-app.png" />
        <meta name="apple-mobile-web-app-title" content="Ordre du jour" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#0F2138" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="true" />
        <link
          href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </Head>
      <OrdreDuJourApp />
    </>
  );
}

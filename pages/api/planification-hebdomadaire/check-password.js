import { verifierSession, tropDEssais, reinitialiserEssais, egaliteConstante } from '../../../lib/commun/gardeApi';

// ---------------------------------------------------------------------------
// LE MOT DE PASSE ANIMATEUR
//
// Cette route decide qui passe du mode « participant » (lecture seule) au
// mode « animateur » (edition du tableau de la planification hebdomadaire).
//
// Revision 46 — trois choses corrigees :
//
// 1. ELLE REPONDAIT OUI A TOUT LE MONDE si ANIMATEUR_PASSWORD n'etait pas
//    configuree. Le commentaire d'origine disait « comportement du prototype ».
//    En production la variable EST configuree, donc le trou ne s'ouvrait pas
//    aujourd'hui — mais il suffisait de la retirer, ou de deployer un nouvel
//    environnement Vercel sans elle, pour que tout le monde devienne
//    animateur en silence. Une porte se ferme quand la serrure manque, elle
//    ne s'ouvre pas. On repond maintenant 503 et on l'ecrit dans les logs.
//
// 2. ELLE ETAIT OUVERTE A INTERNET. N'importe qui pouvait poster des mots de
//    passe a l'infini sans avoir de compte. Il faut maintenant une session
//    Toolbox valide avec l'acces a l'app — la meme exigence que pour ouvrir
//    la page. Le mot de passe redevient ce qu'il est : un deuxieme cran entre
//    collegues, pas la seule serrure.
//
// 3. AUCUNE LIMITE D'ESSAIS, ET UNE COMPARAISON QUI FUITE. Huit essais par
//    dix minutes et par personne, et une comparaison a duree constante.
// ---------------------------------------------------------------------------

const APP_SLUG = 'planification-hebdomadaire';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Methode non supportee' });
  }

  const acces = await verifierSession(req, APP_SLUG);
  if (acces.erreur) {
    return res.status(acces.erreur.status).json({ ok: false, error: acces.erreur.message });
  }

  const attendu = process.env.ANIMATEUR_PASSWORD;
  if (!attendu) {
    // eslint-disable-next-line no-console
    console.error(
      'ANIMATEUR_PASSWORD n est pas configuree : le mode animateur reste ferme pour tout le monde. ' +
        'Ajouter la variable dans Vercel -> Settings -> Environment Variables, puis redeployer.'
    );
    return res.status(503).json({
      ok: false,
      error: "Le mot de passe animateur n'est pas configure sur le serveur. Previens l'equipe technique.",
    });
  }

  const cle = `animateur:${acces.userId}`;
  if (tropDEssais(cle)) {
    return res.status(429).json({
      ok: false,
      error: 'Trop d essais. Attends une dizaine de minutes avant de reessayer.',
    });
  }

  const { password } = req.body || {};
  const bon = egaliteConstante(password, attendu);
  if (bon) reinitialiserEssais(cle);

  return res.status(200).json({ ok: bon });
}

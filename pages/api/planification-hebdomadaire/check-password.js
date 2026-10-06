import { createClient } from '@supabase/supabase-js';
import { verifierSession, tropDEssais, reinitialiserEssais, egaliteConstante } from '../../../lib/commun/gardeApi';
import { verifierMotDePasse } from '../../../lib/commun/motDePasseApp';

// ---------------------------------------------------------------------------
// LE MOT DE PASSE ANIMATEUR
//
// Cette route decide qui passe du mode « participant » (lecture seule) au
// mode « admin » (edition du tableau de la planification hebdomadaire).
//
// Revision 46 — trois choses corrigees :
//
// 1. ELLE REPONDAIT OUI A TOUT LE MONDE si ANIMATEUR_PASSWORD n'etait pas
//    configuree. Une porte se ferme quand la serrure manque, elle ne s'ouvre
//    pas. On repond 503 et on l'ecrit dans les logs.
// 2. ELLE ETAIT OUVERTE A INTERNET. Il faut maintenant une session Toolbox
//    valide avec l'acces a l'app.
// 3. AUCUNE LIMITE D'ESSAIS, ET UNE COMPARAISON QUI FUITE. Huit essais par
//    dix minutes et par personne, comparaison a duree constante.
//
// Revision 73 — LE MOT DE PASSE SE CHANGE DEPUIS L'APP ADMINISTRATION.
//
// Il vivait dans une variable d'environnement Vercel : le changer demandait
// un acces Vercel et un redeploiement. Il est maintenant dans
// `pep_app_secrets`, sous forme d'empreinte scrypt, et William le change
// lui-meme depuis Administration.
//
// On garde ANIMATEUR_PASSWORD comme REPLI tant qu'aucun mot de passe n'a ete
// enregistre en base. Sans ce repli, le deploiement de cette revision
// fermerait le mode admin a tout le monde jusqu'a ce que quelqu'un ouvre
// Administration — une coupure, au pire moment, pour rien. Des qu'un mot de
// passe est enregistre, c'est lui qui compte et la variable est ignoree.
// ---------------------------------------------------------------------------

const APP_SLUG = 'planification-hebdomadaire';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function empreinteEnregistree() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return null;
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data, error } = await admin
      .from('pep_app_secrets').select('hash').eq('app_slug', APP_SLUG).maybeSingle();
    if (error) {
      // eslint-disable-next-line no-console
      console.error('Lecture de pep_app_secrets impossible :', error.message);
      return null;
    }
    return data?.hash || null;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Lecture de pep_app_secrets impossible :', e.message);
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Methode non supportee' });
  }

  const acces = await verifierSession(req, APP_SLUG);
  if (acces.erreur) {
    return res.status(acces.erreur.status).json({ ok: false, error: acces.erreur.message });
  }

  // Le comptage des essais vient AVANT toute comparaison : sinon la limite ne
  // limite rien, elle se contente de commenter apres coup.
  const cle = `animateur:${acces.userId}`;
  if (tropDEssais(cle)) {
    return res.status(429).json({
      ok: false,
      error: 'Trop d essais. Attends une dizaine de minutes avant de reessayer.',
    });
  }

  const { password } = req.body || {};
  const hash = await empreinteEnregistree();

  let bon;
  if (hash) {
    bon = await verifierMotDePasse(typeof password === 'string' ? password : '', hash);
  } else {
    const attendu = process.env.ANIMATEUR_PASSWORD;
    if (!attendu) {
      // eslint-disable-next-line no-console
      console.error(
        'Aucun mot de passe admin pour la planification hebdomadaire : ni dans pep_app_secrets, ' +
          'ni dans ANIMATEUR_PASSWORD. Le mode admin reste ferme. ' +
          'A regler depuis l app Administration -> Mot de passe admin.'
      );
      return res.status(503).json({
        ok: false,
        error:
          "Aucun mot de passe admin n'est configure. Un administrateur doit le definir dans l app Administration.",
      });
    }
    bon = egaliteConstante(password, attendu);
  }

  if (bon) reinitialiserEssais(cle);
  return res.status(200).json({ ok: bon });
}

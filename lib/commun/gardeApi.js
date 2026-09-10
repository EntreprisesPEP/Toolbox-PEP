import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// LA GARDE DES ROUTES API — une seule, pour toutes les apps.
//
// Revision 46. Le meme controle etait deja ecrit trois fois dans le depot :
// lib/facturation/auth.js, lib/ordre-du-jour/auth.js, et a la main dans
// quelques routes. Chaque copie a sa propre facon de rater — c'est comme ca
// que /api/defi-strava/connect et /api/defi-strava/push-subscribe se sont
// retrouvees sans aucun controle : personne n'avait de garde a reutiliser au
// moment de les ecrire.
//
// Ce que la garde exige, c'est exactement ce que GardeConnexion exige pour
// ouvrir l'app dans le navigateur : une session Toolbox valide, ET l'acces a
// l'app en question (ou le role administrateur, qui ouvre tout). Ni plus —
// une route appelee par les contremaitres ne doit pas exiger « admin » — ni
// moins.
//
// La cle anon ne sert qu'a valider le jeton de l'appelant. La lecture des
// droits passe par la cle service, hors de portee de RLS : une personne ne
// peut pas se donner un droit en trafiquant sa propre requete.
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * @param {object} req      la requete Next
 * @param {string} appSlug  le slug de l'app dans pep_apps (ex: 'defi-strava')
 * @returns {Promise<{erreur:{status:number,message:string}} |
 *                   {user:object,userId:string,email:string,estAdmin:boolean,admin:object}>}
 */
export async function verifierSession(req, appSlug) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return { erreur: { status: 401, message: 'Non autorisé' } };
  }
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
    return { erreur: { status: 500, message: 'Configuration Supabase manquante sur le serveur.' } };
  }

  let userData;
  try {
    const supabaseAuth = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const resultat = await supabaseAuth.auth.getUser();
    if (resultat.error || !resultat.data?.user) {
      return { erreur: { status: 401, message: 'Non autorisé' } };
    }
    userData = resultat.data;
  } catch (e) {
    return { erreur: { status: 401, message: 'Non autorisé' } };
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const userId = userData.user.id;

  const [{ data: roleRow }, { data: appAccess }] = await Promise.all([
    admin.from('pep_user_roles').select('role').eq('user_id', userId).maybeSingle(),
    admin
      .from('pep_user_apps')
      .select('app_slug')
      .eq('user_id', userId)
      .eq('app_slug', appSlug)
      .maybeSingle(),
  ]);

  const estAdmin = roleRow?.role === 'admin';
  if (!estAdmin && !appAccess) {
    return { erreur: { status: 403, message: "Accès refusé à cette application" } };
  }

  return { user: userData.user, userId, email: userData.user.email, estAdmin, admin };
}

// ---------------------------------------------------------------------------
// UNE LIMITE D'ESSAIS, EN MEMOIRE
//
// A dire franchement : sur Vercel, chaque instance a sa propre memoire, et
// elles sont recyclees. Ce compteur ne survit donc pas a tout, et quelqu'un
// de determine peut tomber sur une instance fraiche. Ce n'est PAS un mur.
//
// Ce que ca fait quand meme : un script qui essaie mille mots de passe a la
// seconde depuis une seule connexion se fait couper. Combine a l'obligation
// d'avoir deja une session Toolbox valide, ca suffit largement pour un mot
// de passe partage entre collegues. Une vraie limite (table Postgres ou
// Upstash) serait la bonne reponse si un jour cette porte protege autre
// chose que le mode edition d'un tableau interne.
// ---------------------------------------------------------------------------
const compteurs = new Map();

export function tropDEssais(cle, max = 8, fenetreMs = 10 * 60 * 1000) {
  const maintenant = Date.now();
  const entree = compteurs.get(cle);

  if (!entree || maintenant - entree.debut > fenetreMs) {
    compteurs.set(cle, { debut: maintenant, essais: 1 });
    return false;
  }

  entree.essais += 1;

  // Menage : sans ca la Map grossit indefiniment sur une instance de longue duree.
  if (compteurs.size > 500) {
    for (const [k, v] of compteurs) {
      if (maintenant - v.debut > fenetreMs) compteurs.delete(k);
    }
  }

  return entree.essais > max;
}

export function reinitialiserEssais(cle) {
  compteurs.delete(cle);
}

// ---------------------------------------------------------------------------
// COMPARAISON A DUREE CONSTANTE
// Une comparaison ordinaire s'arrete au premier caractere different, donc
// elle repond plus vite sur « aaaa » que sur « bonX » si le vrai mot de passe
// commence par « bon ». C'est mesurable, et ca permet de deviner le mot de
// passe caractere par caractere. Ici on parcourt toujours toute la chaine.
// ---------------------------------------------------------------------------
export function egaliteConstante(a, b) {
  const A = String(a == null ? '' : a);
  const B = String(b == null ? '' : b);
  const longueur = Math.max(A.length, B.length);
  let difference = A.length ^ B.length;
  for (let i = 0; i < longueur; i += 1) {
    difference |= (A.charCodeAt(i) || 0) ^ (B.charCodeAt(i) || 0);
  }
  return difference === 0;
}

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(scryptCb);

// ---------------------------------------------------------------------------
// LES MOTS DE PASSE D'APP — revision 73
//
// Jusqu'ici, le mot de passe animateur de la Planification hebdomadaire vivait
// dans une variable d'environnement Vercel. Le changer voulait dire ouvrir
// Vercel, modifier la variable et redeployer : personne chez PEP ne peut le
// faire sans moi. Il se change maintenant depuis l'app Administration.
//
// Ce qui est enregistre n'est PAS le mot de passe : c'est une empreinte
// scrypt avec un sel propre a chaque enregistrement. Meme avec la table sous
// les yeux, on ne remonte pas au mot de passe. Ca compte ici parce que les
// gens reutilisent leurs mots de passe, et qu'un mot de passe d'equipe lu en
// clair dans une base, c'est un mot de passe personnel devine ailleurs.
//
// scrypt vient de node:crypto — pas de dependance ajoutee, donc rien de
// nouveau qui puisse casser un deploiement.
//
// Format enregistre : scrypt$<N>$<sel base64>$<empreinte base64>
// Le N est dans la chaine pour qu'une empreinte ancienne reste verifiable le
// jour ou on durcit le parametre.
// ---------------------------------------------------------------------------

const N = 16384; // cout CPU ; ~50 ms par verification, invisible a l'usage
const LONGUEUR_CLE = 64;
const LONGUEUR_SEL = 16;

export const LONGUEUR_MINIMALE = 6;

export async function hacherMotDePasse(motDePasse) {
  const sel = randomBytes(LONGUEUR_SEL);
  const cle = await scrypt(String(motDePasse), sel, LONGUEUR_CLE, { N });
  return `scrypt$${N}$${sel.toString('base64')}$${cle.toString('base64')}`;
}

/**
 * Compare un mot de passe saisi a une empreinte enregistree.
 * Ne leve jamais : une empreinte illisible repond false, comme un mauvais
 * mot de passe. Une erreur qui remonterait ici ouvrirait la porte en cas de
 * donnee corrompue, au lieu de la garder fermee.
 */
export async function verifierMotDePasse(motDePasse, empreinte) {
  if (typeof motDePasse !== 'string' || typeof empreinte !== 'string') return false;
  try {
    const parties = empreinte.split('$');
    if (parties.length !== 4 || parties[0] !== 'scrypt') return false;
    const cout = parseInt(parties[1], 10);
    if (!Number.isFinite(cout) || cout < 1024) return false;
    const sel = Buffer.from(parties[2], 'base64');
    const attendu = Buffer.from(parties[3], 'base64');
    if (sel.length === 0 || attendu.length === 0) return false;
    const calcule = await scrypt(motDePasse, sel, attendu.length, { N: cout });
    return timingSafeEqual(calcule, attendu);
  } catch (e) {
    return false;
  }
}

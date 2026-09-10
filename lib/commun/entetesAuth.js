import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// EN-TETES D'UN APPEL DU NAVIGATEUR VERS NOS PROPRES ROUTES /api
//
// Revision 46. Version commune de ce qui existait deja pour l'ordre du jour
// (components/ordre-du-jour/lib/entetesAuth.js), maintenant que trois apps en
// ont besoin.
//
// Pourquoi relire la session ici plutot que de trimballer le jeton en props :
// un jeton Supabase expire au bout d'une heure et se renouvelle tout seul en
// arriere-plan. Un jeton copie dans un state React au moment ou la page s'est
// ouverte est perime des la deuxieme heure de la journee — et l'appel echoue
// avec un 401 incomprehensible pour la personne. getSession() renvoie
// toujours le jeton courant, parce que ce client partage le meme stockage de
// session que GardeConnexion.
//
// Si aucun jeton n'est lisible, on renvoie quand meme les en-tetes de base :
// la route repondra 401, ce qui est le bon comportement.
// ---------------------------------------------------------------------------

let client = null;

function clientSession() {
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
  }
  return client;
}

export async function entetesAuth() {
  const entetes = { 'Content-Type': 'application/json' };
  try {
    const { data } = await clientSession().auth.getSession();
    const jeton = data?.session?.access_token;
    if (jeton) entetes.Authorization = `Bearer ${jeton}`;
  } catch (e) {
    // Pas de session lisible : on laisse partir sans jeton, la route refusera.
  }
  return entetes;
}

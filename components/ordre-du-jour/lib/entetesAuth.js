import { supabase } from "./supabaseClient";

// ---------------------------------------------------------------------------
// EN-TETES D'UN APPEL A NOS PROPRES ROUTES
//
// Revision 42. Les routes /api/ordre-du-jour/send-push et send-notification
// n'avaient AUCUNE authentification : n'importe qui sur Internet pouvait
// appeler ces adresses et envoyer une notification push a tous les appareils
// abonnes, ou un courriel a toute la direction. Elles verifient maintenant
// une session Toolbox valide — il faut donc que l'app joigne son jeton.
//
// Pourquoi une fonction plutot que de passer la session en props : les appels
// partent de composants enfants (FicheDetail, le formulaire de requete, le
// tableau de bord) qui ne recoivent pas la session. Elle vit dans le
// composant App tout en haut. Plutot que de la faire descendre a travers
// cinq niveaux, on la relit ici : le client Supabase de l'app partage le
// meme stockage de session que GardeConnexion, donc getSession() renvoie
// exactement la session de la personne connectee.
//
// Si le jeton manque pour une raison quelconque, on renvoie quand meme les
// en-tetes de base. L'appel echouera alors avec un 401 — et comme les quatre
// appels sont deja dans des try/catch marques « secondaire », l'action
// principale (enregistrer la fiche, envoyer la reponse) n'est jamais bloquee.
// ---------------------------------------------------------------------------
export async function entetesAuth() {
  const entetes = { "Content-Type": "application/json" };
  try {
    const { data } = await supabase.auth.getSession();
    const jeton = data?.session?.access_token;
    if (jeton) entetes.Authorization = `Bearer ${jeton}`;
  } catch (e) {
    // Pas de session lisible : on laisse partir sans jeton, la route refusera.
  }
  return entetes;
}

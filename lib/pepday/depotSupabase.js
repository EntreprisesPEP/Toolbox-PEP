// ---------------------------------------------------------------------------
// PEPDAY — DÉPÔT SUPABASE (schéma « pepday » du projet Toolbox)
//
// Même interface que depotDemo.js. Le client utilise la clé anon et la
// session du Toolbox (même stockage de session que GardeConnexion) : chaque
// requête part avec le jeton de la personne, et ce sont les règles RLS et les
// fonctions de 002_regles.sql qui décident. Les transitions d'étape et les
// accusés de lecture passent par des fonctions SQL (rpc) : un client ne peut
// pas écrire « etape = 6 » directement.
//
// Prérequis côté Supabase : le schéma pepday doit être ajouté aux « Exposed
// schemas » de l'API (Settings > API), comme les autres schémas du Toolbox.
// ---------------------------------------------------------------------------

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const TABLES = [
  'membres', 'quarts', 'metiers', 'taches', 'sous_taches', 'equipes', 'employes', 'equipements', 'materiaux',
  'materiau_organisations', 'organisations', 'primes', 'projets', 'budgets', 'documents', 'taux', 'rapports',
  'lignes', 'activites', 'ressources_provisoires', 'photos', 'commentaires', 'historique', 'trajets', 'parametres',
];

const PAGE = 1000; // limite par requête de l'API Supabase

let clientMemo = null;
function client() {
  if (!clientMemo) clientMemo = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { db: { schema: 'pepday' } });
  return clientMemo;
}

function verifier({ data, error }) {
  if (error) throw new Error(error.message || 'Erreur Supabase');
  return data;
}

// Lit une table au complet, 1000 rangées à la fois.
async function toutLire(nom) {
  const toutes = [];
  for (let debut = 0; ; debut += PAGE) {
    const { data, error } = await client().from(nom).select('*').range(debut, debut + PAGE - 1);
    if (error) throw new Error(`${nom} : ${error.message}`);
    toutes.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return toutes;
}

export function supabaseConfigure() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export function creerDepotSupabase() {
  return {
    mode: 'supabase',

    async chargerTout() {
      const resultats = await Promise.all(TABLES.map((t) => toutLire(t)));
      return Object.fromEntries(TABLES.map((t, i) => [t, resultats[i]]));
    },

    async inserer(nomTable, row) {
      return verifier(await client().from(nomTable).insert(row).select().single());
    },

    async insererPlusieurs(nomTable, rows) {
      if (!rows.length) return [];
      return verifier(await client().from(nomTable).insert(rows).select());
    },

    async modifier(nomTable, id, patch) {
      return verifier(await client().from(nomTable).update(patch).eq('id', id).select().single());
    },

    async supprimer(nomTable, id) {
      verifier(await client().from(nomTable).delete().eq('id', id));
    },

    async transition({ rapportId, action, commentaire }) {
      const data = verifier(await client().rpc('transition_rapport', {
        p_rapport_id: rapportId, p_action: action, p_commentaire: commentaire || null,
      }));
      // La fonction renvoie le rapport à jour et la ligne d'historique.
      return { rapport: data.rapport, historique: data.historique };
    },

    async accuserLecture({ commentaireId }) {
      return verifier(await client().rpc('accuser_lecture', { p_commentaire_id: commentaireId }));
    },

    // Rattache le compte Toolbox à sa fiche pepday.membres (par courriel) et
    // renvoie la fiche. Appelé une fois à l'ouverture.
    async monMembre() {
      return verifier(await client().rpc('mon_membre'));
    },

    async televerser(bucket, chemin, fichier) {
      verifier(await client().storage.from(bucket).upload(chemin, fichier, { upsert: false, contentType: fichier.type }));
      return { chemin };
    },

    async urlFichier(bucket, chemin) {
      const { data, error } = await client().storage.from(bucket).createSignedUrl(chemin, 60 * 60);
      if (error) return null;
      return data?.signedUrl || null;
    },

    async supprimerFichier(bucket, chemin) {
      await client().storage.from(bucket).remove([chemin]);
    },
  };
}

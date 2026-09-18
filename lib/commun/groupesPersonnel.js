// ---------------------------------------------------------------------------
// LES GROUPES DE LA LISTE DU PERSONNEL, RÉSOLUS EN LISTES DE PERSONNES
//
// Revision 56.
//
// Avant : chaque app tenait sa propre liste de noms. La Planification hebdo
// avait ses tables `charges` et `surintendants` (remplies à la main, en noms
// courts : « Frank », « Tony », « Lalande »), la Liste de projets avait sa
// table `personnel` (en noms complets), et le bottin — l'app Liste du
// personnel — avait la vraie liste. Trois listes, trois graphies, et un même
// surintendant qui s'appelait « Frank » dans une app et « François Ouellet »
// dans l'autre.
//
// Maintenant : une seule source, le bottin. Les rôles y sont exprimés par des
// GROUPES, une fonctionnalité qui existait déjà dans la Liste du personnel et
// que la Visite de surintendant utilisait seule dans son coin.
//
// Un groupe se remplit de deux façons, combinables :
//   - en y rattachant un DÉPARTEMENT complet (le groupe suit alors les
//     arrivées et les départs tout seul) ;
//   - en y ajoutant des PERSONNES nommément (pour les cas qui ne suivent pas
//     l'organigramme — un chargé de projet peut avoir n'importe quel titre).
//
// Ce module est la seule implémentation de cette résolution. Il en existait
// deux avant, avec des règles qui divergeaient déjà : l'une filtrait les
// personnes inactives, l'autre non. Deux copies d'une même règle finissent
// toujours par se contredire.
// ---------------------------------------------------------------------------

import { createClient } from '@supabase/supabase-js';

// Les noms des groupes tels qu'ils apparaissent dans l'onglet Groupes de la
// Liste du personnel. La comparaison est insensible à la casse et aux espaces
// de bout (voir `memeNom`), mais pas aux accents : renommer « Chargés de
// projet » en « Charges de projet » dans le bottin déconnecterait les apps.
// C'est le prix du rattachement par nom ; en échange, le groupe reste lisible
// et modifiable par quelqu'un qui n'écrit pas de code.
export const GROUPE_CHARGES = 'Chargés de projet';
export const GROUPE_SURINTENDANTS = 'Surintendants';
export const GROUPE_VISITE = 'projets';

const URL_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const CLE_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let clientMemo = null;

// Un seul client pour le schéma `personnel`, partagé par tous les appelants.
// Chaque `createClient` ouvre sa propre connexion Realtime ; trois apps qui en
// créaient chacune un, c'était trois connexions pour lire les mêmes quatre
// tables.
function clientPersonnel() {
  if (!clientMemo) {
    clientMemo = createClient(URL_SUPABASE, CLE_SUPABASE, { db: { schema: 'personnel' } });
  }
  return clientMemo;
}

function memeNom(a, b) {
  return (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();
}

// Résout UN groupe à partir de tables déjà chargées en mémoire.
//
// Séparé de la lecture Supabase exprès : c'est la partie qui contient la
// règle, et une fonction pure se teste sans base de données.
export function resoudreGroupe(nomGroupe, tables, options = {}) {
  const { groupes = [], groupeDepartements = [], groupePersonnes = [], personnes = [] } = tables || {};
  const { inclureInactifs = false } = options;

  const cible = groupes.find((g) => memeNom(g.nom, nomGroupe));
  if (!cible) return null; // null = le groupe n'existe pas, [] = il est vide

  const departements = groupeDepartements
    .filter((x) => x.groupe === cible.nom)
    .map((x) => x.departement);
  const idsNommes = new Set(
    groupePersonnes.filter((x) => x.groupe === cible.nom).map((x) => x.personne_id)
  );

  return personnes
    .filter((p) => inclureInactifs || p.actif !== false)
    .filter((p) => (p.departement && departements.includes(p.departement)) || idsNommes.has(p.id))
    .map((p) => ({ ...p, viaDepartement: Boolean(p.departement && departements.includes(p.departement)) }))
    .sort((a, b) => (a.nom || '').localeCompare(b.nom || '', 'fr'));
}

// Lit les quatre tables du bottin et résout les groupes demandés.
//
// Renvoie toujours un objet exploitable, même en cas de panne : une app qui
// n'arrive pas à joindre le bottin doit afficher un avertissement, pas un menu
// déroulant vide. L'appelant décide de son repli — la Visite de surintendant
// retombe sur l'ancienne liste, la Planification hebdo sur les noms déjà
// présents dans ses projets.
export async function chargerGroupes(nomsGroupes, options = {}) {
  const noms = Array.isArray(nomsGroupes) ? nomsGroupes : [nomsGroupes];
  const vide = Object.fromEntries(noms.map((n) => [n, []]));

  try {
    const client = clientPersonnel();
    const [g, gd, gp, p] = await Promise.all([
      client.from('groupes').select('nom'),
      client.from('groupe_departements').select('groupe, departement'),
      client.from('groupe_personnes').select('groupe, personne_id'),
      client.from('personnes').select('id, nom, courriel, titre, departement, actif'),
    ]);

    const echec = g.error || gd.error || gp.error || p.error;
    if (echec) {
      return { groupes: vide, personnes: [], erreur: echec.message || 'lecture du bottin impossible', manquants: noms };
    }

    const tables = {
      groupes: g.data || [],
      groupeDepartements: gd.data || [],
      groupePersonnes: gp.data || [],
      personnes: p.data || [],
    };

    const resultat = {};
    const manquants = [];
    for (const nom of noms) {
      const membres = resoudreGroupe(nom, tables, options);
      if (membres === null) { manquants.push(nom); resultat[nom] = []; } else { resultat[nom] = membres; }
    }

    return { groupes: resultat, personnes: tables.personnes, erreur: null, manquants };
  } catch (e) {
    return { groupes: vide, personnes: [], erreur: e?.message || String(e), manquants: noms };
  }
}

// Raccourci : les noms seuls, ce dont les menus déroulants ont besoin.
export function nomsDe(membres) {
  return (membres || []).map((p) => p.nom).filter(Boolean);
}

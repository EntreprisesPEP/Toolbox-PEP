// ---------------------------------------------------------------------------
// PEPDAY — LES VALEURS QUI NE CHANGENT PAS D'UN ÉCRAN À L'AUTRE
//
// Rôles, étapes de validation, catégories de cost et statuts de projet. Les
// mêmes codes sont écrits dans les migrations SQL (supabase/pepday/) : un
// code renommé ici doit l'être là aussi, sinon les règles RLS ne
// reconnaîtront plus la valeur.
// ---------------------------------------------------------------------------

export const APP_SLUG = 'pepday';
export const NOM_APP = 'PEPday';

// Les rôles propres à PEPday. Une personne peut en cumuler plusieurs (un
// surintendant qui fait aussi le dispatch, par exemple). Ils vivent dans la
// table pepday.membres, pas dans le Toolbox : le Toolbox décide qui ouvre
// l'app, PEPday décide ce que chacun y fait.
export const ROLES = [
  { code: 'dispatch', libelle: 'Dispatch' },
  { code: 'contremaitre', libelle: 'Contremaître' },
  { code: 'surintendant', libelle: 'Surintendant' },
  { code: 'coordonnateur', libelle: 'Coordonnateur' },
  { code: 'charge_projet', libelle: 'Chargé de projet' },
  { code: 'directeur', libelle: 'Directeur construction' },
];

export function libelleRole(code) {
  return ROLES.find((r) => r.code === code)?.libelle || code;
}

// Les étapes d'un rapport journalier. L'étape 6 n'est pas une étape de
// travail : c'est l'état « verrouillé » après la confirmation du cost final.
export const ETAPES = [
  { no: 1, code: 'dispatch', libelle: 'Dispatch', role: 'dispatch', action: 'Transmettre au contremaître', court: 'Dispatch' },
  { no: 2, code: 'saisie', libelle: 'Saisie du contremaître', role: 'contremaitre', action: 'Soumettre le rapport', court: 'Contremaître' },
  { no: 3, code: 'surintendant', libelle: 'Validation du surintendant', role: 'surintendant', action: 'Valider (surintendant)', court: 'Surintendant' },
  { no: 4, code: 'coordonnateur', libelle: 'Validation du coordonnateur', role: 'coordonnateur', action: 'Valider (coordonnateur)', court: 'Coordonnateur' },
  { no: 5, code: 'charge_projet', libelle: 'Confirmation du chargé de projet', role: 'charge_projet', action: 'Confirmer le cost final', court: 'Chargé de projet' },
  { no: 6, code: 'verrouille', libelle: 'Verrouillé', role: null, action: null, court: 'Verrouillé' },
];

export const ETAPE_VERROUILLE = 6;

export function etape(no) {
  return ETAPES.find((e) => e.no === Number(no)) || ETAPES[0];
}

// Couleurs des pastilles d'étape — lisibles de jour comme de nuit.
export const COULEURS_ETAPES = {
  1: '#6b7488',
  2: '#2e86c1',
  3: '#8e44ad',
  4: '#d68910',
  5: '#c0392b',
  6: '#2e9f58',
};

// Les quatre catégories de cost d'un rapport, plus « autre » pour le budget
// (frais généraux, permis, imprévus) qui ne vient pas des rapports.
export const CATEGORIES = [
  { code: 'main_oeuvre', libelle: 'Main-d’œuvre', court: 'M.-O.', unite: 'h' },
  { code: 'equipement', libelle: 'Équipements', court: 'Équip.', unite: 'h' },
  { code: 'materiau', libelle: 'Matériaux', court: 'Mat.', unite: '' },
  { code: 'sous_traitant', libelle: 'Sous-traitants', court: 'S.-T.', unite: '' },
];
export const CATEGORIES_BUDGET = [...CATEGORIES, { code: 'autre', libelle: 'Autres', court: 'Autres', unite: '' }];

export function libelleCategorie(code) {
  return CATEGORIES_BUDGET.find((c) => c.code === code)?.libelle || code;
}

export const STATUTS_PROJET = [
  { code: 'soumission', libelle: 'En soumission', couleur: '#8a93a8' },
  { code: 'a_venir', libelle: 'À venir', couleur: '#2e86c1' },
  { code: 'en_cours', libelle: 'En cours', couleur: '#2e9f58' },
  { code: 'suspendu', libelle: 'Suspendu', couleur: '#d68910' },
  { code: 'termine', libelle: 'Terminé', couleur: '#14213d' },
  { code: 'annule', libelle: 'Annulé', couleur: '#c0392b' },
];

export function statutProjet(code) {
  return STATUTS_PROJET.find((s) => s.code === code) || STATUTS_PROJET[0];
}

export const METEO_CONDITIONS = [
  'Ensoleillé', 'Partiellement nuageux', 'Nuageux', 'Pluie légère', 'Pluie forte',
  'Orages', 'Neige', 'Verglas', 'Brouillard', 'Venteux',
];

// RV02 — unités : seulement celles que PEP utilise (relevé Civalgo : Heure
// et Tonne métrique presque partout). Le code court est ce qui s'enregistre.
export const UNITES_DETAIL = [
  { code: 'h', libelle: 'Heure (h)' },
  { code: 't', libelle: 'Tonne métrique (t)' },
  { code: 'm³', libelle: 'Mètre cube (m³)' },
  { code: 'm²', libelle: 'Mètre carré (m²)' },
  { code: 'm lin.', libelle: 'Mètre linéaire (m lin.)' },
  { code: 'chq', libelle: 'Chaque (chq)' },
  { code: 'forf', libelle: 'Forfaitaire (forf)' },
];
export const UNITES = UNITES_DETAIL.map((u) => u.code);

// RV02 — un seul registre d'organisations, type OBLIGATOIRE dans une liste
// fermée (chez Civalgo le type était presque toujours vide et écrit dans la
// note : « (Client) », « Transporteur »…).
export const TYPES_ORGANISATION = [
  { code: 'entite_pep', libelle: 'Entité PEP', couleur: '#c41230' },
  { code: 'client', libelle: 'Client', couleur: '#14213d' },
  { code: 'fournisseur', libelle: 'Fournisseur', couleur: '#2e86c1' },
  { code: 'carriere', libelle: 'Carrière', couleur: '#7d5530' },
  { code: 'transporteur', libelle: 'Transporteur', couleur: '#d68910' },
  { code: 'sous_traitant', libelle: 'Sous-traitant', couleur: '#8e44ad' },
  { code: 'signalisation', libelle: 'Signalisation', couleur: '#e67e22' },
];
export function typeOrganisation(code) {
  return TYPES_ORGANISATION.find((t) => t.code === code) || { code, libelle: code || '—', couleur: '#8a93a8' };
}

// Départements : liste fermée, une seule graphie.
export const DEPARTEMENTS = ['Excavation / Civil', 'Aménagement', 'Asphalte'];

export const TYPES_MATERIAU = ['Asphalte', 'Terre', 'Pierre', 'Matériaux revalorisés'];

export const TITULAIRES_EQUIPEMENT = [
  { code: 'proprietaire', libelle: 'Propriétaire' },
  { code: 'location_externe', libelle: 'Location externe' },
];

export const UNITES_PRIME = [
  { code: 'forfait', libelle: 'Forfait (par rapport)' },
  { code: 'heure', libelle: 'Par heure travaillée' },
  { code: 'jour', libelle: 'Par jour' },
];

// RV02 — les statuts « à la Civalgo », dérivés de l'étape de validation.
// Les cinq étapes de PEPday restent la règle; ces statuts sont la lecture
// rapide que les équipes connaissent déjà (compteurs du calendrier, filtres).
//   À planifier : créé par le dispatch, pas encore assigné à un projet
//   À remplir   : assigné, en attente du contremaître (étapes 1 et 2)
//   À réviser   : chez le surintendant (étape 3)
//   À valider   : chez le coordonnateur ou le chargé de projet (4 et 5)
//   Validé      : cost final confirmé, verrouillé (6)
//   Abandonné   : fermé sans avoir été rempli
export const STATUTS_RAPPORT = [
  { code: 'a_planifier', libelle: 'À planifier', couleur: '#8a93a8' },
  { code: 'a_remplir', libelle: 'À remplir', couleur: '#2e86c1' },
  { code: 'a_reviser', libelle: 'À réviser', couleur: '#8e44ad' },
  { code: 'a_valider', libelle: 'À valider', couleur: '#d68910' },
  { code: 'valide', libelle: 'Validé', couleur: '#2e9f58' },
  { code: 'abandonne', libelle: 'Abandonné', couleur: '#5c6478' },
];
export function codeStatut(r) {
  if (!r) return 'a_planifier';
  if (r.abandonne) return 'abandonne';
  if (r.etape >= 6) return 'valide';
  if (r.etape >= 4) return 'a_valider';
  if (r.etape === 3) return 'a_reviser';
  if (r.etape === 1 && !r.projet_id) return 'a_planifier';
  return 'a_remplir';
}
export function statutRapport(r) {
  return STATUTS_RAPPORT.find((s) => s.code === codeStatut(r));
}

// Fermeture automatique des rapports jamais remplis (Civalgo en traîne
// 1 057 « À remplir »). Valeur par défaut, modifiable dans pepday.parametres.
export const JOURS_AVANT_ABANDON = 14;

// Couleur des couches de la carte.
export const COULEUR_EMPLOYE = '#16a085';
export const COULEUR_EQUIPEMENT = '#f39c12';

export const VERSION = 'RV02';

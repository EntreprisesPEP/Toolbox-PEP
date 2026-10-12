// ---------------------------------------------------------------------------
// PEPDAY RV02 — LES LISTES DE RÉFÉRENCE À SEMER
//
// Repris du relevé Civalgo du 11 octobre 2026 (compte de production de PEP).
// La structure des tâches est reprise TELLE QUELLE : c'est le vocabulaire
// que les contremaîtres connaissent. Ne rien renommer.
//
// Une seule source pour la démo et pour Supabase : le fichier SQL de
// semences (supabase/pepday/005_semences.sql) est généré à partir d'ici par
// scripts/generer-semences.js. Modifier ici, puis régénérer.
// ---------------------------------------------------------------------------

export const TACHES = [
  { id: 'ta-100', code: '100', nom: '1- EXCAVATION', unite: 'h' },
  { id: 'ta-200', code: '200', nom: '2- GÉNIE CIVIL', unite: 'h' },
  { id: 'ta-300', code: '300', nom: '3- BORDURE, TROTTOIR', unite: 'h' },
  { id: 'ta-400', code: '400', nom: '4- PAVAGE', unite: 'h' },
  { id: 'ta-500', code: '500', nom: '5- AMEN. PAYSAGER', unite: 'h' },
  { id: 'ta-600', code: '600', nom: '6- PROJETS À TEMPS ET MATÉRIEL', unite: 'h' },
];

const ST = [
  ['101', 'Arpentage et implantation'], ['102', 'Décontaminations'], ['103', 'Excavations de masse'],
  ['104', 'Excavation locale'], ['105', 'Empierrement et grade final'], ['106', 'Remblai extérieur et de dalle tréfonds'],
  ['107', 'Plomberie et drain français'], ['108', 'Électricités sous-dalle'],
  ['201', 'Excavation / remblais des tranchées'], ['202', 'Assise et enrobage des conduites'],
  ['203', 'Installation pluvial / sanitaire / aqueduc'], ['204', 'Installation des regards et puisards'],
  ['205', 'Bassins de rétention'], ['206', 'Électricité extérieure'], ['207', 'Infrastructure de chaussée'], ['208', 'Coupes de rue'],
  ['301', 'Préparation de la fondation'], ['302', 'Coffrage'], ['303', 'Coulage du béton'], ['304', 'Décoffrage'],
  ['305', 'Bordures et Trottoirs - Divers'],
  ['401', 'Pulvérisation'], ['402', 'Travaux d’empierrement'], ['403', 'Nivellement final de la fondation'],
  ['404', 'Pose de la couche de base'], ['405', 'Pose de la couche de finition'],
  ['501', 'Excavation amen. Paysager'], ['502', 'Terrassement & remblais infra.'], ['503', 'Nivellement de finition'],
  ['504', 'Pose de pavés / blocs / bordures'], ['505', 'Plantation d’arbres et arbustres'], ['506', 'Engazonnement & ensemencement'],
  ['507', 'Aménagement hardscape'], ['508', 'Aménagement softscape'],
];

export const SOUS_TACHES = [
  ...ST.map(([code, nom]) => ({ id: `st-${code}`, code, nom, tache_id: `ta-${code[0]}00`, unite: 'h' })),
  // La 35e : sans code ni unité, comme dans Civalgo.
  { id: 'st-tm', code: null, nom: 'Travaux à temps et matériel', tache_id: 'ta-600', unite: null },
];

// Seuil de temps supplémentaire : À CONFIRMER avec William (question 3).
// heures_normales est informatif; PEPday ne calcule pas encore le temps supp.
export const QUARTS = [
  { id: 'qu-9h', nom: '9h', heures_normales: 9, code_paie: '9H' },
  { id: 'qu-pav', nom: 'Pavage 10h', heures_normales: 10, code_paie: 'PAV10' },
  { id: 'qu-hccq', nom: 'Hors CCQ', heures_normales: null, code_paie: 'HCCQ' },
  { id: 'qu-nuit', nom: 'Nuit', heures_normales: null, code_paie: 'NUIT' },
];

export const METIERS = [
  { id: 'mt-adm', nom: 'Administration' }, { id: 'mt-arp', nom: 'Arpenteur' },
  { id: 'mt-cp', nom: 'Chargé de projet' }, { id: 'mt-chl', nom: 'Chauffeur / Livreur' },
  { id: 'mt-chb', nom: 'Chauffeur Balai' }, { id: 'mt-ope', nom: 'Opérateur de pelles' },
  { id: 'mt-man', nom: 'Manoeuvre spécialisé' }, { id: 'mt-sig', nom: 'Signaleurs' },
  { id: 'mt-mec', nom: 'Mécanicien' }, { id: 'mt-chs', nom: 'Chauffeur Semi' },
  { id: 'mt-chf', nom: 'Chauffeur Fardier' }, { id: 'mt-jou', nom: 'Journalier' },
  { id: 'mt-ctm', nom: 'Contremaître' }, { id: 'mt-opl', nom: 'Opérateur d’équipement lourd' },
];

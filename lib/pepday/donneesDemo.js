// ---------------------------------------------------------------------------
// PEPDAY — DONNÉES DE DÉMONSTRATION (RV02)
//
// TOUT EST FICTIF. Aucun nom de ce fichier n'est celui d'un employé, d'un
// client ou d'un fournisseur réel : les noms de famille sont volontairement
// des mots (Exemple, Modèle, Gabarit…) pour qu'on ne les confonde jamais avec
// de vraies personnes dans une capture d'écran. Les villes sont réelles pour
// que la carte ait du sens; les adresses et les projets ne le sont pas.
// Les montants des primes et des taux sont des exemples, pas les vrais.
//
// Les rapports sont générés autour de la date du jour, pour que la démo ait
// toujours l'air vivante, avec un générateur pseudo-aléatoire à graine fixe :
// deux chargements donnent les mêmes données.
// ---------------------------------------------------------------------------

import { TACHES, SOUS_TACHES, QUARTS, METIERS } from './referentiel';

function generateur(graine) {
  let s = graine >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const iso = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export const MEMBRE_DEMO_PAR_DEFAUT = 'm-dir';

export function creerDonneesDemo() {
  const alea = generateur(2026);
  const choisir = (liste) => liste[Math.floor(alea() * liste.length)];
  const entre = (a, b) => a + Math.floor(alea() * (b - a + 1));
  const maintenant = new Date();
  const anneeCourante = maintenant.getFullYear();

  // --- Équipe PEPday (les personnes qui se connectent) -------------------
  const membres = [
    { id: 'm-dir', user_id: 'demo-u-dir', nom: 'Diane Exemple', titre: 'Directrice construction', courriel: 'diane.exemple@demo.local', roles: ['directeur'], actif: true },
    { id: 'm-cp1', user_id: 'demo-u-cp1', nom: 'Philippe Modèle', titre: 'Chargé de projet', courriel: 'philippe.modele@demo.local', roles: ['charge_projet'], actif: true },
    { id: 'm-cp2', user_id: 'demo-u-cp2', nom: 'Karine Essai', titre: 'Chargée de projet', courriel: 'karine.essai@demo.local', roles: ['charge_projet'], actif: true },
    { id: 'm-coo', user_id: 'demo-u-coo', nom: 'Sophie Prototype', titre: 'Coordonnatrice de projets', courriel: 'sophie.prototype@demo.local', roles: ['coordonnateur'], actif: true },
    { id: 'm-su1', user_id: 'demo-u-su1', nom: 'Marc Fictif', titre: 'Surintendant', courriel: 'marc.fictif@demo.local', roles: ['surintendant'], actif: true },
    { id: 'm-su2', user_id: 'demo-u-su2', nom: 'Benoît Témoin', titre: 'Surintendant', courriel: 'benoit.temoin@demo.local', roles: ['surintendant'], actif: true },
    { id: 'm-dis', user_id: 'demo-u-dis', nom: 'Nathalie Démo', titre: 'Répartitrice', courriel: 'nathalie.demo@demo.local', roles: ['dispatch'], actif: true },
    { id: 'm-cm1', user_id: 'demo-u-cm1', nom: 'Éric Gabarit', titre: 'Contremaître', courriel: 'eric.gabarit@demo.local', roles: ['contremaitre'], actif: true },
    { id: 'm-cm2', user_id: 'demo-u-cm2', nom: 'Luc Maquette', titre: 'Contremaître', courriel: 'luc.maquette@demo.local', roles: ['contremaitre'], actif: true },
    { id: 'm-cm3', user_id: 'demo-u-cm3', nom: 'Jean Brouillon', titre: 'Contremaître', courriel: 'jean.brouillon@demo.local', roles: ['contremaitre'], actif: true },
  ];

  // --- Référentiel (repris de Civalgo) ------------------------------------
  const quarts = QUARTS.map((q) => ({ ...q, actif: true }));
  const metiers = METIERS.map((m) => ({ ...m, actif: true }));
  const taches = TACHES.map((t) => ({ ...t, actif: true }));
  const sousTaches = SOUS_TACHES.map((t) => ({ ...t, actif: true }));

  // --- Organisations : un seul registre, type obligatoire ------------------
  const org = (id, nom, type, adresse, lat, lng, contact_nom, notes = '') => ({
    id, nom, type, adresse, lat, lng, contact_nom, notes, actif: true, ref_civalgo: null,
    telephone: `450 555-${String(1000 + (id.charCodeAt(0) * 7 + Number(id.replace(/\D/g, '') || 0) * 13) % 9000).padStart(4, '0')}`,
    courriel: `bureau@${nom.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '').slice(0, 14)}.demo.local`,
  });
  const organisations = [
    org('o-pep', 'Entreprises PEP (démo)', 'entite_pep', '1000, boulevard Démo, Saint-Constant', 45.3678, -73.5671, 'Réception'),
    org('c-1', 'Municipalité Exemple', 'client', '1, place de l’Hôtel-de-Ville, Saint-Constant', 45.3693, -73.5694, 'Service des travaux publics'),
    org('c-2', 'Ville Démo', 'client', '200, rue de la Mairie, Châteauguay', 45.3801, -73.7476, 'Génie municipal'),
    org('c-3', 'Centre sportif Fictif', 'client', '50, rue du Stade, La Prairie', 45.4121, -73.5122, 'Direction'),
    org('c-4', 'Industries Témoin inc.', 'client', '400, rue des Usines, Mercier', 45.3188, -73.7401, 'Bureau de projet'),
    org('f-1', 'Carrière Exemple inc.', 'carriere', '100, chemin de la Carrière, Saint-Constant', 45.3487, -73.5946, 'Paul Caillou'),
    org('o-car2', 'Carrière Modèle', 'carriere', '12, rang des Pierres, Saint-Philippe', 45.3361, -73.4602, 'Hélène Concasse'),
    org('f-2', 'Béton Démo ltée', 'fournisseur', '25, rue de l’Industrie, Delson', 45.3712, -73.5389, 'Annie Malaxeur'),
    org('f-3', 'Enrobés Fictifs', 'fournisseur', '800, montée Saint-Fictif, Candiac', 45.3813, -73.5021, 'Robert Bitume', 'Usine d’enrobé'),
    org('f-4', 'Tuyaux Modèle', 'fournisseur', '42, boulevard Industriel, Châteauguay', 45.3557, -73.7311, 'Claire Conduit'),
    org('f-5', 'Quincaillerie Témoin', 'fournisseur', '310, rue Principale, La Prairie', 45.4161, -73.4978, 'Yves Boulon'),
    org('f-6', 'Site de disposition Remblai-Test', 'fournisseur', '5, rang du Dépôt, Saint-Rémi', 45.2671, -73.6122, 'Guy Benne', 'Site de disposition des sols'),
    org('f-7', 'Location Gabarit', 'fournisseur', '77, rue des Grues, Brossard', 45.4585, -73.4651, 'Line Levier', 'Location d’équipement'),
    org('o-tr1', 'Transport Exemple', 'transporteur', '9, rue du Camionnage, Sainte-Catherine', 45.3988, -73.5741, 'Gilles Benne'),
    org('s-1', 'Pavage Exemple', 'sous_traitant', '12, rue du Pavé, Sainte-Catherine', 45.4006, -73.5797, 'Marie Rouleau'),
    org('s-2', 'Marquage Fictif', 'sous_traitant', '9, rue des Lignes, Mercier', 45.3203, -73.7462, 'Denis Ligne'),
    org('s-3', 'Arpentage Démo', 'sous_traitant', '150, boulevard Taschereau, La Prairie', 45.4204, -73.4882, 'Julie Jalon'),
    org('s-4', 'Laboratoire Modèle', 'sous_traitant', '61, rue de la Science, Longueuil', 45.5312, -73.5181, 'Paul Éprouvette'),
    org('s-5', 'Signalisation Témoin', 'signalisation', '33, rue des Cônes, Saint-Philippe', 45.3586, -73.4752, 'Sonia Balise'),
    org('s-6', 'Bordures Prototype', 'sous_traitant', '18, rue du Coffrage, Saint-Isidore', 45.3054, -73.6828, 'Marc Coffrage'),
  ];

  // --- Équipes (une équipe = un contremaître, son monde, son quart) -------
  const equipes = [
    { id: 'eq-1', nom: 'Équipe Gabarit', contremaitre_id: 'm-cm1', departement: 'Excavation / Civil', quart_id: 'qu-9h', actif: true },
    { id: 'eq-2', nom: 'Équipe Maquette', contremaitre_id: 'm-cm2', departement: 'Excavation / Civil', quart_id: 'qu-9h', actif: true },
    { id: 'eq-3', nom: 'Équipe Brouillon', contremaitre_id: 'm-cm3', departement: 'Aménagement', quart_id: 'qu-9h', actif: true },
  ];
  const equipeDe = (cmId) => equipes.find((e) => e.contremaitre_id === cmId);

  // --- Employés ---------------------------------------------------------------
  const listeEmployes = [
    ['Alexis Brique', 'mt-jou', 'eq-1'], ['Samuel Pelle', 'mt-jou', 'eq-1'], ['Gabriel Gravier', 'mt-jou', 'eq-2'],
    ['Olivier Ciment', 'mt-man', 'eq-1'], ['Thomas Asphalte', 'mt-man', 'eq-2'], ['Félix Bordure', 'mt-man', 'eq-3'],
    ['Mathis Remblai', 'mt-ope', 'eq-1'], ['Raphaël Compacteur', 'mt-opl', 'eq-2'], ['Antoine Niveau', 'mt-opl', 'eq-3'],
    ['Jérémie Pavé', 'mt-chl', 'eq-1'], ['Maxime Regard', 'mt-chl', 'eq-2'], ['Vincent Ponceau', 'mt-ope', 'eq-3'],
    ['Hugo Granulat', 'mt-jou', 'eq-3'], ['Loïc Tranchée', 'mt-man', 'eq-2'],
    ['Éric Gabarit', 'mt-ctm', 'eq-1'], ['Luc Maquette', 'mt-ctm', 'eq-2'], ['Jean Brouillon', 'mt-ctm', 'eq-3'],
  ];
  const opere = { 'mt-ope': 'Pelles hydrauliques', 'mt-opl': 'Niveleuse, rouleau, chargeuse', 'mt-chl': 'Camions 10 et 12 roues' };
  const employes = listeEmployes.map(([nom, metier_id, equipe_id], i) => {
    const eq = equipes.find((e) => e.id === equipe_id);
    return {
      id: `e-${String(i + 1).padStart(2, '0')}`, code: `D${String(100 + i)}`, nom, metier_id,
      courriel: '', telephone: `514 555-${String(2000 + i * 37).slice(-4)}`, organisation_id: 'o-pep', equipe_id,
      type: metier_id === 'mt-ctm' ? 'Contremaître' : 'Horaire', opere: opere[metier_id] || '', quart_id: eq.quart_id,
      attestation: i % 4 === 0 ? 'ASP Construction' : (i % 4 === 1 ? 'Signaleur routier' : ''),
      ccq: i !== 13, manoeuvre_paysager: eq.departement === 'Aménagement' && metier_id === 'mt-man',
      departement: eq.departement, actif: true, ref_civalgo: null,
    };
  });

  // --- Équipements ---------------------------------------------------------------
  const equipements = [
    ['EX-201', 'Pelle hydraulique 20 t', 'Excavation', 'Exemplo', 'PX200', 'eq-1', 'e-07'],
    ['EX-301', 'Pelle hydraulique 30 t', 'Excavation', 'Exemplo', 'PX300', 'eq-3', 'e-12'],
    ['MP-05', 'Mini-pelle 5 t', 'Excavation', 'Modelia', 'MP5', 'eq-2', 'e-08'],
    ['CH-950', 'Chargeuse sur roues', 'Chargement', 'Exemplo', 'CR950', 'eq-1', null],
    ['BT-D6', 'Bouteur D6', 'Terrassement', 'Modelia', 'D6X', 'eq-3', null],
    ['NV-140', 'Niveleuse', 'Terrassement', 'Exemplo', 'NV14', 'eq-3', 'e-09'],
    ['RC-10', 'Rouleau compacteur 10 t', 'Compaction', 'Rouleo', 'R10', 'eq-1', null],
    ['PV-01', 'Plaque vibrante', 'Compaction', 'Rouleo', 'PV1', 'eq-2', null],
    ['CA-10', 'Camion 10 roues', 'Transport', 'Camio', 'T10', 'eq-2', 'e-11'],
    ['CA-12', 'Camion 12 roues', 'Transport', 'Camio', 'T12', 'eq-1', 'e-10'],
    ['FA-01', 'Finisseur d’asphalte', 'Pavage', 'Paveo', 'F1', 'eq-3', null],
    ['BA-01', 'Balai mécanique', 'Entretien', 'Balayo', 'B1', 'eq-2', null],
    ['CM-01', 'Camionnette de service', 'Service', 'Camio', 'C1', 'eq-1', null],
    ['LX-14', 'Pelle 14 t (location)', 'Excavation', 'Exemplo', 'PX140', null, null],
  ].map(([code, nom, type, marque, modele, equipe_id, operateur_id], i) => ({
    id: `q-${String(i + 1).padStart(2, '0')}`, code, nom, type, categorie: type, marque, modele,
    plaque: `DEMO-${String(100 + i)}`, niv: `NIVDEMO${String(1000 + i * 7)}`,
    organisation_id: code.startsWith('LX') ? 'f-7' : 'o-pep', equipe_id, operateur_id,
    titulaire: code.startsWith('LX') ? 'location_externe' : 'proprietaire', actif: true, ref_civalgo: null,
  }));

  // --- Matériaux (plusieurs fournisseurs par matériau) ----------------------
  const materiaux = [
    ['MG20', 'Pierre concassée MG-20', 't', 'Pierre', ['f-1', 'o-car2']], ['MG56', 'Pierre concassée MG-56', 't', 'Pierre', ['f-1']],
    ['MG112', 'Sable MG-112', 't', 'Terre', ['f-1', 'o-car2']], ['B32', 'Béton 32 MPa', 'm³', null, ['f-2']],
    ['ESG10', 'Enrobé ESG-10', 't', 'Asphalte', ['f-3', 'o-car2']], ['ESG14', 'Enrobé ESG-14', 't', 'Asphalte', ['f-3', 'o-car2']],
    ['PVC200', 'Conduite PVC 200 mm', 'm lin.', null, ['f-4']], ['TBA600', 'Conduite TBA 600 mm', 'm lin.', null, ['f-4']],
    ['REG1200', 'Regard préfabriqué 1200 mm', 'chq', null, ['f-4']], ['PUIS', 'Puisard préfabriqué', 'chq', null, ['f-4']],
    ['GEO', 'Géotextile', 'm²', null, ['f-5']], ['BORD', 'Bordure de béton préfabriquée', 'm lin.', null, ['f-2']],
    ['RECY', 'Granulat recyclé MR-5', 't', 'Matériaux revalorisés', ['f-1']],
  ].map(([code, nom, unite, type, orgs], i) => ({ id: `t-${String(i + 1).padStart(2, '0')}`, code, nom, unite, type, categorie: type || '', organisation_ids: orgs, actif: true, ref_civalgo: null }));
  const materiauOrganisations = materiaux.flatMap((m) => m.organisation_ids.map((o) => ({ id: `mo-${m.id}-${o}`, materiau_id: m.id, organisation_id: o })));
  materiaux.forEach((m) => { delete m.organisation_ids; });

  // --- Primes -----------------------------------------------------------------
  const primes = [
    { id: 'pr-chef', nom: 'Prime de chef d’équipe', code: 'CHEF', montant: 1.5, unite: 'heure', actif: true },
    { id: 'pr-dep', nom: 'Prime de déplacement', code: 'DEPL', montant: 30, unite: 'jour', actif: true },
    { id: 'pr-repas', nom: 'Indemnité de repas', code: 'REPAS', montant: 18, unite: 'forfait', actif: true },
  ];

  // --- Projets --------------------------------------------------------------
  const debut = (joursAvant) => { const d = new Date(maintenant); d.setDate(d.getDate() - joursAvant); return iso(d); };
  const fin = (joursApres) => { const d = new Date(maintenant); d.setDate(d.getDate() + joursApres); return iso(d); };
  const yy = String(anneeCourante).slice(2);

  const projets = [
    { id: 'p-1', numero: `${yy}-101`, nom: 'Réfection de la rue des Érables', client: 'Municipalité Exemple', departement: 'Excavation / Civil', adresse: 'Rue des Érables, Saint-Constant', lat: 45.3701, lng: -73.5654, date_debut: debut(55), date_fin: fin(20), montant_contrat: 1850000, statut: 'en_cours', charge_projet_id: 'm-cp1', coordonnateur_id: 'm-coo', surintendant_id: 'm-su1', contremaitre_ids: ['m-cm1'], notes: 'Travaux de nuit interdits. Maintien de la circulation en alternance.' },
    { id: 'p-2', numero: `${yy}-102`, nom: 'Prolongement des services — boulevard Démo', client: 'Ville Démo', departement: 'Excavation / Civil', adresse: 'Boulevard Démo, Châteauguay', lat: 45.3612, lng: -73.7502, date_debut: debut(40), date_fin: fin(60), montant_contrat: 3200000, statut: 'en_cours', charge_projet_id: 'm-cp2', coordonnateur_id: 'm-coo', surintendant_id: 'm-su2', contremaitre_ids: ['m-cm2', 'm-cm3'], notes: 'Aqueduc, égout sanitaire et pluvial sur 450 m.' },
    { id: 'p-3', numero: `${yy}-103`, nom: 'Pavage du stationnement — centre sportif', client: 'Centre sportif Fictif', departement: 'Asphalte', adresse: 'Rue du Stade, La Prairie', lat: 45.4105, lng: -73.5103, date_debut: debut(25), date_fin: fin(5), montant_contrat: 640000, statut: 'en_cours', charge_projet_id: 'm-cp1', coordonnateur_id: 'm-coo', surintendant_id: 'm-su1', contremaitre_ids: ['m-cm1', 'm-cm3'], notes: '' },
    { id: 'p-4', numero: `${yy}-104`, nom: 'Trottoirs et bordures — secteur de la Gare', client: 'Municipalité Exemple', departement: 'Excavation / Civil', adresse: 'Rue de la Gare, Candiac', lat: 45.3889, lng: -73.5156, date_debut: debut(18), date_fin: fin(30), montant_contrat: 480000, statut: 'en_cours', charge_projet_id: 'm-cp2', coordonnateur_id: 'm-coo', surintendant_id: 'm-su2', contremaitre_ids: ['m-cm2'], notes: '' },
    { id: 'p-5', numero: `${yy}-105`, nom: 'Piste cyclable — parc Modèle', client: 'Ville Démo', departement: 'Aménagement', adresse: 'Parc Modèle, Brossard', lat: 45.4476, lng: -73.4561, date_debut: fin(14), date_fin: fin(70), montant_contrat: 395000, statut: 'a_venir', charge_projet_id: 'm-cp1', coordonnateur_id: 'm-coo', surintendant_id: 'm-su1', contremaitre_ids: [], notes: 'Mobilisation prévue dans deux semaines.' },
    { id: 'p-6', numero: `${String(anneeCourante - 1).slice(2)}-118`, nom: 'Remplacement de ponceaux — rang Saint-Exemple', client: 'Municipalité Exemple', departement: 'Excavation / Civil', adresse: 'Rang Saint-Exemple, Saint-Rémi', lat: 45.2805, lng: -73.6301, date_debut: debut(160), date_fin: debut(70), montant_contrat: 520000, statut: 'termine', charge_projet_id: 'm-cp2', coordonnateur_id: 'm-coo', surintendant_id: 'm-su2', contremaitre_ids: ['m-cm3'], notes: '' },
    { id: 'p-7', numero: `${yy}-110`, nom: 'Agrandissement de stationnement — usine Témoin', client: 'Industries Témoin inc.', departement: 'Asphalte', adresse: 'Rue des Usines, Mercier', lat: 45.3172, lng: -73.7389, date_debut: fin(40), date_fin: fin(90), montant_contrat: 0, statut: 'soumission', charge_projet_id: 'm-cp2', coordonnateur_id: null, surintendant_id: null, contremaitre_ids: [], notes: 'Soumission à déposer.' },
  ].map((p) => ({ ...p, ref_civalgo: null, created_at: new Date(maintenant.getTime() - 86400000 * 60).toISOString() }));

  // Budget par catégorie : environ 85 % du contrat, réparti. (Qui entre les
  // budgets et à quelle granularité : question ouverte, voir le rapport RV02.)
  const repartition = { main_oeuvre: 0.30, equipement: 0.25, materiau: 0.25, sous_traitant: 0.12, autre: 0.08 };
  const budgets = [];
  projets.forEach((p) => {
    if (!p.montant_contrat) return;
    Object.entries(repartition).forEach(([categorie, part]) => {
      budgets.push({ id: `b-${p.id}-${categorie}`, projet_id: p.id, categorie, montant: Math.round(p.montant_contrat * 0.85 * part) });
    });
  });

  // --- Taux preset (année courante et précédente) --------------------------
  const taux = [];
  let noTaux = 0;
  const ajouterTaux = (o) => { noTaux += 1; taux.push({ id: `x-${noTaux}`, actif: true, description: '', unite: '', taux_supp: null, ...o }); };
  const tauxMetier = { 'mt-jou': 52, 'mt-man': 58, 'mt-ope': 68, 'mt-opl': 66, 'mt-chl': 60, 'mt-ctm': 74, 'mt-sig': 46, 'mt-chs': 64, 'mt-chf': 66, 'mt-chb': 58, 'mt-mec': 70, 'mt-arp': 72 };
  const tauxEquip = [165, 210, 95, 140, 185, 170, 90, 22, 115, 130, 260, 105, 35, 150];
  const prixMat = [24.5, 21, 18.75, 245, 118, 112, 38, 225, 3200, 1450, 3.1, 42, 14.5];
  [anneeCourante - 1, anneeCourante].forEach((annee) => {
    const f = annee === anneeCourante ? 1 : 0.96;
    const r = (n) => Math.round(n * f * 100) / 100;
    Object.entries(tauxMetier).forEach(([ref_id, t]) => ajouterTaux({ annee, categorie: 'main_oeuvre', ref_type: 'metier', ref_id, taux: r(t), taux_supp: r(t * 1.5), unite: 'h' }));
    // Un employé avec un taux propre — il passe avant celui de son métier.
    ajouterTaux({ annee, categorie: 'main_oeuvre', ref_type: 'employe', ref_id: 'e-07', taux: r(71), taux_supp: r(106.5), unite: 'h' });
    equipements.forEach((q, i) => ajouterTaux({ annee, categorie: 'equipement', ref_type: 'equipement', ref_id: q.id, taux: r(tauxEquip[i]), unite: 'h' }));
    materiaux.forEach((m, i) => ajouterTaux({ annee, categorie: 'materiau', ref_type: 'materiau', ref_id: m.id, taux: r(prixMat[i]), unite: m.unite }));
    ajouterTaux({ annee, categorie: 'sous_traitant', ref_type: 'organisation', ref_id: 's-1', description: 'Pose d’enrobé', unite: 't', taux: r(28) });
    ajouterTaux({ annee, categorie: 'sous_traitant', ref_type: 'organisation', ref_id: 's-2', description: 'Ligne simple', unite: 'm lin.', taux: r(0.85) });
    ajouterTaux({ annee, categorie: 'sous_traitant', ref_type: 'organisation', ref_id: 's-3', description: 'Équipe d’arpentage (jour)', unite: 'forf', taux: r(1450) });
    ajouterTaux({ annee, categorie: 'sous_traitant', ref_type: 'organisation', ref_id: 's-4', description: 'Essai de compaction', unite: 'chq', taux: r(95) });
    ajouterTaux({ annee, categorie: 'sous_traitant', ref_type: 'organisation', ref_id: 's-5', description: 'Signaleur', unite: 'h', taux: r(48) });
    ajouterTaux({ annee, categorie: 'sous_traitant', ref_type: 'organisation', ref_id: 's-6', description: 'Bordure coulée en place', unite: 'm lin.', taux: r(62) });
  });

  // --- Rapports journaliers --------------------------------------------------
  const rapports = [];
  const lignes = [];
  const activites = [];
  const ressourcesProvisoires = [];
  const commentaires = [];
  const historique = [];
  let noRapport = 1000;
  let noLigne = 0;
  let noComm = 0;
  let noHist = 0;
  let noAct = 0;

  const membre = (id) => membres.find((m) => m.id === id);
  const tauxDe = (categorie, refId, annee, description) => {
    const deLAnnee = taux.filter((t) => t.annee === annee && t.categorie === categorie);
    if (categorie === 'main_oeuvre') {
      const e = employes.find((x) => x.id === refId);
      return deLAnnee.find((t) => t.ref_type === 'employe' && t.ref_id === refId)
        || deLAnnee.find((t) => t.ref_type === 'metier' && t.ref_id === e.metier_id);
    }
    return deLAnnee.find((t) => t.ref_id === refId && (!description || t.description === description));
  };
  const ligneVide = (rapport) => ({
    rapport_id: rapport.id, detail: '', quantite_supp: null, taux_supp: null, taux_supp_preset: null,
    custom_raison: null, custom_par_id: null, custom_par_nom: null, custom_le: null, organisation_id: null,
    sous_tache_id: null, prime_id: null, parent_ligne_id: null, ressource_provisoire_id: null, created_at: rapport.created_at,
  });
  const ajouterLigne = (rapport, categorie, refId, libelle, quantite, extra = {}) => {
    const annee = Number(rapport.date.slice(0, 4));
    const preset = refId ? tauxDe(categorie, refId, annee, extra.description) : null;
    noLigne += 1;
    const l = {
      ...ligneVide(rapport), id: `l-${noLigne}`, categorie, ref_id: refId, libelle, detail: extra.detail || '',
      quantite, quantite_supp: categorie === 'main_oeuvre' ? (extra.supp || 0) : null,
      unite: extra.unite || preset?.unite || 'h',
      taux: preset ? Number(preset.taux) : Number(extra.tauxManuel || 0),
      taux_supp: categorie === 'main_oeuvre' ? Number(preset?.taux_supp ?? (extra.tauxManuel || 0) * 1.5) : null,
      taux_preset: preset ? Number(preset.taux) : null,
      taux_supp_preset: categorie === 'main_oeuvre' && preset ? Number(preset.taux_supp) : null,
      taux_annee: annee, taux_source: preset ? 'preset' : 'manuel', taux_preset_id: preset?.id || null,
      organisation_id: extra.organisation_id || null, sous_tache_id: extra.sous_tache_id || null,
      ressource_provisoire_id: extra.ressource_provisoire_id || null,
    };
    lignes.push(l);
    return l;
  };
  // Une prime sur la ligne d'un employé : son montant du catalogue est figé ici.
  const ajouterPrime = (rapport, ligneEmploye, primeId) => {
    const p = primes.find((x) => x.id === primeId);
    const quantite = p.unite === 'heure' ? (Number(ligneEmploye.quantite) || 0) + (Number(ligneEmploye.quantite_supp) || 0) : 1;
    noLigne += 1;
    lignes.push({
      ...ligneVide(rapport), id: `l-${noLigne}`, categorie: 'main_oeuvre', ref_id: ligneEmploye.ref_id,
      libelle: `${p.nom} — ${ligneEmploye.libelle}`, quantite, quantite_supp: 0, taux_supp: 0,
      unite: p.unite === 'heure' ? 'h' : p.unite === 'jour' ? 'jour' : 'forf',
      taux: p.montant, taux_preset: p.montant, taux_annee: Number(rapport.date.slice(0, 4)), taux_source: 'preset', taux_preset_id: null,
      prime_id: p.id, parent_ligne_id: ligneEmploye.id,
    });
  };
  const hist = (rapport, de, a, action, par, quand, commentaire = '') => {
    noHist += 1;
    historique.push({ id: `h-${noHist}`, rapport_id: rapport.id, de_etape: de, a_etape: a, action, commentaire, par_id: par.id, par_nom: par.nom, le: quand.toISOString() });
  };

  const titres = {
    'p-1': ['Excavation et pose de conduite', 'Remblayage et compaction', 'Fondation de rue MG-20', 'Bordures et préparation pavage'],
    'p-2': ['Pose d’aqueduc 200 mm', 'Égout pluvial TBA 600 mm', 'Installation de regards', 'Remblai et essais'],
    'p-3': ['Décohésionnement et nivellement', 'Fondation granulaire', 'Pavage couche de base', 'Pavage couche de surface'],
    'p-4': ['Démolition des trottoirs', 'Coffrage et bordures', 'Coulée de trottoirs', 'Remblai et engazonnement'],
    'p-6': ['Excavation du ponceau', 'Pose du ponceau', 'Remblai et empierrement'],
  };
  // Sous-tâches typiques par projet, avec l'unité réellement mesurée au
  // chantier (dans Civalgo l'unité par défaut est l'heure; elle se change sur
  // la ligne d'activité).
  const activitesProjet = {
    'p-1': [['st-201', 'h'], ['st-207', 'm lin.'], ['st-105', 't']],
    'p-2': [['st-203', 'm lin.'], ['st-204', 'chq'], ['st-201', 'h']],
    'p-3': [['st-402', 't'], ['st-404', 't'], ['st-405', 't']],
    'p-4': [['st-302', 'm lin.'], ['st-303', 'm³'], ['st-301', 'h']],
    'p-6': [['st-203', 'm lin.'], ['st-201', 'h']],
  };
  const quantiteSelonUnite = (u) => (u === 'm lin.' ? entre(18, 70) : u === 't' ? entre(60, 240) : u === 'chq' ? entre(1, 3) : u === 'm³' ? entre(6, 22) : entre(6, 30));
  const descriptions = [
    'Journée productive, aucun incident. Circulation maintenue en alternance avec signaleurs.',
    'Sol plus argileux que prévu au chaînage 0+120 : rendement réduit en après-midi.',
    'Livraison de matériaux en retard d’une heure le matin. Rattrapé en fin de journée.',
    'Inspection de la ville en matinée, conforme. Poursuite des travaux selon l’échéancier.',
    'Pluie en fin d’après-midi, arrêt des travaux à 15 h 30.',
  ];
  const flagsTextes = [
    'Conduite de gaz non indiquée aux plans découverte au chaînage 0+085. Travaux arrêtés 2 h, Énergir avisé. Possible extra à facturer.',
    'Le client demande d’ajouter 15 m de bordure devant le no 214. Pas dans le contrat — à valider avant de continuer.',
    'Bris de la pelle EX-201 (boyau hydraulique). Réparation par le garage demain matin; prévoir location si plus long.',
  ];

  const membresEquipe = (eqId) => employes.filter((e) => e.equipe_id === eqId).map((e) => e.id);

  const projetsActifs = projets.filter((p) => ['en_cours', 'termine'].includes(p.statut));
  for (let joursAvant = 165; joursAvant >= 0; joursAvant -= 1) {
    const d = new Date(maintenant);
    d.setDate(d.getDate() - joursAvant);
    const jourSemaine = d.getDay();
    if (jourSemaine === 0 || jourSemaine === 6) continue;
    const date = iso(d);

    projetsActifs.forEach((p) => {
      if (date < p.date_debut || date > p.date_fin) return;
      p.contremaitre_ids.forEach((cmId, idxCm) => {
        if (idxCm > 0 && alea() < 0.5) return; // le 2e contremaître n'est pas là tous les jours
        noRapport += 1;
        const cm = membre(cmId);
        const eq = equipeDe(cmId);
        let etape;
        if (joursAvant > 12) etape = 6;
        else if (joursAvant > 8) etape = choisir([5, 6, 6]);
        else if (joursAvant > 5) etape = choisir([4, 5]);
        else if (joursAvant > 2) etape = choisir([3, 4]);
        else if (joursAvant > 0) etape = choisir([2, 3]);
        else etape = choisir([1, 2]);

        const creeLe = new Date(d); creeLe.setHours(6, 30, 0, 0);
        const r = {
          id: `r-${noRapport}`, numero: noRapport, projet_id: p.id, date, equipe_id: eq.id,
          quart_id: p.departement === 'Asphalte' ? 'qu-pav' : eq.quart_id,
          titre: choisir(titres[p.id] || ['Travaux du jour']),
          description: etape >= 2 ? choisir(descriptions) : '',
          meteo_conditions: choisir(['Ensoleillé', 'Ensoleillé', 'Partiellement nuageux', 'Nuageux', 'Pluie légère']),
          meteo_temp_min: entre(4, 12), meteo_temp_max: entre(13, 24), meteo_precipitations_mm: alea() < 0.2 ? entre(1, 12) : 0,
          meteo_vent: choisir(['Calme', 'Léger', 'Modéré']),
          contremaitre_id: cmId, etape, created_by: 'm-dis', created_at: creeLe.toISOString(), updated_at: creeLe.toISOString(),
          confirme_par_id: null, confirme_par_nom: null, confirme_le: null,
          abandonne: false, abandonne_le: null, abandonne_raison: null, ref_civalgo: null,
        };
        rapports.push(r);

        const pas = [
          [1, 'creer', membre('m-dis'), 6.5],
          [2, 'avancer', membre('m-dis'), 6.75],
          [3, 'avancer', cm, 16.5],
          [4, 'avancer', membre(p.surintendant_id), 19],
          [5, 'avancer', membre(p.coordonnateur_id), 34],
          [6, 'avancer', membre(p.charge_projet_id), 58],
        ];
        pas.filter(([a]) => a <= etape).forEach(([a, action, par, heures]) => {
          const quand = new Date(d); quand.setHours(0, 0, 0, 0); quand.setTime(quand.getTime() + heures * 3600000);
          hist(r, action === 'creer' ? null : a - 1, a, action, par || cm, quand);
          if (a === 6) { r.confirme_par_id = par.id; r.confirme_par_nom = par.nom; r.confirme_le = quand.toISOString(); }
        });
        if (etape >= 3 && alea() < 0.12) {
          const quand = new Date(d); quand.setHours(17, 10, 0, 0);
          hist(r, 3, 2, 'renvoyer', membre(p.surintendant_id), quand, 'Il manque les heures du camion 12 roues. Merci de compléter.');
          const q2 = new Date(d); q2.setHours(17, 40, 0, 0);
          hist(r, 2, 3, 'avancer', cm, q2);
        }

        if (etape < 2 && alea() < 0.5) return; // rapport tout juste créé, encore vide

        // Activités : une ou deux sous-tâches, avec la quantité réalisée.
        const choix = activitesProjet[p.id] || [['st-tm', null]];
        const nbAct = alea() < 0.3 ? 2 : 1;
        const debutChoix = entre(0, choix.length - 1);
        const acts = [];
        for (let k = 0; k < nbAct && k < choix.length; k += 1) {
          const [stId, unite] = choix[(debutChoix + k) % choix.length];
          noAct += 1;
          const a = { id: `a-${noAct}`, rapport_id: r.id, sous_tache_id: stId, quantite_realisee: unite ? quantiteSelonUnite(unite) : null, unite, note: '', created_at: r.created_at };
          activites.push(a);
          acts.push(a);
        }
        const sousTachePour = () => (acts.length > 1 ? choisir(acts).sous_tache_id : null);

        // Main-d'œuvre (l'équipe), avec ses primes
        membresEquipe(eq.id).forEach((empId) => {
          if (alea() < 0.12) return; // absence
          const e = employes.find((x) => x.id === empId);
          const reg = choisir(r.quart_id === 'qu-pav' ? [10, 10, 9] : [8, 9, 9, 9, 7.5]);
          const supp = alea() < 0.25 ? choisir([1, 1.5, 2]) : 0;
          const l = ajouterLigne(r, 'main_oeuvre', e.id, e.nom, reg, { supp, detail: metiers.find((m) => m.id === e.metier_id).nom, sous_tache_id: sousTachePour() });
          if (e.metier_id === 'mt-ctm') ajouterPrime(r, l, 'pr-chef');
          if (supp >= 1.5) ajouterPrime(r, l, 'pr-repas');
          if (p.id === 'p-6') ajouterPrime(r, l, 'pr-dep');
        });
        // Machinerie
        const machines = p.id === 'p-3' ? ['q-06', 'q-07', 'q-11', 'q-10'] : p.id === 'p-4' ? ['q-03', 'q-08', 'q-09', 'q-13'] : ['q-01', 'q-04', 'q-07', 'q-10', 'q-13'];
        machines.forEach((qId) => {
          if (alea() < 0.15) return;
          const q = equipements.find((x) => x.id === qId);
          ajouterLigne(r, 'equipement', q.id, `${q.code} — ${q.nom}`, choisir([6, 7, 8, 8, 9]), { sous_tache_id: sousTachePour() });
        });
        // Matériaux
        const mats = p.id === 'p-3' ? [['t-01', 'f-1'], ['t-06', 'f-3']] : p.id === 'p-2' ? [['t-07', 'f-4'], ['t-02', 'f-1'], ['t-09', 'f-4']] : p.id === 'p-4' ? [['t-04', 'f-2'], ['t-01', 'o-car2']] : [['t-01', 'f-1'], ['t-03', 'o-car2'], ['t-11', 'f-5']];
        mats.forEach(([mId, oId]) => {
          if (alea() < 0.3) return;
          const m = materiaux.find((x) => x.id === mId);
          const q = m.unite === 'chq' ? entre(1, 2) : m.unite === 'm³' ? entre(6, 24) : entre(20, 180);
          ajouterLigne(r, 'materiau', m.id, m.nom, q, { unite: m.unite, organisation_id: oId });
        });
        if (alea() < 0.15) ajouterLigne(r, 'materiau', null, 'Sacs de ciment à prise rapide', entre(4, 12), { unite: 'chq', tauxManuel: 14.95, organisation_id: 'f-5' });
        // Sous-traitants
        if (p.id === 'p-3' && alea() < 0.5) ajouterLigne(r, 'sous_traitant', 's-1', 'Pavage Exemple — Pose d’enrobé', entre(80, 220), { description: 'Pose d’enrobé', unite: 't' });
        if (alea() < 0.3) ajouterLigne(r, 'sous_traitant', 's-5', 'Signalisation Témoin — Signaleur', entre(8, 20), { description: 'Signaleur', unite: 'h' });
        if (alea() < 0.12) ajouterLigne(r, 'sous_traitant', 's-4', 'Laboratoire Modèle — Essai de compaction', entre(2, 6), { description: 'Essai de compaction', unite: 'chq' });
        if (p.id === 'p-4' && alea() < 0.4) ajouterLigne(r, 'sous_traitant', 's-6', 'Bordures Prototype — Bordure coulée en place', entre(20, 60), { description: 'Bordure coulée en place', unite: 'm lin.' });
      });
    });
  }

  // Ressources hors catalogue (ajoutées à la volée sur un rapport).
  const recents = rapports.filter((r) => r.etape >= 3 && r.etape <= 5);
  [
    [recents[1], 'main_oeuvre', 'Signaleur d’agence (remplaçant)', null, 45, 8],
    [recents[4], 'equipement', 'Pelle 14 t louée à la journée', 'Excavation', 135, 8],
    [recents[7], 'main_oeuvre', 'Opérateur prêté par Pavage Exemple', null, 70, 6],
  ].forEach(([r, categorie, nom, type, tauxManuel, heures], k) => {
    if (!r) return;
    const rp = { id: `rp-${k + 1}`, rapport_id: r.id, categorie, nom, type, regularise_ref_id: null, regularise_le: null, regularise_par_nom: null, created_at: r.created_at };
    ressourcesProvisoires.push(rp);
    ajouterLigne(r, categorie, null, nom, heures, { tauxManuel, detail: 'Hors catalogue', ressource_provisoire_id: rp.id, unite: 'h' });
  });

  // Rapports « À planifier » : créés par le dispatch, sans projet encore.
  const demain = new Date(maintenant); demain.setDate(demain.getDate() + 1);
  [[iso(maintenant), 'eq-3'], [iso(demain), 'eq-2'], [iso(demain), 'eq-1']].forEach(([date, eqId]) => {
    noRapport += 1;
    const eq = equipes.find((e) => e.id === eqId);
    const creeLe = new Date(maintenant); creeLe.setHours(7, 5, 0, 0);
    const r = {
      id: `r-${noRapport}`, numero: noRapport, projet_id: null, date, equipe_id: eqId, quart_id: eq.quart_id, titre: '', description: '',
      meteo_conditions: null, meteo_temp_min: null, meteo_temp_max: null, meteo_precipitations_mm: null, meteo_vent: null,
      contremaitre_id: eq.contremaitre_id, etape: 1, created_by: 'm-dis', created_at: creeLe.toISOString(), updated_at: creeLe.toISOString(),
      confirme_par_id: null, confirme_par_nom: null, confirme_le: null, abandonne: false, abandonne_le: null, abandonne_raison: null, ref_civalgo: null,
    };
    rapports.push(r);
    hist(r, null, 1, 'creer', membre('m-dis'), creeLe);
  });

  // Deux vieux rapports « À remplir » jamais remplis : la fermeture
  // automatique les passera à « Abandonné » au premier chargement.
  [22, 27].forEach((joursAvant) => {
    const d = new Date(maintenant); d.setDate(d.getDate() - joursAvant);
    if (d.getDay() === 0) d.setDate(d.getDate() - 2);
    if (d.getDay() === 6) d.setDate(d.getDate() - 1);
    noRapport += 1;
    const creeLe = new Date(d); creeLe.setHours(6, 40, 0, 0);
    const r = {
      id: `r-${noRapport}`, numero: noRapport, projet_id: 'p-2', date: iso(d), equipe_id: 'eq-3', quart_id: 'qu-9h', titre: '', description: '',
      meteo_conditions: null, meteo_temp_min: null, meteo_temp_max: null, meteo_precipitations_mm: null, meteo_vent: null,
      contremaitre_id: 'm-cm3', etape: 2, created_by: 'm-dis', created_at: creeLe.toISOString(), updated_at: creeLe.toISOString(),
      confirme_par_id: null, confirme_par_nom: null, confirme_le: null, abandonne: false, abandonne_le: null, abandonne_raison: null, ref_civalgo: null,
    };
    rapports.push(r);
    hist(r, null, 1, 'creer', membre('m-dis'), creeLe);
    hist(r, 1, 2, 'avancer', membre('m-dis'), new Date(creeLe.getTime() + 600000));
  });

  // Quelques taux custom, avec leur raison, sur des rapports validés.
  const lignesEquipVal = lignes.filter((l) => l.categorie === 'equipement' && l.ref_id && rapports.find((r) => r.id === l.rapport_id).etape >= 4);
  [0, 7, 19].forEach((i, k) => {
    const l = lignesEquipVal[i * 3];
    if (!l) return;
    l.taux = Math.round(l.taux * (k === 1 ? 0.85 : 1.12) * 100) / 100;
    l.taux_source = 'custom';
    l.custom_raison = k === 1 ? 'Équipement loué au mois, taux négocié avec le client' : 'Travail en conditions difficiles (sol rocheux), taux majoré selon l’entente';
    const par = membre(k === 1 ? 'm-coo' : 'm-su1');
    l.custom_par_id = par.id; l.custom_par_nom = par.nom; l.custom_le = new Date(maintenant.getTime() - 86400000 * (10 + k)).toISOString();
  });

  // Commentaires, dont trois « Lecture obligatoire » (un lu, deux à lire).
  const rapportsRecents = rapports.filter((r) => r.etape >= 3 && r.etape <= 5);
  const rapportsVieux = rapports.filter((r) => r.etape === 6);
  const ajouterComm = (r, auteur, texte, flag, lu) => {
    noComm += 1;
    const quand = new Date(`${r.date}T15:${String(10 + (noComm % 40)).padStart(2, '0')}:00`);
    commentaires.push({
      id: `k-${noComm}`, rapport_id: r.id, auteur_id: auteur.id, auteur_nom: auteur.nom, texte,
      lecture_obligatoire: flag, created_at: quand.toISOString(),
      lu_par_id: lu ? lu.id : null, lu_par_nom: lu ? lu.nom : null, lu_le: lu ? new Date(quand.getTime() + 20 * 3600000).toISOString() : null,
    });
  };
  const rf1 = rapportsRecents.find((r) => r.projet_id === 'p-1' && r.etape === 5) || rapportsRecents[0];
  const rf2 = rapportsRecents.find((r) => r.projet_id === 'p-2' && r !== rf1) || rapportsRecents[1];
  if (rf1) ajouterComm(rf1, membre(rf1.contremaitre_id), flagsTextes[0], true, null);
  if (rf2) ajouterComm(rf2, membre(rf2.contremaitre_id), flagsTextes[1], true, null);
  if (rapportsVieux[3]) ajouterComm(rapportsVieux[3], membre(rapportsVieux[3].contremaitre_id), flagsTextes[2], true, membre(projets.find((p) => p.id === rapportsVieux[3].projet_id).charge_projet_id));
  rapports.filter((r) => r.etape >= 3).slice(0, 12).forEach((r, i) => {
    if (i % 3 !== 0) return;
    ajouterComm(r, membre(r.contremaitre_id), 'Équipe complète, bonne collaboration avec l’inspecteur.', false, null);
  });

  // --- Trajets pré-créés -------------------------------------------------------
  const trajets = [
    { id: 'j-1', nom: 'Rue des Érables → Carrière Exemple', projet_id: 'p-1', notes: 'Chemin des camions : éviter le centre-ville (limite de charge).', points: [
      { type: 'projet', ref_id: 'p-1' }, { type: 'organisation', ref_id: 'f-1' },
    ] },
    { id: 'j-2', nom: 'Boulevard Démo → site de disposition', projet_id: 'p-2', notes: 'Sols excavés — billet de pesée obligatoire.', points: [
      { type: 'projet', ref_id: 'p-2' }, { type: 'organisation', ref_id: 'f-6' },
    ] },
    { id: 'j-3', nom: 'Tournée béton : Béton Démo → secteur de la Gare → Quincaillerie', projet_id: 'p-4', notes: '', points: [
      { type: 'organisation', ref_id: 'f-2' }, { type: 'projet', ref_id: 'p-4' }, { type: 'organisation', ref_id: 'f-5' },
    ] },
  ];

  return {
    membres, quarts, metiers, taches, sous_taches: sousTaches, equipes, employes, equipements, materiaux,
    materiau_organisations: materiauOrganisations, organisations, primes, projets, budgets, documents: [], taux,
    rapports, lignes, activites, ressources_provisoires: ressourcesProvisoires, photos: [], commentaires, historique, trajets,
    parametres: [{ id: 'jours_avant_abandon', valeur: 14 }],
  };
}

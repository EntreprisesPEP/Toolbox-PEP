// Liste fixe des surintendants pouvant remplir "Votre nom" — pas tirée de
// liste_projets.personnel, car ce sont toujours les mêmes 4 personnes,
// peu importe l'évolution du reste du personnel.
export const SURINTENDANTS = [
  { nom: 'Francois Ouellet', courriel: 'fouellet@pep2000.com' },
  { nom: 'Stephan Nadeau', courriel: 'snadeau@pep2000.com' },
  { nom: 'Stephane Lalande', courriel: 'slalande@pep2000.com' },
  { nom: 'Tony Moschetta', courriel: 'amoschetta@pep2000.com' },
];

// Destinataires toujours avisés, en plus de la personne qui fait la
// demande, des personnes additionnelles choisies, et du chargé de projet.
export const DESTINATAIRES_FIXES = [
  { nom: 'William Dubreuil', email: 'wdubreuil@pep2000.com' },
  { nom: 'Marc-Antoine Blais', email: 'mablais@pep2000.com' },
  { nom: 'Davio Pallotta', email: 'dpallotta@pep2000.com' },
];

export const TRAVAUX_EN_COURS_OPTIONS = [
  'Asphalte', 'Bâtiment', 'Bordure', 'Civil', 'Coupe de rue',
  'Électricité', 'Infra', 'Plomberie',
];

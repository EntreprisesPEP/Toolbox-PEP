// Destinataires fixes sur CHAQUE demande d'arpentage, peu importe le projet.
// Utilisé à la fois par pages/demandes-arpentage/index.js (affichage) et par
// pages/api/demandes-arpentage/notifier.js (envoi réel des courriels) —
// un seul endroit à modifier si la liste change un jour.
export const DESTINATAIRES_FIXES_RAW = [
  { nom: 'André Pichette', email: 'apichette@pep2000.com' },
  { nom: 'Anthony Pelliccia', email: 'apelliccia@pep2000.com' },
  { nom: 'François Ouellet', email: 'fouellet@pep2000.com' },
  { nom: 'Tony Moschetta', email: 'amoschetta@pep2000.com' },
  { nom: 'William Dubreuil', email: 'wdubreuil@pep2000.com' },
];

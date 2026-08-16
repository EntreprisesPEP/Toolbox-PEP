// Destinataires fixes sur CHAQUE demande d'arpentage, peu importe le projet.
// Utilisé à la fois par pages/demandes-arpentage/index.js (affichage) et par
// pages/api/demandes-arpentage/notifier.js (envoi réel des courriels) —
// un seul endroit à modifier si la liste change un jour.
//
// role: 'to'  -> destinataire principal (À:)
// role: 'cc'  -> tout le monde d'autre parmi les fixes, en copie (Cc:)
export const DESTINATAIRES_FIXES_RAW = [
  { nom: 'André Pichette', email: 'apichette@pep2000.com', role: 'to' },
  { nom: 'Anthony Pelliccia', email: 'apelliccia@pep2000.com', role: 'cc' },
  { nom: 'François Ouellet', email: 'fouellet@pep2000.com', role: 'cc' },
  { nom: 'Tony Moschetta', email: 'amoschetta@pep2000.com', role: 'cc' },
  { nom: 'William Dubreuil', email: 'wdubreuil@pep2000.com', role: 'cc' },
];

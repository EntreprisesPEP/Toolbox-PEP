// ---------------------------------------------------------------------------
// DESTINATAIRES FIXES — Demande garage
//
// Chaque demande de garage notifie ces personnes, peu importe le projet.
//   role: 'to' — destinataire principal
//   role: 'cc' — en copie
//
// Le demandeur lui-même et le chargé de projet du projet choisi sont
// ajoutés en copie automatiquement par pages/api/demande-garage/notifier.js;
// inutile de les inscrire ici.
//
// Pour modifier qui reçoit les demandes : édite ce seul fichier.
// ---------------------------------------------------------------------------
export const DESTINATAIRES_FIXES_RAW = [
  { nom: 'Jacques Laflèche', email: 'jlafleche@pep2000.com', role: 'to' },
];

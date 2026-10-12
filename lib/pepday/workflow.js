// ---------------------------------------------------------------------------
// PEPDAY — QUI PEUT FAIRE QUOI SUR UN RAPPORT JOURNALIER
//
// Ce module est la règle écrite une seule fois côté JavaScript. L'interface
// s'en sert pour montrer ou cacher les boutons, et le dépôt de démonstration
// s'en sert pour refuser une action. En mode Supabase, la même règle est
// réécrite en SQL (supabase/pepday/002_regles.sql) : c'est la base qui a le
// dernier mot, l'interface ne fait que ne pas proposer ce qui serait refusé.
//
// « moi » = { membreId, nom, roles: [...], estAdmin }
//
// Les cinq étapes :
//   1 Dispatch          crée le rapport, l'assigne au projet et au contremaître
//   2 Contremaître      remplit le rapport, puis le soumet
//   3 Surintendant      valide (peut corriger heures et quantités)
//   4 Coordonnateur     valide (peut corriger heures, quantités et taux)
//   5 Chargé de projet  confirme le cost final -> verrouillé (6)
//
// Chaque validateur peut renvoyer le rapport à l'étape précédente, avec un
// commentaire obligatoire. Le directeur construction et les administrateurs
// du Toolbox peuvent agir à toutes les étapes (remplacement, vacances).
// ---------------------------------------------------------------------------

import { ETAPE_VERROUILLE } from './constantes';

export function aRole(moi, role) {
  return Boolean(moi && (moi.roles || []).includes(role));
}

export function estSuperviseur(moi) {
  return Boolean(moi && (moi.estAdmin || aRole(moi, 'directeur')));
}

// Une personne voit-elle les rapports de tout le monde ? Le contremaître ne
// voit que les siens; tous les autres rôles voient tout.
export function voitTout(moi) {
  if (estSuperviseur(moi)) return true;
  return (moi?.roles || []).some((r) => r !== 'contremaitre');
}

export function peutVoirRapport(moi, rapport) {
  if (!rapport) return false;
  if (voitTout(moi)) return true;
  return aRole(moi, 'contremaitre') && rapport.contremaitre_id === moi.membreId && rapport.etape >= 2;
}

// Le membre assigné au projet dans un rôle donné. Un projet sans personne
// dans ce rôle reste ouvert à toute personne qui a le rôle — sinon un projet
// mal rempli bloquerait ses rapports.
function assigneOuLibre(moi, projet, champ, role) {
  if (!aRole(moi, role)) return false;
  const assigne = projet?.[champ];
  return !assigne || assigne === moi.membreId;
}

// La personne peut-elle faire avancer (ou renvoyer) le rapport à son étape
// actuelle ?
export function peutAgirEtape(moi, rapport, projet) {
  if (!rapport || rapport.etape >= ETAPE_VERROUILLE) return false;
  if (estSuperviseur(moi)) return true;
  switch (rapport.etape) {
    case 1: return aRole(moi, 'dispatch');
    case 2: return aRole(moi, 'contremaitre') && rapport.contremaitre_id === moi.membreId;
    case 3: return assigneOuLibre(moi, projet, 'surintendant_id', 'surintendant');
    case 4: return assigneOuLibre(moi, projet, 'coordonnateur_id', 'coordonnateur');
    case 5: return assigneOuLibre(moi, projet, 'charge_projet_id', 'charge_projet');
    default: return false;
  }
}

export function estChargeDuProjet(moi, projet) {
  if (estSuperviseur(moi)) return true;
  return assigneOuLibre(moi, projet, 'charge_projet_id', 'charge_projet');
}

// Ce que l'étape permet de modifier. Tout est faux sur un rapport verrouillé.
export function droitsEdition(moi, rapport, projet) {
  const aucun = {
    entete: false, contenu: false, lignesAjout: false, lignesQuantites: false, lignesSupprimer: false,
    tauxCustom: false, photos: false, commentaires: false, flag: false, accuserLecture: false,
    avancer: false, renvoyer: false, supprimer: false, abandonner: false, quart: false,
  };
  if (!rapport || !peutVoirRapport(moi, rapport)) return aucun;
  // RV02 : un rapport abandonné ne se modifie plus; seul un superviseur
  // peut le réactiver (bouton à part, voir peutReactiver).
  if (rapport.abandonne) return aucun;
  if (rapport.etape >= ETAPE_VERROUILLE) return aucun;

  const agit = peutAgirEtape(moi, rapport, projet);
  const d = { ...aucun };
  d.commentaires = true;
  d.flag = estSuperviseur(moi) || (aRole(moi, 'contremaitre') && rapport.contremaitre_id === moi.membreId);
  d.accuserLecture = estChargeDuProjet(moi, projet);

  // RV02 : le dispatch (ou un superviseur) peut abandonner un rapport qui
  // n'a pas encore été soumis (étapes 1 et 2), avec une raison.
  d.abandonner = rapport.etape <= 2 && (estSuperviseur(moi) || aRole(moi, 'dispatch'));

  if (!agit) return d;
  d.avancer = true;
  d.renvoyer = rapport.etape >= 2;

  switch (rapport.etape) {
    case 1:
      // Le dispatch prépare : projet, date, contremaître, titre, et peut
      // pré-inscrire l'équipe et la machinerie prévues.
      Object.assign(d, { entete: true, contenu: true, quart: true, lignesAjout: true, lignesQuantites: true, lignesSupprimer: true, photos: true, supprimer: true });
      break;
    case 2:
      // Le contremaître remplit tout, sauf le projet, la date et
      // l'assignation, qui sont la décision du dispatch.
      // RV02 : il peut aussi changer le quart du jour (hérité de l'équipe).
      Object.assign(d, { contenu: true, quart: true, lignesAjout: true, lignesQuantites: true, lignesSupprimer: true, photos: true });
      break;
    case 3:
      // Le surintendant corrige les heures et les quantités, ajoute un
      // oubli, met un taux custom au besoin.
      Object.assign(d, { lignesAjout: true, lignesQuantites: true, lignesSupprimer: true, tauxCustom: true });
      break;
    case 4:
      Object.assign(d, { lignesAjout: true, lignesQuantites: true, lignesSupprimer: true, tauxCustom: true });
      break;
    case 5:
      // Le chargé de projet ne touche plus aux quantités : il ajuste les
      // taux s'il le faut et confirme le cost.
      Object.assign(d, { tauxCustom: true });
      break;
    default:
      break;
  }
  return d;
}

export function peutReactiver(moi, rapport) {
  return Boolean(rapport?.abandonne && estSuperviseur(moi));
}

// RV02 : les rapports jamais remplis, assez vieux pour être fermés
// automatiquement (même règle que pepday.fermer_rapports_abandonnes en SQL).
// Seulement aux étapes 1 et 2 et seulement s'ils n'ont aucune ligne : un
// rapport commencé mais pas soumis reste visible comme retard de saisie.
export function rapportsAAbandonner(rapports, lignes, aujourdhuiIso, jours) {
  const avecLignes = new Set((lignes || []).map((l) => l.rapport_id));
  const limite = new Date(`${aujourdhuiIso}T12:00:00`);
  limite.setDate(limite.getDate() - jours);
  const limiteIso = limite.toISOString().slice(0, 10);
  return (rapports || []).filter((r) => !r.abandonne && r.etape <= 2 && r.date < limiteIso && !avecLignes.has(r.id));
}

export function flagsNonLus(commentaires) {
  return (commentaires || []).filter((c) => c.lecture_obligatoire && !c.lu_le);
}

// Vérifie une transition avant de l'appliquer. Renvoie un message d'erreur
// en français, ou null si tout est en ordre.
export function verifierTransition({ moi, rapport, projet, action, commentaire, commentaires }) {
  if (!rapport) return 'Rapport introuvable.';
  if (action === 'reactiver') {
    if (!rapport.abandonne) return 'Ce rapport n’est pas abandonné.';
    return estSuperviseur(moi) ? null : 'Seul un directeur peut réactiver un rapport abandonné.';
  }
  if (rapport.abandonne) return 'Ce rapport est abandonné.';
  if (rapport.etape >= ETAPE_VERROUILLE) return 'Ce rapport est verrouillé.';
  if (action === 'abandonner') {
    if (rapport.etape > 2) return 'Un rapport déjà soumis ne s’abandonne pas.';
    if (!(estSuperviseur(moi) || aRole(moi, 'dispatch'))) return 'Seul le dispatch peut abandonner un rapport.';
    if (!commentaire || !commentaire.trim()) return 'Indique pourquoi le rapport est abandonné.';
    return null;
  }
  if (!peutAgirEtape(moi, rapport, projet)) return 'Cette étape ne t’est pas assignée.';
  if (action === 'renvoyer') {
    if (rapport.etape < 2) return 'Un rapport au dispatch ne peut pas être renvoyé plus loin.';
    if (!commentaire || !commentaire.trim()) return 'Un commentaire est obligatoire pour renvoyer un rapport.';
    return null;
  }
  if (action === 'avancer') {
    if (rapport.etape === 1 && !rapport.contremaitre_id) return 'Assigne un contremaître avant de transmettre.';
    if (rapport.etape === 1 && !rapport.projet_id) return 'Choisis le projet avant de transmettre.';
    if (rapport.etape === 5) {
      const n = flagsNonLus(commentaires).length;
      if (n > 0) return `Impossible de confirmer le cost final : ${n} commentaire${n > 1 ? 's' : ''} « Lecture obligatoire » non lu${n > 1 ? 's' : ''}.`;
    }
    return null;
  }
  return 'Action inconnue.';
}

// Le libellé de l'action dans l'historique.
export function libelleAction(action, deEtape) {
  if (action === 'creer') return 'Création';
  if (action === 'renvoyer') return 'Renvoi';
  if (action === 'abandonner') return 'Abandonné';
  if (action === 'reactiver') return 'Réactivé';
  if (deEtape === 1) return 'Transmis au contremaître';
  if (deEtape === 2) return 'Soumis';
  if (deEtape === 5) return 'Cost final confirmé';
  return 'Validé';
}

// Les rapports qui attendent la personne : son étape, ses projets.
export function rapportsAValider(moi, rapports, projetsParId) {
  return (rapports || []).filter((r) => r.etape < ETAPE_VERROUILLE && !r.abandonne
    && peutAgirEtape(moi, r, projetsParId[r.projet_id])
    // Le superviseur peut tout faire, mais son tableau n'en montre pas
    // tout : seulement ce qui l'attend dans ses propres rôles.
    && (!estSuperviseur(moi) || peutAgirEtape({ ...moi, estAdmin: false, roles: (moi.roles || []).filter((x) => x !== 'directeur') }, r, projetsParId[r.projet_id])));
}

// ---------------------------------------------------------------------------
// Droits hors rapports. Mêmes règles qu'en SQL (002_regles.sql).
// ---------------------------------------------------------------------------

// Créer et modifier les projets, leur budget, leur équipe et leurs documents.
export function peutGererProjets(moi) {
  return estSuperviseur(moi) || aRole(moi, 'charge_projet') || aRole(moi, 'coordonnateur');
}

// Modifier les tables de taux preset.
export function peutGererTaux(moi) {
  return estSuperviseur(moi) || aRole(moi, 'coordonnateur');
}

// Employés, équipes, équipements, matériaux, organisations, trajets.
export function peutGererRepertoires(moi) {
  return estSuperviseur(moi) || aRole(moi, 'coordonnateur') || aRole(moi, 'charge_projet') || aRole(moi, 'dispatch');
}

// L'équipe PEPday et ses rôles.
export function peutGererMembres(moi) {
  return estSuperviseur(moi);
}

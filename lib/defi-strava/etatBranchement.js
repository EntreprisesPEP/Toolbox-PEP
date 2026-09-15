// ---------------------------------------------------------------------------
// « DANS QUEL ETAT EST LE BRANCHEMENT STRAVA DE CETTE PERSONNE? »
//
// Revision 54. Sortie de la route API pour une raison simple : c'est la seule
// partie du panneau d'administration qui porte un jugement, donc la seule
// qu'il faut pouvoir tester sans base de donnees ni navigateur.
//
// L'ordre des verifications n'est pas anodin. On annonce d'abord ce qui
// EMPECHE de conclure (pas branche, permissions refusees) avant ce qui est un
// simple soupcon (silence). Dire « silencieux » de quelqu'un qui n'a jamais
// branche son compte serait exact et inutile.
// ---------------------------------------------------------------------------

export const JOURS_AVANT_SOUPCON = 21;

// Strava n'ecrit pas la portee de la meme facon partout : on la DEMANDE en
// « read,activity:read_all » (virgules) et il la RENVOIE en
// « activity:read_all read » (espaces, et dans l'autre ordre). Les deux
// formes sont dans notre base en ce moment meme.
//
// Decouper seulement sur la virgule, comme on le faisait, revient a lire
// « activity:read_all read » comme UNE SEULE permission qui s'appellerait
// « activity:read_all read » — qui n'est evidemment pas « activity:read_all ».
// Resultat : on declarait « permissions incompletes » a des gens dont les
// permissions etaient parfaites. On decoupe donc sur les deux.
//
// Retourne null quand on ne sait pas (portee absente ou vide) : « je ne sais
// pas » et « non » ne doivent pas se ressembler.
export function porteeDonneAccesAuxActivites(portee) {
  if (portee === null || portee === undefined || String(portee).trim() === '') return null;
  return String(portee)
    .split(/[\s,]+/)
    .filter(Boolean)
    .includes('activity:read_all');
}

export function evaluerBranchement({
  stravaAthleteId,
  jeton,
  derniereActivite,
  maintenant = new Date(),
  joursAvantSoupcon = JOURS_AVANT_SOUPCON,
}) {
  const branche = !!(stravaAthleteId && jeton);

  // Une portee absente n'est pas une portee incomplete : c'est une connexion
  // faite avant qu'on enregistre cette information. On ne peut pas conclure.
  const portee = jeton?.scope ?? null;
  const permissionsCompletes = porteeDonneAccesAuxActivites(portee);

  const joursDepuisDerniere = derniereActivite
    ? Math.floor((maintenant.getTime() - new Date(derniereActivite).getTime()) / 86400000)
    : null;

  let etat;
  if (!branche) etat = 'pas-connecte';
  else if (permissionsCompletes === false) etat = 'permissions-incompletes';
  else if (derniereActivite === null || joursDepuisDerniere > joursAvantSoupcon) etat = 'silencieux';
  else etat = 'ok';

  return { etat, branche, portee, permissionsCompletes, joursDepuisDerniere };
}

// ---------------------------------------------------------------------------
// CONVERSION GEODESIQUE — le coeur du calcul.
//
// Isole dans son propre fichier pour une raison : c'est la seule partie de
// l'app ou une erreur se paie en beton coule au mauvais niveau. Elle est
// couverte par 49 tests (voir le LIS-MOI de la revision 45).
//
// LE PRINCIPE
// Sur un plan de structure, « 100'-0" » est un zero arbitraire. Le plan dit
// a quoi ce zero correspond dans le systeme geodesique reel. Tout le reste
// se deduit de cet ecart :
//
//   geo   = reference + (pieds - 100) x facteur
//   pieds = 100 + (geo - reference) / facteur
//
// facteur = 0.3048 quand le geodesique est en metres (le cas normal au
// Quebec), 1 quand le plan donne le geodesique en pieds.
// ---------------------------------------------------------------------------

export const PIED_EN_METRES = 0.3048; // exact, par definition du pied international

export function facteurUnite(uniteGeo) {
  return uniteGeo === 'pieds' ? 1 : PIED_EN_METRES;
}

// ---------------------------------------------------------------------------
// LECTURE D'UNE HAUTEUR EN PIEDS-POUCES
//
// On accepte tout ce qu'une personne tape vraiment sur un chantier :
//   100        100'       100'-6"      100'6"      100-6      100 6
//   100'-6 1/2"          100' 6 1/2    98'-10 3/8"
//   -2'-6"     -2-6      6" (pouces seuls)        100,5 (virgule francaise)
//   100 pi 6 po          100’-6” (apostrophes typographiques)
//
// Retourne des pieds decimaux, ou null si ce n'est pas lisible. On prefere
// null a une interpretation douteuse : mieux vaut ne rien afficher que
// d'afficher un niveau faux.
// ---------------------------------------------------------------------------
export function analyserPiedsPouces(brut) {
  if (brut === null || brut === undefined) return null;
  let t = String(brut).trim().toLowerCase();
  if (!t) return null;

  t = t.replace(/,/g, '.');                                   // virgule decimale
  t = t.replace(/[’ʼ´]/g, "'").replace(/[“”″]/g, '"');        // guillemets typographiques
  t = t.replace(/\s*(pieds|pied|pi)\b/g, "'")
       .replace(/\s*(pouces|pouce|po)\b/g, '"');              // mots -> symboles

  const negatif = /^-/.test(t);
  if (negatif) t = t.slice(1).trim();

  // Pouces seuls :  6"   ou   6 1/2"
  const pouceSeul = t.match(/^(\d+(?:\.\d+)?)?\s*(?:(\d+)\/(\d+))?\s*"$/);
  if (pouceSeul && (pouceSeul[1] || pouceSeul[2])) {
    if (pouceSeul[3] && parseInt(pouceSeul[3], 10) === 0) return null;
    const po = parseFloat(pouceSeul[1] || '0');
    const fr = pouceSeul[2] ? parseInt(pouceSeul[2], 10) / parseInt(pouceSeul[3], 10) : 0;
    const v = (po + fr) / 12;
    return negatif ? -v : v;
  }

  t = t.replace(/["']/g, ' ').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return null;

  let pieds = 0, pouces = 0, fraction = 0, vus = 0;
  for (const m of t.split(' ')) {
    const fr = m.match(/^(\d+)\/(\d+)$/);
    if (fr) {
      const den = parseInt(fr[2], 10);
      if (!den) return null;
      fraction = parseInt(fr[1], 10) / den;
      continue;
    }
    if (!/^\d+(\.\d+)?$/.test(m)) return null;
    if (vus === 0) pieds = parseFloat(m);
    else if (vus === 1) pouces = parseFloat(m);
    else return null;            // trois nombres d'affilee : on ne devine pas
    vus++;
  }
  if (vus === 0) return null;

  const valeur = pieds + (pouces + fraction) / 12;
  return negatif ? -valeur : valeur;
}

// ---------------------------------------------------------------------------
// ECRITURE D'UNE HAUTEUR EN PIEDS-POUCES
// Arrondi au 1/8 de pouce par defaut. La fraction est reduite : 4/8 s'ecrit
// 1/2, 6/8 s'ecrit 3/4. A mi-chemin exactement, on arrondit vers le haut —
// previsible, et c'est le sens qui evite de couper trop court.
// ---------------------------------------------------------------------------
function pgcd(a, b) { return b ? pgcd(b, a % b) : a; }

export function formaterPiedsPouces(piedsDecimaux, denominateur = 8) {
  if (piedsDecimaux === null || piedsDecimaux === undefined || !isFinite(piedsDecimaux)) return '';
  const negatif = piedsDecimaux < 0;
  const abs = Math.abs(piedsDecimaux);

  const partsParPouce = denominateur;
  const partsParPied = 12 * partsParPouce;
  let parts = Math.round(abs * partsParPied);

  const pieds = Math.floor(parts / partsParPied);
  parts -= pieds * partsParPied;
  const pouces = Math.floor(parts / partsParPouce);
  const num = parts - pouces * partsParPouce;

  let texte = `${pieds}'-${pouces}`;
  if (num > 0) {
    const d = pgcd(num, denominateur);
    texte += ` ${num / d}/${denominateur / d}`;
  }
  texte += '"';
  return (negatif ? '-' : '') + texte;
}

// ---------------------------------------------------------------------------
// LES DEUX SENS
// ---------------------------------------------------------------------------
export function versGeo(piedsDecimaux, refGeo, uniteGeo) {
  if (piedsDecimaux === null || refGeo === null || refGeo === undefined) return null;
  return refGeo + (piedsDecimaux - 100) * facteurUnite(uniteGeo);
}

export function versPieds(geo, refGeo, uniteGeo) {
  if (geo === null || refGeo === null || refGeo === undefined) return null;
  return 100 + (geo - refGeo) / facteurUnite(uniteGeo);
}

// ---------------------------------------------------------------------------
// LECTURE ET ECRITURE D'UN NOMBRE GEODESIQUE
// Trois decimales, comme sur les plans : xx.xxx
// ---------------------------------------------------------------------------
export function analyserGeo(brut) {
  if (brut === null || brut === undefined) return null;
  const t = String(brut).trim().replace(/\s/g, '').replace(/,/g, '.');
  if (!t || !/^-?\d*\.?\d+$/.test(t)) return null;
  const v = parseFloat(t);
  return isFinite(v) ? v : null;
}

export function formaterGeo(v) {
  if (v === null || v === undefined || !isFinite(v)) return '';
  return v.toFixed(3);
}

// ---------------------------------------------------------------------------
// L'ECART ENTRE DEUX NIVEAUX, EN PIEDS-POUCES ET EN UNITE GEODESIQUE
// Sert a repondre a « combien de hauteur entre le radier et le dessus de
// dalle ? » sans sortir la calculatrice.
// ---------------------------------------------------------------------------
export function ecartEntre(geoA, geoB, uniteGeo) {
  if (geoA === null || geoB === null) return null;
  const d = geoA - geoB;
  return { geo: d, pieds: d / facteurUnite(uniteGeo) };
}

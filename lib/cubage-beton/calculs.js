// ============================================================================
// CUBAGE BÉTON — calculs purs, sans React
//
// Repris tel quel de l'outil « Cubage béton / bollards & massifs » (artifact du
// 2026-09-28) : mêmes formules, mêmes détails d'Hydro-Québec. Le calcul vit
// ici seul pour que l'écran ne puisse pas le déformer.
//
// Toutes les dimensions sont en millimètres, sauf la longueur d'un massif
// (en mètres) et les volumes (en m³).
// ============================================================================

/** Aire d'un cercle en m² à partir d'un diamètre en mm. */
export const aire = (dMm) => (Math.PI / 4) * Math.pow(dMm / 1000, 2);

/** Lit un nombre saisi (virgule ou point); renvoie `defaut` si vide ou invalide. */
export function lireNombre(valeur, defaut = 0) {
  if (valeur === null || valeur === undefined) return defaut;
  const v = parseFloat(String(valeur).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(v) ? v : defaut;
}

export function formater(v, decimales) {
  if (!Number.isFinite(v)) return '—';
  return v.toLocaleString('fr-CA', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
}

// ---------------------------------------------------------------------------
// BOLLARDS — détails normalisés (Livre vert d'Hydro-Québec, norme E.21-11,
// 5e édition). Les valeurs servent de point de départ; tout reste modifiable.
// ---------------------------------------------------------------------------
export const DETAILS_BOLLARD = {
  hq3410: {
    libelle: 'Hydro-Québec 03-3410 — circulation normale',
    ds: 300, hs: 1200, hr: 150, dp: 100, t: 6, ha: 1000, he: 1200, dome: false,
    source: 'Livre vert, norme E.21-11, 5e éd. — dessin 03-3410, page 114. Poteau d’acier galvanisé CSA G164, bouchon d’acier au sommet.',
  },
  hq3425: {
    libelle: 'Hydro-Québec 03-3425 — circulation lourde',
    ds: 400, hs: 1500, hr: 0, dp: 150, t: 6, ha: 1500, he: 1500, dome: false,
    source: 'Livre vert, norme E.21-11, 5e éd. — dessin 03-3425, page 116. Circulation lourde : peinture jaune, planche asphaltique et scellement de fissures au pourtour.',
  },
};

export const FORMATS_POTEAU = [
  { valeur: '100|6', libelle: 'HQ 03-3410 — ⌀ 100 mm, paroi 6 mm min.' },
  { valeur: '150|6', libelle: 'HQ 03-3425 — ⌀ 150 mm, paroi 6 mm min.' },
  { valeur: '114.3|6.02', libelle: '4 po — ⌀ ext. 114,3 mm, paroi 6,02 mm' },
  { valeur: '141.3|6.55', libelle: '5 po — ⌀ ext. 141,3 mm, paroi 6,55 mm' },
  { valeur: '168.3|7.11', libelle: '6 po — ⌀ ext. 168,3 mm, paroi 7,11 mm' },
  { valeur: '219.1|8.18', libelle: '8 po — ⌀ ext. 219,1 mm, paroi 8,18 mm' },
];

/** Format de la liste qui correspond au poteau saisi, ou '' (Autre). */
export function formatPoteauDe(dp, t) {
  const v = `${lireNombre(dp)}|${lireNombre(t)}`;
  return FORMATS_POTEAU.some((f) => f.valeur === v) ? v : '';
}

/**
 * Bollard : tuyau d'acier centré dans un sonotube, les deux remplis.
 *
 *   béton = sonotube plein, sous le remblai granulaire
 *         − la paroi d'acier noyée (l'intérieur du tuyau se remplit aussi)
 *         + l'intérieur du tuyau au-dessus du sol
 *         + la calotte bombée, s'il y a lieu
 */
export function calculerBollard(e) {
  const Ds = lireNombre(e.ds), Hs = lireNombre(e.hs);
  const Hr = Math.min(lireNombre(e.hr), Hs);          // remblai au-dessus du béton
  const Dp = lireNombre(e.dp), t = lireNombre(e.t);
  const Ha = lireNombre(e.ha);
  const HeSaisi = lireNombre(e.he);
  const He = Math.min(HeSaisi, Hs);                   // pied du poteau
  const Di = Math.max(Dp - 2 * t, 0);

  // Sur la hauteur traversée par le poteau il ne reste que l'anneau autour;
  // sous le pied du poteau la section est pleine.
  const hAnneau = Math.max(Math.min(He, Hs) - Hr, 0);
  const hPleine = Math.max(Hs - Math.max(He, Hr), 0);

  const anneau = (aire(Ds) - aire(Dp)) * (hAnneau / 1000);
  const pleine = aire(Ds) * (hPleine / 1000);
  const interieur = aire(Di) * ((Ha + He) / 1000);    // tuyau plein sur toute sa longueur
  const dome = e.dome ? (2 / 3) * Math.PI * Math.pow(Di / 2000, 3) : 0;
  const net = anneau + pleine + interieur + dome;

  const qte = Math.max(1, Math.round(lireNombre(e.qte, 1)));
  const perte = lireNombre(e.perte);
  const total = net * qte;

  const avis = [];
  if (Di <= 0) avis.push("L'épaisseur de paroi dépasse le rayon du tuyau : vérifie les deux valeurs.");
  if (Dp >= Ds) avis.push("Le poteau est aussi large que le sonotube — il ne reste pas d'enrobage autour.");
  else if ((Ds - Dp) / 2 < 75) avis.push(`Enrobage de ${formater((Ds - Dp) / 2, 0)} mm seulement autour du poteau. Le détail courant en demande au moins 75 mm.`);
  if (HeSaisi > Hs) avis.push(`L'ancrage a été ramené à la profondeur du sonotube (${formater(Hs, 0)} mm).`);

  return {
    Ds, Hs, Hr, Dp, Di, t, Ha, He, hAnneau, hPleine,
    anneau, pleine, interieur, dome, net,
    qte, perte, total, commande: total * (1 + perte / 100), avis,
  };
}

// ---------------------------------------------------------------------------
// MASSIFS ÉLECTRIQUES — enrobage rectangulaire, conduites soustraites au
// diamètre EXTÉRIEUR (PVC série IPS : DB2, annelé rigide, Sch 40).
// ---------------------------------------------------------------------------
export const FORMATS_CONDUITE = [
  { nom: '2 po', d: 60.3 }, { nom: '2½ po', d: 73.0 }, { nom: '3 po', d: 88.9 },
  { nom: '3½ po', d: 101.6 }, { nom: '4 po', d: 114.3 }, { nom: '5 po', d: 141.3 },
  { nom: '6 po', d: 168.3 },
];

export const ENROBAGE_MM = 75;
export const ECART_MM = 50;

export function calculerMassif(e, lignes) {
  const W = lireNombre(e.w), H = lireNombre(e.h), L = lireNombre(e.l);
  const perte = lireNombre(e.perte);
  const brut = (W / 1000) * (H / 1000) * L;

  let aireCond = 0;
  const details = [];
  lignes.forEach((ln) => {
    const q = Math.max(0, Math.round(lireNombre(ln.qte)));
    const d = Math.max(0, lireNombre(ln.d));
    if (q > 0 && d > 0) {
      aireCond += q * aire(d);
      details.push({ qte: q, d, volume: q * aire(d) * L });
    }
  });
  const conduites = aireCond * L;
  const net = brut - conduites;
  const aireMassif = (W / 1000) * (H / 1000);

  const avis = [];
  const occupation = aireMassif > 0 ? aireCond / aireMassif : 0;
  if (net < 0) avis.push('Les conduites occupent plus que la section du massif : le volume net est négatif.');
  else if (occupation > 0.5) avis.push(`Les conduites occupent ${formater(occupation * 100, 0)} % de la section. Vérifie que l'enrobage et l'espacement du devis tiennent.`);
  const plusGros = Math.max(0, ...details.map((x) => x.d));
  if (plusGros + 2 * ENROBAGE_MM > H) avis.push(`Une conduite de ${formater(plusGros, 1)} mm laisse moins de ${ENROBAGE_MM} mm d'enrobage en haut et en bas d'un massif de ${formater(H, 0)} mm.`);

  return {
    W, H, L, brut, conduites, net, details, perte,
    parMetre: L > 0 ? net / L : NaN,
    commande: net * (1 + perte / 100), avis,
  };
}

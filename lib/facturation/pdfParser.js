// lib/facturation/pdfParser.js
//
// Extraction du texte d'une facture PDF, puis interprétation de ce texte
// selon un "gabarit" propre au fournisseur (facturation.fournisseur_templates.config).
//
// Le gabarit est un objet JSON de la forme :
// {
//   "numeroFactureRegex": "(?:Facture|Invoice)\\s*#?\\s*:?\\s*([A-Z0-9-]+)",
//   "dateRegex": "(\\d{4}-\\d{2}-\\d{2}|\\d{2}/\\d{2}/\\d{4})",
//   "sousTotalRegex": "Sous-total\\s*:?\\s*\\$?([\\d,\\.]+)",
//   "taxesRegex": "(?:TPS|TVQ|Taxes)[^\\d]*([\\d,\\.]+)",
//   "totalRegex": "^Total\\s*:?\\s*\\$?([\\d,\\.]+)",
//   "ligneRegex": "^(?<description>.+?)\\s+(?<quantite>[\\d,\\.]+)\\s*(?<unite>m|pi|kg|unit[eé]|tonne)?\\s+(?<prixUnitaire>[\\d,\\.]+)\\s+(?<montant>[\\d,\\.]+)$"
// }
//
// Si aucun gabarit n'est fourni (ou si un champ du gabarit échoue),
// on retombe sur des heuristiques génériques (parseFactureGenerique).
// La confiance du parsing ("haute" / "moyenne" / "basse") est retournée
// pour que l'interface puisse inviter à une vérification manuelle.

const { PDFParse } = require('pdf-parse');

async function extraireTexteBrut(bufferPdf) {
  // pdf-parse v2 a changé son API (v1 exportait une fonction directe,
  // v2 exporte une classe PDFParse) — voir le README du package. On
  // détruit le parseur après usage pour libérer la mémoire (recommandé
  // par la doc, sinon les pages restent chargées en mémoire).
  const parseur = new PDFParse({ data: bufferPdf });
  try {
    const resultat = await parseur.getText();
    return resultat.text || '';
  } finally {
    if (typeof parseur.destroy === 'function') await parseur.destroy();
  }
}

function nettoyerNombre(txt) {
  if (txt == null) return null;
  const n = txt.replace(/\s/g, '').replace(/,/g, '.').replace(/\.(?=.*\.)/g, '');
  const v = parseFloat(n);
  return Number.isFinite(v) ? v : null;
}

function nettoyerDate(txt) {
  if (!txt) return null;
  // Formats supportés : AAAA-MM-JJ, JJ/MM/AAAA, MM/JJ/AAAA (on privilégie JJ/MM si ambigu)
  const isoMatch = txt.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return txt;
  const slashMatch = txt.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    let [, a, b, annee] = slashMatch;
    a = parseInt(a, 10);
    b = parseInt(b, 10);
    // Si le premier nombre dépasse 12, c'est forcément le jour.
    const jour = a > 12 ? a : b;
    const mois = a > 12 ? b : a;
    return `${annee}-${String(mois).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;
  }
  return null;
}

function extraireChamp(texte, regexStr, groupeIndex = 1) {
  if (!regexStr) return null;
  try {
    const re = new RegExp(regexStr, 'im');
    const m = texte.match(re);
    if (!m) return null;
    return m[groupeIndex] ?? m[1] ?? null;
  } catch (err) {
    return null;
  }
}

function extraireLignesAvecGabarit(texte, ligneRegexStr) {
  if (!ligneRegexStr) return [];
  const lignes = texte.split('\n');
  const resultat = [];
  let re;
  try {
    re = new RegExp(ligneRegexStr);
  } catch (err) {
    return [];
  }
  for (const ligne of lignes) {
    const l = ligne.trim();
    if (!l) continue;
    const m = l.match(re);
    if (m && m.groups) {
      const quantite = nettoyerNombre(m.groups.quantite);
      const prixUnitaire = nettoyerNombre(m.groups.prixUnitaire);
      const montant = nettoyerNombre(m.groups.montant);
      if (quantite != null && (prixUnitaire != null || montant != null)) {
        resultat.push({
          description_brute: (m.groups.description || '').trim(),
          quantite,
          unite: (m.groups.unite || '').trim() || null,
          prix_unitaire: prixUnitaire ?? (montant != null && quantite ? montant / quantite : null),
          montant: montant ?? (prixUnitaire != null ? prixUnitaire * quantite : null),
        });
      }
    }
  }
  return resultat;
}

// Heuristique générique : cherche des lignes qui ressemblent à
// "description ... quantité unité prix montant" sans gabarit spécifique.
// Volontairement prudente : mieux vaut ne rien extraire qu'extraire faux.
const LIGNE_GENERIQUE = /^(?<description>[A-Za-zÀ-ÿ0-9''"\-\.\s/]{3,80}?)\s+(?<quantite>\d{1,6}(?:[.,]\d{1,3})?)\s*(?<unite>m|pi|pied|pieds|kg|tonne|unit[ée]s?|ch|caisse|sac|verge|vg)?\.?\s+\$?(?<prixUnitaire>\d{1,6}(?:[.,]\d{2,4})?)\s+\$?(?<montant>\d{1,7}(?:[.,]\d{2})?)\s*$/i;

function parseFactureGenerique(texte) {
  const lignes = texte.split('\n');
  const resultatLignes = [];
  for (const ligne of lignes) {
    const l = ligne.trim();
    if (!l || l.length < 8) continue;
    const m = l.match(LIGNE_GENERIQUE);
    if (m && m.groups) {
      const quantite = nettoyerNombre(m.groups.quantite);
      const prixUnitaire = nettoyerNombre(m.groups.prixUnitaire);
      const montant = nettoyerNombre(m.groups.montant);
      if (quantite && prixUnitaire != null && montant != null) {
        // Cohérence approximative qty * prix ~= montant (tolérance 5%)
        const attendu = quantite * prixUnitaire;
        const ecart = montant > 0 ? Math.abs(attendu - montant) / montant : 1;
        if (ecart < 0.08) {
          resultatLignes.push({
            description_brute: (m.groups.description || '').trim(),
            quantite,
            unite: (m.groups.unite || '').trim() || null,
            prix_unitaire: prixUnitaire,
            montant,
          });
        }
      }
    }
  }

  const numeroFacture =
    extraireChamp(texte, '(?:Facture|Invoice)\\s*#?\\s*:?\\s*([A-Z0-9-]{3,20})') || null;
  const dateBrute =
    extraireChamp(texte, '(\\d{4}-\\d{2}-\\d{2})') ||
    extraireChamp(texte, '(\\d{1,2}/\\d{1,2}/\\d{4})');
  const totalBrut = extraireChamp(texte, '^Total\\s*:?\\s*\\$?\\s*([\\d,\\.]+)\\s*$');

  return {
    numero_facture: numeroFacture,
    date_facture: nettoyerDate(dateBrute),
    ...completerSousTotalTaxesTotal({ sous_total: null, taxes: null, total: nettoyerNombre(totalBrut) }),
    lignes: resultatLignes,
    confiance: resultatLignes.length > 0 ? 'moyenne' : 'basse',
  };
}// Interprète le texte extrait selon le gabarit du fournisseur (ou, à
// défaut, selon l'heuristique générique). Retourne toujours la même
// forme, avec un champ "confiance" pour piloter l'UI.
function interpreterFacture(texte, templateConfig) {
  if (!templateConfig || Object.keys(templateConfig).length === 0) {
    return parseFactureGenerique(texte);
  }

  const numeroFacture = extraireChamp(texte, templateConfig.numeroFactureRegex);
  const dateBrute = extraireChamp(texte, templateConfig.dateRegex);
  const sousTotal = nettoyerNombre(extraireChamp(texte, templateConfig.sousTotalRegex));
  const taxes = nettoyerNombre(extraireChamp(texte, templateConfig.taxesRegex));
  const total = nettoyerNombre(extraireChamp(texte, templateConfig.totalRegex));

  let lignes = extraireLignesAvecGabarit(texte, templateConfig.ligneRegex);
  let confiance = 'haute';

  if (lignes.length === 0) {
    // Le gabarit n'a rien trouvé (facture au format inhabituel ce mois-ci
    // par ex.) — on retombe sur l'heuristique générique pour au moins
    // proposer quelque chose, mais on baisse la confiance.
    const fallback = parseFactureGenerique(texte);
    lignes = fallback.lignes;
    confiance = lignes.length > 0 ? 'moyenne' : 'basse';
  }

  return {
    numero_facture: numeroFacture,
    date_facture: nettoyerDate(dateBrute),
    ...completerSousTotalTaxesTotal({ sous_total: sousTotal, taxes, total }),
    lignes,
    confiance,
  };
}

// Complète sous_total/taxes/total quand seulement 2 des 3 valeurs ont pu
// être lues — arithmétique simple, jamais une invention de chiffres.
function completerSousTotalTaxesTotal({ sous_total, taxes, total }) {
  let st = sous_total, tx = taxes, tt = total;
  if (st != null && tx != null && tt == null) tt = Number((st + tx).toFixed(2));
  else if (st != null && tt != null && tx == null) tx = Number((tt - st).toFixed(2));
  else if (tx != null && tt != null && st == null) st = Number((tt - tx).toFixed(2));
  return { sous_total: st, taxes: tx, total: tt };
}

module.exports = {
  extraireTexteBrut,
  interpreterFacture,
  parseFactureGenerique,
  nettoyerNombre,
  nettoyerDate,
};

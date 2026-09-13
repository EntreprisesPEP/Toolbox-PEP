// ---------------------------------------------------------------------------
// SORTIR UN GAIN IMPOSABLE EN EXCEL OU EN PDF
//
// Les deux exports partent du MEME resultat, calcule une seule fois par
// lib/gain-imposable/calculs.js et passe en parametre. Aucun des deux ne
// refait l'arithmetique de son cote : c'est comme ca qu'on evite un PDF et un
// Excel qui ne disent pas le meme chiffre.
//
// Le Excel garde des FORMULES VIVANTES. Quelqu'un qui recoit le fichier doit
// pouvoir changer le kilometrage personnel et voir le total bouger — sinon
// autant envoyer une image.
// ---------------------------------------------------------------------------

import { enDollars, enCents, analyserNombre, nomFichier } from './calculs';

const LOGO_PEP = '/pep-logo-blanc.png';

const NAVY = 'FF14213D';
const ROUGE = 'FFC41230';
const GRIS_PALE = 'FFF2F4F8';
const FILET = 'FFDDE1EA';
const FMT_ARGENT = '#,##0.00 [$$-fr-CA]';
const FMT_KM = '#,##0.0" km"';
const FMT_PCT = '0.0 %';

async function chargerLogo(chemin = LOGO_PEP) {
  try {
    const resp = await fetch(chemin);
    const blob = await resp.blob();
    return await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  } catch (e) {
    return null; // sans logo l'export reste valable
  }
}

function telecharger(blob, nom) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function dateFr(iso) {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : String(iso);
}

// ===========================================================================
// EXCEL
// ===========================================================================

export async function exporterExcel({ calcul: c, resultat: r }) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Toolbox PEP';
  wb.created = new Date();

  const ws = wb.addWorksheet('Gain imposable', {
    pageSetup: { paperSize: 5, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  ws.columns = [
    { width: 3 }, { width: 46 }, { width: 16 }, { width: 16 }, { width: 18 }, { width: 3 },
  ];

  const estAchat = c.mode === 'achat';
  let L = 1;

  // --- Bandeau -------------------------------------------------------------
  ws.mergeCells(`B${L}:E${L + 1}`);
  const titre = ws.getCell(`B${L}`);
  titre.value = 'AVANTAGE IMPOSABLE — AUTOMOBILE';
  titre.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' }, name: 'Calibri' };
  titre.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  for (let col = 2; col <= 5; col++) {
    for (let li = L; li <= L + 1; li++) {
      ws.getCell(li, col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    }
  }
  ws.getRow(L).height = 20; ws.getRow(L + 1).height = 12;
  L += 3;

  // --- Identité ------------------------------------------------------------
  const info = (etiquette, valeur) => {
    ws.getCell(`B${L}`).value = etiquette;
    ws.getCell(`B${L}`).font = { size: 9, color: { argb: 'FF6B7280' } };
    ws.mergeCells(`C${L}:E${L}`);
    ws.getCell(`C${L}`).value = valeur;
    ws.getCell(`C${L}`).font = { size: 10, bold: true };
    L++;
  };
  info("Nom de l'employeur", c.employeur);
  info("Nom de l'employé", c.employe_nom);
  info('Véhicule', c.vehicule || '—');
  info('Mode', estAchat ? 'Acheté' : 'Loué');
  info("Année d'imposition", Number(c.annee));
  info('Mise à disposition', `${dateFr(c.date_debut)} au ${dateFr(c.date_fin)}`);
  L++;

  const sousTitre = (texte) => {
    ws.mergeCells(`B${L}:E${L}`);
    const cel = ws.getCell(`B${L}`);
    cel.value = texte;
    cel.font = { bold: true, size: 10, color: { argb: ROUGE } };
    cel.border = { bottom: { style: 'thin', color: { argb: FILET } } };
    L++;
  };

  // --- Les entrées, en cellules vivantes -----------------------------------
  // Ces cellules-la sont la SOURCE. Tout le reste est une formule qui pointe
  // dessus, pour qu'une correction se propage jusqu'aux taxes.
  sousTitre('DONNÉES DE BASE  (modifie ces cellules et tout se recalcule)');

  const saisie = (etiquette, valeur, format) => {
    ws.getCell(`B${L}`).value = etiquette;
    const cel = ws.getCell(`C${L}`);
    cel.value = valeur;
    if (format) cel.numFmt = format;
    cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF9E6' } };
    cel.border = {
      top: { style: 'thin', color: { argb: FILET } }, left: { style: 'thin', color: { argb: FILET } },
      bottom: { style: 'thin', color: { argb: FILET } }, right: { style: 'thin', color: { argb: FILET } },
    };
    const ref = `C${L}`;
    L++;
    return ref;
  };

  const refKmTotal = saisie('Kilométrage total parcouru', r.kmTotal ?? 0, FMT_KM);
  const refKmPerso = saisie('Kilométrage personnel', r.kmPersonnel ?? 0, FMT_KM);
  const refPeriodes = saisie('Périodes de 30 jours de mise à disposition', r.periodes ?? 0, '#,##0.00');
  // On reprend les valeurs SAISIES, pas des montants reconstruits a l'envers a
  // partir du resultat : une division par le nombre de periodes se casse la
  // figure des que ce nombre vaut zero, et un arrondi a l'envers ne redonne
  // pas toujours le chiffre tape.
  let refCout = null; let refMensualite = null; let refMois = null; let refAssur = null;
  if (estAchat) {
    refCout = saisie('Coût du véhicule (taxes incluses)',
      enDollars(enCents(c.cout) ?? 0), FMT_ARGENT);
  } else {
    refMensualite = saisie('Mensualité de location (taxes incluses)',
      enDollars(enCents(c.mensualite) ?? 0), FMT_ARGENT);
    refMois = saisie('Nombre de mensualités', analyserNombre(c.mois_location) ?? 0, '#,##0');
    refAssur = saisie('Assurances par mois (comprises dans la mensualité)',
      enDollars(enCents(c.assurances) ?? 0), FMT_ARGENT);
  }
  const refTauxKm = saisie(`Taux prescrit ${c.annee} ($ le kilomètre)`, r.tauxKm ?? 0, '0.00 "$"');
  const refRembUsage = saisie("Remboursé par l'employé — droit d'usage", enDollars(r.rembUsageCents), FMT_ARGENT);
  const refRembFonct = saisie("Remboursé par l'employé — frais de fonctionnement", enDollars(r.rembFonctCents), FMT_ARGENT);
  L++;

  const calc = (etiquette, formule, options = {}) => {
    ws.getCell(`B${L}`).value = etiquette;
    if (options.attenue) ws.getCell(`B${L}`).font = { size: 9, color: { argb: 'FF6B7280' } };
    if (options.fort) ws.getCell(`B${L}`).font = { bold: true };
    const cel = ws.getCell(`E${L}`);
    cel.value = typeof formule === 'string' ? { formula: formule } : formule;
    cel.numFmt = options.format || FMT_ARGENT;
    if (options.fort) cel.font = { bold: true };
    if (options.pale) {
      for (let col = 2; col <= 5; col++) {
        ws.getCell(L, col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS_PALE } };
      }
    }
    const ref = `E${L}`;
    L++;
    return ref;
  };

  // --- Droit d'usage -------------------------------------------------------
  sousTitre("DROIT D'USAGE");
  let refUsageComplet;
  if (estAchat) {
    refUsageComplet = calc(
      `${(r.tauxUsage * 100).toFixed(1).replace('.', ',')} % × coût × périodes`,
      `${refCout}*${r.tauxUsage}*${refPeriodes}`,
      { pale: true },
    );
  } else {
    const refCoutLoc = calc('Coût de location total', `${refMensualite}*${refMois}`, { attenue: true });
    const refAssurTot = calc('Moins les assurances comprises', `-${refAssur}*${refMois}`, { attenue: true });
    refUsageComplet = calc('⅔ × (location − assurances)',
      `(${refCoutLoc}+${refAssurTot})*2/3`, { pale: true });
  }

  const refPlafond = calc('Plafond de km personnels (1 667 × périodes)',
    `1667*${refPeriodes}`, { attenue: true, format: FMT_KM });

  // La reduction ne s'applique que si les trois conditions sont remplies. Le
  // IF() garde la regle vivante dans le fichier : si quelqu'un change le
  // kilometrage personnel au-dela du plafond, la reduction disparait toute
  // seule au lieu de gonfler le droit d'usage — ce que faisait l'ancien
  // chiffrier, qui comparait a un 20 000 fixe.
  //
  // La condition « l'employeur exige l'usage du vehicule » n'est pas une
  // cellule : c'est un fait, coche dans l'app. S'il est faux, aucune formule
  // ne doit pouvoir ressusciter la reduction dans le fichier.
  const conditions = `AND(${refKmTotal}>0,(${refKmTotal}-${refKmPerso})/${refKmTotal}>0.5,${refKmPerso}<=${refPlafond})`;
  const refUsage = calc(
    "Droit d'usage après réduction",
    r.conditionExige
      ? `IF(${conditions},${refUsageComplet}*${refKmPerso}/${refPlafond},${refUsageComplet})`
      : `${refUsageComplet}`,
    { fort: true },
  );
  const refUsageNet = calc("DROIT D'USAGE RETENU",
    `MAX(0,${refUsage}-${refRembUsage})`, { fort: true, pale: true });
  L++;

  // --- Frais de fonctionnement --------------------------------------------
  sousTitre('FRAIS DE FONCTIONNEMENT');
  const refParKm = calc('Kilomètres personnels × taux prescrit',
    `${refKmPerso}*${refTauxKm}`, { attenue: r.methodeRetenue !== 'kilometrique' });
  const refMoitie = calc("Ou 50 % du droit d'usage (si affaires > 50 %)",
    `IF(AND(${refKmTotal}>0,(${refKmTotal}-${refKmPerso})/${refKmTotal}>0.5),${refUsage}*0.5,"")`,
    { attenue: r.methodeRetenue !== 'moitie' });
  const refFonct = calc('Montant retenu',
    c.methode_fonctionnement === 'kilometrique' ? `${refParKm}`
      : c.methode_fonctionnement === 'moitie' ? `IF(ISNUMBER(${refMoitie}),${refMoitie},${refParKm})`
        : `IF(ISNUMBER(${refMoitie}),MIN(${refParKm},${refMoitie}),${refParKm})`,
    { fort: true });
  const refFonctNet = calc('FRAIS DE FONCTIONNEMENT RETENUS',
    `MAX(0,${refFonct}-${refRembFonct})`, { fort: true, pale: true });
  L++;

  // --- Total ---------------------------------------------------------------
  ws.mergeCells(`B${L}:D${L}`);
  ws.getCell(`B${L}`).value = 'AVANTAGE IMPOSABLE TOTAL';
  ws.getCell(`B${L}`).font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
  ws.getCell(`B${L}`).alignment = { indent: 1 };
  const cellTotal = ws.getCell(`E${L}`);
  cellTotal.value = { formula: `${refUsageNet}+${refFonctNet}` };
  cellTotal.numFmt = FMT_ARGENT;
  cellTotal.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
  for (let col = 2; col <= 5; col++) {
    ws.getCell(L, col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  }
  ws.getRow(L).height = 22;
  const refTotal = `E${L}`;
  L += 2;

  // --- Taxes ---------------------------------------------------------------
  sousTitre("TAXES À REMETTRE PAR L'EMPLOYEUR");
  calc("TPS — droit d'usage × 4/104 + fonctionnement × 3 %",
    `${refUsageNet}*4/104+${refFonctNet}*0.03`);
  calc('TVQ — droit d\'usage × 9,975/109,975 + fonctionnement × 6 %',
    `${refUsageNet}*9.975/109.975+${refFonctNet}*0.06`);
  L++;

  ws.mergeCells(`B${L}:E${L + 2}`);
  const nota = ws.getCell(`B${L}`);
  nota.value = "Cotisation à retenir sur l'avantage imposable : RRQ seulement — ni RQAP, ni assurance-emploi.\n"
    + `Taux de ${c.annee} appliqué aux frais de fonctionnement : ${r.taux?.fonctionnement ?? '—'} $ le kilomètre.\n`
    + 'Les cellules jaunes sont les données de base : tout le reste est une formule qui en découle.';
  nota.font = { size: 8.5, color: { argb: 'FF6B7280' } };
  nota.alignment = { wrapText: true, vertical: 'top' };
  L += 4;

  if (c.note) {
    ws.getCell(`B${L}`).value = 'Note interne';
    ws.getCell(`B${L}`).font = { size: 9, bold: true, color: { argb: 'FF6B7280' } };
    ws.mergeCells(`C${L}:E${L}`);
    ws.getCell(`C${L}`).value = c.note;
    ws.getCell(`C${L}`).font = { size: 9 };
    ws.getCell(`C${L}`).alignment = { wrapText: true };
  }

  const buffer = await wb.xlsx.writeBuffer();
  telecharger(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    nomFichier(c, 'xlsx'),
  );
}

// ===========================================================================
// PDF
// ===========================================================================

export async function exporterPdf({ calcul, resultat }) {
  const { pdf } = await import('@react-pdf/renderer');
  const { default: GainPdf } = await import('../../components/gain-imposable/GainPdf');
  const React = (await import('react')).default;
  const logoDataUrl = await chargerLogo(LOGO_PEP);
  const blob = await pdf(
    React.createElement(GainPdf, { calcul, resultat, logoDataUrl }),
  ).toBlob();
  telecharger(blob, nomFichier(calcul, 'pdf'));
}

export { LOGO_PEP };

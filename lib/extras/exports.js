import {
  CATEGORIES, totalLigneCents, ligneEstVide, enDollars, analyserNombre, numeroAffiche,
  gabaritDe, estAffiche, blocsDe, totalTableauCents,
} from './calculs';

// ---------------------------------------------------------------------------
// SORTIR UN EXTRA EN EXCEL OU EN PDF
//
// Les deux exports partent des MEMES totaux, calcules une seule fois par
// lib/extras/calculs.js et passes en parametre. Recalculer de son cote dans
// chaque export, c'est la porte ouverte a un PDF et un Excel qui ne disent
// pas le meme chiffre — le genre d'ecart qu'on ne decouvre que devant le
// client.
// ---------------------------------------------------------------------------

const LOGO_PEP = '/pep-logo-blanc.png';   // sur fond navy
const LOGO_PEP_NOIR = '/pep-logo-noir.png';

const NAVY = 'FF14213D';
const ROUGE = 'FFC41230';
const GRIS_PALE = 'FFF2F4F8';
const FILET = 'FFDDE1EA';
const FMT_ARGENT = '#,##0.00 [$$-fr-CA]';

export async function chargerLogo(chemin = LOGO_PEP) {
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
    // Sans logo l'export reste valable : on ne fait pas echouer un
    // telechargement pour une image.
    return null;
  }
}

// ---------------------------------------------------------------------------
// LES IMAGES DES BLOCS
//
// En base, un bloc image ne garde que le CHEMIN du fichier dans Supabase.
// Avant de fabriquer le document il faut le vrai contenu, en data URL. Le
// telechargement est injecte par l'appelant : ce fichier n'a pas a savoir ce
// qu'est Supabase.
//
// Une image qui ne descend pas ne fait PAS echouer l'export — le reste du
// document est bon, et le bloc se retire tout seul a l'impression. Les
// echecs sont retournes pour que l'app puisse le dire.
// ---------------------------------------------------------------------------
export async function resoudreImages(blocs, telechargerImage) {
  const manquantes = [];
  if (!telechargerImage) return { blocs: blocs || [], manquantes };
  const sortie = await Promise.all((blocs || []).map(async (b) => {
    if (b.type !== 'image' || !b.chemin || b.dataUrl) return b;
    try {
      const blob = await telechargerImage(b.chemin);
      if (!blob) throw new Error('vide');
      const dataUrl = await new Promise((resoudre, rejeter) => {
        const r = new FileReader();
        r.onload = () => resoudre(r.result);
        r.onerror = rejeter;
        r.readAsDataURL(blob);
      });
      return { ...b, dataUrl };
    } catch (e) {
      manquantes.push(b.titre || b.chemin);
      return b;
    }
  }));
  return { blocs: sortie, manquantes };
}

function telecharger(blob, nomFichier) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomFichier;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function nomFichier(extra, extension) {
  // Le numero complet porte deja le projet ET la revision : EX-24-118-001-R02.
  // C'est ce qui empeche la revision 2 d'ecraser la revision 1 dans le
  // dossier Telechargements, du meme nom, sans un mot.
  const base = [numeroAffiche(extra.numero, extra.revision) || 'extra', extra.sujet]
    .filter(Boolean).join(' - ')
    .replace(/[\\/:*?"<>|]/g, '')      // caracteres interdits sous Windows
    .replace(/\s+/g, ' ').trim().slice(0, 90);
  return `${base}.${extension}`;
}

// ---------------------------------------------------------------------------
// LES BLOCS LIBRES DANS LA FEUILLE
//
// Retourne { ligne, cellules } : la ligne ou continuer, et l'adresse de la
// cellule de total de chaque tableau qui compte. C'est cette adresse qui
// entre dans la formule du sous-total — pas une copie du montant. Recopier
// le chiffre casserait la chaine : on changerait une rangee du tableau et le
// total avec taxes ne bougerait pas.
//
// Les images sont ancrees a la feuille, pas mises dans une cellule : Excel
// n'a pas de cellule-image, alors on reserve des lignes de la bonne hauteur
// et on pose l'image par-dessus.
// ---------------------------------------------------------------------------
function ecrireBlocs(ws, depart, blocs, o) {
  let r = depart;
  const cellules = {};
  (blocs || []).forEach((b) => {
    if (b.type === 'saut') {
      ws.getRow(r).addPageBreak();
      r += 1;
      return;
    }

    if (b.titre) {
      o.fusion(r, 1, 5);
      const c = ws.getCell(r, 1);
      c.value = b.titre;
      c.font = { bold: true, size: 11, name: 'Calibri', color: { argb: 'FF14213D' } };
      c.border = { bottom: { style: 'thin', color: { argb: ROUGE } } };
      r += 1;
    }

    if (b.type === 'texte') {
      if (String(b.corps || '').trim()) {
        o.fusion(r, 1, 5);
        const c = ws.getCell(r, 1);
        c.value = b.corps;
        c.alignment = { wrapText: true, vertical: 'top' };
        c.font = { name: 'Calibri', size: 10 };
        ws.getRow(r).height = Math.min(140, 13 * Math.max(1, Math.ceil(String(b.corps).length / 95)));
        r += 1;
      }
      r += 1;
      return;
    }

    if (b.type === 'image') {
      if (b.dataUrl) {
        const m = String(b.dataUrl).match(/^data:image\/(png|jpe?g|gif|webp);base64,(.*)$/);
        if (m) {
          const id = ws.workbook.addImage({ base64: m[2], extension: m[1] === 'jpg' ? 'jpeg' : m[1] });
          const hauteurLignes = 14;
          for (let i = 0; i < hauteurLignes; i++) ws.getRow(r + i).height = 15;
          ws.addImage(id, {
            tl: { col: 0.1, row: r - 1 + 0.1 },
            ext: { width: (b.largeur || 'pleine') === 'pleine' ? 520 : 290, height: 260 },
            editAs: 'oneCell',
          });
          r += hauteurLignes;
        }
      }
      if (b.legende) {
        o.fusion(r, 1, 5);
        const c = ws.getCell(r, 1);
        c.value = b.legende;
        c.font = { italic: true, size: 9, name: 'Calibri', color: { argb: 'FF6B7488' } };
        r += 1;
      }
      r += 1;
      return;
    }

    if (b.type === 'tableau') {
      const colonnes = b.colonnes || [];
      const rangees = (b.rangees || []).filter((x) => (x || []).some((c) => String(c || '').trim()));
      if (colonnes.length === 0 || rangees.length === 0) { r += 1; return; }
      const iM = Number(b.colonneMontant);
      const nb = Math.min(colonnes.length, 5);

      colonnes.slice(0, nb).forEach((col, i) => {
        const c = ws.getCell(r, i + 1);
        c.value = col.libelle || '';
        c.font = { bold: true, size: 9, name: 'Calibri', color: { argb: 'FFFFFFFF' } };
        c.alignment = { horizontal: i === iM ? 'right' : 'left' };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
      });
      r += 1;

      const premiere = r;
      rangees.forEach((rangee, ri) => {
        colonnes.slice(0, nb).forEach((col, i) => {
          const c = ws.getCell(r, i + 1);
          const brut = (rangee || [])[i];
          if (i === iM) {
            const v = analyserNombre(brut);
            c.value = v === null ? (brut || '') : v;
            c.numFmt = FMT_ARGENT;
            c.alignment = { horizontal: 'right' };
          } else {
            c.value = brut || '';
            c.alignment = { wrapText: true, vertical: 'top' };
          }
          c.font = { name: 'Calibri', size: 10 };
          c.border = { bottom: { style: 'hair', color: { argb: FILET } } };
          if (ri % 2 === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFBFC' } };
        });
        r += 1;
      });

      if (b.compteDansTotal && isFinite(iM) && iM >= 0 && iM < nb) {
        const lettre = String.fromCharCode(65 + iM);
        ws.getCell(r, 1).value = 'Total';
        ws.getCell(r, 1).font = { bold: true, size: 10, name: 'Calibri' };
        const c = ws.getCell(r, iM + 1);
        c.value = { formula: `SUM(${lettre}${premiere}:${lettre}${r - 1})`,
          result: enDollars(totalTableauCents(b)) };
        c.numFmt = FMT_ARGENT;
        c.font = { bold: true, size: 10, name: 'Calibri' };
        c.alignment = { horizontal: 'right' };
        o.remplir(r, 1, nb, GRIS_PALE);
        cellules[b.id || b.titre || `t${r}`] = `${lettre}${r}`;
        r += 1;
      }
      r += 1;
    }
  });
  return { ligne: r, cellules };
}

// ===========================================================================
// EXCEL
//
// Le fichier reproduit le document, pas une table brute : quelqu'un doit
// pouvoir l'ouvrir, changer une quantite et voir le total suivre. Les
// montants sont donc de VRAIS NOMBRES avec un format monetaire, et les
// totaux sont des FORMULES, pas des valeurs figees. Un Excel ou tout est
// fige n'est qu'un PDF plus laid.
// ===========================================================================
export async function exporterExcel({ extra, lignes, totaux, projet, telechargerImage }) {
  const resolu = await resoudreImages(extra.blocs, telechargerImage);
  extra = { ...extra, blocs: resolu.blocs };
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Les Entreprises PEP2000 inc.';
  const ws = wb.addWorksheet('Extra', {
    pageSetup: { paperSize: 1, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
  });

  ws.getColumn(1).width = 46;   // description
  ws.getColumn(2).width = 10;   // quantite
  ws.getColumn(3).width = 9;    // unite
  ws.getColumn(4).width = 14;   // prix unitaire
  ws.getColumn(5).width = 16;   // total

  const FMT = FMT_ARGENT;
  let r = 1;

  const fusion = (ligne, de, a) => ws.mergeCells(ligne, de, ligne, a);
  const remplir = (ligne, de, a, couleur) => {
    for (let c = de; c <= a; c++) {
      ws.getCell(ligne, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: couleur } };
    }
  };

  // --- bandeau ---
  ws.getRow(r).height = 42;
  fusion(r, 1, 5);
  remplir(r, 1, 5, NAVY);
  const titre = ws.getCell(r, 1);
  titre.value = `   LES ENTREPRISES PEP2000 INC.  —  ${gabaritDe(extra.gabarit).titreDocument.toUpperCase()}`;
  titre.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' }, name: 'Calibri' };
  titre.alignment = { vertical: 'middle' };
  r += 1;

  ws.getRow(r).height = 4;
  remplir(r, 1, 5, ROUGE);
  r += 2;

  // --- entete du document ---
  const champ = (etiquette, valeur, gras) => {
    ws.getCell(r, 1).value = etiquette;
    ws.getCell(r, 1).font = { bold: true, size: 9, color: { argb: 'FF6B7488' }, name: 'Calibri' };
    fusion(r, 2, 5);
    const c = ws.getCell(r, 2);
    c.value = valeur || '';
    c.font = { name: 'Calibri', size: 11, bold: !!gras };
    c.alignment = { wrapText: true, vertical: 'top' };
    r += 1;
  };
  // Dans la feuille : le numero sans suffixe; la revision est sur sa propre
  // ligne. Le suffixe complet sert au nom du fichier.
  champ('Numéro', extra.numero || '—', true);
  champ('Projet', projet ? `${projet.no} — ${projet.nom}` : (extra.projet_no || '—'), true);
  if (projet?.client) champ('Client', projet.client);
  champ('Date', extra.date_extra || '');
  champ('Révision', `R${String(Math.max(0, Math.round(Number(extra.revision) || 0))).padStart(2, '0')}`);
  champ('Type', gabaritDe(extra.gabarit).libelle);
  champ('Sujet', extra.sujet || '', true);
  if (extra.description) {
    ws.getCell(r, 1).value = 'Description';
    ws.getCell(r, 1).font = { bold: true, size: 9, color: { argb: 'FF6B7488' }, name: 'Calibri' };
    fusion(r, 2, 5);
    const c = ws.getCell(r, 2);
    c.value = extra.description;
    c.alignment = { wrapText: true, vertical: 'top' };
    c.font = { name: 'Calibri', size: 10 };
    ws.getRow(r).height = Math.min(90, 14 * Math.max(1, Math.ceil(extra.description.length / 80)));
    r += 1;
  }
  if (extra.destinataire_nom || extra.destinataire_courriel) {
    champ("À l'attention de", [extra.destinataire_nom, extra.destinataire_courriel].filter(Boolean).join(' — '));
  }
  champ('Soumis par', extra.afficher_soumis_par && extra.soumis_par
    ? extra.soumis_par : 'Les Entreprises PEP2000 inc.');
  r += 1;

  // ---- les blocs libres qui vont AVANT le detail ----
  // L'Excel est notre feuille de travail : il porte TOUT, y compris le detail
  // qu'un forfait n'imprime pas au client. C'est justement ce qui sert a
  // verifier un prix ferme six mois plus tard.
  const blocsAvant = ecrireBlocs(ws, r, blocsDe(extra.blocs, 'avant'), { FMT, fusion, remplir });
  r = blocsAvant.ligne;

  // --- sections ---
  const lignesTotalCat = {};   // categorie -> numero de la cellule de total

  CATEGORIES.forEach((cat) => {
    const miennes = (lignes || []).filter((l) => l.categorie === cat.id && !ligneEstVide(l));
    if (miennes.length === 0) return;

    fusion(r, 1, 5);
    remplir(r, 1, 5, NAVY);
    const t = ws.getCell(r, 1);
    t.value = `  ${cat.libelle.toUpperCase()}`;
    t.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' }, name: 'Calibri' };
    t.alignment = { vertical: 'middle' };
    ws.getRow(r).height = 20;
    r += 1;

    ['Description', 'Quantité', 'Unité', 'Prix unitaire', 'Total'].forEach((h, i) => {
      const c = ws.getCell(r, i + 1);
      c.value = h;
      c.font = { bold: true, size: 9, name: 'Calibri', color: { argb: 'FF6B7488' } };
      c.border = { bottom: { style: 'thin', color: { argb: NAVY } } };
      c.alignment = { horizontal: i >= 1 && i !== 2 ? 'right' : 'left' };
    });
    r += 1;

    const premiere = r;
    miennes.forEach((l, i) => {
      const q = analyserNombre(l.quantite);
      const p = analyserNombre(l.prix_unitaire);
      ws.getCell(r, 1).value = l.note ? `${l.description}\n${l.note}` : l.description;
      ws.getCell(r, 1).alignment = { wrapText: true, vertical: 'top' };
      ws.getCell(r, 2).value = q === null ? '' : q;
      ws.getCell(r, 3).value = l.unite || '';
      ws.getCell(r, 4).value = p === null ? '' : p;
      ws.getCell(r, 4).numFmt = FMT;
      // FORMULE, pas valeur : modifier B ou D met E a jour tout seul.
      ws.getCell(r, 5).value = { formula: `B${r}*D${r}`, result: enDollars(totalLigneCents(l)) };
      ws.getCell(r, 5).numFmt = FMT;
      for (let c = 1; c <= 5; c++) {
        ws.getCell(r, c).font = { name: 'Calibri', size: 10 };
        ws.getCell(r, c).border = { bottom: { style: 'hair', color: { argb: FILET } } };
        if (i % 2 === 1) ws.getCell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFBFC' } };
      }
      ws.getCell(r, 2).alignment = { horizontal: 'right' };
      ws.getCell(r, 4).alignment = { horizontal: 'right' };
      ws.getCell(r, 5).alignment = { horizontal: 'right' };
      r += 1;
    });
    const derniere = r - 1;

    const resume = totaux.categories[cat.id];
    fusion(r, 1, 4);
    ws.getCell(r, 1).value = `Total ${cat.libelle.toLowerCase()}`;
    ws.getCell(r, 1).font = { name: 'Calibri', size: 10, bold: true };
    ws.getCell(r, 1).alignment = { horizontal: 'right' };
    ws.getCell(r, 5).value = { formula: `SUM(E${premiere}:E${derniere})`, result: resume.total };
    ws.getCell(r, 5).numFmt = FMT;
    ws.getCell(r, 5).font = { name: 'Calibri', size: 10, bold: true };
    remplir(r, 1, 5, GRIS_PALE);
    lignesTotalCat[cat.id] = `E${r}`;
    r += 2;
  });

  // --- totaux ---
  // Un tableau maison qui compte dans le total est toujours ecrit AVANT les
  // totaux (l'app force son emplacement), alors sa cellule est deja connue :
  // elle entre dans la formule, et changer une rangee du tableau remonte
  // jusqu'au total avec taxes.
  const cellules = [
    ...Object.values(lignesTotalCat),
    ...Object.values(blocsAvant.cellules),
  ];
  const formuleSousTotal = cellules.length ? cellules.join('+') : '0';

  const ligneTotal = (etiquette, formule, resultat, options = {}) => {
    fusion(r, 1, 4);
    const lib = ws.getCell(r, 1);
    lib.value = etiquette;
    lib.alignment = { horizontal: 'right' };
    lib.font = { name: 'Calibri', size: options.grand ? 12 : 10, bold: !!options.gras,
      color: { argb: options.blanc ? 'FFFFFFFF' : 'FF1A2035' } };
    const val = ws.getCell(r, 5);
    val.value = typeof formule === 'string' ? { formula: formule, result: resultat } : resultat;
    val.numFmt = FMT;
    val.alignment = { horizontal: 'right' };
    val.font = { name: 'Calibri', size: options.grand ? 12 : 10, bold: !!options.gras,
      color: { argb: options.blanc ? 'FFFFFFFF' : 'FF1A2035' } };
    if (options.fond) remplir(r, 1, 5, options.fond);
    if (options.grand) ws.getRow(r).height = 22;
    const ref = `E${r}`;
    r += 1;
    return ref;
  };

  // L'administration et le profit : une seule ligne, ici, tout en bas. Sans
  // majoration, « total des travaux » et « sous-total » donneraient deux fois
  // le meme chiffre — on n'ecrit alors que le sous-total.
  const g = gabaritDe(extra.gabarit);
  let refSousTotal;
  if (totaux.forfaitImpose) {
    // Un prix ferme decide a la main : on montre les deux, parce que l'ecart
    // entre le cout et le prix soumis est exactement ce qu'on cherche a
    // retrouver quand on rouvre le fichier des mois plus tard.
    const refCout = ligneTotal('Coût calculé', formuleSousTotal, totaux.totalTravaux, { fond: GRIS_PALE });
    if (totaux.pourcentage > 0) {
      ligneTotal(`Administration et profit (${totaux.pourcentage.toLocaleString('fr-CA', { maximumFractionDigits: 3 })} %)`,
        `ROUND(${refCout}*${totaux.pourcentage}/100,2)`, totaux.majoration, { fond: GRIS_PALE });
    }
    ligneTotal('Écart avec le prix soumis', null, totaux.ecartForfait, { fond: GRIS_PALE });
    refSousTotal = ligneTotal('Prix forfaitaire soumis', null, totaux.sousTotal,
      { gras: true, fond: GRIS_PALE });
  } else if (totaux.pourcentage > 0) {
    const refTravaux = ligneTotal('Total des travaux', formuleSousTotal, totaux.totalTravaux,
      { fond: GRIS_PALE });
    const refMaj = ligneTotal(
      `Administration et profit (${totaux.pourcentage.toLocaleString('fr-CA', { maximumFractionDigits: 3 })} %)`,
      `ROUND(${refTravaux}*${totaux.pourcentage}/100,2)`, totaux.majoration, { fond: GRIS_PALE }
    );
    refSousTotal = ligneTotal('Sous-total', `${refTravaux}+${refMaj}`, totaux.sousTotal,
      { gras: true, fond: GRIS_PALE });
  } else {
    refSousTotal = ligneTotal('Sous-total', formuleSousTotal, totaux.sousTotal,
      { gras: true, fond: GRIS_PALE });
  }
  ligneTotal(`TPS (${(totaux.tauxTps * 100).toLocaleString('fr-CA', { maximumFractionDigits: 3 })} %)`,
    `ROUND(${refSousTotal}*${totaux.tauxTps},2)`, totaux.tps);
  ligneTotal(`TVQ (${(totaux.tauxTvq * 100).toLocaleString('fr-CA', { maximumFractionDigits: 3 })} %)`,
    `ROUND(${refSousTotal}*${totaux.tauxTvq},2)`, totaux.tvq);
  ligneTotal(g.libelleTotal,
    `${refSousTotal}+E${r - 2}+E${r - 1}`, totaux.total,
    { gras: true, grand: true, fond: NAVY, blanc: true });

  if (g.signe < 0) {
    fusion(r, 1, 5);
    ws.getCell(r, 1).value = 'Montant à déduire du contrat.';
    ws.getCell(r, 1).font = { bold: true, size: 10, color: { argb: ROUGE }, name: 'Calibri' };
    ws.getCell(r, 1).alignment = { horizontal: 'right' };
    r += 1;
  }

  // ---- les blocs libres qui vont APRES les totaux ----
  r += 1;
  r = ecrireBlocs(ws, r, blocsDe(extra.blocs, 'apres'), { FMT, fusion, remplir }).ligne;

  r += 2;
  fusion(r, 1, 5);
  ws.getCell(r, 1).value = 'Les Entreprises PEP2000 inc.'
    + (extra.afficher_soumis_par && extra.soumis_par ? ` — soumis par ${extra.soumis_par}` : '')
    + `  ·  généré le ${new Date().toLocaleDateString('fr-CA')}`;
  ws.getCell(r, 1).font = { italic: true, size: 9, color: { argb: 'FF6B7488' }, name: 'Calibri' };

  const buffer = await wb.xlsx.writeBuffer();
  telecharger(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    nomFichier(extra, 'xlsx')
  );
  return { manquantes: resolu.manquantes };
}

// ===========================================================================
// PDF
// ===========================================================================
export async function exporterPdf({ extra, lignes, totaux, projet, telechargerImage }) {
  const { pdf } = await import('@react-pdf/renderer');
  const { default: ExtraPdf } = await import('../../components/extras/ExtraPdf');
  const React = (await import('react')).default;
  const logoDataUrl = await chargerLogo(LOGO_PEP);
  const { blocs, manquantes } = await resoudreImages(extra.blocs, telechargerImage);
  const blob = await pdf(
    React.createElement(ExtraPdf, { extra: { ...extra, blocs }, lignes, totaux, projet, logoDataUrl })
  ).toBlob();
  telecharger(blob, nomFichier(extra, 'pdf'));
  return { manquantes };
}

export { LOGO_PEP, LOGO_PEP_NOIR };

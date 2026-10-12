// ---------------------------------------------------------------------------
// PEPDAY — EXPORT EXCEL
//
// Un seul exportateur pour tous les tableaux de l'app. ExcelJS est déjà une
// dépendance du Toolbox (Création d'un extra, Gain imposable); on le charge
// à la demande pour ne pas alourdir l'ouverture de l'app sur un cellulaire.
//
// feuilles = [{ nom, titre?, colonnes: [{ entete, cle, largeur?, format? }], lignes: [{}], total? }]
// format : 'argent' | 'nombre' | 'pct' | 'texte' (défaut)
// Les exports restent en Calibri, comme les autres exports du Toolbox.
// ---------------------------------------------------------------------------

const NAVY = 'FF14213D';
const FORMATS = {
  // Codes de format neutres : Excel affiche ensuite les séparateurs de la
  // langue de l'ordinateur (1 234,56 $ en français).
  argent: '#,##0.00 "$";[Red]-#,##0.00 "$"',
  nombre: '#,##0.00',
  pct: '0%',
};

function nomFeuille(nom) {
  return String(nom || 'Feuille').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31);
}

export async function exporterExcel(nomFichier, feuilles) {
  const ExcelJS = (await import('exceljs')).default;
  const classeur = new ExcelJS.Workbook();
  classeur.creator = 'PEPday — Toolbox PEP';
  classeur.created = new Date();

  for (const f of feuilles) {
    const ws = classeur.addWorksheet(nomFeuille(f.nom));
    let rangee = 1;
    if (f.titre) {
      ws.getCell(1, 1).value = f.titre;
      ws.getCell(1, 1).font = { name: 'Calibri', size: 14, bold: true, color: { argb: NAVY } };
      if (f.sousTitre) {
        ws.getCell(2, 1).value = f.sousTitre;
        ws.getCell(2, 1).font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF6B7488' } };
      }
      rangee = f.sousTitre ? 4 : 3;
    }

    const entete = ws.getRow(rangee);
    f.colonnes.forEach((c, i) => {
      const cell = entete.getCell(i + 1);
      cell.value = c.entete;
      cell.font = { name: 'Calibri', bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
      cell.alignment = { vertical: 'middle', wrapText: true };
      ws.getColumn(i + 1).width = c.largeur || Math.max(12, Math.min(45, String(c.entete).length + 4));
    });
    entete.height = 22;
    ws.views = [{ state: 'frozen', ySplit: rangee }];

    const ecrire = (ligne, gras) => {
      rangee += 1;
      const r = ws.getRow(rangee);
      f.colonnes.forEach((c, i) => {
        const cell = r.getCell(i + 1);
        const v = ligne[c.cle];
        cell.value = v == null || v === '' ? null : v;
        cell.font = { name: 'Calibri', bold: Boolean(gras) };
        if (FORMATS[c.format]) cell.numFmt = FORMATS[c.format];
      });
    };
    (f.lignes || []).forEach((l) => ecrire(l, false));
    if (f.total) {
      ecrire(f.total, true);
      ws.getRow(rangee).eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8ECF0' } }; });
    }
    ws.autoFilter = { from: { row: f.titre ? (f.sousTitre ? 4 : 3) : 1, column: 1 }, to: { row: rangee, column: f.colonnes.length } };
  }

  const tampon = await classeur.xlsx.writeBuffer();
  const blob = new Blob([tampon], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomFichier.endsWith('.xlsx') ? nomFichier : `${nomFichier}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

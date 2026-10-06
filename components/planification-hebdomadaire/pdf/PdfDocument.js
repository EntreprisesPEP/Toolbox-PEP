import { Document } from '@react-pdf/renderer';
import Meeting1Pdf from './Meeting1Pdf';
import Meeting2Pdf from './Meeting2Pdf';
import TerminesPdf from './TerminesPdf';
import AdminPdf from './AdminPdf';
import CoupesPdf from './CoupesPdf';
import VacancesPdf from './VacancesPdf';

// `format` : 'lettre' (defaut) ou 'tabloide'. Les deux font 792 pt de large,
// donc toutes les colonnes sont identiques — seule la hauteur de feuille
// change. Voir pdfStyles.js.
export default function PdfDocument({ selection, board, format }) {
  return (
    <Document title="Planification Hebdomadaire - PEP2000">
      {selection.includes('admin') && <AdminPdf board={board} format={format} />}
      {selection.includes('1') && <Meeting1Pdf board={board} format={format} />}
      {selection.includes('2') && <Meeting2Pdf board={board} format={format} />}
      {selection.includes('3') && <TerminesPdf board={board} format={format} />}
      {selection.includes('coupes') && <CoupesPdf board={board} format={format} />}
      {selection.includes('vacances') && <VacancesPdf board={board} format={format} />}
    </Document>
  );
}

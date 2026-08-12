import { Document } from '@react-pdf/renderer';
import Meeting1Pdf from './Meeting1Pdf';
import Meeting2Pdf from './Meeting2Pdf';
import TerminesPdf from './TerminesPdf';
import AdminPdf from './AdminPdf';

export default function PdfDocument({ selection, board }) {
  return (
    <Document title="Planification Hebdomadaire - PEP2000">
      {selection.includes('admin') && <AdminPdf board={board} />}
      {selection.includes('1') && <Meeting1Pdf board={board} />}
      {selection.includes('2') && <Meeting2Pdf board={board} />}
      {selection.includes('3') && <TerminesPdf board={board} />}
    </Document>
  );
}

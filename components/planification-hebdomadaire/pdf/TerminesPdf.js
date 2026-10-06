import { Page, Text } from '@react-pdf/renderer';
import { pdfStyles, taillePage } from '../../../lib/planification-hebdomadaire/pdfStyles';
import { PdfHeader, PdfFooter } from './PdfChrome';
import TableauProjets from './TableauProjets';

export default function TerminesPdf({ board, format }) {
  const termines = board.projects.filter((p) => p.statut === 'Termine');
  return (
    <Page size={taillePage(format)} style={pdfStyles.page}>
      <PdfHeader title="Projets terminés" subtitle={`${termines.length} projet${termines.length > 1 ? 's' : ''} au dossier`} />
      <TableauProjets projets={termines} vide="Aucun projet terminé pour le moment." />
      <Text style={pdfStyles.note}>
        S1 / S2 : besoin d’une équipe en semaine 1 / semaine 2. Une case vide veut dire non.
      </Text>
      <PdfFooter mention="Projets terminés" />
    </Page>
  );
}

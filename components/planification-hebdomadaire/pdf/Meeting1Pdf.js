import { Page, Text } from '@react-pdf/renderer';
import { pdfStyles, taillePage } from '../../../lib/planification-hebdomadaire/pdfStyles';
import { mondayOf, today, fmtIntervalle, dateKey } from '../../../lib/planification-hebdomadaire/dates';
import { PdfHeader, PdfFooter } from './PdfChrome';
import TableauProjets from './TableauProjets';

export default function Meeting1Pdf({ board, format }) {
  const actifs = board.projects.filter((p) => p.statut !== 'Termine');

  // Le sous-titre portait la date d'impression — qu'on retrouve deja dans le
  // bandeau et le pied. Il porte maintenant la semaine couverte : une feuille
  // retrouvee sur un bureau dit a quelle semaine elle appartient.
  const lundi = mondayOf(new Date((board.settings?.range_start || dateKey(today())) + 'T00:00:00'));
  const dimanche = new Date(lundi);
  dimanche.setDate(dimanche.getDate() + 6);

  return (
    <Page size={taillePage(format)} style={pdfStyles.page}>
      <PdfHeader title="Meeting 1 — Suivi des projets" subtitle={`Semaine du ${fmtIntervalle(lundi, dimanche)}`} />
      <TableauProjets projets={actifs} vide="Aucun projet actif." />
      <Text style={pdfStyles.note}>
        S1 / S2 : besoin d’une équipe en semaine 1 / semaine 2. Une case vide veut dire non.
      </Text>
      <PdfFooter mention="Meeting 1 — Suivi des projets" />
    </Page>
  );
}

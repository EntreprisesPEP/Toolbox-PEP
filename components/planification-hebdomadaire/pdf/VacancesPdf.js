import { Page, View, Text } from '@react-pdf/renderer';
import { pdfStyles } from '../../../lib/planification-hebdomadaire/pdfStyles';
import { formatDateFr, joursOuvrables } from '../../../lib/planification-hebdomadaire/dates';
import { PdfHeader, PdfFooter } from './PdfChrome';

// Revision 72. La somme des largeurs fait 100.
const COLS = [22, 22, 13, 13, 8, 22];

export default function VacancesPdf({ board }) {
  const { vacances } = board;
  const total = vacances.reduce((t, v) => t + (joursOuvrables(v.date_debut, v.date_fin) || 0), 0);

  return (
    <Page size={[792, 1224]} style={pdfStyles.page}>
      <PdfHeader title="Vacances / Conges" fixed />

      <View style={pdfStyles.table}>
        <View style={pdfStyles.row}>
          <Text style={[pdfStyles.th, { width: `${COLS[0]}%` }]}>Nom</Text>
          <Text style={[pdfStyles.th, { width: `${COLS[1]}%` }]}>Titre</Text>
          <Text style={[pdfStyles.th, { width: `${COLS[2]}%` }]}>Debut</Text>
          <Text style={[pdfStyles.th, { width: `${COLS[3]}%` }]}>Fin</Text>
          <Text style={[pdfStyles.th, { width: `${COLS[4]}%`, textAlign: 'right' }]}>Jours</Text>
          <Text style={[pdfStyles.th, { width: `${COLS[5]}%` }]}>Commentaire</Text>
        </View>

        {vacances.length === 0 && (
          <Text style={[pdfStyles.td, { padding: 8, textAlign: 'center' }]}>Aucune absence inscrite.</Text>
        )}
        {vacances.map((v) => {
          const jours = joursOuvrables(v.date_debut, v.date_fin);
          return (
            <View key={v.id} style={pdfStyles.row} wrap={false}>
              <Text style={[pdfStyles.tdBold, { width: `${COLS[0]}%` }]}>{v.nom || ''}</Text>
              <Text style={[pdfStyles.td, { width: `${COLS[1]}%` }]}>{v.titre || ''}</Text>
              <Text style={[pdfStyles.td, { width: `${COLS[2]}%` }]}>{v.date_debut ? formatDateFr(v.date_debut) : ''}</Text>
              <Text style={[pdfStyles.td, { width: `${COLS[3]}%` }]}>{v.date_fin ? formatDateFr(v.date_fin) : ''}</Text>
              <Text style={[pdfStyles.tdBold, { width: `${COLS[4]}%`, textAlign: 'right' }]}>{jours === null ? '' : jours}</Text>
              <Text style={[pdfStyles.td, { width: `${COLS[5]}%` }]}>{v.commentaire || ''}</Text>
            </View>
          );
        })}

        {vacances.length > 0 && (
          <View style={pdfStyles.row} wrap={false}>
            <Text style={[pdfStyles.tdBold, { width: `${COLS[0] + COLS[1] + COLS[2] + COLS[3]}%` }]}>Total</Text>
            <Text style={[pdfStyles.tdBold, { width: `${COLS[4]}%`, textAlign: 'right' }]}>{total}</Text>
            <Text style={[pdfStyles.td, { width: `${COLS[5]}%` }]}>jours ouvrables (lun-ven, feries non deduits)</Text>
          </View>
        )}
      </View>

      <PdfFooter fixed />
    </Page>
  );
}

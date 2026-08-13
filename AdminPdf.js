import { Page, View, Text } from '@react-pdf/renderer';
import { pdfStyles } from '../../../lib/planification-hebdomadaire/pdfStyles';
import { PdfHeader, PdfFooter } from './PdfChrome';

const COLS = [15, 45, 20, 20];

export default function AdminPdf({ board }) {
  return (
    <Page size={[792, 1224]} style={pdfStyles.page}>
      <PdfHeader title="Admin projets" fixed />

      <View style={pdfStyles.table}>
        <View style={pdfStyles.row}>
          <Text style={[pdfStyles.th, { width: `${COLS[0]}%` }]}>No</Text>
          <Text style={[pdfStyles.th, { width: `${COLS[1]}%` }]}>Projet</Text>
          <Text style={[pdfStyles.th, { width: `${COLS[2]}%` }]}>Charge</Text>
          <Text style={[pdfStyles.th, { width: `${COLS[3]}%` }]}>Surintendant</Text>
        </View>
        {board.projects.map((p) => (
          <View key={p.id} style={pdfStyles.row} wrap={false}>
            <Text style={[pdfStyles.td, { width: `${COLS[0]}%` }]}>{p.no}</Text>
            <Text style={[pdfStyles.tdBold, { width: `${COLS[1]}%` }]}>{p.projet}</Text>
            <Text style={[pdfStyles.td, { width: `${COLS[2]}%` }]}>{p.charge}</Text>
            <Text style={[pdfStyles.td, { width: `${COLS[3]}%` }]}>{p.surintendant}</Text>
          </View>
        ))}
      </View>

      <PdfFooter fixed />
    </Page>
  );
}

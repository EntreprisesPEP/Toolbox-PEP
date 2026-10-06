import { Page, View, Text } from '@react-pdf/renderer';
import { pdfStyles, taillePage, ZEBRA } from '../../../lib/planification-hebdomadaire/pdfStyles';
import { PdfHeader, PdfFooter, TableHead } from './PdfChrome';

// Somme = 100.
const COLS = [8, 38, 27, 27];

export default function AdminPdf({ board, format }) {
  const { projects } = board;
  return (
    <Page size={taillePage(format)} style={pdfStyles.page}>
      <PdfHeader title="Admin — Liste des projets" subtitle={`${projects.length} projet${projects.length > 1 ? 's' : ''} au tableau`} />

      <View style={pdfStyles.table}>
        <TableHead>
          <Text style={[pdfStyles.th, { width: `${COLS[0]}%` }]}>No</Text>
          <Text style={[pdfStyles.th, { width: `${COLS[1]}%` }]}>Projet</Text>
          <Text style={[pdfStyles.th, { width: `${COLS[2]}%` }]}>Chargé de projet</Text>
          <Text style={[pdfStyles.th, { width: `${COLS[3]}%` }]}>Surintendant</Text>
        </TableHead>

        {projects.length === 0 && <Text style={pdfStyles.empty}>Aucun projet au tableau.</Text>}

        {projects.map((p, i) => (
          <View key={p.id} style={[pdfStyles.row, i % 2 === 1 ? { backgroundColor: ZEBRA } : {}]} wrap={false}>
            <Text style={[pdfStyles.tdBold, { width: `${COLS[0]}%` }]}>{p.no}</Text>
            <Text style={[pdfStyles.tdBold, { width: `${COLS[1]}%` }]}>{p.projet}</Text>
            <Text style={[pdfStyles.td, { width: `${COLS[2]}%` }]}>{p.charge || ''}</Text>
            <Text style={[pdfStyles.td, { width: `${COLS[3]}%` }]}>{p.surintendant || ''}</Text>
          </View>
        ))}
      </View>

      <PdfFooter mention="Admin — Liste des projets" />
    </Page>
  );
}

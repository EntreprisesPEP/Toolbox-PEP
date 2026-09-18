import { Page, View, Text } from '@react-pdf/renderer';
import { pdfStyles } from '../../../lib/planification-hebdomadaire/pdfStyles';
import { statusColor } from '../../../lib/planification-hebdomadaire/statusColors';
import { formatDateFr, fmtDateLong } from '../../../lib/planification-hebdomadaire/dates';
import { PdfHeader, PdfFooter } from './PdfChrome';

// Revision 56 : Statut, Charge et Surintendant sur UNE seule ligne, comme a
// l ecran. « Date - 30 septembre 2026 » ne tenait pas dans 12 % et se coupait
// avant « 2026 » ; les noms complets ne laissaient que 5 pt de marge dans 10 %.
// La largeur reprise vient de Commentaire, seule colonne qui s enroule sans nuire.
const COLS = [16, 16, 35, 5, 5, 11.5, 11.5]; // No/Projet, Statut, Commentaire, Sem1, Sem2, Charge, Surintendant

function statutLabel(p) {
  if (p.statut === 'Date' && p.date_valeur) return `Date - ${formatDateFr(p.date_valeur)}`;
  return p.statut;
}

export default function Meeting1Pdf({ board }) {
  const active = board.projects.filter((p) => p.statut !== 'Termine');
  const subtitle = fmtDateLong(new Date());

  return (
    <Page size={[792, 1224]} style={pdfStyles.page}>
      <PdfHeader title="Meeting 1 - Suivi projets" subtitle={subtitle} fixed />

      <View style={pdfStyles.table}>
        <View style={pdfStyles.row}>
          <Text style={[pdfStyles.th, { width: `${COLS[0]}%` }]}>No / Projet</Text>
          <Text style={[pdfStyles.th, { width: `${COLS[1]}%` }]}>Statut</Text>
          <Text style={[pdfStyles.th, { width: `${COLS[2]}%` }]}>Commentaire</Text>
          <Text style={[pdfStyles.th, { width: `${COLS[3]}%`, textAlign: 'right' }]}>Sem 1</Text>
          <Text style={[pdfStyles.th, { width: `${COLS[4]}%`, textAlign: 'right' }]}>Sem 2</Text>
          <Text style={[pdfStyles.th, { width: `${COLS[5]}%` }]}>Charge</Text>
          <Text style={[pdfStyles.th, { width: `${COLS[6]}%` }]}>Surintendant</Text>
        </View>

        {active.map((p) => {
          const col = statusColor(p.statut, 'jour');
          const rowStyle = col ? { backgroundColor: col.bg } : {};
          return (
            <View key={p.id} style={[pdfStyles.row, rowStyle]} wrap={false}>
              <Text style={[pdfStyles.tdBold, { width: `${COLS[0]}%` }]}>{p.no} {p.projet}</Text>
              <Text style={[pdfStyles.td, { width: `${COLS[1]}%` }]}>{statutLabel(p)}</Text>
              <Text style={[pdfStyles.td, { width: `${COLS[2]}%` }]}>{p.commentaire || ''}</Text>
              <Text style={[pdfStyles.td, { width: `${COLS[3]}%`, textAlign: 'right' }]}>{p.s1 ? 'OUI' : 'NON'}</Text>
              <Text style={[pdfStyles.td, { width: `${COLS[4]}%`, textAlign: 'right' }]}>{p.s2 ? 'OUI' : 'NON'}</Text>
              <Text style={[pdfStyles.td, { width: `${COLS[5]}%` }]}>{p.charge}</Text>
              <Text style={[pdfStyles.td, { width: `${COLS[6]}%` }]}>{p.surintendant}</Text>
            </View>
          );
        })}
      </View>

      <PdfFooter fixed />
    </Page>
  );
}

import { Page, View, Text } from '@react-pdf/renderer';
import { pdfStyles } from '../../../lib/planification-hebdomadaire/pdfStyles';
import { formatDateFr } from '../../../lib/planification-hebdomadaire/dates';
import { PdfHeader, PdfFooter } from './PdfChrome';

// Revision 72. Memes largeurs en pourcentage que les autres pages : la somme
// fait 100, sinon react-pdf laisse une bande vide a droite.
// Les trois colonnes de permis ont ete elargies de 7 a 8,5 % : a 7 %,
// react-pdf coupait « Permis occup. » en « PERMIS OC- / CUP. » au milieu du
// mot. La somme fait toujours 100.
const COLS = [18, 9, 11, 8.5, 8.5, 8.5, 10.5, 6, 10, 10];

const PERCEMENT = { oui: 'Coordonne', non: 'NON coordonne' };

export default function CoupesPdf({ board }) {
  const { coupes, projects } = board;
  const parId = new Map(projects.map((p) => [String(p.id), p]));

  return (
    <Page size={[792, 1224]} style={pdfStyles.page}>
      <PdfHeader title="Coupe de rue" fixed />

      <View style={pdfStyles.table}>
        <View style={pdfStyles.row}>
          <Text style={[pdfStyles.th, { width: `${COLS[0]}%` }]}>No / Projet</Text>
          <Text style={[pdfStyles.th, { width: `${COLS[1]}%` }]}>Date exacte</Text>
          <Text style={[pdfStyles.th, { width: `${COLS[2]}%` }]}>Date approx.</Text>
          <Text style={[pdfStyles.th, { width: `${COLS[3]}%`, textAlign: 'center' }]}>Permis coupe</Text>
          <Text style={[pdfStyles.th, { width: `${COLS[4]}%`, textAlign: 'center' }]}>Plan signal.</Text>
          <Text style={[pdfStyles.th, { width: `${COLS[5]}%`, textAlign: 'center' }]}>Occupation</Text>
          <Text style={[pdfStyles.th, { width: `${COLS[6]}%` }]}>Percement</Text>
          <Text style={[pdfStyles.th, { width: `${COLS[7]}%`, textAlign: 'center' }]}>Pret</Text>
          <Text style={[pdfStyles.th, { width: `${COLS[8]}%` }]}>Charge</Text>
          <Text style={[pdfStyles.th, { width: `${COLS[9]}%` }]}>Surintendant</Text>
        </View>

        {coupes.length === 0 && (
          <Text style={[pdfStyles.td, { padding: 8, textAlign: 'center' }]}>Aucune coupe de rue au suivi.</Text>
        )}
        {coupes.map((c) => {
          const p = parId.get(String(c.project_id));
          const pret = c.permis_coupe && c.plan_signalisation && c.permis_occupation;
          return (
            <View key={c.id} style={pdfStyles.row} wrap={false}>
              <Text style={[pdfStyles.tdBold, { width: `${COLS[0]}%` }]}>{p ? `${p.no} ${p.projet}` : 'Projet retire'}</Text>
              <Text style={[pdfStyles.td, { width: `${COLS[1]}%` }]}>{c.date_exacte ? formatDateFr(c.date_exacte) : ''}</Text>
              <Text style={[pdfStyles.td, { width: `${COLS[2]}%` }]}>{c.date_approx || ''}</Text>
              <Text style={[pdfStyles.td, { width: `${COLS[3]}%`, textAlign: 'center' }]}>{c.permis_coupe ? 'OUI' : 'NON'}</Text>
              <Text style={[pdfStyles.td, { width: `${COLS[4]}%`, textAlign: 'center' }]}>{c.plan_signalisation ? 'OUI' : 'NON'}</Text>
              <Text style={[pdfStyles.td, { width: `${COLS[5]}%`, textAlign: 'center' }]}>{c.permis_occupation ? 'OUI' : 'NON'}</Text>
              <Text style={[pdfStyles.td, { width: `${COLS[6]}%` }]}>{PERCEMENT[c.percement] || ''}</Text>
              <Text style={[pdfStyles.tdBold, { width: `${COLS[7]}%`, textAlign: 'center' }]}>{pret ? 'PRET' : ''}</Text>
              <Text style={[pdfStyles.td, { width: `${COLS[8]}%` }]}>{p?.charge || ''}</Text>
              <Text style={[pdfStyles.td, { width: `${COLS[9]}%` }]}>{p?.surintendant || ''}</Text>
            </View>
          );
        })}
      </View>

      <PdfFooter fixed />
    </Page>
  );
}

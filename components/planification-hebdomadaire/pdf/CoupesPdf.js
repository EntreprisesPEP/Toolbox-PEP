import { Page, View, Text } from '@react-pdf/renderer';
import { pdfStyles, taillePage, ZEBRA } from '../../../lib/planification-hebdomadaire/pdfStyles';
import { formatDateFr } from '../../../lib/planification-hebdomadaire/dates';
import { PdfHeader, PdfFooter, TableHead } from './PdfChrome';

// ---------------------------------------------------------------------------
// COUPE DE RUE — refonte revision 73
//
// Les trois colonnes de permis affichaient OUI ou NON. Une colonne pleine de
// NON cache les OUI : seul le OUI s'imprime maintenant, une case vide veut
// dire que le document manque. Un sur-en-tete « Documents requis » les coiffe
// pour qu'on voie d'un coup d'oeil ce qui compose « Pret ».
//
// Somme des largeurs = 100.
// ---------------------------------------------------------------------------
// Depuis qu'on a coupe la cesure, un mot d'en-tete plus large que sa colonne
// deborde sur la voisine au lieu de se couper : « PERMIS D'OCCUPATION » et
// « PLAN DE SIGNALISATION » se chevauchaient. Les trois colonnes de permis
// portent donc le mot distinctif seul — « Documents requis » au-dessus dit de
// quoi il s'agit. Somme = 100.
const C = {
  no: 5, projet: 14.5, exacte: 10.5, approx: 9,
  coupe: 6.5, signal: 9.5, occupation: 8.5,
  percement: 10, pret: 5, charge: 10, surint: 11.5,
};
const GROUPE_AVANT = C.no + C.projet + C.exacte + C.approx;
const GROUPE = C.coupe + C.signal + C.occupation;
const GROUPE_APRES = C.percement + C.pret + C.charge + C.surint;

const PERCEMENT = { oui: 'Coordonné', non: 'Non coordonné' };

function Oui({ actif, largeur }) {
  return (
    <Text style={[pdfStyles.td, pdfStyles.ctr, { width: `${largeur}%` }]}>
      {actif ? <Text style={pdfStyles.oui}>OUI</Text> : ''}
    </Text>
  );
}

export default function CoupesPdf({ board, format }) {
  const { coupes, projects } = board;
  const parId = new Map(projects.map((p) => [String(p.id), p]));
  const pretes = coupes.filter((c) => c.permis_coupe && c.plan_signalisation && c.permis_occupation).length;

  return (
    <Page size={taillePage(format)} style={pdfStyles.page}>
      <PdfHeader
        title="Coupe de rue"
        subtitle={`${coupes.length} coupe${coupes.length > 1 ? 's' : ''} au suivi · ${pretes} prête${pretes > 1 ? 's' : ''}`}
      />

      <View style={pdfStyles.table}>
        <View style={pdfStyles.row} fixed>
          <Text style={[pdfStyles.thGroup, { width: `${GROUPE_AVANT}%`, backgroundColor: '#FFFFFF', borderLeftWidth: 0, borderBottomWidth: 0 }]}> </Text>
          <Text style={[pdfStyles.thGroup, { width: `${GROUPE}%` }]}>Documents requis</Text>
          <Text style={[pdfStyles.thGroup, { width: `${GROUPE_APRES}%`, backgroundColor: '#FFFFFF', borderLeftWidth: 0, borderBottomWidth: 0 }]}> </Text>
        </View>

        <TableHead>
          <Text style={[pdfStyles.th, { width: `${C.no}%` }]}>No</Text>
          <Text style={[pdfStyles.th, { width: `${C.projet}%` }]}>Projet</Text>
          <Text style={[pdfStyles.th, { width: `${C.exacte}%` }]}>Date exacte</Text>
          <Text style={[pdfStyles.th, { width: `${C.approx}%` }]}>Date approx.</Text>
          <Text style={[pdfStyles.th, pdfStyles.ctr, { width: `${C.coupe}%` }]}>Coupe</Text>
          <Text style={[pdfStyles.th, pdfStyles.ctr, { width: `${C.signal}%` }]}>Signalisation</Text>
          <Text style={[pdfStyles.th, pdfStyles.ctr, { width: `${C.occupation}%` }]}>Occupation</Text>
          <Text style={[pdfStyles.th, { width: `${C.percement}%` }]}>Percement</Text>
          <Text style={[pdfStyles.th, pdfStyles.ctr, { width: `${C.pret}%` }]}>Prêt</Text>
          <Text style={[pdfStyles.th, { width: `${C.charge}%` }]}>Chargé</Text>
          <Text style={[pdfStyles.th, { width: `${C.surint}%` }]}>Surintendant</Text>
        </TableHead>

        {coupes.length === 0 && <Text style={pdfStyles.empty}>Aucune coupe de rue au suivi.</Text>}

        {coupes.map((c, i) => {
          const p = parId.get(String(c.project_id));
          const pret = c.permis_coupe && c.plan_signalisation && c.permis_occupation;
          return (
            <View key={c.id} style={[pdfStyles.row, i % 2 === 1 ? { backgroundColor: ZEBRA } : {}]} wrap={false}>
              <Text style={[pdfStyles.tdBold, { width: `${C.no}%` }]}>{p ? p.no : ''}</Text>
              <Text style={[pdfStyles.tdBold, { width: `${C.projet}%` }]}>
                {p ? p.projet : 'Projet retiré de la liste'}
              </Text>
              <Text style={[pdfStyles.td, { width: `${C.exacte}%` }]}>{c.date_exacte ? formatDateFr(c.date_exacte) : ''}</Text>
              <Text style={[pdfStyles.tdDim, { width: `${C.approx}%` }]}>{c.date_approx || ''}</Text>
              <Oui actif={c.permis_coupe} largeur={C.coupe} />
              <Oui actif={c.plan_signalisation} largeur={C.signal} />
              <Oui actif={c.permis_occupation} largeur={C.occupation} />
              <Text style={[pdfStyles.td, { width: `${C.percement}%` }]}>{PERCEMENT[c.percement] || ''}</Text>
              <Text style={[pdfStyles.td, pdfStyles.ctr, { width: `${C.pret}%` }]}>
                {pret ? <Text style={pdfStyles.pret}>PRÊT</Text> : ''}
              </Text>
              <Text style={[pdfStyles.td, { width: `${C.charge}%` }]}>{p?.charge || ''}</Text>
              <Text style={[pdfStyles.td, { width: `${C.surint}%` }]}>{p?.surintendant || ''}</Text>
            </View>
          );
        })}
      </View>

      <Text style={pdfStyles.note}>
        Documents requis : permis de coupe, plan de signalisation, permis d’occupation de la ville.
        Une case vide veut dire que le document n’est pas obtenu — une coupe est prête quand les trois
        le sont. « Percement » = percement sous pression. Le chargé et le surintendant sont ceux du projet.
      </Text>

      <PdfFooter mention="Coupe de rue" />
    </Page>
  );
}

import { View, Text } from '@react-pdf/renderer';
import { pdfStyles, ZEBRA } from '../../../lib/planification-hebdomadaire/pdfStyles';
import { formatDateFr } from '../../../lib/planification-hebdomadaire/dates';
import { libelleStatut } from '../../../lib/planification-hebdomadaire/statusColors';
import { TableHead } from './PdfChrome';

// ---------------------------------------------------------------------------
// Le tableau de projets, partage par Meeting 1 et Projets termines. Les deux
// feuilles avaient le meme tableau copie deux fois : une correction sur l'une
// ne suivait pas sur l'autre. Il n'y en a plus qu'un.
//
// Le numero de projet a sa propre colonne. Colle devant le nom, il se perdait
// dedans alors que c'est la premiere chose qu'on cherche du regard.
// Somme des largeurs = 100 (sinon react-pdf laisse une bande vide a droite).
// ---------------------------------------------------------------------------
const COLS = {
  no: 6.5,
  projet: 20,
  statut: 12,
  commentaire: 30.5,
  s1: 4,
  s2: 4,
  // 10,75 % laissait « Thomas Lawrence » passer a la ligne. Un nom propre
  // casse en deux se lit mal; la largeur vient du commentaire, seule colonne
  // qui s'enroule sans gener.
  charge: 11.5,
  surintendant: 11.5,
};

function Oui({ actif, largeur }) {
  return (
    <Text style={[pdfStyles.td, pdfStyles.ctr, { width: `${largeur}%` }]}>
      {actif ? <Text style={pdfStyles.oui}>OUI</Text> : ''}
    </Text>
  );
}

export default function TableauProjets({ projets, vide }) {
  return (
    <View style={pdfStyles.table}>
      <TableHead>
        <Text style={[pdfStyles.th, { width: `${COLS.no}%` }]}>No</Text>
        <Text style={[pdfStyles.th, { width: `${COLS.projet}%` }]}>Projet</Text>
        <Text style={[pdfStyles.th, { width: `${COLS.statut}%` }]}>Statut</Text>
        <Text style={[pdfStyles.th, { width: `${COLS.commentaire}%` }]}>Commentaire</Text>
        <Text style={[pdfStyles.th, pdfStyles.ctr, { width: `${COLS.s1}%` }]}>S1</Text>
        <Text style={[pdfStyles.th, pdfStyles.ctr, { width: `${COLS.s2}%` }]}>S2</Text>
        <Text style={[pdfStyles.th, { width: `${COLS.charge}%` }]}>Chargé</Text>
        <Text style={[pdfStyles.th, { width: `${COLS.surintendant}%` }]}>Surintendant</Text>
      </TableHead>

      {projets.length === 0 && <Text style={pdfStyles.empty}>{vide}</Text>}

      {projets.map((p, i) => (
        <View
          key={p.id}
          style={[pdfStyles.row, i % 2 === 1 ? { backgroundColor: ZEBRA } : {}]}
          wrap={false}
        >
          <Text style={[pdfStyles.tdBold, { width: `${COLS.no}%` }]}>{p.no}</Text>
          <Text style={[pdfStyles.tdBold, { width: `${COLS.projet}%` }]}>{p.projet}</Text>

          {/* Statut sur deux niveaux : le mot, puis la date en dessous quand il
              y en a une. « Date - 19 octobre 2026 » sur une seule ligne forcait
              une colonne large pour une information qui tient en dessous. */}
          <View style={[pdfStyles.tdStack, { width: `${COLS.statut}%` }]}>
            <Text style={{ fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: '#1B2436' }}>
              {libelleStatut(p.statut)}
            </Text>
            {p.statut === 'Date' && p.date_valeur ? (
              <Text style={{ fontSize: 7.5, color: '#6B7280', marginTop: 1.5 }}>
                {formatDateFr(p.date_valeur)}
              </Text>
            ) : null}
          </View>

          <Text style={[pdfStyles.td, { width: `${COLS.commentaire}%` }]}>{p.commentaire || ''}</Text>
          <Oui actif={p.s1} largeur={COLS.s1} />
          <Oui actif={p.s2} largeur={COLS.s2} />
          <Text style={[pdfStyles.td, { width: `${COLS.charge}%` }]}>{p.charge || ''}</Text>
          <Text style={[pdfStyles.td, { width: `${COLS.surintendant}%` }]}>{p.surintendant || ''}</Text>
        </View>
      ))}
    </View>
  );
}

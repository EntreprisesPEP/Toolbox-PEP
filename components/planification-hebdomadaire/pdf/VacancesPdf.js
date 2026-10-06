import { Page, View, Text } from '@react-pdf/renderer';
import { pdfStyles, taillePage, ZEBRA } from '../../../lib/planification-hebdomadaire/pdfStyles';
import { formatDateFr, joursOuvrables } from '../../../lib/planification-hebdomadaire/dates';
import { PdfHeader, PdfFooter, TableHead } from './PdfChrome';

// Somme = 100.
const C = { nom: 18, titre: 20, debut: 12, fin: 12, jours: 7, commentaire: 31 };

export default function VacancesPdf({ board, format }) {
  // Trie par date de debut pour l'impression : a l'ecran on veut l'ordre de
  // saisie (on retrouve ce qu'on vient d'ajouter), sur papier on veut savoir
  // qui part en premier.
  const vacances = [...board.vacances].sort((a, b) => (a.date_debut || '9999').localeCompare(b.date_debut || '9999'));
  const total = vacances.reduce((t, v) => t + (joursOuvrables(v.date_debut, v.date_fin) || 0), 0);

  return (
    <Page size={taillePage(format)} style={pdfStyles.page}>
      <PdfHeader
        title="Vacances / Congés"
        subtitle={`${vacances.length} absence${vacances.length > 1 ? 's' : ''} inscrite${vacances.length > 1 ? 's' : ''}`}
      />

      <View style={pdfStyles.table}>
        <TableHead>
          <Text style={[pdfStyles.th, { width: `${C.nom}%` }]}>Nom</Text>
          <Text style={[pdfStyles.th, { width: `${C.titre}%` }]}>Titre</Text>
          <Text style={[pdfStyles.th, { width: `${C.debut}%` }]}>Début</Text>
          <Text style={[pdfStyles.th, { width: `${C.fin}%` }]}>Fin</Text>
          <Text style={[pdfStyles.th, pdfStyles.ctr, { width: `${C.jours}%` }]}>Jours</Text>
          <Text style={[pdfStyles.th, { width: `${C.commentaire}%` }]}>Commentaire</Text>
        </TableHead>

        {vacances.length === 0 && <Text style={pdfStyles.empty}>Aucune absence inscrite.</Text>}

        {vacances.map((v, i) => {
          const jours = joursOuvrables(v.date_debut, v.date_fin);
          return (
            <View key={v.id} style={[pdfStyles.row, i % 2 === 1 ? { backgroundColor: ZEBRA } : {}]} wrap={false}>
              <Text style={[pdfStyles.tdBold, { width: `${C.nom}%` }]}>{v.nom || ''}</Text>
              <Text style={[pdfStyles.tdDim, { width: `${C.titre}%` }]}>{v.titre || ''}</Text>
              <Text style={[pdfStyles.td, { width: `${C.debut}%` }]}>{v.date_debut ? formatDateFr(v.date_debut) : ''}</Text>
              <Text style={[pdfStyles.td, { width: `${C.fin}%` }]}>{v.date_fin ? formatDateFr(v.date_fin) : ''}</Text>
              <Text style={[pdfStyles.tdBold, pdfStyles.ctr, { width: `${C.jours}%` }]}>{jours === null ? '' : jours}</Text>
              <Text style={[pdfStyles.td, { width: `${C.commentaire}%` }]}>{v.commentaire || ''}</Text>
            </View>
          );
        })}

        {vacances.length > 0 && (
          <View style={pdfStyles.totalRow} wrap={false}>
            <Text style={[pdfStyles.tdBold, { width: `${C.nom + C.titre + C.debut + C.fin}%` }]}>Total</Text>
            <Text style={[pdfStyles.tdBold, pdfStyles.ctr, { width: `${C.jours}%` }]}>{total}</Text>
            <Text style={[pdfStyles.tdDim, { width: `${C.commentaire}%` }]}>jours ouvrables</Text>
          </View>
        )}
      </View>

      <Text style={pdfStyles.note}>
        Les jours sont comptés du lundi au vendredi, bornes incluses. Les jours fériés
        ne sont pas déduits.
      </Text>

      <PdfFooter mention="Vacances / Congés" />
    </Page>
  );
}

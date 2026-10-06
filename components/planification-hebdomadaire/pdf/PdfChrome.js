import { View, Text, Image } from '@react-pdf/renderer';
import { pdfStyles } from '../../../lib/planification-hebdomadaire/pdfStyles';
import { fmtDateLong } from '../../../lib/planification-hebdomadaire/dates';

// Le bandeau et le pied sont `fixed` : ils se redessinent sur chaque page
// quand un tableau deborde. Avant, une deuxieme page sortait nue, sans titre
// ni date — on ne savait plus de quelle feuille elle venait.

export function PdfHeader({ title, subtitle }) {
  return (
    <View style={pdfStyles.header} fixed>
      <Image src="/_static/planification-hebdomadaire/logo-pep.png" style={pdfStyles.logo} />
      <View>
        <Text style={pdfStyles.headerTitle}>{title}</Text>
        {subtitle ? <Text style={pdfStyles.headerSubtitle}>{subtitle}</Text> : null}
      </View>
      <View style={pdfStyles.headerRight}>
        <Text style={pdfStyles.headerBrand}>LES ENTREPRISES PEP2000</Text>
        <Text style={pdfStyles.headerDate}>Généré le {fmtDateLong(new Date())}</Text>
      </View>
    </View>
  );
}

export function PdfFooter({ mention }) {
  return (
    <View style={pdfStyles.footer} fixed>
      <Text style={pdfStyles.footerText}>
        {mention || 'Planification hebdomadaire — Toolbox PEP'}
      </Text>
      <Text
        style={pdfStyles.footerText}
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`}
      />
    </View>
  );
}

// L'en-tete d'un tableau est `fixed` lui aussi : si la liste des projets passe
// sur une deuxieme page, les titres de colonnes repartent avec elle.
export function TableHead({ children }) {
  return <View style={pdfStyles.row} fixed>{children}</View>;
}

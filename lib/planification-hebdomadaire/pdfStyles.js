import { StyleSheet, Font } from '@react-pdf/renderer';

// ---------------------------------------------------------------------------
// STYLES DU PDF — refonte revision 73
//
// Trois choses changent par rapport aux revisions precedentes :
//
// 1. FORMAT LETTRE. C'etait du 11x17 (792x1224 pt). Personne n'a de 11x17 au
//    bureau, et surtout : Meeting 1 remplissait 15 % de sa feuille, Meeting 2
//    40 %. On imprimait du vide. Tout passe en lettre paysage — 8,5x11 — une
//    seule orientation pour toutes les feuilles, donc une liasse qui s'agrafe.
//
// 2. CORPS DE TEXTE LISIBLE. 7,5 pt sur une feuille de 17 pouces, c'etait
//    minuscule. Sur lettre, 8,5 pt occupe presque le double de la largeur
//    relative de la page.
//
// 3. PAS DE CESURE. react-pdf coupait « Terrebonne » en « Terre-bonne » et
//    « Occupation » en « Occu-pation ». Le correctif historique etait
//    d'elargir la colonne jusqu'a ce que le mot rentre — un pansement qui
//    recommence au prochain nom de rue un peu long. On desactive la cesure :
//    un mot trop large passe a la ligne en entier.
// ---------------------------------------------------------------------------

Font.registerHyphenationCallback((mot) => [mot]);

// ---------------------------------------------------------------------------
// DEUX FORMATS, UNE SEULE LARGEUR
//
// Lettre paysage (8,5x11) et tabloide portrait (11x17) font tous les deux
// 792 pt de large. Les colonnes sont donc IDENTIQUES d'un format a l'autre :
// seule la hauteur de la feuille change, donc seul le nombre de lignes par
// page change. Aucune largeur a recalculer, aucun risque qu'un format casse
// une mise en page validee sur l'autre.
//
// Lettre : s'imprime partout, 20 projets par feuille.
// Tabloide : demande une imprimante grand format, environ 55 projets par
// feuille — les 43 projets de PEP tiennent sur une seule.
// ---------------------------------------------------------------------------
export const PAGE_LETTRE = [792, 612];
export const PAGE_TABLOIDE = [792, 1224];

export function taillePage(format) {
  return format === 'tabloide' ? PAGE_TABLOIDE : PAGE_LETTRE;
}

// Compatibilite : l'ancien nom pointe sur le format par defaut.
export const PAGE = PAGE_LETTRE;

export const NAVY = '#14213D';
export const RED = '#C41230';
export const VERT = '#1F7A42';
export const LINE = '#C8CEDA'; // filets structurants (contour, separations)
export const LINE_SOFT = '#E6E9EF'; // filets entre les lignes du tableau
export const ZEBRA = '#EFF2F7'; // assez marque pour se voir a l'impression
export const WEEKEND_BG = '#EDEFF4';
export const WEEKEND_TH = '#E2E6EE';
export const INK = '#111827';
export const INK_DIM = '#6B7280';

const PAD_X = 26;

export const pdfStyles = StyleSheet.create({
  page: {
    paddingTop: 22,
    paddingHorizontal: PAD_X,
    paddingBottom: 38,
    fontFamily: 'Helvetica',
    backgroundColor: '#FFFFFF',
  },

  // --- Bandeau ------------------------------------------------------------
  header: {
    backgroundColor: NAVY,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginBottom: 12,
    borderBottomWidth: 3,
    borderBottomColor: RED,
  },
  logo: { width: 30, height: 30, marginRight: 11 },
  headerTitle: { color: '#FFFFFF', fontSize: 14.5, fontFamily: 'Helvetica-Bold' },
  headerSubtitle: { color: '#A9BCD9', fontSize: 8.5, marginTop: 2.5 },
  headerRight: { marginLeft: 'auto', alignItems: 'flex-end' },
  headerBrand: {
    color: '#FFFFFF', fontSize: 7.5, fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.8,
  },
  headerDate: { color: '#8FA4C6', fontSize: 7, marginTop: 2.5 },

  // --- Pied de page -------------------------------------------------------
  footer: {
    position: 'absolute', bottom: 16, left: PAD_X, right: PAD_X,
    flexDirection: 'row', justifyContent: 'space-between',
    borderTopWidth: 0.8, borderTopColor: LINE, paddingTop: 5,
  },
  footerText: { fontSize: 7, color: '#98A0AE' },

  // --- Titre de section (Semaine 1, Semaine 2...) --------------------------
  sectionRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 5 },
  sectionTitle: {
    fontSize: 10.5, fontFamily: 'Helvetica-Bold', color: NAVY,
    textTransform: 'uppercase', letterSpacing: 0.6,
  },
  sectionDates: { fontSize: 9, color: INK_DIM, marginLeft: 8 },

  // --- Tableau ------------------------------------------------------------
  table: { borderWidth: 0.6, borderColor: LINE },
  row: { flexDirection: 'row' },
  rowZebra: { flexDirection: 'row', backgroundColor: ZEBRA },

  th: {
    backgroundColor: '#E9EDF4',
    fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#3A4458',
    textTransform: 'uppercase', letterSpacing: 0.45,
    paddingVertical: 5, paddingHorizontal: 5,
    borderBottomWidth: 1.2, borderBottomColor: NAVY,
    borderLeftWidth: 0.5, borderLeftColor: '#D3D9E4',
  },
  // Sur-en-tete qui coiffe un groupe de colonnes (« Documents requis »).
  thGroup: {
    backgroundColor: '#F3F5F9',
    fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: INK_DIM,
    textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center',
    paddingVertical: 3, paddingHorizontal: 4,
    borderBottomWidth: 0.5, borderBottomColor: '#D3D9E4',
    borderLeftWidth: 0.5, borderLeftColor: '#D3D9E4',
  },

  td: {
    fontSize: 8.5, color: INK,
    paddingVertical: 4.5, paddingHorizontal: 5,
    borderBottomWidth: 0.5, borderBottomColor: LINE_SOFT,
    borderLeftWidth: 0.5, borderLeftColor: LINE_SOFT,
  },
  tdBold: {
    fontSize: 8.5, color: INK, fontFamily: 'Helvetica-Bold',
    paddingVertical: 4.5, paddingHorizontal: 5,
    borderBottomWidth: 0.5, borderBottomColor: LINE_SOFT,
    borderLeftWidth: 0.5, borderLeftColor: LINE_SOFT,
  },
  tdDim: {
    fontSize: 8, color: INK_DIM,
    paddingVertical: 4.5, paddingHorizontal: 5,
    borderBottomWidth: 0.5, borderBottomColor: LINE_SOFT,
    borderLeftWidth: 0.5, borderLeftColor: LINE_SOFT,
  },
  // Cellule qui contient plusieurs lignes de texte (statut + date).
  tdStack: {
    paddingVertical: 4, paddingHorizontal: 5,
    borderBottomWidth: 0.5, borderBottomColor: LINE_SOFT,
    borderLeftWidth: 0.5, borderLeftColor: LINE_SOFT,
  },

  ctr: { textAlign: 'center' },

  // Un « OUI » marque. Une case vide veut dire non : on n'imprime pas une
  // colonne de NON, qui fait du bruit et cache les vrais oui.
  oui: { fontFamily: 'Helvetica-Bold', color: NAVY, fontSize: 8.5 },
  pret: { fontFamily: 'Helvetica-Bold', color: VERT, fontSize: 8, letterSpacing: 0.3 },

  empty: {
    fontSize: 8.5, color: INK_DIM, padding: 14, textAlign: 'center',
    borderBottomWidth: 0.5, borderBottomColor: LINE_SOFT,
  },
  totalRow: { flexDirection: 'row', backgroundColor: '#E9EDF4' },
  note: { fontSize: 7.5, color: INK_DIM, marginTop: 7, fontStyle: 'italic' },
});

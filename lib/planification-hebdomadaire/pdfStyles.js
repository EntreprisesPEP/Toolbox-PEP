import { StyleSheet } from '@react-pdf/renderer';

export const NAVY = '#14213D';
export const RED = '#C41230';
export const LINE = '#D7DBE3';
export const INK = '#1B2436';
export const INK_DIM = '#6B7280';

export const pdfStyles = StyleSheet.create({
  page: { padding: 24, fontFamily: 'Helvetica', backgroundColor: '#FFFFFF' },
  header: {
    backgroundColor: NAVY, borderRadius: 6, padding: 10, flexDirection: 'row',
    alignItems: 'center', marginBottom: 10, gap: 10,
  },
  logo: { width: 32, height: 32 },
  headerTitle: { color: '#FFFFFF', fontSize: 14, fontFamily: 'Helvetica-Bold' },
  headerSubtitle: { color: '#AFC2E0', fontSize: 8, marginTop: 2 },
  footer: {
    position: 'absolute', bottom: 14, left: 24, right: 24, flexDirection: 'row',
    justifyContent: 'space-between', fontSize: 7, color: '#888888',
    borderTopWidth: 1, borderTopColor: LINE, paddingTop: 4,
  },
  sectionTitle: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 3, marginTop: 6 },
  table: { borderTopWidth: 1, borderTopColor: LINE },
  th: {
    backgroundColor: '#F3F5F8', fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: INK_DIM,
    textTransform: 'uppercase', padding: 3, borderBottomWidth: 1, borderBottomColor: LINE,
  },
  td: { fontSize: 7.5, color: INK, padding: 3, borderBottomWidth: 0.5, borderBottomColor: LINE },
  tdBold: { fontSize: 7.5, color: INK, padding: 3, fontFamily: 'Helvetica-Bold', borderBottomWidth: 0.5, borderBottomColor: LINE },
  row: { flexDirection: 'row' },
  chip: {
    fontSize: 6.5, fontFamily: 'Helvetica-Bold', textAlign: 'center', borderRadius: 3,
    paddingVertical: 1.5, marginHorizontal: 2,
  },
});

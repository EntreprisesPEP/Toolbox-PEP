import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import {
  CATEGORIES, formaterArgent, formaterQuantite, formaterPourcentage,
  totalLigneCents, ligneEstVide, enDollars, numeroAffiche,
  gabaritDe, estAffiche, blocsDe, totalTableauCents,
} from '../../lib/extras/calculs';

// ---------------------------------------------------------------------------
// LE PDF D'UN EXTRA
//
// C'est le document qui part chez le client. Il doit tenir debout tout seul :
// on doit pouvoir le lire six mois plus tard et savoir de quel projet il
// s'agit, ce qui a ete fait, qui l'a monte et combien ca coute — sans avoir
// a ouvrir l'app.
//
// Les taxes sont separees et le total est en evidence : c'est la premiere
// chose que le client cherche, et la premiere qu'il conteste si elle est
// ambigue.
//
// QUATRE GABARITS, UN SEUL SQUELETTE
// Le bandeau, les cases du haut, les taxes, le bas de page et l'entente sont
// les memes partout. Le gabarit decide de ce qui s'imprime :
//   tm         tout le detail
//   forfait    l'etendue et UN prix; le detail reste a l'interne
//   credit     les memes lignes, mais le document dit « a deduire »
//   sur_mesure ce qui est coche, plus les blocs libres
// ---------------------------------------------------------------------------

const NAVY = '#14213D';
const ROUGE = '#C41230';
const GRIS = '#6b7488';
const FILET = '#dde1ea';
const PALE = '#f2f4f8';

const s = StyleSheet.create({
  page: { paddingTop: 26, paddingBottom: 46, paddingHorizontal: 30, fontSize: 9, fontFamily: 'Helvetica', color: '#1a2035' },

  bandeauRouge: { height: 4, backgroundColor: ROUGE },
  entete: { backgroundColor: NAVY, flexDirection: 'row', alignItems: 'center', paddingVertical: 9, paddingHorizontal: 11, marginBottom: 10 },
  logo: { height: 36, width: 36, marginRight: 10, objectFit: 'contain' },
  enteteTitre: { color: '#ffffff', fontSize: 14, fontFamily: 'Helvetica-Bold', letterSpacing: 0.5 },
  enteteSous: { color: '#aec0f5', fontSize: 8, marginTop: 1.5 },
  enteteDroite: { marginLeft: 'auto', alignItems: 'flex-end' },
  numero: { color: '#ffffff', fontSize: 12.5, fontFamily: 'Helvetica-Bold' },
  numeroEtiq: { color: '#aec0f5', fontSize: 7, letterSpacing: 1, textTransform: 'uppercase' },

  // Les trois cases du haut. Serrees : chaque point gagne ici est un point de
  // plus pour les lignes de couts avant que la page deborde.
  blocs: { flexDirection: 'row', gap: 8, marginBottom: 9 },
  bloc: { flex: 1, borderWidth: 1, borderColor: FILET, borderRadius: 3, paddingVertical: 5, paddingHorizontal: 7 },
  blocTitre: { fontSize: 6.5, letterSpacing: 0.8, color: GRIS, textTransform: 'uppercase', fontFamily: 'Helvetica-Bold', marginBottom: 1.5 },
  blocTitreSuite: { marginTop: 5 },
  blocLigne: { fontSize: 8.5, lineHeight: 1.25 },
  blocFort: { fontSize: 9, fontFamily: 'Helvetica-Bold', lineHeight: 1.2 },

  sujetBloc: { borderLeftWidth: 3, borderLeftColor: ROUGE, paddingLeft: 8, marginBottom: 10 },
  sujetEtiq: { fontSize: 7, letterSpacing: 0.8, color: GRIS, textTransform: 'uppercase', fontFamily: 'Helvetica-Bold' },
  sujet: { fontSize: 12, fontFamily: 'Helvetica-Bold', marginTop: 1 },
  descr: { fontSize: 9, marginTop: 4, lineHeight: 1.4, color: '#333a4d' },

  catTitre: { backgroundColor: NAVY, color: '#ffffff', fontSize: 8.5, fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.6, textTransform: 'uppercase', paddingVertical: 4, paddingHorizontal: 6, marginTop: 8 },
  thRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: NAVY, paddingVertical: 3, paddingHorizontal: 6 },
  th: { fontSize: 7, letterSpacing: 0.5, color: GRIS, textTransform: 'uppercase', fontFamily: 'Helvetica-Bold' },
  tr: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: FILET, paddingVertical: 3.5, paddingHorizontal: 6 },
  trPaire: { backgroundColor: '#fafbfc' },
  cDesc: { width: '52%', paddingRight: 6 },
  cQte: { width: '11%', textAlign: 'right', paddingRight: 6 },
  cUnite: { width: '9%', paddingLeft: 2, color: GRIS },
  cPrix: { width: '14%', textAlign: 'right', paddingRight: 6 },
  cTotal: { width: '14%', textAlign: 'right' },
  note: { fontSize: 7.5, color: GRIS, marginTop: 1 },

  sousCat: { flexDirection: 'row', paddingVertical: 3, paddingHorizontal: 6, backgroundColor: PALE },
  sousCatLib: { flex: 1, fontSize: 8, color: '#333a4d' },
  sousCatVal: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', width: '14%', textAlign: 'right' },

  totaux: { marginTop: 16, marginLeft: 'auto', width: '58%', borderWidth: 1, borderColor: FILET, borderRadius: 3 },
  totLigne: { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 9, borderBottomWidth: 0.5, borderBottomColor: FILET },
  totLib: { flex: 1, fontSize: 9 },
  totVal: { fontSize: 9, textAlign: 'right', width: 95 },
  totSousTotal: { backgroundColor: PALE },
  totFort: { fontFamily: 'Helvetica-Bold' },
  totFinal: { flexDirection: 'row', paddingVertical: 7, paddingHorizontal: 9, backgroundColor: NAVY },
  totFinalLib: { flex: 1, fontSize: 10.5, color: '#ffffff', fontFamily: 'Helvetica-Bold' },
  totFinalVal: { fontSize: 12, color: '#ffffff', fontFamily: 'Helvetica-Bold', textAlign: 'right', width: 95 },
  mentionCredit: { marginTop: 5, fontSize: 8.5, color: ROUGE, textAlign: 'right', fontFamily: 'Helvetica-Bold' },

  // --- blocs libres ---
  blocLibre: { marginTop: 12 },
  blocLibreTitre: { fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: NAVY, marginBottom: 3,
    borderBottomWidth: 1, borderBottomColor: ROUGE, paddingBottom: 2 },
  blocTexte: { fontSize: 9, lineHeight: 1.45, color: '#333a4d' },
  tblTh: { flexDirection: 'row', backgroundColor: NAVY, paddingVertical: 3.5, paddingHorizontal: 6 },
  tblThTexte: { fontSize: 7, letterSpacing: 0.5, color: '#ffffff', textTransform: 'uppercase', fontFamily: 'Helvetica-Bold' },
  tblTr: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: FILET, paddingVertical: 3.5, paddingHorizontal: 6 },
  tblTd: { fontSize: 8.5 },
  tblTotal: { flexDirection: 'row', backgroundColor: PALE, paddingVertical: 3.5, paddingHorizontal: 6 },
  imageLegende: { fontSize: 8, color: GRIS, marginTop: 3, fontStyle: 'italic' },

  signature: { marginTop: 18, flexDirection: 'row', gap: 30 },
  sigBloc: { flex: 1 },
  sigTrait: { borderTopWidth: 0.8, borderTopColor: '#9aa3b5', marginTop: 20, paddingTop: 3 },
  sigEtiq: { fontSize: 7.5, color: GRIS },

  pied: { position: 'absolute', bottom: 20, left: 30, right: 30, flexDirection: 'row',
    justifyContent: 'space-between', fontSize: 7.5, color: GRIS,
    borderTopWidth: 0.5, borderTopColor: FILET, paddingTop: 5 },
});

// ---------------------------------------------------------------------------
// LES UNITES AVEC UN EXPOSANT
//
// « m² » et « m³ » ne s'impriment pas : les polices standards du PDF n'ont pas
// ces deux caracteres, et le lecteur les laisse tomber SANS RIEN DIRE. On se
// retrouve avec « 8 m » la ou il fallait lire 8 metres cubes — sur un document
// qui part au client, c'est une erreur de facturation.
//
// On ecrit donc le chiffre a part, en plus petit et en exposant. Si un lecteur
// ne comprend pas l'exposant, il affiche « m3 » : lisible, jamais faux.
// ---------------------------------------------------------------------------
function Unite({ valeur, style }) {
  const t = String(valeur || '');
  const m = t.match(/^(.*?)([²³])$/);
  if (!m) return <Text style={style}>{t}</Text>;
  return (
    <Text style={style}>
      {m[1]}
      <Text style={{ fontSize: 6, verticalAlign: 'super' }}>{m[2] === '²' ? '2' : '3'}</Text>
    </Text>
  );
}

// La revision s'ecrit exactement comme dans le nom du fichier : R00, R01.
function revisionLisible(r) {
  const n = Math.max(0, Math.round(Number(r) || 0));
  return `R${String(n).padStart(2, '0')}${n === 0 ? '  (originale)' : ''}`;
}

function dateLisible(iso) {
  if (!iso) return '';
  const [a, m, j] = String(iso).slice(0, 10).split('-').map(Number);
  if (!a || !m || !j) return String(iso);
  const MOIS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  return `${j} ${MOIS[m - 1]} ${a}`;
}

// ---------------------------------------------------------------------------
// UNE SECTION DE COUTS
// ---------------------------------------------------------------------------
function Section({ categorie, lignes, resume }) {
  const miennes = (lignes || []).filter((l) => l.categorie === categorie.id && !ligneEstVide(l));
  if (miennes.length === 0) return null;
  return (
    // La section peut se couper entre deux pages — un extra de trente lignes
    // ne tient pas sur une page. Ce qui ne doit JAMAIS se couper, c'est une
    // ligne, et un titre de categorie ne doit pas rester seul en bas de page.
    <View>
      <View wrap={false} minPresenceAhead={54}>
        <Text style={s.catTitre}>{categorie.libelle}</Text>
        <View style={s.thRow}>
          <Text style={[s.th, s.cDesc]}>Description</Text>
          <Text style={[s.th, s.cQte]}>Qté</Text>
          <Text style={[s.th, s.cUnite]}>Unité</Text>
          <Text style={[s.th, s.cPrix]}>Prix unit.</Text>
          <Text style={[s.th, s.cTotal]}>Total</Text>
        </View>
      </View>
      {miennes.map((l, i) => (
        <View key={l.id || i} style={[s.tr, i % 2 === 1 ? s.trPaire : null]} wrap={false}>
          <View style={s.cDesc}>
            <Text>{l.description}</Text>
            {l.note ? <Text style={s.note}>{l.note}</Text> : null}
          </View>
          <Text style={s.cQte}>{formaterQuantite(l.quantite)}</Text>
          <Unite valeur={l.unite} style={s.cUnite} />
          <Text style={s.cPrix}>{formaterArgent(l.prix_unitaire, false)}</Text>
          <Text style={s.cTotal}>{formaterArgent(enDollars(totalLigneCents(l)), false)}</Text>
        </View>
      ))}
      <View style={s.sousCat} wrap={false}>
        <Text style={[s.sousCatLib, s.totFort]}>Total {categorie.libelle.toLowerCase()}</Text>
        <Text style={s.sousCatVal}>{formaterArgent(resume ? resume.total : 0, false)}</Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// LES BLOCS LIBRES
//
// « dataUrl » est pose par lib/extras/exports.js juste avant de fabriquer le
// PDF : le bloc ne garde en base que le CHEMIN de l'image dans Supabase, et
// c'est l'app qui la telecharge avec le jeton de la personne connectee.
// Sans image lisible, le bloc ne s'imprime pas — un cadre vide sur un
// document envoye au client, ca fait bricole.
// ---------------------------------------------------------------------------
function BlocLibre({ bloc, detailImprime = true }) {
  if (!bloc) return null;

  // Dans un forfait, un tableau maison qui COMPTE dans le total est du cout :
  // il reste a l'interne, comme les lignes. L'imprimer laisserait au client un
  // montant partiel qui ne s'additionne pas au prix ferme — la premiere
  // question qu'il poserait. Un tableau d'information, lui, s'imprime.
  if (!detailImprime && bloc.type === 'tableau' && bloc.compteDansTotal) return null;

  if (bloc.type === 'saut') return <View break />;

  if (bloc.type === 'texte') {
    if (!String(bloc.corps || '').trim() && !String(bloc.titre || '').trim()) return null;
    return (
      <View style={s.blocLibre} wrap={false}>
        {bloc.titre ? <Text style={s.blocLibreTitre}>{bloc.titre}</Text> : null}
        {bloc.corps ? <Text style={s.blocTexte}>{bloc.corps}</Text> : null}
      </View>
    );
  }

  if (bloc.type === 'image') {
    if (!bloc.dataUrl) return null;
    const pleine = (bloc.largeur || 'pleine') === 'pleine';
    return (
      <View style={s.blocLibre} wrap={false}>
        {bloc.titre ? <Text style={s.blocLibreTitre}>{bloc.titre}</Text> : null}
        {/* Une photo qui prend la moitie de la page fait perdre la piste au
            lecteur. 300 points, c'est environ 10 cm : assez pour voir, pas
            assez pour ecraser le reste. */}
        <Image src={bloc.dataUrl} style={{ width: pleine ? '100%' : '55%', objectFit: 'contain', maxHeight: 300 }} />
        {bloc.legende ? <Text style={s.imageLegende}>{bloc.legende}</Text> : null}
      </View>
    );
  }

  if (bloc.type === 'tableau') {
    const colonnes = bloc.colonnes || [];
    const rangees = (bloc.rangees || []).filter((r) => (r || []).some((c) => String(c || '').trim()));
    if (colonnes.length === 0 || rangees.length === 0) return null;
    const iM = Number(bloc.colonneMontant);
    const largeur = (i) => `${Math.round(100 / colonnes.length)}%`;
    const aDroite = (i) => (isFinite(iM) && i === iM ? 'right' : (colonnes[i]?.align === 'droite' ? 'right' : 'left'));
    return (
      <View style={s.blocLibre}>
        {bloc.titre ? <Text style={s.blocLibreTitre}>{bloc.titre}</Text> : null}
        <View wrap={false} minPresenceAhead={40}>
          <View style={s.tblTh}>
            {colonnes.map((c, i) => (
              <Text key={i} style={[s.tblThTexte, { width: largeur(i), textAlign: aDroite(i), paddingRight: 4 }]}>
                {c.libelle || ''}
              </Text>
            ))}
          </View>
        </View>
        {rangees.map((r, ri) => (
          <View key={ri} style={[s.tblTr, ri % 2 === 1 ? s.trPaire : null]} wrap={false}>
            {colonnes.map((c, i) => (
              <Text key={i} style={[s.tblTd, { width: largeur(i), textAlign: aDroite(i), paddingRight: 4 }]}>
                {(r || [])[i] || ''}
              </Text>
            ))}
          </View>
        ))}
        {bloc.compteDansTotal ? (
          <View style={s.tblTotal} wrap={false}>
            {colonnes.map((c, i) => (
              <Text key={i} style={[s.tblTd, s.totFort, { width: largeur(i), textAlign: aDroite(i), paddingRight: 4 }]}>
                {i === 0 ? 'Total' : (i === iM ? formaterArgent(enDollars(totalTableauCents(bloc)), false) : '')}
              </Text>
            ))}
          </View>
        ) : null}
      </View>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
export default function ExtraPdf({ extra, lignes, totaux, projet, logoDataUrl }) {
  const g = gabaritDe(extra.gabarit);
  const aff = extra.affichage || {};
  const voir = (id) => estAffiche(aff, id);
  const pct = (t) => `${(t * 100).toLocaleString('fr-CA', { maximumFractionDigits: 3 })} %`;
  const blocs = extra.blocs || [];
  const estCredit = g.id === 'credit';

  // Une case du haut ne s'imprime que si elle a quelque chose dedans. Trois
  // cadres dont deux vides, ca a l'air d'un gabarit qu'on a oublie de remplir.
  const caseProjet = voir('projet');
  const casePersonnes = (voir('soumis_par') || voir('destinataire'));
  const caseDates = (voir('date') || voir('revision'));
  const nbCases = [caseProjet, casePersonnes, caseDates].filter(Boolean).length;

  return (
    <Document
      title={`${numeroAffiche(extra.numero, extra.revision) || 'Extra'} — ${extra.sujet || ''}`}
      author="Les Entreprises PEP2000 inc."
      subject={extra.sujet || 'Extra'}
    >
      <Page size="LETTER" style={s.page}>
        <View style={s.bandeauRouge} />
        <View style={s.entete}>
          {logoDataUrl ? <Image src={logoDataUrl} style={s.logo} /> : null}
          <View>
            <Text style={s.enteteTitre}>LES ENTREPRISES PEP2000 INC.</Text>
            <Text style={s.enteteSous}>{g.titreDocument}</Text>
          </View>
          <View style={s.enteteDroite}>
            {/* En haut : le numero SANS le suffixe de revision. La revision a
                sa propre case juste en dessous, et le suffixe complet
                (EX-24-118-001-R02) sert de nom au fichier. */}
            <Text style={s.numeroEtiq}>Numéro</Text>
            <Text style={s.numero}>{extra.numero || '—'}</Text>
          </View>
        </View>

        {nbCases > 0 ? (
          <View style={s.blocs}>
            {caseProjet ? (
              <View style={s.bloc}>
                <Text style={s.blocTitre}>Projet</Text>
                <Text style={s.blocFort}>{projet ? `${projet.no} — ${projet.nom}` : (extra.projet_no || '—')}</Text>
                {voir('client') && (projet?.client || projet?.adresse) ? (
                  <Text style={s.blocLigne}>
                    {[projet?.client, projet?.adresse].filter(Boolean).join(' · ')}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {casePersonnes ? (
              <View style={s.bloc}>
                {voir('soumis_par') ? (
                  <>
                    <Text style={s.blocTitre}>Soumis par</Text>
                    <Text style={s.blocFort}>
                      {extra.afficher_soumis_par && extra.soumis_par
                        ? extra.soumis_par : 'Les Entreprises PEP2000 inc.'}
                    </Text>
                  </>
                ) : null}
                {voir('destinataire') && (extra.destinataire_nom || extra.destinataire_courriel) ? (
                  <>
                    <Text style={[s.blocTitre, voir('soumis_par') ? s.blocTitreSuite : null]}>À l&apos;attention de</Text>
                    {extra.destinataire_nom ? <Text style={s.blocFort}>{extra.destinataire_nom}</Text> : null}
                    {extra.destinataire_courriel ? <Text style={s.blocLigne}>{extra.destinataire_courriel}</Text> : null}
                  </>
                ) : null}
              </View>
            ) : null}

            {caseDates ? (
              <View style={s.bloc}>
                {voir('date') ? (
                  <>
                    <Text style={s.blocTitre}>Date</Text>
                    <Text style={s.blocFort}>{dateLisible(extra.date_extra)}</Text>
                  </>
                ) : null}
                {voir('revision') ? (
                  <>
                    <Text style={[s.blocTitre, voir('date') ? s.blocTitreSuite : null]}>Révision</Text>
                    <Text style={s.blocFort}>{revisionLisible(extra.revision)}</Text>
                  </>
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}

        {voir('sujet') || (voir('description') && extra.description) ? (
          <View style={s.sujetBloc}>
            {voir('sujet') ? (
              <>
                <Text style={s.sujetEtiq}>Sujet</Text>
                <Text style={s.sujet}>{extra.sujet || '—'}</Text>
              </>
            ) : null}
            {voir('description') && extra.description
              ? <Text style={s.descr}>{extra.description}</Text> : null}
          </View>
        ) : null}

        {/* ---- les blocs libres qui vont AVANT le detail ---- */}
        {blocsDe(blocs, 'avant').map((b, i) => (
          <BlocLibre key={b.id || `av${i}`} bloc={b} detailImprime={g.detailImprime} />
        ))}

        {/* ---- le detail des couts ----
            Un forfait ne l'imprime pas : le client achete une etendue de
            travaux et un prix, pas notre feuille de calcul. Le detail reste
            dans l'app et dans l'Excel, pour nous. */}
        {g.detailImprime
          ? CATEGORIES.map((c) => (
              <Section key={c.id} categorie={c} lignes={lignes} resume={totaux.categories[c.id]} />
            ))
          : null}

        {/* ---- les totaux ---- */}
        <View style={s.totaux} wrap={false}>
          {g.detailImprime && totaux.pourcentage > 0 ? (
            <>
              <View style={s.totLigne}>
                <Text style={s.totLib}>{estCredit ? 'Total des travaux retirés' : 'Total des travaux'}</Text>
                <Text style={s.totVal}>{formaterArgent(totaux.totalTravaux)}</Text>
              </View>
              <View style={s.totLigne}>
                <Text style={s.totLib}>Administration et profit ({formaterPourcentage(totaux.pourcentage)})</Text>
                <Text style={s.totVal}>{formaterArgent(totaux.majoration)}</Text>
              </View>
            </>
          ) : null}
          <View style={[s.totLigne, s.totSousTotal]}>
            <Text style={[s.totLib, s.totFort]}>{g.id === 'forfait' ? 'Prix forfaitaire' : 'Sous-total'}</Text>
            <Text style={[s.totVal, s.totFort]}>{formaterArgent(totaux.sousTotal)}</Text>
          </View>
          <View style={s.totLigne}>
            <Text style={s.totLib}>TPS ({pct(totaux.tauxTps)})</Text>
            <Text style={s.totVal}>{formaterArgent(totaux.tps)}</Text>
          </View>
          <View style={s.totLigne}>
            <Text style={s.totLib}>TVQ ({pct(totaux.tauxTvq)})</Text>
            <Text style={s.totVal}>{formaterArgent(totaux.tvq)}</Text>
          </View>
          <View style={s.totFinal}>
            <Text style={s.totFinalLib}>{g.libelleTotal}</Text>
            <Text style={s.totFinalVal}>{formaterArgent(totaux.total)}</Text>
          </View>
        </View>
        {estCredit ? (
          <Text style={s.mentionCredit}>Montant à déduire du contrat.</Text>
        ) : null}

        {/* ---- les blocs libres qui vont APRES les totaux ---- */}
        {blocsDe(blocs, 'apres').map((b, i) => (
          <BlocLibre key={b.id || `ap${i}`} bloc={b} detailImprime={g.detailImprime} />
        ))}

        {estAffiche(aff, 'signatures') ? (
          <View style={s.signature} wrap={false}>
            <View style={s.sigBloc}>
              <View style={s.sigTrait}><Text style={s.sigEtiq}>Approuvé par (client) — date</Text></View>
            </View>
            <View style={s.sigBloc}>
              <View style={s.sigTrait}>
                <Text style={s.sigEtiq}>
                  {extra.afficher_soumis_par && extra.soumis_par
                    ? `${extra.soumis_par} — Les Entreprises PEP2000 inc.`
                    : 'Les Entreprises PEP2000 inc.'}
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        <View style={s.pied} fixed>
          <Text>
            Les Entreprises PEP2000 inc. — {numeroAffiche(extra.numero, extra.revision) || 'extra'}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

import { Page, View, Text } from '@react-pdf/renderer';
import {
  pdfStyles, taillePage, ZEBRA, WEEKEND_BG, WEEKEND_TH,
} from '../../../lib/planification-hebdomadaire/pdfStyles';
import {
  JOURS, dateKey, twoWeekDates, fmtJourCourt, fmtIntervalle,
} from '../../../lib/planification-hebdomadaire/dates';
import { PdfHeader, PdfFooter, TableHead } from './PdfChrome';

// ---------------------------------------------------------------------------
// MEETING 2 — ATTRIBUTION (refonte revision 73)
//
// Le samedi et le dimanche prenaient chacun un septieme de la largeur pour
// n'afficher qu'un tiret, et les cinq jours travailles se retrouvaient
// comprimes au point que « Depot municipal Terrebonne » tenait sur trois
// lignes. Les colonnes de fin de semaine n'apparaissent plus que lorsqu'une
// equipe y est affectee.
//
// Le test porte sur les DEUX semaines a la fois : si quelqu'un travaille le
// samedi de la semaine 1 seulement, la colonne reste quand meme dans les deux
// tableaux. Deux tableaux empiles qui n'auraient pas les memes colonnes se
// liraient de travers.
//
// L'en-tete affichait « LUN 5 octobre 2026 » — l'annee sept fois par semaine,
// quatorze fois par feuille. Le jour et le quantieme suffisent : la semaine
// complete est ecrite une fois, au-dessus du tableau.
// ---------------------------------------------------------------------------

const CM_W = 13;

function estFinDeSemaine(d) {
  return d.getDay() === 0 || d.getDay() === 6;
}

function WeekTable({ numero, dates, contremaitres, getAssignment, projetsActifs, marginTop }) {
  const dayW = (100 - CM_W) / dates.length;
  const nomDeProjet = new Map(projetsActifs.map((p) => [p.id, p.projet]));

  // `wrap={false}` : une semaine ne se coupe JAMAIS entre deux feuilles. A 14
  // contremaitres, la semaine 2 partait a cheval — quatre equipes au bas d'une
  // page, dix sur la suivante, et la suite arrivait sans titre. On ne sait plus
  // de quelle semaine on parle. Si la semaine ne rentre pas sous la semaine 1,
  // elle part entiere sur la feuille d'apres.
  //
  // Le titre reste `fixed` en filet : une equipe assez nombreuse pour qu'UNE
  // semaine depasse une feuille complete se couperait quand meme, et la page
  // de suite porterait au moins « Semaine 2 » et ses dates.
  return (
    <View style={{ marginTop: marginTop || 0 }} wrap={false}>
      <View style={pdfStyles.sectionRow} fixed>
        <Text style={pdfStyles.sectionTitle}>Semaine {numero}</Text>
        <Text style={pdfStyles.sectionDates}>{fmtIntervalle(dates[0], dates[dates.length - 1])}</Text>
      </View>

      <View style={pdfStyles.table}>
        <TableHead>
          <Text style={[pdfStyles.th, { width: `${CM_W}%` }]}>Contremaître</Text>
          {dates.map((d) => (
            <View
              key={dateKey(d)}
              style={[
                pdfStyles.th,
                { width: `${dayW}%`, paddingVertical: 3.5, paddingHorizontal: 3 },
                estFinDeSemaine(d) ? { backgroundColor: WEEKEND_TH } : {},
              ]}
            >
              <Text style={{ fontSize: 7.5, fontFamily: 'Helvetica-Bold', textAlign: 'center', letterSpacing: 0.5 }}>
                {JOURS[d.getDay()]}
              </Text>
              <Text style={{ fontSize: 7, fontFamily: 'Helvetica', color: '#6B7280', textAlign: 'center', marginTop: 1.5 }}>
                {fmtJourCourt(d)}
              </Text>
            </View>
          ))}
        </TableHead>

        {contremaitres.length === 0 && <Text style={pdfStyles.empty}>Aucun contremaître au tableau.</Text>}

        {contremaitres.map((c, i) => (
          <View
            key={c.id}
            style={[pdfStyles.row, i % 2 === 1 ? { backgroundColor: ZEBRA } : {}]}
            wrap={false}
          >
            <Text style={[pdfStyles.tdBold, { width: `${CM_W}%`, paddingVertical: 3 }]}>{c.nom}</Text>
            {dates.map((d) => {
              const iso = dateKey(d);
              const nom = nomDeProjet.get(getAssignment(c.id, iso));
              return (
                <Text
                  key={iso}
                  style={[
                    pdfStyles.td, pdfStyles.ctr,
                    { width: `${dayW}%`, fontSize: 8, paddingVertical: 3, paddingHorizontal: 3 },
                    estFinDeSemaine(d) ? { backgroundColor: WEEKEND_BG } : {},
                  ]}
                >{nom || ''}</Text>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

export default function Meeting2Pdf({ board, format }) {
  const { contremaitres, settings, getAssignment, projects } = board;
  const projetsActifs = projects.filter((p) => p.statut !== 'Termine');
  const quatorze = twoWeekDates(settings.range_start);

  // Quels jours de la semaine gardent une colonne : lundi a vendredi toujours,
  // samedi et dimanche seulement s'ils portent au moins une affectation.
  const finDeSemaineUtile = new Set();
  quatorze.forEach((d) => {
    if (!estFinDeSemaine(d)) return;
    const iso = dateKey(d);
    const occupe = contremaitres.some((c) => getAssignment(c.id, iso));
    if (occupe) finDeSemaineUtile.add(d.getDay());
  });

  const garder = (d) => !estFinDeSemaine(d) || finDeSemaineUtile.has(d.getDay());
  const semaine1 = quatorze.slice(0, 7).filter(garder);
  const semaine2 = quatorze.slice(7, 14).filter(garder);

  const masques = 2 - finDeSemaineUtile.size;
  const mentionFds = masques === 2
    ? 'samedi et dimanche masqués, aucune équipe affectée'
    : masques === 1 ? 'un jour de fin de semaine masqué, aucune équipe affectée' : '';

  return (
    <Page size={taillePage(format)} style={pdfStyles.page}>
      <PdfHeader
        title="Meeting 2 — Attribution des équipes"
        subtitle={[
          fmtIntervalle(quatorze[0], quatorze[13]),
          `${contremaitres.length} contremaître${contremaitres.length > 1 ? 's' : ''}`,
          mentionFds,
        ].filter(Boolean).join(' · ')}
      />

      <WeekTable
        numero={1} dates={semaine1} contremaitres={contremaitres}
        getAssignment={getAssignment} projetsActifs={projetsActifs}
      />
      <WeekTable
        numero={2} dates={semaine2} contremaitres={contremaitres}
        getAssignment={getAssignment} projetsActifs={projetsActifs} marginTop={12}
      />

      <PdfFooter mention="Meeting 2 — Attribution des équipes" />
    </Page>
  );
}

import { Page, View, Text } from '@react-pdf/renderer';
import { pdfStyles, LINE, NAVY } from '../../../lib/planification-hebdomadaire/pdfStyles';
import { JOURS, dateKey, twoWeekDates, fmtDateLong } from '../../../lib/planification-hebdomadaire/dates';
import { PdfHeader, PdfFooter } from './PdfChrome';

const CM_W = 12;
const DAY_W = (100 - CM_W) / 7;
const WEEKEND_BG = '#E7E9EF';
const WEEKEND_HEADER_BG = '#DEE3ED';

function isWeekend(d) {
  return d.getDay() === 0 || d.getDay() === 6;
}

function WeekTable({ label, dates, contremaitres, getAssignment, activeProjects, topGap }) {
  return (
    <View style={{ marginBottom: 12, marginTop: topGap || 0 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
        <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold', color: NAVY }}>{label}</Text>
        <Text style={{ fontSize: 11.2, fontFamily: 'Helvetica-Bold', color: '#6B7280' }}>- {fmtDateLong(dates[0])} au {fmtDateLong(dates[6])}</Text>
      </View>
      <View style={[pdfStyles.table, { borderColor: LINE }]}>
        <View style={pdfStyles.row}>
          <Text style={[pdfStyles.th, { width: `${CM_W}%` }]}>Contremaitre</Text>
          {dates.map((d) => (
            <Text
              key={dateKey(d)}
              style={[
                pdfStyles.th,
                { width: `${DAY_W}%`, textAlign: 'center' },
                isWeekend(d) ? { backgroundColor: WEEKEND_HEADER_BG } : {},
              ]}
            >
              {JOURS[d.getDay()]} {fmtDateLong(d)}
            </Text>
          ))}
        </View>
        {contremaitres.map((c) => (
          <View key={c.id} style={pdfStyles.row} wrap={false}>
            <Text style={[pdfStyles.tdBold, { width: `${CM_W}%` }]}>{c.nom}</Text>
            {dates.map((d) => {
              const dIso = dateKey(d);
              const projectId = getAssignment(c.id, dIso);
              const proj = activeProjects.find((p) => p.id === projectId);
              return (
                <Text
                  key={dIso}
                  style={[
                    pdfStyles.td,
                    { width: `${DAY_W}%`, textAlign: 'center' },
                    isWeekend(d) ? { backgroundColor: WEEKEND_BG } : {},
                  ]}
                >
                  {proj ? proj.projet : '\u2014'}
                </Text>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

export default function Meeting2Pdf({ board }) {
  const { contremaitres, settings, getAssignment, projects } = board;
  const activeProjects = projects.filter((p) => p.statut !== 'Termine');
  const dates = twoWeekDates(settings.range_start);
  const week1 = dates.slice(0, 7);
  const week2 = dates.slice(7, 14);

  return (
    <Page size={[1224, 792]} style={pdfStyles.page}>
      <PdfHeader title="Meeting 2 - Attribution" fixed />

      <WeekTable label="Semaine 1" dates={week1} contremaitres={contremaitres} getAssignment={getAssignment} activeProjects={activeProjects} />
      <WeekTable label="Semaine 2" dates={week2} contremaitres={contremaitres} getAssignment={getAssignment} activeProjects={activeProjects} topGap={16} />

      <PdfFooter fixed />
    </Page>
  );
}

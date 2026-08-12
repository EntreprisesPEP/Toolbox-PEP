import { dayCellPalette } from '../../lib/planification-hebdomadaire/statusColors';
import { JOURS, dateKey, mondayOf, today, weekDates, twoWeekDates, fmtDateLong } from '../../lib/planification-hebdomadaire/dates';
import NeedsPanel from './NeedsPanel';

export default function Meeting2View({ board, editable, theme, printMode }) {
  const { projects, contremaitres, settings, getAssignment, setAssignment, updateSettings, updateProject } = board;
  const dates = printMode ? twoWeekDates(settings.range_start) : weekDates(settings.range_start);
  const pal = dayCellPalette(theme);
  const activeProjects = projects.filter((p) => p.statut !== 'Termine');

  function goToWeek(mondayDate) {
    updateSettings({ range_start: dateKey(mondayDate) });
  }

  return (
    <div className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <h2 className="big-title">MEETING 2 - ATTRIBUTION</h2>
        {!printMode && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
            <div className="weeknav">
              <span>{fmtDateLong(dates[0])} - {fmtDateLong(dates[dates.length - 1])}</span>
              <input
                type="date"
                value={settings.range_start || ''}
                onChange={(e) => e.target.value && goToWeek(mondayOf(new Date(e.target.value + 'T00:00:00')))}
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn ghost" onClick={() => { const d = mondayOf(today()); d.setDate(d.getDate() + 7); goToWeek(d); }}>1re semaine</button>
              <button className="btn ghost" onClick={() => { const d = mondayOf(today()); d.setDate(d.getDate() + 14); goToWeek(d); }}>2e semaine</button>
            </div>
          </div>
        )}
        {printMode && (
          <span style={{ fontSize: 12, color: 'var(--ink-dim)' }}>
            Semaine 1 : {fmtDateLong(dates[0])} - {fmtDateLong(dates[6])} &nbsp;|&nbsp;
            Semaine 2 : {fmtDateLong(dates[7])} - {fmtDateLong(dates[13])}
          </span>
        )}
      </div>

      <div className="scrollx">
        <table id="cmTable" className={printMode ? 'print-two-weeks' : ''}>
          <thead>
            <tr>
              <th style={{ background: pal.headerBg, color: pal.headerInk }}>Contremaitre</th>
              {dates.map((d, i) => {
                const wknd = d.getDay() === 0 || d.getDay() === 6;
                const startsWeek2 = printMode && i === 7;
                return (
                  <th
                    key={dateKey(d)}
                    style={{
                      background: wknd ? pal.headerWeekendBg : pal.headerBg,
                      color: wknd ? pal.headerWeekendInk : pal.headerInk,
                      borderLeft: startsWeek2 ? '2px solid var(--red)' : undefined,
                    }}
                  >
                    {JOURS[d.getDay()]}<br />{fmtDateLong(d)}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {contremaitres.length === 0 && <tr><td colSpan={dates.length + 1} className="empty">Aucun contremaitre. Ajoute-les dans Admin projets.</td></tr>}
            {contremaitres.map((c) => (
              <tr key={c.id}>
                <td className="cm-name" style={{ color: pal.ink }}>{c.nom}</td>
                {dates.map((d, i) => {
                  const dIso = dateKey(d);
                  const wknd = d.getDay() === 0 || d.getDay() === 6;
                  const bg = wknd ? pal.weekend : pal.base;
                  const bd = wknd ? pal.weekendBorder : pal.border;
                  const startsWeek2 = printMode && i === 7;
                  const projectId = getAssignment(c.id, dIso);
                  const proj = activeProjects.find((p) => p.id === projectId);
                  return (
                    <td
                      key={dIso}
                      className="daycell"
                      style={{ background: bg, borderLeft: startsWeek2 ? '2px solid var(--red)' : undefined }}
                    >
                      {editable ? (
                        <select
                          value={projectId || ''}
                          style={{ background: bg, color: pal.ink, borderColor: bd }}
                          onChange={(e) => setAssignment(c.id, dIso, e.target.value || null)}
                        >
                          <option value="">&mdash;</option>
                          {activeProjects.map((p) => <option key={p.id} value={p.id}>{p.projet}</option>)}
                        </select>
                      ) : (
                        <span style={{ color: pal.ink }}>{proj ? proj.projet : '\u2014'}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!printMode && (
        <NeedsPanel
          activeProjects={activeProjects}
          theme={theme}
          editable={editable}
          onTogglePlaced={(id, field, value) => updateProject(id, { [field]: value })}
        />
      )}
    </div>
  );
}

import { useState } from 'react';
import { dayCellPalette } from '../../lib/planification-hebdomadaire/statusColors';
import { JOURS, dateKey, mondayOf, today, weekDates, twoWeekDates, fmtDateLong } from '../../lib/planification-hebdomadaire/dates';
import NeedsPanel from './NeedsPanel';
import ConfirmModal from './ConfirmModal';

export default function Meeting2View({ board, editable, theme, printMode }) {
  const { projects, contremaitres, settings, getAssignment, setAssignment, updateSettings, updateProject, getContremaitreName, setContremaitreNameForWeek, importPreviousWeekAssignments, clearMeeting2Week } = board;
  const dates = printMode ? twoWeekDates(settings.range_start) : weekDates(settings.range_start);
  const pal = dayCellPalette(theme);
  const activeProjects = projects.filter((p) => p.statut !== 'Termine');
  const [notice, setNotice] = useState('');
  const [confirmCopyPrev, setConfirmCopyPrev] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [editingNameId, setEditingNameId] = useState(null);
  const [editingNameValue, setEditingNameValue] = useState('');

  function goToWeek(mondayDate) {
    updateSettings({ range_start: dateKey(mondayDate) });
  }

  function copyMondayToWeek(contremaitreId) {
    const mondayIso = dateKey(dates[0]);
    const mondayProjectId = getAssignment(contremaitreId, mondayIso);
    for (let i = 1; i < 5; i++) { // mardi a vendredi
      setAssignment(contremaitreId, dateKey(dates[i]), mondayProjectId);
    }
  }

  function startEditName(c) {
    if (!editable) return;
    setEditingNameId(c.id);
    setEditingNameValue(getContremaitreName(c.id, dateKey(dates[0])));
  }
  function saveEditName() {
    if (editingNameId && editingNameValue.trim()) {
      setContremaitreNameForWeek(editingNameId, dateKey(dates[0]), editingNameValue.trim());
    }
    setEditingNameId(null);
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
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button className="btn ghost" onClick={() => { const d = mondayOf(today()); d.setDate(d.getDate() + 7); goToWeek(d); }}>1re semaine</button>
              <button className="btn ghost" onClick={() => { const d = mondayOf(today()); d.setDate(d.getDate() + 14); goToWeek(d); }}>2e semaine</button>
              {editable && (
                <button className="btn ghost" onClick={() => setConfirmCopyPrev(true)}>Copier la semaine precedente</button>
              )}
              {editable && (
                <button className="btn ghost" onClick={() => setConfirmClear(true)}>Effacer cette semaine</button>
              )}
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
            {contremaitres.map((c, rowIdx) => {
              const zebraBg = rowIdx % 2 === 0 ? 'var(--panel)' : 'var(--panel-2)';
              return (
                <tr key={c.id}>
                  <td className="cm-name" style={{ color: pal.ink, background: zebraBg }}>
                    {editingNameId === c.id ? (
                      <input
                        autoFocus
                        value={editingNameValue}
                        onChange={(e) => setEditingNameValue(e.target.value)}
                        onBlur={saveEditName}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveEditName(); if (e.key === 'Escape') setEditingNameId(null); }}
                        style={{ width: '100%' }}
                      />
                    ) : (
                      <span
                        onClick={() => startEditName(c)}
                        title={editable ? 'Cliquer pour renommer (a partir de cette semaine)' : undefined}
                        style={{ cursor: editable ? 'pointer' : undefined }}
                      >{getContremaitreName(c.id, dateKey(dates[0]))}</span>
                    )}
                  </td>
                  {dates.map((d, i) => {
                    const dIso = dateKey(d);
                    const wknd = d.getDay() === 0 || d.getDay() === 6;
                    const bg = wknd ? pal.weekend : zebraBg;
                    const bd = wknd ? pal.weekendBorder : pal.border;
                    const startsWeek2 = printMode && i === 7;
                    const projectId = getAssignment(c.id, dIso);
                    const proj = activeProjects.find((p) => p.id === projectId);
                    const isMonday = !printMode && i === 0;
                    return (
                      <td
                        key={dIso}
                        className="daycell"
                        style={{ background: bg, borderLeft: startsWeek2 ? '2px solid var(--red)' : undefined, position: 'relative' }}
                      >
                        {editable ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <select
                              value={projectId || ''}
                              style={{ background: bg, color: pal.ink, borderColor: bd, flex: 1 }}
                              onChange={(e) => setAssignment(c.id, dIso, e.target.value || null)}
                              onKeyDown={(e) => {
                                if (e.key === ' ') {
                                  e.preventDefault();
                                  setAssignment(c.id, dIso, null);
                                }
                              }}
                            >
                              <option value="">&mdash;</option>
                              {activeProjects.map((p) => <option key={p.id} value={p.id}>{p.projet}</option>)}
                            </select>
                            {isMonday && (
                              <button
                                type="button"
                                className="btn ghost small"
                                title="Copier ce projet du lundi au vendredi"
                                onClick={() => copyMondayToWeek(c.id)}
                                style={{ padding: '2px 5px', fontSize: 10, flexShrink: 0 }}
                              >All</button>
                            )}
                          </span>
                        ) : (
                          <span style={{ color: pal.ink }}>{proj ? proj.projet : '\u2014'}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
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

      <ConfirmModal
        open={!!notice}
        message={notice}
        okLabel="OK"
        showCancel={false}
        onOk={() => setNotice('')}
      />

      <ConfirmModal
        open={confirmCopyPrev}
        message="Voulez-vous vraiment copier les attributions de la semaine precedente sur la semaine affichee ? Ça remplacera les attributions deja en place pour cette semaine."
        okLabel="Copier"
        onOk={async () => {
          setConfirmCopyPrev(false);
          const n = await importPreviousWeekAssignments();
          setNotice(n === 0
            ? "Aucune attribution trouvee pour la semaine precedente."
            : `${n} attribution(s) copiee(s) depuis la semaine precedente.`);
        }}
        onCancel={() => setConfirmCopyPrev(false)}
      />

      <ConfirmModal
        open={confirmClear}
        message="Voulez-vous vraiment effacer toutes les attributions de la semaine affichee ? Cette action est irreversible."
        okLabel="Effacer"
        onOk={async () => { await clearMeeting2Week(dateKey(dates[0])); setConfirmClear(false); }}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  );
}

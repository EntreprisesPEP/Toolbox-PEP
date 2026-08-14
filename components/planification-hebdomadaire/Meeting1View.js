import { useState } from 'react';
import ProjectsTable from './ProjectsTable';
import ConfirmModal from './ConfirmModal';
import { fmtDateLong, mondayOf, dateKey } from '../../lib/planification-hebdomadaire/dates';

export default function Meeting1View({ board, editable, theme }) {
  const { projects, settings, updateProject, switchNotesWeek, importPreviousWeek } = board;
  const [notice, setNotice] = useState('');

  const active = projects.filter((p) => p.statut !== 'Termine');
  const weekStart = settings.notes_week_start ? new Date(settings.notes_week_start + 'T00:00:00') : mondayOf(new Date());
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 6);

  return (
    <div className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <h2 className="big-title">MEETING 1 - SUIVI PROJETS</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
          <div className="weeknav">
            <span>{fmtDateLong(weekStart)} - {fmtDateLong(weekEnd)}</span>
            <input
              type="date"
              value={settings.notes_week_start || ''}
              onChange={(e) => e.target.value && switchNotesWeek(dateKey(mondayOf(new Date(e.target.value + 'T00:00:00'))))}
            />
          </div>
          {editable && (
            <button
              className="btn ghost"
              onClick={async () => {
                const n = await importPreviousWeek();
                setNotice(n === 0
                  ? "Aucune note trouvee pour la semaine precedente (elle n'a peut-etre jamais ete visitee)."
                  : `${n} projet(s) mis a jour avec les notes de la semaine precedente.`);
              }}
            >Importer la semaine precedente</button>
          )}
        </div>
      </div>

      <ProjectsTable
        rows={active}
        editable={editable}
        theme={theme}
        board={board}
        onUpdate={(id, patch) => updateProject(id, patch)}
        emptyLabel="Aucun projet actif. Ajoute-les dans Admin projets."
        highlightedId={settings.highlighted_project_id}
        onHighlight={editable ? (id) => board.updateSettings({ highlighted_project_id: settings.highlighted_project_id === id ? null : id }) : undefined}
      />

      <div style={{ textAlign: 'center', marginTop: 14 }}>
        <button
          className="btn ghost"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          title="Retour en haut de la page"
        >&#8593; Retour en haut</button>
      </div>

      <ConfirmModal
        open={!!notice}
        message={notice}
        okLabel="OK"
        showCancel={false}
        onOk={() => setNotice('')}
      />
    </div>
  );
}

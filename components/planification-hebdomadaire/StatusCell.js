import { useState } from 'react';
import { STATUS_OPTS } from '../../lib/planification-hebdomadaire/statusColors';
import { formatDateFr, dateKey, today } from '../../lib/planification-hebdomadaire/dates';

export default function StatusCell({ project, editable, onChange }) {
  const [showDropdown, setShowDropdown] = useState(false);

  if (!editable) {
    if (project.statut === 'Date' && project.date_valeur) {
      return <span>Date &middot; {formatDateFr(project.date_valeur)}</span>;
    }
    return <span>{project.statut}</span>;
  }

  if (project.statut === 'Date' && !showDropdown) {
    return (
      <div className="statut-inline">
        <div className="date-field-wrap">
          <input
            type="date"
            className="hidden-date-input"
            value={project.date_valeur || ''}
            onChange={(e) => onChange({ date_valeur: e.target.value })}
          />
          <div className="date-display-visual">{formatDateFr(project.date_valeur)}</div>
        </div>
        <button className="x-sq" title="Changer le statut" onClick={() => setShowDropdown(true)}>&times;</button>
      </div>
    );
  }

  return (
    <select
      value={project.statut}
      onChange={(e) => {
        const v = e.target.value;
        const patch = { statut: v };
        if (v === 'Date' && !project.date_valeur) patch.date_valeur = dateKey(today());
        onChange(patch);
        setShowDropdown(false);
      }}
    >
      {STATUS_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

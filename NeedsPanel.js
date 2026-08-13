import { useEffect, useState } from 'react';
import { statusColor } from '../../lib/planification-hebdomadaire/statusColors';

export default function NeedsPanel({ activeProjects, theme, editable, onTogglePlaced }) {
  const [open, setOpen] = useState(false);

  const sem1 = activeProjects.filter((p) => p.s1);
  const sem2 = activeProjects.filter((p) => p.s2);
  const remaining =
    sem1.filter((p) => !p.s1_placed).length + sem2.filter((p) => !p.s2_placed).length;

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Enter' && e.shiftKey) {
        const tag = (document.activeElement && document.activeElement.tagName) || '';
        if (tag === 'TEXTAREA' || tag === 'INPUT') return;
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  function renderColumn(title, list, field) {
    return (
      <div className="needs-col">
        <div className="needs-col-title">{title}</div>
        {list.length === 0 && <div className="needs-empty">Aucun besoin</div>}
        {list.map((p) => {
          const placed = !!p[field];
          const col = statusColor(p.statut, theme);
          return (
            <div
              key={p.id}
              className={`needs-item ${editable ? 'needs-clickable' : ''} ${placed ? 'needs-placed' : ''}`}
              onClick={() => editable && onTogglePlaced(p.id, field, !placed)}
            >
              <span className="sw" style={{ background: placed ? '#2E9F58' : (col ? col.border : 'var(--ink-dim)') }} />
              <span>{p.no} - {p.projet}</span>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <>
      <button
        className="needs-fab"
        onClick={() => setOpen((o) => !o)}
        title="Besoins de la semaine (Shift+Enter)"
      >
        Besoins
        {remaining > 0 && <span className="needs-fab-badge">{remaining}</span>}
      </button>

      {open && (
        <div className="confirm-overlay" onClick={() => setOpen(false)}>
          <div className="needs-modal" onClick={(e) => e.stopPropagation()}>
            <div className="needs-modal-head">
              <strong>Besoins de la semaine</strong>
              <button className="btn ghost small" onClick={() => setOpen(false)}>Fermer</button>
            </div>
            <p style={{ fontSize: 11.5, color: 'var(--ink-dim)', margin: '4px 0 12px' }}>
              Clique sur un projet une fois l&apos;equipe placee &mdash; il devient vert.
              Raccourci : maintiens Shift puis appuie sur Entree pour ouvrir/fermer.
            </p>
            <div className="needs-sidebar" style={{ width: '100%' }}>
              {renderColumn('Sem 1', sem1, 's1_placed')}
              {renderColumn('Sem 2', sem2, 's2_placed')}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

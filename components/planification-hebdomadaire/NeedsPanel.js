import { useEffect, useState } from 'react';
import { statusColor } from '../../lib/planification-hebdomadaire/statusColors';
import ConfirmModal from './ConfirmModal';

// ---------------------------------------------------------------------------
// BESOINS DE LA SEMAINE
//
// L'ouverture n'est plus un etat local : elle vient du parent. C'est ce qui
// permet a l'ecran de reunion (la tele) de s'ouvrir en meme temps que celui de
// l'animateur. Participant et admin gardent un etat chacun chez eux; seule la
// vue Reunion suit celui de l'animateur.
// ---------------------------------------------------------------------------

export default function NeedsPanel({ activeProjects, theme, editable, onTogglePlaced, ouvert, onOuvert, onDecocherTout }) {
  const [confirmDecocher, setConfirmDecocher] = useState(false);

  const sem1 = activeProjects.filter((p) => p.s1);
  const sem2 = activeProjects.filter((p) => p.s2);
  const remaining =
    sem1.filter((p) => !p.s1_placed).length + sem2.filter((p) => !p.s2_placed).length;
  const coches = sem1.filter((p) => p.s1_placed).length + sem2.filter((p) => p.s2_placed).length;

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Enter' && e.shiftKey) {
        const tag = (document.activeElement && document.activeElement.tagName) || '';
        if (tag === 'TEXTAREA' || tag === 'INPUT') return;
        e.preventDefault();
        onOuvert(!ouvert);
      }
      if (e.key === 'Escape') onOuvert(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [ouvert, onOuvert]);

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
        onClick={() => onOuvert(!ouvert)}
        title="Besoins de la semaine (Shift+Enter)"
      >
        Besoins
        {remaining > 0 && <span className="needs-fab-badge">{remaining}</span>}
      </button>

      {ouvert && (
        <div className="confirm-overlay" onClick={() => onOuvert(false)}>
          <div className="needs-modal" onClick={(e) => e.stopPropagation()}>
            <div className="needs-modal-head">
              <strong>Besoins de la semaine</strong>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {editable && coches > 0 && (
                  <button className="btn ghost small" onClick={() => setConfirmDecocher(true)}>
                    Tout décocher ({coches})
                  </button>
                )}
                <button className="btn ghost small" onClick={() => onOuvert(false)}>Fermer</button>
              </div>
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

      <ConfirmModal
        open={confirmDecocher}
        message={`Décocher les ${coches} projet(s) encore verts ? À faire en début de semaine, quand les pastilles datent de la semaine passée. Le bouton Annuler de la barre du haut peut revenir en arrière.`}
        okLabel="Tout décocher"
        onOk={async () => { setConfirmDecocher(false); await onDecocherTout(); }}
        onCancel={() => setConfirmDecocher(false)}
      />
    </>
  );
}

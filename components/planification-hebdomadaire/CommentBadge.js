import { useEffect, useRef, useState } from 'react';

function timeAgo(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' }) + ' ' +
    d.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' });
}

export default function CommentBadge({ project, comments, onAdd, onDelete }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const btnRef = useRef(null);
  const panelRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    function onDocClick(e) {
      if (open && panelRef.current && !panelRef.current.contains(e.target) && !btnRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  function openPanel() {
    const rect = btnRef.current.getBoundingClientRect();
    let left = rect.left;
    const maxLeft = window.innerWidth - 300;
    if (left > maxLeft) left = Math.max(8, maxLeft);
    setPos({ top: rect.bottom + 4, left });
    setOpen(true);
  }

  const count = comments.length;

  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <span
        ref={btnRef}
        onClick={() => (open ? setOpen(false) : openPanel())}
        title="Notes de la semaine"
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          minWidth: 18, height: 18, borderRadius: 9, fontSize: 10, fontWeight: 700,
          cursor: 'pointer', background: count > 0 ? 'var(--red)' : 'var(--panel-2)',
          color: count > 0 ? '#fff' : 'var(--ink-dim)', border: count > 0 ? 'none' : '1px solid var(--line)',
          padding: '0 5px', verticalAlign: 'middle',
        }}
      >{count > 0 ? count : '+'}</span>

      {open && (
        <div
          ref={panelRef}
          className="filter-panel"
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: 280, display: 'block' }}
        >
          <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 6, color: 'var(--ink)' }}>
            Notes &mdash; {project.no} {project.projet}
          </div>
          <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 8 }}>
            {comments.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--ink-dim)', padding: '4px 0' }}>Aucune note pour le moment.</div>
            )}
            {comments.map((c) => (
              <div key={c.id} style={{ borderBottom: '1px solid var(--line)', padding: '6px 0', fontSize: 12.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <strong style={{ color: 'var(--ink)' }}>{c.author || 'Anonyme'}</strong>
                  <button className="del-btn" style={{ fontSize: 13 }} onClick={() => onDelete(c.id)}>&times;</button>
                </div>
                <div style={{ color: 'var(--ink)', margin: '2px 0' }}>{c.body}</div>
                <div style={{ color: 'var(--ink-dim)', fontSize: 10.5 }}>{timeAgo(c.created_at)}</div>
              </div>
            ))}
          </div>
          <textarea
            placeholder="Ex: ajouter 2 gars mardi"
            value={text}
            onChange={(e) => setText(e.target.value)}
            style={{ width: '100%', height: 50, resize: 'vertical' }}
          />
          <div className="filter-actions">
            <button className="btn ghost small" onClick={() => setOpen(false)}>Fermer</button>
            <button
              className="btn small"
              onClick={async () => {
                if (!text.trim()) return;
                await onAdd(text.trim());
                setText('');
              }}
            >Ajouter</button>
          </div>
        </div>
      )}
    </span>
  );
}

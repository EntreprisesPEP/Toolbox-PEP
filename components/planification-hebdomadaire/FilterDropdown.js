import { useEffect, useRef, useState } from 'react';

export default function FilterDropdown({ label, options, value, sortDir, onSort, onFilter }) {
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState(new Set(value || options));
  const btnRef = useRef(null);
  const panelRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => { setChecked(new Set(value || options)); }, [open]); // eslint-disable-line

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
    const maxLeft = window.innerWidth - 232;
    if (left > maxLeft) left = Math.max(8, maxLeft);
    setPos({ top: rect.bottom + 4, left });
    setOpen(true);
  }

  function toggleAll(next) {
    setChecked(next ? new Set(options) : new Set());
  }
  function toggleOne(o) {
    const next = new Set(checked);
    if (next.has(o)) next.delete(o); else next.add(o);
    setChecked(next);
  }

  return (
    <span style={{ position: 'relative', marginLeft: 4 }}>
      <span
        ref={btnRef}
        className="filter-btn"
        onClick={() => (open ? setOpen(false) : openPanel())}
        title={`Trier / filtrer par ${label}`}
      >&#9660;</span>
      {open && (
        <div className="filter-panel" ref={panelRef} style={{ position: 'fixed', top: pos.top, left: pos.left, display: 'block' }}>
          <div className="filter-sort-opt" onClick={() => { onSort('asc'); setOpen(false); }}>&#8593; Trier de A a Z</div>
          <div className="filter-sort-opt" onClick={() => { onSort('desc'); setOpen(false); }}>&#8595; Trier de Z a A</div>
          <div className="filter-divider" />
          <label className="filter-check-all">
            <input type="checkbox" checked={checked.size === options.length} onChange={(e) => toggleAll(e.target.checked)} />
            (Tout selectionner)
          </label>
          <div className="filter-check-list">
            {options.length === 0 && <div style={{ padding: '6px 8px', color: 'var(--ink-dim)' }}>Aucune valeur</div>}
            {options.map((o) => (
              <label className="filter-check-item" key={o}>
                <input type="checkbox" checked={checked.has(o)} onChange={() => toggleOne(o)} />
                {o}
              </label>
            ))}
          </div>
          <div className="filter-actions">
            <button className="btn ghost small" onClick={() => setOpen(false)}>Annuler</button>
            <button
              className="btn small"
              onClick={() => {
                onFilter(checked.size === options.length ? null : [...checked]);
                setOpen(false);
              }}
            >OK</button>
          </div>
        </div>
      )}
    </span>
  );
}

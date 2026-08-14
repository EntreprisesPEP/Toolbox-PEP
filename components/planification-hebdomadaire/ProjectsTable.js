import { useEffect, useMemo, useRef, useState } from 'react';
import StatusCell from './StatusCell';
import FilterDropdown from './FilterDropdown';
import CommentBadge from './CommentBadge';
import { statusColor } from '../../lib/planification-hebdomadaire/statusColors';

function AutoTextarea({ value, editable, onChange }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.value !== (value || '')) el.value = value || '';
    el.style.height = '32px';
    el.style.height = Math.max(32, el.scrollHeight) + 'px';
  }, [value]);

  if (!editable) return <span>{value || ''}</span>;
  return (
    <textarea
      ref={ref}
      defaultValue={value || ''}
      onInput={(e) => { e.target.style.height = '32px'; e.target.style.height = Math.max(32, e.target.scrollHeight) + 'px'; }}
      onBlur={(e) => e.target.value !== (value || '') && onChange(e.target.value)}
    />
  );
}

export default function ProjectsTable({ rows, editable, theme, onUpdate, board, emptyLabel, highlightedId, onHighlight }) {
  const [sortField, setSortField] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [filterCharge, setFilterCharge] = useState(null);
  const [filterSurint, setFilterSurint] = useState(null);

  const chargeOptions = useMemo(() => [...new Set(rows.map((r) => r.charge).filter(Boolean))].sort(), [rows]);
  const surintOptions = useMemo(() => [...new Set(rows.map((r) => r.surintendant).filter(Boolean))].sort(), [rows]);

  const visible = useMemo(() => {
    let list = rows.filter(
      (r) => (!filterCharge || filterCharge.includes(r.charge)) && (!filterSurint || filterSurint.includes(r.surintendant))
    );
    if (sortField) {
      list = [...list].sort((a, b) => (a[sortField] || '').localeCompare(b[sortField] || ''));
      if (sortDir === 'desc') list.reverse();
    }
    return list;
  }, [rows, filterCharge, filterSurint, sortField, sortDir]);

  function sortBy(field, dir) {
    setSortField(field);
    setSortDir(dir);
  }

  return (
    <div className="scrollx">
      <table className="projtable">
        <colgroup>
          <col style={{ width: '15%' }} /><col style={{ width: '14%' }} /><col style={{ width: '35%' }} />
          <col style={{ width: '6%' }} /><col style={{ width: '6%' }} /><col style={{ width: '9%' }} />
          <col style={{ width: '10%' }} /><col style={{ width: '5%' }} />
        </colgroup>
        <thead>
          <tr>
            <th>No / Projet</th>
            <th>Statut</th>
            <th>Commentaire</th>
            <th style={{ textAlign: 'right' }}>Sem 1</th>
            <th style={{ textAlign: 'right' }}>Sem 2</th>
            <th>
              Charge
              <FilterDropdown
                label="charge de projet"
                options={chargeOptions}
                value={filterCharge}
                onSort={(dir) => sortBy('charge', dir)}
                onFilter={setFilterCharge}
              />
            </th>
            <th>
              Surintendant
              <FilterDropdown
                label="surintendant"
                options={surintOptions}
                value={filterSurint}
                onSort={(dir) => sortBy('surintendant', dir)}
                onFilter={setFilterSurint}
              />
            </th>
            <th />
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 && <tr><td colSpan={8} className="empty">{emptyLabel || 'Aucun projet.'}</td></tr>}
          {visible.map((p) => {
            const col = statusColor(p.statut, theme);
            const projComments = board.commentsFor(p.id);
            const isHighlighted = highlightedId && p.id === highlightedId;
            const rowStyle = isHighlighted ? { background: '#FFF3B0' } : (col ? { background: col.bg } : undefined);
            return (
              <tr key={p.id} style={rowStyle}>
                <td
                  onClick={onHighlight ? () => onHighlight(p.id) : undefined}
                  style={onHighlight ? { cursor: 'pointer' } : undefined}
                  title={onHighlight ? 'Cliquer pour surligner ce projet pour tout le monde' : undefined}
                >
                  <span className="jobline" title={`${p.no} ${p.projet}`}>
                    <span className="no">{p.no}</span>{p.projet}
                  </span>
                </td>
                <td>
                  <StatusCell project={p} editable={editable} onChange={(patch) => onUpdate(p.id, patch)} />
                </td>
                <td>
                  <AutoTextarea value={p.commentaire} editable={editable} onChange={(v) => onUpdate(p.id, { commentaire: v })} />
                </td>
                <td style={{ textAlign: 'right' }}>
                  <span
                    className={`need-chip ${p.s1 ? 'need-yes' : 'need-no'} ${editable ? '' : 'readonly'}`}
                    onClick={() => editable && onUpdate(p.id, { s1: !p.s1 })}
                  >{p.s1 ? 'OUI' : 'NON'}</span>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <span
                    className={`need-chip ${p.s2 ? 'need-yes' : 'need-no'} ${editable ? '' : 'readonly'}`}
                    onClick={() => editable && onUpdate(p.id, { s2: !p.s2 })}
                  >{p.s2 ? 'OUI' : 'NON'}</span>
                </td>
                <td>{p.charge}</td>
                <td>{p.surintendant}</td>
                <td style={{ textAlign: 'center' }}>
                  <CommentBadge
                    project={p}
                    comments={projComments}
                    onAdd={(body, author) => board.addComment(p.id, body, author)}
                    onDelete={(id) => board.deleteComment(id)}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

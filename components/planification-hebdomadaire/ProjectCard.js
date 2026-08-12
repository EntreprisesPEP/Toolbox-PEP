import StatusCell from './StatusCell';
import CommentBadge from './CommentBadge';
import { statusColor } from '../../lib/planification-hebdomadaire/statusColors';

function CardTextarea({ value, editable, onChange }) {
  if (!editable) return <div className="mc-value">{value || '\u2014'}</div>;
  return (
    <textarea
      defaultValue={value || ''}
      onInput={(e) => { e.target.style.height = '32px'; e.target.style.height = Math.max(32, e.target.scrollHeight) + 'px'; }}
      onBlur={(e) => e.target.value !== (value || '') && onChange(e.target.value)}
    />
  );
}

export default function ProjectCard({ project: p, editable, theme, onUpdate, board }) {
  const col = statusColor(p.statut, theme);
  const projComments = board.commentsFor(p.id);

  return (
    <div className="mobile-card" style={col ? { background: col.bg } : undefined}>
      <div className="mc-head">
        <span className="jobline">
          <span className="no">{p.no}</span>{p.projet}
        </span>
        <CommentBadge
          project={p}
          comments={projComments}
          onAdd={(body, author) => board.addComment(p.id, body, author)}
          onDelete={(id) => board.deleteComment(id)}
        />
      </div>

      <div className="mc-row">
        <span className="mc-label">Statut</span>
        <StatusCell project={p} editable={editable} onChange={(patch) => onUpdate(p.id, patch)} />
      </div>

      <div className="mc-row mc-col">
        <span className="mc-label">Commentaire</span>
        <CardTextarea value={p.commentaire} editable={editable} onChange={(v) => onUpdate(p.id, { commentaire: v })} />
      </div>

      <div className="mc-row mc-split">
        <div>
          <span className="mc-label">Sem 1</span>
          <span
            className={`need-chip ${p.s1 ? 'need-yes' : 'need-no'} ${editable ? '' : 'readonly'}`}
            onClick={() => editable && onUpdate(p.id, { s1: !p.s1 })}
          >{p.s1 ? 'OUI' : 'NON'}</span>
        </div>
        <div>
          <span className="mc-label">Sem 2</span>
          <span
            className={`need-chip ${p.s2 ? 'need-yes' : 'need-no'} ${editable ? '' : 'readonly'}`}
            onClick={() => editable && onUpdate(p.id, { s2: !p.s2 })}
          >{p.s2 ? 'OUI' : 'NON'}</span>
        </div>
      </div>

      <div className="mc-row mc-split">
        <div>
          <span className="mc-label">Charge</span>
          <div className="mc-value">{p.charge || '\u2014'}</div>
        </div>
        <div>
          <span className="mc-label">Surintendant</span>
          <div className="mc-value">{p.surintendant || '\u2014'}</div>
        </div>
      </div>
    </div>
  );
}

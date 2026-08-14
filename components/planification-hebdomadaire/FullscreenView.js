import { useEffect } from 'react';
import StatusCell from './StatusCell';

export default function FullscreenView({ open, onClose, activeProjects }) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'var(--page)', zIndex: 9999, overflow: 'auto',
      }}
    >
      <div
        style={{
          position: 'sticky', top: 0, background: 'var(--navy)', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', fontFamily: "'Oswald',sans-serif", fontSize: 18,
          fontWeight: 700, zIndex: 1,
        }}
      >
        <span>SUIVI DES PROJETS &mdash; PLEIN ECRAN</span>
        <button
          onClick={onClose}
          title="Fermer (Echap)"
          style={{
            background: 'none', border: '1.5px solid #fff', color: '#fff',
            borderRadius: 6, width: 34, height: 34, fontSize: 18, cursor: 'pointer',
          }}
        >&times;</button>
      </div>

      <div style={{ padding: 16 }} className="scrollx">
        <table className="projtable">
          <colgroup>
            <col style={{ width: '18%' }} /><col style={{ width: '12%' }} /><col style={{ width: '55%' }} />
            <col style={{ width: '7.5%' }} /><col style={{ width: '7.5%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>No / Projet</th>
              <th>Statut</th>
              <th>Commentaire</th>
              <th style={{ textAlign: 'right' }}>Sem 1</th>
              <th style={{ textAlign: 'right' }}>Sem 2</th>
            </tr>
          </thead>
          <tbody>
            {activeProjects.length === 0 && <tr><td colSpan={5} className="empty">Aucun projet actif.</td></tr>}
            {activeProjects.map((p) => (
              <tr key={p.id}>
                <td>
                  <span className="jobline" title={`${p.no} ${p.projet}`}>
                    <span className="no">{p.no}</span>{p.projet}
                  </span>
                </td>
                <td><StatusCell project={p} editable={false} onChange={() => {}} /></td>
                <td>{p.commentaire || ''}</td>
                <td style={{ textAlign: 'right' }}>
                  <span className={`need-chip readonly ${p.s1 ? 'need-yes' : 'need-no'}`}>{p.s1 ? 'OUI' : 'NON'}</span>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <span className={`need-chip readonly ${p.s2 ? 'need-yes' : 'need-no'}`}>{p.s2 ? 'OUI' : 'NON'}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

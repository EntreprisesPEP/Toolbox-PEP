import { useState } from 'react';
import ConfirmModal from './ConfirmModal';

function NameOptions({ list, selected }) {
  return (
    <>
      <option value="">&mdash;</option>
      {selected && !list.includes(selected) && <option value={selected}>{selected}</option>}
      {list.map((n) => <option key={n} value={n}>{n}</option>)}
    </>
  );
}

export default function AdminView({ board, editable }) {
  const { projects, charges, surintendants, contremaitres,
    addProject, updateProject, deleteProject,
    addCharge, deleteCharge, addSurintendant, deleteSurintendant,
    addContremaitre, updateContremaitre, deleteContremaitre } = board;

  const [newProj, setNewProj] = useState({ no: '', projet: '', charge: '', surintendant: '' });
  const [newCharge, setNewCharge] = useState('');
  const [newSurint, setNewSurint] = useState('');
  const [newCm, setNewCm] = useState('');
  const [confirmDel, setConfirmDel] = useState(null); // {id, label}

  return (
    <div className="panel">
      <h2>Liste des projets</h2>
      <p className="desc">
        Section administrative : ajoute, corrige ou retire un projet ici. Ces changements
        alimentent Meeting 1 et Meeting 2, ou les noms restent fixes.
      </p>
      {editable && (
        <div className="admin-add">
          <input type="text" placeholder="No de job" value={newProj.no} onChange={(e) => setNewProj({ ...newProj, no: e.target.value })} />
          <input type="text" placeholder="Nom du projet" value={newProj.projet} onChange={(e) => setNewProj({ ...newProj, projet: e.target.value })} />
          <select value={newProj.charge} onChange={(e) => setNewProj({ ...newProj, charge: e.target.value })}>
            <NameOptions list={charges} selected="" />
          </select>
          <select value={newProj.surintendant} onChange={(e) => setNewProj({ ...newProj, surintendant: e.target.value })}>
            <NameOptions list={surintendants} selected="" />
          </select>
          <button
            className="btn"
            onClick={async () => {
              if (!newProj.projet.trim()) return;
              await addProject(newProj);
              setNewProj({ no: '', projet: '', charge: '', surintendant: '' });
            }}
          >+ Ajouter</button>
        </div>
      )}

      <div className="scrollx">
        <table>
          <thead><tr><th>No</th><th>Projet</th><th>Charge</th><th>Surintendant</th><th /></tr></thead>
          <tbody>
            {projects.length === 0 && <tr><td colSpan={5} className="empty">Aucun projet.</td></tr>}
            {projects.map((p) => (
              <tr key={p.id}>
                {editable ? (
                  <>
                    <td><input type="text" defaultValue={p.no} onBlur={(e) => e.target.value !== p.no && updateProject(p.id, { no: e.target.value })} /></td>
                    <td><input type="text" defaultValue={p.projet} onBlur={(e) => e.target.value !== p.projet && updateProject(p.id, { projet: e.target.value })} /></td>
                    <td>
                      <select value={p.charge || ''} onChange={(e) => updateProject(p.id, { charge: e.target.value })}>
                        <NameOptions list={charges} selected={p.charge} />
                      </select>
                    </td>
                    <td>
                      <select value={p.surintendant || ''} onChange={(e) => updateProject(p.id, { surintendant: e.target.value })}>
                        <NameOptions list={surintendants} selected={p.surintendant} />
                      </select>
                    </td>
                    <td>
                      <button className="del-btn" onClick={() => setConfirmDel({ id: p.id, label: `${p.no} - ${p.projet}` })}>&times;</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td>{p.no}</td><td>{p.projet}</td><td>{p.charge}</td><td>{p.surintendant}</td><td />
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Charges de projet</h3>
      <div className="name-list">
        {charges.length === 0 && <span style={{ fontSize: 12, color: 'var(--ink-dim)' }}>Aucun nom.</span>}
        {charges.map((n) => (
          <span className="name-chip" key={n}>
            {n}
            {editable && <button className="del-btn" onClick={() => deleteCharge(n)}>&times;</button>}
          </span>
        ))}
      </div>
      {editable && (
        <div className="name-add">
          <input type="text" placeholder="Nom du charge de projet" value={newCharge} onChange={(e) => setNewCharge(e.target.value)} />
          <button className="btn ghost" onClick={async () => { if (!newCharge.trim()) return; await addCharge(newCharge.trim()); setNewCharge(''); }}>+ Ajouter</button>
        </div>
      )}

      <h3>Surintendants</h3>
      <div className="name-list">
        {surintendants.length === 0 && <span style={{ fontSize: 12, color: 'var(--ink-dim)' }}>Aucun nom.</span>}
        {surintendants.map((n) => (
          <span className="name-chip" key={n}>
            {n}
            {editable && <button className="del-btn" onClick={() => deleteSurintendant(n)}>&times;</button>}
          </span>
        ))}
      </div>
      {editable && (
        <div className="name-add">
          <input type="text" placeholder="Nom du surintendant" value={newSurint} onChange={(e) => setNewSurint(e.target.value)} />
          <button className="btn ghost" onClick={async () => { if (!newSurint.trim()) return; await addSurintendant(newSurint.trim()); setNewSurint(''); }}>+ Ajouter</button>
        </div>
      )}

      <h3>Contremaitres</h3>
      <div className="scrollx">
        <table>
          <thead><tr><th>Nom</th><th /></tr></thead>
          <tbody>
            {contremaitres.length === 0 && <tr><td colSpan={2} className="empty">Aucun contremaitre.</td></tr>}
            {contremaitres.map((c) => (
              <tr key={c.id}>
                {editable ? (
                  <>
                    <td><input type="text" defaultValue={c.nom} onBlur={(e) => e.target.value !== c.nom && updateContremaitre(c.id, e.target.value)} /></td>
                    <td><button className="del-btn" onClick={() => deleteContremaitre(c.id)}>&times;</button></td>
                  </>
                ) : (
                  <><td>{c.nom}</td><td /></>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editable && (
        <div className="name-add">
          <input type="text" placeholder="Nom du contremaitre ou de l'equipe" value={newCm} onChange={(e) => setNewCm(e.target.value)} />
          <button className="btn ghost" onClick={async () => { if (!newCm.trim()) return; await addContremaitre(newCm.trim()); setNewCm(''); }}>+ Ajouter</button>
        </div>
      )}

      <ConfirmModal
        open={!!confirmDel}
        message={confirmDel ? `Voulez-vous vraiment supprimer ${confirmDel.label} ?` : ''}
        onOk={async () => { await deleteProject(confirmDel.id); setConfirmDel(null); }}
        onCancel={() => setConfirmDel(null)}
      />
    </div>
  );
}

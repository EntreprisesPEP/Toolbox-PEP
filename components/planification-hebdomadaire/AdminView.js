import { useState } from 'react';
import { Plus, X, Trash2, Lightbulb, ClipboardList, Users, HardHat } from 'lucide-react';
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

function initiales(nom) {
  if (!nom) return '';
  const parties = nom.trim().split(/\s+/);
  return parties.slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('');
}

function NameCard({ titre, Icone, list, newValue, setNewValue, onAdd, onDelete, placeholder, editable }) {
  return (
    <div className="admin-card">
      <div className="admin-card-title">
        <Icone size={16} color="var(--navy)" aria-hidden="true" />
        <span className="label">{titre}</span>
      </div>
      <div className="name-list">
        {list.length === 0 && <span style={{ fontSize: 12, color: 'var(--ink-dim)' }}>Aucun nom.</span>}
        {list.map((n) => (
          <span className="name-chip" key={n}>
            {n}
            {editable && <button className="del-btn" onClick={() => onDelete(n)} aria-label={`Retirer ${n}`}><X size={13} /></button>}
          </span>
        ))}
      </div>
      {editable && (
        <div className="name-add">
          <input type="text" placeholder={placeholder} value={newValue} onChange={(e) => setNewValue(e.target.value)} />
          <button className="btn ghost" onClick={async () => { if (!newValue.trim()) return; await onAdd(newValue.trim()); setNewValue(''); }}>
            <Plus size={14} style={{ verticalAlign: -2, marginRight: 4 }} />Ajouter
          </button>
        </div>
      )}
    </div>
  );
}

export default function AdminView({ board, editable }) {
  const { projects, charges, surintendants, contremaitres,
    addProject, updateProject, deleteProject,
    addCharge, deleteCharge, addSurintendant, deleteSurintendant,
    addContremaitre, deleteContremaitre,
    projetsSuggeres, importerSuggestion, ignorerSuggestion } = board;

  const [newProj, setNewProj] = useState({ no: '', projet: '', charge: '', surintendant: '' });
  const [newCharge, setNewCharge] = useState('');
  const [newSurint, setNewSurint] = useState('');
  const [newCm, setNewCm] = useState('');
  const [confirmDel, setConfirmDel] = useState(null); // {id, label}
  const [enCours, setEnCours] = useState(null); // id de suggestion en cours d'import/ignore

  async function handleImporter(s) {
    setEnCours(s.id);
    try { await importerSuggestion(s); } finally { setEnCours(null); }
  }
  async function handleIgnorer(id) {
    setEnCours(id);
    try { await ignorerSuggestion(id); } finally { setEnCours(null); }
  }

  return (
    <div>
      {editable && (
        <div className="admin-card">
          <div className="admin-card-title">
            <Plus size={18} color="var(--red)" aria-hidden="true" />
            <span className="label">Ajouter un projet</span>
          </div>
          <div className="admin-add-grid">
            <div>
              <label>No de job</label>
              <input type="text" placeholder="26-720" value={newProj.no} onChange={(e) => setNewProj({ ...newProj, no: e.target.value })} />
            </div>
            <div>
              <label>Nom du projet</label>
              <input type="text" placeholder="Nom du projet" value={newProj.projet} onChange={(e) => setNewProj({ ...newProj, projet: e.target.value })} />
            </div>
            <div>
              <label>Chargé</label>
              <select value={newProj.charge} onChange={(e) => setNewProj({ ...newProj, charge: e.target.value })}>
                <NameOptions list={charges} selected="" />
              </select>
            </div>
            <div>
              <label>Surintendant</label>
              <select value={newProj.surintendant} onChange={(e) => setNewProj({ ...newProj, surintendant: e.target.value })}>
                <NameOptions list={surintendants} selected="" />
              </select>
            </div>
            <button
              className="btn"
              onClick={async () => {
                if (!newProj.projet.trim()) return;
                await addProject(newProj);
                setNewProj({ no: '', projet: '', charge: '', surintendant: '' });
              }}
            >Ajouter</button>
          </div>
        </div>
      )}

      {editable && projetsSuggeres.length > 0 && (
        <div className="suggestion-card">
          <div className="admin-card-title">
            <Lightbulb size={18} color="#854F0B" aria-hidden="true" />
            <span className="label">Suggestions d'ajout</span>
            <span className="suggestion-badge">{projetsSuggeres.length}</span>
          </div>
          <p className="card-desc">Nouveaux projets créés dans Liste des projets, pas encore importés ici.</p>
          {projetsSuggeres.map((s) => (
            <div className="suggestion-row" key={s.id}>
              <div>
                <span className="titre">{s.projet_no} — {s.nom}</span>
                <div className="sous">
                  {s.client ? `Client ${s.client}` : ''}{s.client && s.charge ? ' · ' : ''}{s.charge ? `Chargé ${s.charge}` : ''}
                </div>
              </div>
              <div className="actions">
                <button className="btn-importer" disabled={enCours === s.id} onClick={() => handleImporter(s)}>
                  <Plus size={14} />Importer
                </button>
                <button className="btn-ignorer" disabled={enCours === s.id} onClick={() => handleIgnorer(s.id)} aria-label="Ignorer">
                  <X size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="admin-card">
        <div className="admin-card-title">
          <ClipboardList size={18} color="var(--navy)" aria-hidden="true" />
          <span className="label">Projets actifs</span>
          <span className="count">{projects.length}</span>
        </div>
        {editable && <p className="card-desc">Clique une cellule pour la modifier.</p>}
        <div className="admin-table-wrap">
          <table>
            <thead><tr><th>No</th><th>Projet</th><th>Chargé</th><th>Surintendant</th><th /></tr></thead>
            <tbody>
              {projects.length === 0 && <tr><td colSpan={5} className="empty">Aucun projet.</td></tr>}
              {projects.map((p) => (
                <tr key={p.id}>
                  {editable ? (
                    <>
                      <td><input className="admin-input-ghost no" type="text" defaultValue={p.no} onBlur={(e) => e.target.value !== p.no && updateProject(p.id, { no: e.target.value })} /></td>
                      <td><input className="admin-input-ghost" type="text" defaultValue={p.projet} onBlur={(e) => e.target.value !== p.projet && updateProject(p.id, { projet: e.target.value })} /></td>
                      <td>
                        <select className="admin-input-ghost" value={p.charge || ''} onChange={(e) => updateProject(p.id, { charge: e.target.value })}>
                          <NameOptions list={charges} selected={p.charge} />
                        </select>
                      </td>
                      <td>
                        <select className="admin-input-ghost" value={p.surintendant || ''} onChange={(e) => updateProject(p.id, { surintendant: e.target.value })}>
                          <NameOptions list={surintendants} selected={p.surintendant} />
                        </select>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button className="del-btn" onClick={() => setConfirmDel({ id: p.id, label: `${p.no} - ${p.projet}` })} aria-label="Supprimer"><Trash2 size={15} /></button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>
                        <span className="avatar-chip">{p.no}</span>
                      </td>
                      <td>{p.projet}</td>
                      <td>{p.charge && <span className="avatar-chip"><span className="avatar-circle">{initiales(p.charge)}</span>{p.charge}</span>}</td>
                      <td>{p.surintendant && <span className="avatar-chip"><span className="avatar-circle">{initiales(p.surintendant)}</span>{p.surintendant}</span>}</td>
                      <td />
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="admin-grid-3">
        <NameCard
          titre="Chargés de projet" Icone={Users} list={charges}
          newValue={newCharge} setNewValue={setNewCharge}
          onAdd={addCharge} onDelete={deleteCharge} editable={editable}
          placeholder="Nom du chargé de projet"
        />
        <NameCard
          titre="Surintendants" Icone={HardHat} list={surintendants}
          newValue={newSurint} setNewValue={setNewSurint}
          onAdd={addSurintendant} onDelete={deleteSurintendant} editable={editable}
          placeholder="Nom du surintendant"
        />
        <NameCard
          titre="Contremaîtres" Icone={HardHat} list={contremaitres.map((c) => c.nom)}
          newValue={newCm} setNewValue={setNewCm}
          onAdd={addContremaitre}
          onDelete={(nom) => { const c = contremaitres.find((x) => x.nom === nom); if (c) deleteContremaitre(c.id); }}
          editable={editable}
          placeholder="Nom du contremaitre ou de l'equipe"
        />
      </div>

      <ConfirmModal
        open={!!confirmDel}
        message={confirmDel ? `Voulez-vous vraiment supprimer ${confirmDel.label} ?` : ''}
        onOk={async () => { await deleteProject(confirmDel.id); setConfirmDel(null); }}
        onCancel={() => setConfirmDel(null)}
      />
    </div>
  );
}

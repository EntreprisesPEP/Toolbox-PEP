import { useState } from 'react';
import { Plus, Trash2, Palmtree } from 'lucide-react';
import ConfirmModal from './ConfirmModal';
import { joursOuvrables, formatDateFr } from '../../lib/planification-hebdomadaire/dates';

// ---------------------------------------------------------------------------
// VACANCES / CONGES — revision 72
//
// Qui est absent, de quand a quand, et combien de jours ouvrables ca fait.
//
// Le nombre de jours est CALCULE a partir des deux dates, jamais enregistre :
// une colonne stockee finit par contredire les dates le jour ou quelqu'un
// corrige une borne. Voir `joursOuvrables` dans lib/.../dates.js — samedi et
// dimanche exclus, jours feries non deduits (et c'est dit a l'ecran).
//
// Les noms viennent du bottin (app Liste du personnel), comme partout
// ailleurs dans cette app, et choisir un nom remplit le titre tout seul. Le
// titre reste modifiable : il arrive qu'on veuille ecrire autre chose que le
// titre officiel, et une personne hors bottin doit pouvoir etre saisie a la
// main.
// ---------------------------------------------------------------------------

const VIDE = { nom: '', titre: '', date_debut: '', date_fin: '', commentaire: '' };

export default function VacancesView({ board, editable }) {
  const { vacances, bottin, addVacance, updateVacance, deleteVacance } = board;
  const [nouveau, setNouveau] = useState(VIDE);
  const [confirmDel, setConfirmDel] = useState(null);

  const titreDe = new Map((bottin || []).map((p) => [p.nom, p.titre || '']));
  const nomsBottin = [...titreDe.keys()].sort((a, b) => a.localeCompare(b, 'fr'));

  const totalJours = vacances.reduce((t, v) => t + (joursOuvrables(v.date_debut, v.date_fin) || 0), 0);

  function choisirNom(nom) {
    setNouveau((n) => ({ ...n, nom, titre: titreDe.get(nom) ?? n.titre }));
  }

  const peutAjouter = nouveau.nom.trim() && nouveau.date_debut && nouveau.date_fin
    && joursOuvrables(nouveau.date_debut, nouveau.date_fin) !== null;

  return (
    <div className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <h2 className="big-title">VACANCES / CONGÉS</h2>
        <div style={{ fontSize: 12.5, color: 'var(--ink-dim)', textAlign: 'right', lineHeight: 1.6 }}>
          {vacances.length} absence{vacances.length > 1 ? 's' : ''}
          {totalJours > 0 && <> · {totalJours} jour{totalJours > 1 ? 's' : ''} ouvrable{totalJours > 1 ? 's' : ''} en tout</>}
        </div>
      </div>

      <p className="desc">
        Les jours ouvrables se comptent du lundi au vendredi, les deux dates incluses.
        Les jours fériés ne sont pas déduits.
      </p>

      {editable && (
        <div className="admin-card">
          <div className="admin-card-title">
            <Plus size={18} color="var(--red)" aria-hidden="true" />
            <span className="label">Ajouter une absence</span>
          </div>
          <div className="vac-add-grid">
            <div>
              <label>Nom</label>
              <input
                type="text"
                list="vac-noms"
                placeholder="Nom de la personne"
                value={nouveau.nom}
                onChange={(e) => choisirNom(e.target.value)}
              />
              <datalist id="vac-noms">
                {nomsBottin.map((n) => <option key={n} value={n} />)}
              </datalist>
            </div>
            <div>
              <label>Titre</label>
              <input type="text" placeholder="Titre" value={nouveau.titre} onChange={(e) => setNouveau({ ...nouveau, titre: e.target.value })} />
            </div>
            <div>
              <label>Début</label>
              <input type="date" value={nouveau.date_debut} onChange={(e) => setNouveau({ ...nouveau, date_debut: e.target.value })} />
            </div>
            <div>
              <label>Fin</label>
              <input type="date" value={nouveau.date_fin} onChange={(e) => setNouveau({ ...nouveau, date_fin: e.target.value })} />
            </div>
            <div>
              <label>Jours ouvrables</label>
              <div className="vac-calcule">{joursOuvrables(nouveau.date_debut, nouveau.date_fin) ?? '—'}</div>
            </div>
            <div style={{ gridColumn: '1 / -2' }}>
              <label>Commentaire</label>
              <input type="text" placeholder="Facultatif" value={nouveau.commentaire} onChange={(e) => setNouveau({ ...nouveau, commentaire: e.target.value })} />
            </div>
            <button
              className="btn"
              disabled={!peutAjouter}
              onClick={async () => {
                if (!peutAjouter) return;
                await addVacance({
                  nom: nouveau.nom.trim(),
                  titre: nouveau.titre.trim() || null,
                  date_debut: nouveau.date_debut,
                  date_fin: nouveau.date_fin,
                  commentaire: nouveau.commentaire.trim() || null,
                });
                setNouveau(VIDE);
              }}
            >Ajouter</button>
          </div>
          {nouveau.date_debut && nouveau.date_fin && joursOuvrables(nouveau.date_debut, nouveau.date_fin) === null && (
            <p className="card-desc" style={{ color: 'var(--red)', marginTop: 8 }}>
              La date de fin est avant la date de début.
            </p>
          )}
        </div>
      )}

      <div className="admin-card">
        <div className="admin-card-title">
          <Palmtree size={18} color="var(--navy)" aria-hidden="true" />
          <span className="label">Absences</span>
          <span className="count">{vacances.length}</span>
        </div>
        <div className="admin-table-wrap">
          <table className="vac-table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Titre</th>
                <th>Début</th>
                <th>Fin</th>
                <th className="ctr">Jours ouvrables</th>
                <th>Commentaire</th>
                {editable && <th />}
              </tr>
            </thead>
            <tbody>
              {vacances.length === 0 && (
                <tr><td colSpan={editable ? 7 : 6} className="empty">Aucune absence inscrite.</td></tr>
              )}
              {vacances.map((v) => {
                const jours = joursOuvrables(v.date_debut, v.date_fin);
                return (
                  <tr key={v.id}>
                    <td data-label="Nom" className="cell-titre">
                      {editable
                        ? <input className="admin-input-ghost" type="text" list="vac-noms" defaultValue={v.nom || ''} onBlur={(e) => e.target.value !== (v.nom || '') && updateVacance(v.id, { nom: e.target.value })} />
                        : <strong>{v.nom}</strong>}
                    </td>
                    <td data-label="Titre">
                      {editable
                        ? <input className="admin-input-ghost" type="text" defaultValue={v.titre || ''} onBlur={(e) => e.target.value !== (v.titre || '') && updateVacance(v.id, { titre: e.target.value })} />
                        : (v.titre || '—')}
                    </td>
                    <td data-label="Début">
                      {editable
                        ? <input className="admin-input-ghost" type="date" value={v.date_debut || ''} onChange={(e) => updateVacance(v.id, { date_debut: e.target.value || null })} />
                        : formatDateFr(v.date_debut)}
                    </td>
                    <td data-label="Fin">
                      {editable
                        ? <input className="admin-input-ghost" type="date" value={v.date_fin || ''} onChange={(e) => updateVacance(v.id, { date_fin: e.target.value || null })} />
                        : formatDateFr(v.date_fin)}
                    </td>
                    <td className="ctr" data-label="Jours ouvrables">
                      {jours === null
                        ? <span style={{ color: 'var(--red)' }} title="La date de fin est avant la date de début">!</span>
                        : <strong>{jours}</strong>}
                    </td>
                    <td data-label="Commentaire">
                      {editable
                        ? <input className="admin-input-ghost" type="text" defaultValue={v.commentaire || ''} onBlur={(e) => e.target.value !== (v.commentaire || '') && updateVacance(v.id, { commentaire: e.target.value })} />
                        : (v.commentaire || '—')}
                    </td>
                    {editable && (
                      <td style={{ textAlign: 'center' }} className="cell-action">
                        <button className="del-btn" aria-label="Supprimer cette absence" onClick={() => setConfirmDel({ id: v.id, label: v.nom })}>
                          <Trash2 size={15} />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmModal
        open={!!confirmDel}
        message={confirmDel ? `Supprimer l'absence de ${confirmDel.label} ?` : ''}
        okLabel="Supprimer"
        onOk={async () => { await deleteVacance(confirmDel.id); setConfirmDel(null); }}
        onCancel={() => setConfirmDel(null)}
      />
    </div>
  );
}

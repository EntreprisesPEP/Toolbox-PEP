import { useState } from 'react';
import { Plus, Trash2, Scissors, Check } from 'lucide-react';
import ConfirmModal from './ConfirmModal';

// ---------------------------------------------------------------------------
// COUPE DE RUE — revision 72
//
// Le suivi des coupes de rue a faire. Ce ne sont PAS tous les projets : on
// ajoute une ligne pour un projet quand une coupe se profile, et on la retire
// quand c'est fini.
//
// Le charge et le surintendant ne se saisissent pas ici — ils viennent du
// projet. Les recopier aurait voulu dire deux endroits a corriger le jour ou
// un projet change de main, donc deux ecrans qui finissent par se contredire.
//
// « Pret » est une colonne calculee, pas une case a cocher : les trois permis
// coches, c'est pret. Un quatrieme interrupteur qu'il faudrait penser a lever
// aurait juste pu mentir.
// ---------------------------------------------------------------------------

// Le percement sous pression n'est pas une case a cocher : il faut pouvoir
// distinguer « non coordonne » (on le sait, et c'est un probleme) de « pas
// encore regarde » (la case vide). Une case a cocher dit la meme chose dans
// les deux cas.
const PERCEMENT = [
  { valeur: '', label: '—' },
  { valeur: 'oui', label: 'Coordonne' },
  { valeur: 'non', label: 'Non coordonne' },
];

function estPrete(c) {
  return Boolean(c.permis_coupe && c.plan_signalisation && c.permis_occupation);
}

function Case({ coche, editable, onChange, aria }) {
  if (!editable) {
    return <span style={{ color: coche ? 'var(--vert)' : 'var(--ink-dim)', fontWeight: 700 }}>{coche ? '✓' : '—'}</span>;
  }
  return (
    <input
      type="checkbox"
      checked={!!coche}
      onChange={(e) => onChange(e.target.checked)}
      aria-label={aria}
      style={{ width: 17, height: 17, cursor: 'pointer', accentColor: 'var(--red)' }}
    />
  );
}

export default function CoupesView({ board, editable }) {
  const { projects, coupes, addCoupe, updateCoupe, deleteCoupe } = board;
  const [nouveauProjet, setNouveauProjet] = useState('');
  const [confirmDel, setConfirmDel] = useState(null);

  const parId = new Map(projects.map((p) => [String(p.id), p]));
  const pretes = coupes.filter(estPrete).length;

  return (
    <div className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <h2 className="big-title">COUPE DE RUE</h2>
        <div style={{ fontSize: 12.5, color: 'var(--ink-dim)', textAlign: 'right', lineHeight: 1.6 }}>
          {coupes.length} coupe{coupes.length > 1 ? 's' : ''} au suivi
          {coupes.length > 0 && <> · <strong style={{ color: pretes === coupes.length ? 'var(--vert)' : 'var(--ink-dim)' }}>{pretes} prête{pretes > 1 ? 's' : ''}</strong></>}
        </div>
      </div>

      <p className="desc">
        Les projets où une coupe de rue est à faire. Une coupe est <strong>prête</strong> quand les
        trois documents sont obtenus : permis de coupe, plan de signalisation, permis d&rsquo;occupation.
        Le chargé et le surintendant sont ceux du projet — ils se changent dans l&rsquo;onglet Admin.
      </p>

      {editable && (
        <div className="admin-card">
          <div className="admin-card-title">
            <Plus size={18} color="var(--red)" aria-hidden="true" />
            <span className="label">Ajouter une coupe</span>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 280px', minWidth: 0 }}>
              <label style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-dim)', fontWeight: 700, marginBottom: 4 }}>
                Projet
              </label>
              <select
                value={nouveauProjet}
                onChange={(e) => setNouveauProjet(e.target.value)}
                style={{ width: '100%' }}
              >
                <option value="">Choisir un projet…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.no} — {p.projet}</option>
                ))}
              </select>
            </div>
            <button
              className="btn"
              disabled={!nouveauProjet}
              onClick={async () => {
                if (!nouveauProjet) return;
                const p = parId.get(String(nouveauProjet));
                await addCoupe({ project_id: p ? p.id : nouveauProjet });
                setNouveauProjet('');
              }}
            >Ajouter</button>
          </div>
          {projects.length === 0 && (
            <p className="card-desc" style={{ marginTop: 8 }}>Aucun projet actif. Ajoute-les d&rsquo;abord dans l&rsquo;onglet Admin.</p>
          )}
        </div>
      )}

      <div className="admin-card">
        <div className="admin-card-title">
          <Scissors size={18} color="var(--navy)" aria-hidden="true" />
          <span className="label">Coupes de rue au suivi</span>
          <span className="count">{coupes.length}</span>
        </div>
        <div className="admin-table-wrap">
          <table className="coupes-table">
            <thead>
              <tr>
                <th>Projet</th>
                <th>Date exacte</th>
                <th>Date approximative</th>
                <th className="ctr">Permis de coupe</th>
                <th className="ctr">Plan de signalisation</th>
                <th className="ctr">Permis d&rsquo;occupation</th>
                <th>Percement sous pression</th>
                <th className="ctr">Prêt</th>
                <th>Chargé</th>
                <th>Surintendant</th>
                {editable && <th />}
              </tr>
            </thead>
            <tbody>
              {coupes.length === 0 && (
                <tr><td colSpan={editable ? 11 : 10} className="empty">Aucune coupe de rue au suivi.</td></tr>
              )}
              {coupes.map((c) => {
                const p = parId.get(String(c.project_id));
                const prete = estPrete(c);
                return (
                  <tr key={c.id} className={prete ? 'coupe-prete' : undefined}>
                    <td data-label="Projet" className="cell-titre">
                      {p
                        ? <><span className="avatar-chip">{p.no}</span> {p.projet}</>
                        : <span style={{ color: 'var(--ink-dim)' }}>Projet retiré de la liste</span>}
                    </td>
                    <td data-label="Date exacte">
                      {editable
                        ? <input className="admin-input-ghost" type="date" value={c.date_exacte || ''} onChange={(e) => updateCoupe(c.id, { date_exacte: e.target.value || null })} />
                        : (c.date_exacte || '—')}
                    </td>
                    <td data-label="Date approximative">
                      {editable
                        ? <input className="admin-input-ghost" type="text" placeholder="mi-juillet, sem. du 14…" defaultValue={c.date_approx || ''} onBlur={(e) => e.target.value !== (c.date_approx || '') && updateCoupe(c.id, { date_approx: e.target.value })} />
                        : (c.date_approx || '—')}
                    </td>
                    <td className="ctr" data-label="Permis de coupe"><Case coche={c.permis_coupe} editable={editable} aria="Permis de coupe" onChange={(v) => updateCoupe(c.id, { permis_coupe: v })} /></td>
                    <td className="ctr" data-label="Plan de signalisation"><Case coche={c.plan_signalisation} editable={editable} aria="Plan de signalisation" onChange={(v) => updateCoupe(c.id, { plan_signalisation: v })} /></td>
                    <td className="ctr" data-label="Permis d&rsquo;occupation"><Case coche={c.permis_occupation} editable={editable} aria="Permis d'occupation" onChange={(v) => updateCoupe(c.id, { permis_occupation: v })} /></td>
                    <td data-label="Percement sous pression">
                      {editable ? (
                        <select className="admin-input-ghost" value={c.percement || ''} onChange={(e) => updateCoupe(c.id, { percement: e.target.value })}>
                          {PERCEMENT.map((o) => <option key={o.valeur} value={o.valeur}>{o.label}</option>)}
                        </select>
                      ) : (PERCEMENT.find((o) => o.valeur === (c.percement || ''))?.label || '—')}
                    </td>
                    <td className="ctr" data-label="Prêt">
                      {prete
                        ? <span className="chip-pret"><Check size={12} strokeWidth={3} /> Prêt</span>
                        : <span style={{ color: 'var(--ink-dim)' }}>—</span>}
                    </td>
                    <td data-label="Chargé">{p?.charge || '—'}</td>
                    <td data-label="Surintendant">{p?.surintendant || '—'}</td>
                    {editable && (
                      <td style={{ textAlign: 'center' }} className="cell-action">
                        <button className="del-btn" aria-label="Retirer cette coupe" onClick={() => setConfirmDel({ id: c.id, label: p ? `${p.no} — ${p.projet}` : 'cette coupe' })}>
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
        message={confirmDel ? `Retirer la coupe de rue de ${confirmDel.label} du suivi ?` : ''}
        okLabel="Retirer"
        onOk={async () => { await deleteCoupe(confirmDel.id); setConfirmDel(null); }}
        onCancel={() => setConfirmDel(null)}
      />
    </div>
  );
}

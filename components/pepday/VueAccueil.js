import { useMemo, useState } from 'react';
import { Plus, CalendarPlus, Flag } from 'lucide-react';
import { usePepday, Encadre } from './ui';
import { ItemRapport, NouveauRapport, DispatchJournee, peutCreerRapport } from './ElementsRapport';
import { ETAPES, libelleRole } from '../../lib/pepday/constantes';
import { rapportsAValider, flagsNonLus, estChargeDuProjet, peutVoirRapport, aRole, voitTout } from '../../lib/pepday/workflow';
import { RETARD_A_DEFINIR } from '../../lib/pepday/direction';
import { budgetDuProjet, pct } from '../../lib/pepday/couts';
import { Jauge } from './ui';
import { argent, dateCourte, horodatage, aujourdhui } from '../../lib/pepday/couts';

// ---------------------------------------------------------------------------
// PEPDAY — TABLEAU « À VALIDER »
//
// L'écran d'accueil de chacun : ce qui l'attend, à son étape, sur ses
// projets. Les commentaires « Lecture obligatoire » non lus passent devant
// tout le reste pour le chargé de projet : ils bloquent la confirmation du
// cost final.
// ---------------------------------------------------------------------------

export default function VueAccueil() {
  const { db, index, moi, naviguer, derive } = usePepday();
  const [creation, setCreation] = useState(false);
  const [dispatch, setDispatch] = useState(false);

  const aValider = useMemo(
    () => rapportsAValider(moi, db.rapports, index.projets).sort((a, b) => a.date.localeCompare(b.date)),
    [moi, db.rapports, index.projets]
  );

  const flags = useMemo(() => flagsNonLus(db.commentaires).filter((c) => {
    const r = index.rapports[c.rapport_id];
    return r && peutVoirRapport(moi, r) && estChargeDuProjet(moi, index.projets[r.projet_id]);
  }), [db.commentaires, index, moi]);

  // Les rapports renvoyés : la dernière action de leur historique est un renvoi.
  const renvoyes = useMemo(() => {
    const dernier = {};
    for (const h of db.historique) {
      if (!dernier[h.rapport_id] || h.le > dernier[h.rapport_id].le) dernier[h.rapport_id] = h;
    }
    return new Set(Object.values(dernier).filter((h) => h.action === 'renvoyer').map((h) => h.rapport_id));
  }, [db.historique]);

  const parEtape = ETAPES.filter((e) => e.no < 6).map((e) => ({ etape: e, rapports: aValider.filter((r) => r.etape === e.no) }))
    .filter((g) => g.rapports.length > 0);

  const auj = aujourdhui();
  const aujourdhuiRapports = db.rapports.filter((r) => r.date === auj && peutVoirRapport(moi, r));
  const enCirculation = db.rapports.filter((r) => r.etape < 6 && peutVoirRapport(moi, r));

  return (
    <main className="pd-main pd-l1300">
      <div className="pd-carte">
        <div className="pd-carte-titre">
          <div>
            <h2 style={{ marginBottom: 4 }}>Bonjour {moi.nom.split(' ')[0]}</h2>
            <div className="pd-dim pd-petit">
              {(moi.roles || []).length ? `Rôles : ${moi.roles.map(libelleRole).join(', ')}` : 'Aucun rôle PEPday'}
              {moi.estAdmin ? ' · administrateur du Toolbox' : ''}
            </div>
          </div>
          {peutCreerRapport(moi) && (
            <div className="pd-actions">
              <button className="pd-btn fantome" onClick={() => setDispatch(true)}><CalendarPlus size={16} /> Dispatch de la journée</button>
              <button className="pd-btn" onClick={() => setCreation(true)}><Plus size={16} /> Nouveau rapport</button>
            </div>
          )}
        </div>
        <div className="pd-kpis" style={{ marginBottom: 0 }}>
          <div className="pd-kpi"><div className="pd-kpi-val">{aValider.length}</div><div className="pd-kpi-lib">M’attendent</div></div>
          <div className="pd-kpi"><div className="pd-kpi-val" style={{ color: flags.length ? 'var(--pd-rouge)' : undefined }}>{flags.length}</div><div className="pd-kpi-lib">Lectures obligatoires</div></div>
          <div className="pd-kpi"><div className="pd-kpi-val">{aujourdhuiRapports.length}</div><div className="pd-kpi-lib">Rapports aujourd’hui</div></div>
          <div className="pd-kpi"><div className="pd-kpi-val">{enCirculation.length}</div><div className="pd-kpi-lib">En validation</div></div>
        </div>
      </div>

      {flags.length > 0 && (
        <div className="pd-carte" style={{ borderColor: 'var(--pd-rouge)', borderWidth: 2 }}>
          <div className="pd-carte-titre">
            <h3 style={{ color: 'var(--pd-rouge)' }}><Flag size={16} style={{ verticalAlign: -2 }} /> Lecture obligatoire — à lire avant de confirmer les costs</h3>
          </div>
          {flags.map((c) => {
            const r = index.rapports[c.rapport_id];
            const p = index.projets[r.projet_id];
            return (
              <button key={c.id} className="pd-item" style={{ borderLeftColor: 'var(--pd-rouge)', marginBottom: 8 }} onClick={() => naviguer('rapport', r.id, { onglet: 'commentaires' })}>
                <div className="pd-item-haut">
                  <span className="pd-flag">Lecture obligatoire</span>
                  <span className="pd-dim pd-petit">{horodatage(c.created_at)}</span>
                </div>
                <div style={{ margin: '8px 0 4px', whiteSpace: 'pre-wrap' }}>{c.texte}</div>
                <div className="pd-item-sous">{c.auteur_nom} · {p?.numero} — {p?.nom} · rapport du {dateCourte(r.date)}</div>
              </button>
            );
          })}
        </div>
      )}

      {aValider.length === 0 && flags.length === 0 && (
        <Encadre type="ok">Rien ne t’attend pour l’instant.</Encadre>
      )}

      {parEtape.map(({ etape, rapports }) => (
        <div className="pd-carte" key={etape.no}>
          <div className="pd-carte-titre">
            <h3>{etape.no === 2 && aRole(moi, 'contremaitre') ? 'Mes rapports à remplir' : etape.libelle}</h3>
            <span className="pd-dim pd-petit">{rapports.length} rapport{rapports.length > 1 ? 's' : ''} · {argent(rapports.reduce((s, r) => s + (derive.totalParRapport[r.id] || 0), 0))}</span>
          </div>
          {rapports.some((r) => renvoyes.has(r.id)) && (
            <Encadre type="avis">Les rapports marqués « Renvoyé » ont été retournés à ton étape avec un commentaire. Ouvre-les pour voir la raison.</Encadre>
          )}
          <div className="pd-liste">
            {rapports.map((r) => (
              <div key={r.id} style={{ position: 'relative' }}>
                <ItemRapport rapport={r} />
                {renvoyes.has(r.id) && <span className="pd-pastille" style={{ background: 'var(--pd-rouge)', position: 'absolute', top: -6, right: 8 }}>Renvoyé</span>}
              </div>
            ))}
          </div>
        </div>
      ))}

      {voitTout(moi) && <ProjetsEnCours />}

      {creation && <NouveauRapport onFermer={() => setCreation(false)} />}
      {dispatch && <DispatchJournee onFermer={() => setDispatch(false)} />}
    </main>
  );
}

// RV02 — les projets en cours avec les deux colonnes du Hub de Civalgo :
// « Temps non validés » et « Retard » (formule à confirmer).
function ProjetsEnCours() {
  const { db, index, derive, naviguer } = usePepday();
  const projets = db.projets.filter((p) => p.statut === 'en_cours');
  if (!projets.length) return null;
  return (
    <div className="pd-carte">
      <div className="pd-carte-titre">
        <h3>Projets en cours</h3>
        <button className="pd-btn lien" onClick={() => naviguer('direction')}>Vue Direction</button>
      </div>
      <div className="pd-table-wrap">
        <table className="pd-table">
          <thead><tr><th>Projet</th><th>Chargé de projet</th><th>% budget</th><th className="num">Temps non validés</th><th>Retard</th><th>Dernier rapport</th></tr></thead>
          <tbody>
            {projets.map((p) => {
              const ind = derive.indicateurs.parProjet[p.id] || {};
              const b = budgetDuProjet(p.id, db.budgets).total;
              const ratio = b ? (derive.coutsProjet[p.id]?.total || 0) / b : null;
              return (
                <tr key={p.id} className="cliquable" onClick={() => naviguer('projet', p.id)}>
                  <td><strong>{p.numero}</strong> — {p.nom}</td>
                  <td>{index.membres[p.charge_projet_id]?.nom || ''}</td>
                  <td style={{ minWidth: 110 }}><div className="pd-flex" style={{ flexWrap: 'nowrap' }}><Jauge ratio={ratio} /><span className="pd-petit">{pct(ratio)}</span></div></td>
                  <td className="num">{ind.nonValides || 0}</td>
                  <td className="pd-dim" title="Formule à confirmer avec William">{RETARD_A_DEFINIR}</td>
                  <td>{ind.dernierRapport ? dateCourte(ind.dernierRapport) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

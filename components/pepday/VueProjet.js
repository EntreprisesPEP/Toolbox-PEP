import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Pencil, Plus, Paperclip, Trash2, Download, Route, Users, Archive } from 'lucide-react';
import { usePepday, Encadre, PastilleStatut, Jauge, Champ } from './ui';
import CarteLeaflet from './CarteLeaflet';
import FormProjet from './FormProjet';
import { ItemRapport, NouveauRapport, peutCreerRapport } from './ElementsRapport';
import { statutProjet, CATEGORIES, libelleCategorie } from '../../lib/pepday/constantes';
import { budgetDuProjet, comparerAuBudget, argent, argent0, pct, dateCourte, moisLong, nombre, enrichirLignes, grouperLignes, horodatage } from '../../lib/pepday/couts';
import { peutGererProjets, peutVoirRapport } from '../../lib/pepday/workflow';
import { aPosition, lienApplePlans, lienGoogleMaps } from '../../lib/pepday/geo';
import { nomFichierPropre } from '../../lib/pepday/images';
import { exporterExcel } from '../../lib/pepday/exportExcel';
import { resoudrePoint } from './VueCarte';

// ---------------------------------------------------------------------------
// PEPDAY — FICHE D'UN PROJET
// Identité, carte, équipe, budget contre cost, documents, trajets et
// rapports récents.
// ---------------------------------------------------------------------------

export const BUCKET_DOCUMENTS = 'pepday-documents';

export default function VueProjet({ id }) {
  const { db, index, moi, naviguer, derive, actions } = usePepday();
  const projet = index.projets[id];
  const [edition, setEdition] = useState(false);
  const [creationRapport, setCreationRapport] = useState(false);
  const [voirTous, setVoirTous] = useState(false);

  const rapports = useMemo(
    () => db.rapports.filter((r) => r.projet_id === id && peutVoirRapport(moi, r)).sort((a, b) => b.date.localeCompare(a.date)),
    [db.rapports, id, moi]
  );
  const parMois = useMemo(() => {
    const rp = Object.fromEntries(db.rapports.filter((r) => r.projet_id === id).map((r) => [r.id, r]));
    const lignes = enrichirLignes(db.lignes.filter((l) => rp[l.rapport_id]), rp);
    return grouperLignes(lignes, (l) => l.mois).sort((a, b) => b.cle.localeCompare(a.cle));
  }, [db.rapports, db.lignes, id]);

  if (!projet) {
    return (
      <main className="pd-main pd-l900">
        <Encadre type="avis">Ce projet n’existe pas ou a été supprimé.</Encadre>
        <button className="pd-btn fantome" onClick={() => naviguer('projets')}><ArrowLeft size={15} /> Retour aux projets</button>
      </main>
    );
  }

  const budget = budgetDuProjet(id, db.budgets);
  const couts = derive.coutsProjet[id] || { total: 0, confirme: 0, heuresMO: 0, heuresEquip: 0 };
  const comparaison = comparerAuBudget(couts, budget);
  const modifiable = peutGererProjets(moi);
  const trajets = db.trajets.filter((t) => t.projet_id === id);
  const enAttente = rapports.filter((r) => r.etape < 6).length;

  function exporter() {
    exporterExcel(`PEPday - projet ${projet.numero}`, [
      {
        nom: 'Budget vs cost',
        titre: `${projet.numero} — ${projet.nom}`,
        sousTitre: `Client : ${projet.client || '—'} · Contrat : ${argent(projet.montant_contrat)} · extrait le ${new Date().toLocaleString('fr-CA')}`,
        colonnes: [
          { entete: 'Catégorie', cle: 'libelle', largeur: 20 }, { entete: 'Budget', cle: 'budget', format: 'argent' },
          { entete: 'Cost à date', cle: 'reel', format: 'argent' }, { entete: 'Écart (reste)', cle: 'ecart', format: 'argent' },
          { entete: '% consommé', cle: 'pourcentage', format: 'pct' },
        ],
        lignes: comparaison,
      },
      {
        nom: 'Par mois',
        colonnes: [{ entete: 'Mois', cle: 'mois', largeur: 16 }, ...CATEGORIES.map((c) => ({ entete: c.libelle, cle: c.code, format: 'argent' })), { entete: 'Total', cle: 'total', format: 'argent' }],
        lignes: parMois.map((g) => ({ mois: moisLong(g.cle), ...g.totaux })),
      },
    ]);
  }

  return (
    <main className="pd-main pd-l1300">
      <div className="pd-flex" style={{ marginBottom: 10, justifyContent: 'space-between' }}>
        <button className="pd-btn lien" onClick={() => naviguer('projets')}><ArrowLeft size={15} /> Projets</button>
        <div className="pd-actions">
          <button className="pd-btn fantome petit" onClick={exporter}><Download size={14} /> Excel</button>
          {modifiable && <button className="pd-btn petit" onClick={() => setEdition(true)}><Pencil size={14} /> Modifier</button>}
        </div>
      </div>

      <div className="pd-carte" style={{ borderTop: `4px solid ${statutProjet(projet.statut).couleur}` }}>
        <div className="pd-carte-titre">
          <div style={{ minWidth: 0 }}>
            <div className="pd-dim pd-petit">Projet {projet.numero}</div>
            <h2 style={{ margin: '2px 0 4px' }}>{projet.nom}</h2>
            <div className="pd-dim">{projet.client}{projet.adresse ? ` · ${projet.adresse}` : ''}</div>
          </div>
          <PastilleStatut code={projet.statut} />
        </div>
        <div className="pd-kpis" style={{ marginBottom: 0 }}>
          <div className="pd-kpi"><div className="pd-kpi-val">{argent0(projet.montant_contrat)}</div><div className="pd-kpi-lib">Contrat</div></div>
          <div className="pd-kpi"><div className="pd-kpi-val">{argent0(budget.total)}</div><div className="pd-kpi-lib">Budget</div></div>
          <div className="pd-kpi"><div className="pd-kpi-val" style={{ color: budget.total && couts.total > budget.total ? 'var(--pd-rouge)' : undefined }}>{argent0(couts.total)}</div><div className="pd-kpi-lib">Cost à date ({pct(budget.total ? couts.total / budget.total : null)})</div></div>
          <div className="pd-kpi"><div className="pd-kpi-val">{argent0(couts.confirme)}</div><div className="pd-kpi-lib">Dont confirmé</div></div>
        </div>
      </div>

      <div className="pd-grille c2" style={{ alignItems: 'start' }}>
        <div>
          <div className="pd-carte">
            <h3>Budget contre cost</h3>
            <div className="pd-table-wrap">
              <table className="pd-table">
                <thead><tr><th>Catégorie</th><th className="num">Budget</th><th className="num">Cost</th><th className="num">Reste</th><th>%</th></tr></thead>
                <tbody>
                  {comparaison.filter((c) => c.code !== 'total').map((c) => (
                    <tr key={c.code}>
                      <td>{c.libelle}</td>
                      <td className="num">{argent0(c.budget)}</td>
                      <td className={`num ${c.pourcentage > 1 ? 'depasse' : ''}`}>{argent0(c.reel)}</td>
                      <td className={`num ${c.ecart < 0 ? 'depasse' : ''}`}>{argent0(c.ecart)}</td>
                      <td style={{ minWidth: 80 }}><Jauge ratio={c.pourcentage} /></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  {comparaison.filter((c) => c.code === 'total').map((c) => (
                    <tr key="t"><td>Total</td><td className="num">{argent0(c.budget)}</td><td className="num">{argent0(c.reel)}</td><td className="num">{argent0(c.ecart)}</td><td>{pct(c.pourcentage)}</td></tr>
                  ))}
                </tfoot>
              </table>
            </div>
            <div className="pd-dim pd-petit" style={{ marginTop: 8 }}>
              {nombre(couts.heuresMO)} h de main-d’œuvre · {nombre(couts.heuresEquip)} h d’équipement · {rapports.length} rapports ({enAttente} en validation).
              Le cost inclut les rapports encore en validation.
            </div>
          </div>

          <div className="pd-carte">
            <h3>Cost par mois</h3>
            {parMois.length === 0 ? <div className="pd-section-vide">Aucun cost saisi.</div> : (
              <div className="pd-table-wrap">
                <table className="pd-table">
                  <thead><tr><th>Mois</th>{CATEGORIES.map((c) => <th key={c.code} className="num">{c.court}</th>)}<th className="num">Total</th></tr></thead>
                  <tbody>
                    {parMois.map((g) => (
                      <tr key={g.cle}><td style={{ whiteSpace: 'nowrap' }}>{moisLong(g.cle)}</td>{CATEGORIES.map((c) => <td key={c.code} className="num">{argent0(g.totaux[c.code])}</td>)}<td className="num pd-gras">{argent0(g.totaux.total)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="pd-carte">
            <h3>Emplacement</h3>
            {aPosition(projet) ? (
              <>
                <CarteLeaflet petite marqueurs={[{ id: projet.id, lat: projet.lat, lng: projet.lng, couleur: statutProjet(projet.statut).couleur, titre: projet.nom }]} cleAjustement={projet.id} />
                <div className="pd-actions" style={{ marginTop: 8 }}>
                  <a className="pd-btn fantome petit" href={`https://maps.apple.com/?daddr=${projet.lat},${projet.lng}&dirflg=d`} target="_blank" rel="noreferrer">Y aller (Apple Plans)</a>
                  <a className="pd-btn fantome petit" href={`https://www.google.com/maps/dir/?api=1&destination=${projet.lat},${projet.lng}`} target="_blank" rel="noreferrer">Y aller (Google Maps)</a>
                </div>
              </>
            ) : <Encadre type="avis">Ce projet n’a pas encore de position. {modifiable ? 'Clique « Modifier » pour localiser l’adresse ou placer l’épingle.' : ''}</Encadre>}
          </div>

          <div className="pd-carte">
            <h3 className="pd-flex" style={{ gap: 6 }}><Users size={16} /> Équipe et dates</h3>
            <div className="pd-grille c2">
              <Info label="Chargé de projet" valeur={index.membres[projet.charge_projet_id]?.nom} />
              <Info label="Coordonnateur" valeur={index.membres[projet.coordonnateur_id]?.nom} />
              <Info label="Surintendant" valeur={index.membres[projet.surintendant_id]?.nom} />
              <Info label="Contremaîtres" valeur={(projet.contremaitre_ids || []).map((x) => index.membres[x]?.nom).filter(Boolean).join(', ')} />
              <Info label="Début prévu" valeur={dateCourte(projet.date_debut)} />
              <Info label="Fin prévue" valeur={dateCourte(projet.date_fin)} />
            </div>
            {projet.notes && <><hr className="pd-sep" /><div style={{ whiteSpace: 'pre-wrap' }}>{projet.notes}</div></>}
          </div>

          <Documents projet={projet} modifiable={modifiable} />

          <div className="pd-carte">
            <div className="pd-carte-titre">
              <h3 className="pd-flex" style={{ gap: 6 }}><Route size={16} /> Trajets</h3>
              <button className="pd-btn lien" onClick={() => naviguer('carte', null, { onglet: 'trajets' })}>Gérer sur la carte</button>
            </div>
            {trajets.length === 0 && <div className="pd-dim pd-petit">Aucun trajet enregistré pour ce projet.</div>}
            {trajets.map((t) => {
              const pts = (t.points || []).map((p) => resoudrePoint(p, index));
              return (
                <div key={t.id} className="pd-ligne">
                  <div className="pd-ligne-nom">{t.nom}</div>
                  <div className="pd-ligne-detail">{pts.map((p) => p?.nom || '?').join(' → ')}</div>
                  <div className="pd-actions" style={{ marginTop: 6 }}>
                    {lienApplePlans(pts) && <a className="pd-btn fantome petit" href={lienApplePlans(pts)} target="_blank" rel="noreferrer">Ouvrir dans Apple Plans</a>}
                    {lienGoogleMaps(pts) && <a className="pd-btn fantome petit" href={lienGoogleMaps(pts)} target="_blank" rel="noreferrer">Ouvrir dans Google Maps</a>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="pd-carte">
        <div className="pd-carte-titre">
          <h3>Rapports journaliers ({rapports.length})</h3>
          {peutCreerRapport(moi) && <button className="pd-btn petit" onClick={() => setCreationRapport(true)}><Plus size={14} /> Nouveau rapport</button>}
        </div>
        <div className="pd-liste">
          {(voirTous ? rapports : rapports.slice(0, 8)).map((r) => <ItemRapport key={r.id} rapport={r} montrerProjet={false} />)}
        </div>
        {rapports.length > 8 && !voirTous && <button className="pd-btn lien" style={{ marginTop: 8 }} onClick={() => setVoirTous(true)}>Voir les {rapports.length} rapports</button>}
        {rapports.length === 0 && <div className="pd-section-vide">Aucun rapport pour ce projet.</div>}
      </div>

      {modifiable && (
        <div className="pd-actions droite" style={{ marginBottom: 20 }}>
          {projet.statut !== 'termine' && (
            <button className="pd-btn fantome petit" onClick={async () => { await actions.modifier('projets', projet.id, { statut: 'termine' }); actions.notifier('Projet marqué terminé.'); }}>
              <Archive size={14} /> Marquer terminé
            </button>
          )}
          {rapports.length === 0 && (
            <button className="pd-btn fantome petit" onClick={async () => {
              if (!window.confirm(`Supprimer définitivement le projet ${projet.numero} ?`)) return;
              await actions.supprimer('projets', projet.id);
              naviguer('projets');
            }}
            >
              <Trash2 size={14} /> Supprimer le projet
            </button>
          )}
        </div>
      )}

      {edition && <FormProjet projet={projet} onFermer={() => setEdition(false)} onEnregistre={() => setEdition(false)} />}
      {creationRapport && <NouveauRapport projetId={projet.id} onFermer={() => setCreationRapport(false)} />}
    </main>
  );
}

function Info({ label, valeur }) {
  return (
    <div className="pd-champ">
      <span className="pd-etiquette">{label}</span>
      <span>{valeur || <span className="pd-dim">—</span>}</span>
    </div>
  );
}

function Documents({ projet, modifiable }) {
  const { db, actions, moi } = usePepday();
  const entree = useRef(null);
  const [envoi, setEnvoi] = useState(false);
  const docs = db.documents.filter((d) => d.projet_id === projet.id).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

  async function ajouter(fichiers) {
    setEnvoi(true);
    for (const fichier of Array.from(fichiers || [])) {
      try {
        if (fichier.size > 25 * 1024 * 1024) throw new Error(`${fichier.name} dépasse 25 Mo.`);
        const chemin = `${projet.id}/${Date.now()}-${nomFichierPropre(fichier.name)}`;
        const { chemin: final } = await actions.televerser(BUCKET_DOCUMENTS, chemin, fichier);
        await actions.inserer('documents', { projet_id: projet.id, nom: fichier.name, chemin: final, taille: fichier.size, type_mime: fichier.type, created_by: moi.membreId, created_by_nom: moi.nom });
      } catch (e) {
        actions.notifier(e.message || String(e), 'err');
      }
    }
    setEnvoi(false);
    if (entree.current) entree.current.value = '';
  }

  async function ouvrir(d) {
    const url = await actions.urlFichier(BUCKET_DOCUMENTS, d.chemin);
    if (!url) { actions.notifier('Document introuvable.', 'err'); return; }
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noreferrer';
    if (url.startsWith('data:')) a.download = d.nom;
    a.click();
  }

  return (
    <div className="pd-carte">
      <div className="pd-carte-titre">
        <h3 className="pd-flex" style={{ gap: 6 }}><Paperclip size={16} /> Documents ({docs.length})</h3>
        {modifiable && (
          <>
            <input ref={entree} type="file" multiple style={{ display: 'none' }} onChange={(e) => ajouter(e.target.files)} />
            <button className="pd-btn petit" onClick={() => entree.current?.click()} disabled={envoi}><Plus size={14} /> {envoi ? 'Envoi…' : 'Ajouter'}</button>
          </>
        )}
      </div>
      {docs.length === 0 && <div className="pd-dim pd-petit">Aucun document (plans, devis, permis…).</div>}
      {docs.map((d) => (
        <div key={d.id} className="pd-flex" style={{ justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--pd-ligne)', flexWrap: 'nowrap' }}>
          <button className="pd-btn lien" style={{ textAlign: 'left', justifyContent: 'flex-start', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }} onClick={() => ouvrir(d)}>{d.nom}</button>
          <span className="pd-flex" style={{ flexWrap: 'nowrap' }}>
            <span className="pd-dim pd-petit pd-cache-mobile">{d.created_by_nom} · {horodatage(d.created_at)}</span>
            {modifiable && (
              <button className="pd-btn fantome petit" aria-label="Supprimer" onClick={async () => {
                if (!window.confirm(`Supprimer « ${d.nom} » ?`)) return;
                await actions.supprimer('documents', d.id);
                actions.supprimerFichier(BUCKET_DOCUMENTS, d.chemin);
              }}
              >
                <Trash2 size={13} />
              </button>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

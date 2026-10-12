import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Camera, Trash2, Send, Undo2, Lock, Flag, CheckCircle2, MessageSquare, History, Copy, CloudSun, Download, Ban, RotateCcw, ListChecks, Plus, UsersRound,
} from 'lucide-react';
import ChampListe from '../commun/ChampListe';
import { usePepday, Champ, ChampNombre, Encadre, Modal, Confirmation, PastilleEtape, BadgeFlag, Frise, optionsDe } from './ui';
import SectionLignes from './SectionLignes';
import { CATEGORIES, ETAPES, METEO_CONDITIONS, etape as infoEtape, ETAPE_VERROUILLE, statutRapport, UNITES } from '../../lib/pepday/constantes';
import { droitsEdition, flagsNonLus, libelleAction, peutVoirRapport, peutReactiver } from '../../lib/pepday/workflow';
import { totauxParCategorie, argent, dateLongue, horodatage, nombre } from '../../lib/pepday/couts';
import { anneeDe, tauxPourNouvelleLigne } from '../../lib/pepday/taux';
import { compresserImage, nomFichierPropre } from '../../lib/pepday/images';
import { exporterExcel } from '../../lib/pepday/exportExcel';

// ---------------------------------------------------------------------------
// PEPDAY — UN RAPPORT JOURNALIER
//
// Formulaire de 900 px, pensé pour le pouce : sections empilées, gros
// champs, et la barre de validation collée au bas de l'écran. Ce que la
// personne peut modifier dépend de l'étape (workflow.droitsEdition).
// ---------------------------------------------------------------------------

export const BUCKET_PHOTOS = 'pepday-photos';

export default function VueRapport({ id }) {
  const { db, index, moi, actions, naviguer, nav } = usePepday();
  const rapport = index.rapports[id];
  // Le dialogue retient l'étape à laquelle il a été ouvert : dès que la
  // transition a changé l'étape, il disparaît au lieu d'afficher l'étape suivante.
  const [dialogueOuvert, setDialogueOuvert] = useState(null); // { type, etape }

  const projet = rapport ? index.projets[rapport.projet_id] : null;
  const lignes = useMemo(() => db.lignes.filter((l) => l.rapport_id === id), [db.lignes, id]);
  const commentaires = useMemo(() => db.commentaires.filter((c) => c.rapport_id === id).sort((a, b) => a.created_at.localeCompare(b.created_at)), [db.commentaires, id]);
  const historique = useMemo(() => db.historique.filter((h) => h.rapport_id === id).sort((a, b) => a.le.localeCompare(b.le)), [db.historique, id]);
  const photos = useMemo(() => db.photos.filter((p) => p.rapport_id === id), [db.photos, id]);
  const activites = useMemo(() => (db.activites || []).filter((a) => a.rapport_id === id), [db.activites, id]);

  const refCommentaires = useRef(null);
  useEffect(() => {
    if (nav.onglet === 'commentaires' && refCommentaires.current) {
      setTimeout(() => refCommentaires.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    }
  }, [nav.onglet, id]);

  if (!rapport) {
    return (
      <main className="pd-main pd-l900">
        <Encadre type="avis">Ce rapport n’existe pas ou a été supprimé.</Encadre>
        <button className="pd-btn fantome" onClick={() => naviguer('rapports')}><ArrowLeft size={15} /> Retour aux rapports</button>
      </main>
    );
  }
  if (!peutVoirRapport(moi, rapport)) {
    return (
      <main className="pd-main pd-l900">
        <Encadre type="avis">Ce rapport ne t’est pas accessible.</Encadre>
      </main>
    );
  }

  const dialogue = dialogueOuvert && dialogueOuvert.etape === rapport.etape && dialogueOuvert.abandonne === Boolean(rapport.abandonne) ? dialogueOuvert.type : null;
  const setDialogue = (type) => setDialogueOuvert(type ? { type, etape: rapport.etape, abandonne: Boolean(rapport.abandonne) } : null);
  const equipe = rapport.equipe_id ? index.equipes[rapport.equipe_id] : null;
  const quart = rapport.quart_id ? index.quarts[rapport.quart_id] : null;
  const statut = statutRapport(rapport);
  const droits = droitsEdition(moi, rapport, projet);
  const totaux = totauxParCategorie(lignes);
  const nonLus = flagsNonLus(commentaires);
  const e = infoEtape(rapport.etape);
  const verrouille = rapport.etape >= ETAPE_VERROUILLE;
  const bloqueParFlag = rapport.etape === 5 && nonLus.length > 0;

  async function sauver(patch) {
    try {
      await actions.modifier('rapports', rapport.id, patch);
    } catch (err) {
      actions.notifier(err.message || String(err), 'err');
    }
  }

  function exporter() {
    const lignesX = lignes.map((l) => ({
      categorie: CATEGORIES.find((c) => c.code === l.categorie)?.libelle, libelle: l.libelle, detail: l.detail,
      quantite: Number(l.quantite) || 0, supp: Number(l.quantite_supp) || 0, unite: l.unite, taux: Number(l.taux) || 0,
      tauxSupp: Number(l.taux_supp) || 0, source: l.taux_source, preset: l.taux_preset, raison: l.custom_raison || '',
      par: l.custom_par_nom || '', organisation: index.organisations[l.organisation_id]?.nom || '',
      sousTache: index.sous_taches[l.sous_tache_id] ? `${index.sous_taches[l.sous_tache_id].code || ''} ${index.sous_taches[l.sous_tache_id].nom}`.trim() : '',
      prime: l.prime_id ? (index.primes[l.prime_id]?.nom || 'Prime') : '', horsCatalogue: l.ressource_provisoire_id ? 'Oui' : '', montant: Math.round(((Number(l.quantite) || 0) * (Number(l.taux) || 0) + (Number(l.quantite_supp) || 0) * (Number(l.taux_supp) || 0)) * 100) / 100,
    }));
    exporterExcel(`PEPday - rapport ${rapport.numero} - ${rapport.date}`, [{
      nom: `Rapport ${rapport.numero}`,
      titre: `Rapport journalier #${rapport.numero} — ${projet ? `${projet.numero} ${projet.nom}` : ''}`,
      sousTitre: `${dateLongue(rapport.date)} · ${equipe?.nom || index.membres[rapport.contremaitre_id]?.nom || ''} · quart ${quart?.nom || '—'} · ${e.libelle} (${statut.libelle})`,
      colonnes: [
        { entete: 'Catégorie', cle: 'categorie', largeur: 16 }, { entete: 'Élément', cle: 'libelle', largeur: 36 },
        { entete: 'Détail', cle: 'detail', largeur: 24 }, { entete: 'Qté / h rég.', cle: 'quantite', format: 'nombre' },
        { entete: 'H supp.', cle: 'supp', format: 'nombre' }, { entete: 'Unité', cle: 'unite', largeur: 8 },
        { entete: 'Taux', cle: 'taux', format: 'argent' }, { entete: 'Taux supp.', cle: 'tauxSupp', format: 'argent' },
        { entete: 'Source du taux', cle: 'source' }, { entete: 'Preset', cle: 'preset', format: 'argent' },
        { entete: 'Raison custom', cle: 'raison', largeur: 30 }, { entete: 'Custom par', cle: 'par', largeur: 18 },
        { entete: 'Organisation', cle: 'organisation', largeur: 22 }, { entete: 'Sous-tâche', cle: 'sousTache', largeur: 28 },
        { entete: 'Prime', cle: 'prime', largeur: 20 }, { entete: 'Hors catalogue', cle: 'horsCatalogue', largeur: 10 },
        { entete: 'Montant', cle: 'montant', format: 'argent' },
      ],
      lignes: lignesX,
      total: { categorie: 'Total', montant: totaux.total },
    }]);
  }

  return (
    <main className="pd-main pd-l900">
      <div className="pd-flex pd-pas-imprimer" style={{ marginBottom: 10, justifyContent: 'space-between' }}>
        <button className="pd-btn lien" onClick={() => (window.history.length > 1 ? window.history.back() : naviguer('rapports'))}><ArrowLeft size={15} /> Retour</button>
        <button className="pd-btn fantome petit" onClick={exporter}><Download size={14} /> Excel</button>
      </div>

      {/* --- En-tête --------------------------------------------------- */}
      <div className="pd-carte">
        <div className="pd-carte-titre">
          <div style={{ minWidth: 0 }}>
            <div className="pd-dim pd-petit">Rapport #{rapport.numero}</div>
            <h2 style={{ margin: '2px 0 4px' }}>{rapport.titre || 'Rapport sans titre'}</h2>
            <div className="pd-dim">{dateLongue(rapport.date)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="pd-kpi-val">{argent(totaux.total)}</div>
            <div className="pd-flex" style={{ justifyContent: 'flex-end', marginTop: 4 }}>
              <span className="pd-pastille" style={{ background: statut.couleur }}>{statut.libelle}</span>
              {!rapport.abandonne && <PastilleEtape no={rapport.etape} court />}
              <BadgeFlag nonLus={nonLus.length} lus={commentaires.filter((c) => c.lecture_obligatoire && c.lu_le).length} />
            </div>
          </div>
        </div>
        {!rapport.abandonne && <Frise etapeCourante={rapport.etape} />}
        {rapport.abandonne && (
          <Encadre type="avis">
            <Ban size={14} style={{ verticalAlign: -2 }} /> Rapport abandonné le {horodatage(rapport.abandonne_le)} — {rapport.abandonne_raison}. Il ne compte dans aucun cost.
            {peutReactiver(moi, rapport) && (
              <div style={{ marginTop: 8 }}><button className="pd-btn fantome petit" onClick={() => setDialogue('reactiver')}><RotateCcw size={13} /> Réactiver</button></div>
            )}
          </Encadre>
        )}
        {!rapport.projet_id && !rapport.abandonne && (
          <Encadre type="info">« À planifier » : choisis le projet pour pouvoir transmettre le rapport au contremaître.</Encadre>
        )}
        {verrouille && (
          <Encadre type="ok"><Lock size={14} style={{ verticalAlign: -2 }} /> Cost final confirmé par {rapport.confirme_par_nom} le {horodatage(rapport.confirme_le)}. Le rapport est verrouillé.</Encadre>
        )}

        {droits.entete ? (
          <>
            <Champ label="Projet" aide="Laisser vide = « À planifier ».">
              <ChampListe
                options={optionsDe(db.projets.filter((p) => p.statut !== 'annule'), { libelle: (p) => `${p.numero} — ${p.nom}` })}
                valeur={rapport.projet_id || ''}
                onChange={(v) => sauver({ projet_id: v || null })}
                videLabel="À planifier (aucun projet)"
              />
            </Champ>
            <div className="pd-grille c2">
              <Champ label="Date" aide="Les lignes déjà saisies gardent le taux de leur saisie.">
                <input className="pd-input" type="date" value={rapport.date} onChange={(ev) => ev.target.value && sauver({ date: ev.target.value })} />
              </Champ>
              <Champ label="Équipe" aide="Le contremaître et le quart suivent l’équipe.">
                <ChampListe
                  options={optionsDe((db.equipes || []).filter((x) => x.actif !== false), { detail: (x) => index.membres[x.contremaitre_id]?.nom })}
                  valeur={rapport.equipe_id || ''}
                  onChange={(v) => {
                    const eq = index.equipes[v];
                    sauver({ equipe_id: v || null, ...(eq ? { contremaitre_id: eq.contremaitre_id, quart_id: eq.quart_id || rapport.quart_id } : {}) });
                  }}
                />
              </Champ>
              <Champ label="Contremaître">
                <ChampListe
                  options={optionsDe(db.membres.filter((m) => (m.roles || []).includes('contremaitre')))}
                  valeur={rapport.contremaitre_id || ''}
                  onChange={(v) => sauver({ contremaitre_id: v || null })}
                />
              </Champ>
              <ChampQuart rapport={rapport} sauver={sauver} />
            </div>
          </>
        ) : (
          <div className="pd-grille c3">
            <div className="pd-champ"><span className="pd-etiquette">Projet</span>{projet ? <button className="pd-btn lien" style={{ justifyContent: 'flex-start', textAlign: 'left' }} onClick={() => naviguer('projet', projet.id)}>{projet.numero} — {projet.nom}</button> : <span>À planifier</span>}</div>
            <div className="pd-champ"><span className="pd-etiquette">Équipe</span><span>{equipe?.nom || '—'} · {index.membres[rapport.contremaitre_id]?.nom || '—'}</span></div>
            {droits.quart ? <ChampQuart rapport={rapport} sauver={sauver} /> : <div className="pd-champ"><span className="pd-etiquette">Quart</span><span>{quart?.nom || '—'}</span></div>}
          </div>
        )}
      </div>

      {/* --- Description et météo --------------------------------------- */}
      <InfosDuJour rapport={rapport} droits={droits} sauver={sauver} />

      {/* --- Lignes ------------------------------------------------------ */}
      <Activites rapport={rapport} activites={activites} lignes={lignes} droits={droits} />
      {droits.lignesAjout && lignes.length === 0 && <ChargerEquipe rapport={rapport} />}
      {droits.lignesAjout && lignes.length === 0 && <ReprendreEquipe rapport={rapport} />}
      {CATEGORIES.map((c) => (
        <SectionLignes key={c.code} rapport={rapport} categorie={c.code} lignes={lignes.filter((l) => l.categorie === c.code)} droits={droits} activites={activites} />
      ))}

      {/* --- Sommaire ---------------------------------------------------- */}
      <div className="pd-carte">
        <h3>Cost du rapport</h3>
        <table className="pd-table" style={{ border: '1px solid var(--pd-ligne)' }}>
          <tbody>
            {CATEGORIES.map((c) => (
              <tr key={c.code}><td>{c.libelle}</td><td className="num">{argent(totaux[c.code])}</td></tr>
            ))}
          </tbody>
          <tfoot><tr><td>Total</td><td className="num">{argent(totaux.total)}</td></tr></tfoot>
        </table>
      </div>

      {/* --- Photos ------------------------------------------------------ */}
      <Photos rapport={rapport} photos={photos} droits={droits} />

      {/* --- Commentaires -------------------------------------------------- */}
      <div ref={refCommentaires}>
        <Commentaires rapport={rapport} commentaires={commentaires} droits={droits} />
      </div>

      {/* --- Historique ------------------------------------------------------ */}
      <div className="pd-carte">
        <h3 className="pd-flex" style={{ gap: 6 }}><History size={16} /> Historique de validation</h3>
        <ul className="pd-histo">
          {historique.map((h) => (
            <li key={h.id} className={h.action === 'renvoyer' ? 'renvoi' : ''}>
              <div><strong>{libelleAction(h.action, h.de_etape)}</strong>{h.de_etape ? ` : étape ${h.de_etape} → ${h.a_etape === 6 ? 'verrouillé' : `étape ${h.a_etape}`}` : ''} — {h.par_nom}</div>
              <div className="pd-histo-quand">{horodatage(h.le)}</div>
              {h.commentaire && <div style={{ marginTop: 3, whiteSpace: 'pre-wrap' }}>« {h.commentaire} »</div>}
            </li>
          ))}
          {historique.length === 0 && <li>Aucun passage enregistré.</li>}
        </ul>
      </div>

      {/* --- Barre de validation --------------------------------------------- */}
      {!verrouille && (droits.avancer || droits.renvoyer || droits.supprimer || droits.abandonner) && (
        <div className="pd-collant-bas">
          {bloqueParFlag && (
            <div style={{ width: '100%' }}>
              <Encadre type="err"><Flag size={14} style={{ verticalAlign: -2 }} /> {nonLus.length} commentaire{nonLus.length > 1 ? 's' : ''} « Lecture obligatoire » à lire avant de confirmer le cost final.</Encadre>
            </div>
          )}
          {droits.renvoyer && (
            <button className="pd-btn fantome" onClick={() => setDialogue('renvoyer')}><Undo2 size={15} /> Renvoyer à l’étape {rapport.etape - 1}</button>
          )}
          {droits.supprimer && (
            <button className="pd-btn fantome" onClick={() => setDialogue('supprimer')}><Trash2 size={15} /> Supprimer</button>
          )}
          {droits.abandonner && (
            <button className="pd-btn fantome" onClick={() => setDialogue('abandonner')}><Ban size={15} /> Abandonner</button>
          )}
          {droits.avancer && (
            <button className={`pd-btn ${rapport.etape === 5 ? 'vert' : ''}`} disabled={bloqueParFlag} onClick={() => setDialogue('avancer')}>
              {rapport.etape === 5 ? <Lock size={15} /> : <Send size={15} />} {e.action}
            </button>
          )}
        </div>
      )}
      {!verrouille && !rapport.abandonne && !droits.avancer && (
        <Encadre type="info">En attente : <strong>{e.libelle}</strong>{rapport.etape === 2 && index.membres[rapport.contremaitre_id] ? ` (${index.membres[rapport.contremaitre_id].nom})` : ''}.</Encadre>
      )}

      {dialogue === 'abandonner' && (
        <Confirmation
          titre="Abandonner le rapport"
          message="Le rapport sort des listes « À valider » et ne compte dans aucun cost. Un directeur peut le réactiver."
          commentaire="obligatoire"
          libelleOk="Abandonner"
          danger
          onAnnuler={() => setDialogue(null)}
          onOk={async (texte) => { await actions.transition(rapport.id, 'abandonner', texte); setDialogue(null); actions.notifier('Rapport abandonné.'); }}
        />
      )}
      {dialogue === 'reactiver' && (
        <Confirmation
          titre="Réactiver le rapport"
          message="Le rapport reprend à son étape, comme avant l’abandon."
          libelleOk="Réactiver"
          onAnnuler={() => setDialogue(null)}
          onOk={async () => { await actions.transition(rapport.id, 'reactiver', ''); setDialogue(null); actions.notifier('Rapport réactivé.'); }}
        />
      )}
      {dialogue === 'avancer' && (
        <Confirmation
          titre={e.action}
          message={rapport.etape === 5
            ? <>Confirmer le cost final de <strong>{argent(totaux.total)}</strong> ? Le rapport sera <strong>verrouillé</strong> : plus personne ne pourra le modifier.</>
            : <>Le rapport passera à l’étape <strong>{infoEtape(rapport.etape + 1).libelle}</strong>.</>}
          libelleOk={e.action}
          onAnnuler={() => setDialogue(null)}
          onOk={async () => {
            await actions.transition(rapport.id, 'avancer', '');
            setDialogue(null);
            actions.notifier(rapport.etape === 5 ? 'Cost final confirmé, rapport verrouillé.' : 'Rapport transmis à l’étape suivante.');
          }}
        />
      )}
      {dialogue === 'renvoyer' && (
        <Confirmation
          titre={`Renvoyer à l’étape ${rapport.etape - 1}`}
          message={<>Le rapport retourne à <strong>{infoEtape(rapport.etape - 1).libelle}</strong>. Explique ce qui doit être corrigé.</>}
          commentaire="obligatoire"
          libelleOk="Renvoyer"
          danger
          onAnnuler={() => setDialogue(null)}
          onOk={async (texte) => {
            await actions.transition(rapport.id, 'renvoyer', texte);
            setDialogue(null);
            actions.notifier('Rapport renvoyé à l’étape précédente.');
          }}
        />
      )}
      {dialogue === 'supprimer' && (
        <Confirmation
          titre="Supprimer le rapport"
          message="Le rapport et toutes ses lignes seront supprimés définitivement."
          libelleOk="Supprimer"
          danger
          onAnnuler={() => setDialogue(null)}
          onOk={async () => {
            await actions.supprimer('rapports', rapport.id);
            actions.notifier('Rapport supprimé.');
            naviguer('rapports');
          }}
        />
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
function InfosDuJour({ rapport, droits, sauver }) {
  const [brouillon, setBrouillon] = useState({});
  const v = { ...rapport, ...brouillon };
  const modif = droits.contenu;
  const changer = (champ, valeur) => setBrouillon((b) => ({ ...b, [champ]: valeur }));
  const sortir = (champ) => {
    if (brouillon[champ] === undefined || brouillon[champ] === rapport[champ]) return;
    sauver({ [champ]: brouillon[champ] });
    setBrouillon((b) => { const n = { ...b }; delete n[champ]; return n; });
  };

  return (
    <div className="pd-carte">
      <h3>Travaux du jour</h3>
      {modif ? (
        <>
          <Champ label="Titre"><input className="pd-input" value={v.titre || ''} onChange={(e) => changer('titre', e.target.value)} onBlur={() => sortir('titre')} maxLength={140} /></Champ>
          <Champ label="Description des travaux">
            <textarea className="pd-input" rows={4} value={v.description || ''} onChange={(e) => changer('description', e.target.value)} onBlur={() => sortir('description')} placeholder="Travaux réalisés, chaînages, imprévus, visiteurs…" />
          </Champ>
        </>
      ) : (
        <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5, marginBottom: 12 }}>{rapport.description || <span className="pd-dim">Aucune description.</span>}</div>
      )}

      <div className="pd-etiquette pd-flex" style={{ gap: 6, marginBottom: 8 }}><CloudSun size={14} /> Météo</div>
      {modif ? (
        <div className="pd-grille c4">
          <Champ label="Conditions">
            <select className="pd-input" value={v.meteo_conditions || ''} onChange={(e) => sauver({ meteo_conditions: e.target.value })}>
              <option value="">—</option>
              {METEO_CONDITIONS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Champ>
          <Champ label="Temp. min (°C)"><ChampNombre min={-60} valeur={v.meteo_temp_min} onChange={(n) => changer('meteo_temp_min', n)} onBlur={() => sortir('meteo_temp_min')} /></Champ>
          <Champ label="Temp. max (°C)"><ChampNombre min={-60} valeur={v.meteo_temp_max} onChange={(n) => changer('meteo_temp_max', n)} onBlur={() => sortir('meteo_temp_max')} /></Champ>
          <Champ label="Précip. (mm)"><ChampNombre valeur={v.meteo_precipitations_mm} onChange={(n) => changer('meteo_precipitations_mm', n)} onBlur={() => sortir('meteo_precipitations_mm')} /></Champ>
          <Champ label="Vent">
            <select className="pd-input" value={v.meteo_vent || ''} onChange={(e) => sauver({ meteo_vent: e.target.value })}>
              <option value="">—</option>
              {['Calme', 'Léger', 'Modéré', 'Fort'].map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Champ>
        </div>
      ) : (
        <div className="pd-dim">
          {[rapport.meteo_conditions,
            rapport.meteo_temp_min != null || rapport.meteo_temp_max != null ? `${rapport.meteo_temp_min ?? '?'} à ${rapport.meteo_temp_max ?? '?'} °C` : null,
            rapport.meteo_precipitations_mm ? `${nombre(rapport.meteo_precipitations_mm)} mm` : null,
            rapport.meteo_vent ? `vent ${rapport.meteo_vent.toLowerCase()}` : null].filter(Boolean).join(' · ') || 'Non inscrite'}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reprendre l'équipe et la machinerie du dernier rapport du même contremaître
// (même projet de préférence). Les taux sont ceux de l'année de CE rapport.
// ---------------------------------------------------------------------------
function ReprendreEquipe({ rapport }) {
  const { db, moi, actions } = usePepday();
  const [enCours, setEnCours] = useState(false);
  const precedent = useMemo(() => {
    const avecLignes = new Set(db.lignes.filter((l) => l.categorie === 'main_oeuvre' || l.categorie === 'equipement').map((l) => l.rapport_id));
    const candidats = db.rapports
      .filter((r) => r.id !== rapport.id && r.contremaitre_id === rapport.contremaitre_id && r.date <= rapport.date && avecLignes.has(r.id))
      .sort((a, b) => (b.projet_id === rapport.projet_id) - (a.projet_id === rapport.projet_id) || b.date.localeCompare(a.date));
    return candidats[0] || null;
  }, [db.lignes, db.rapports, rapport]);

  if (!precedent || !rapport.contremaitre_id) return null;
  // Les primes et les ressources hors catalogue ne se recopient pas d'un jour à l'autre.
  const aCopier = db.lignes.filter((l) => l.rapport_id === precedent.id && (l.categorie === 'main_oeuvre' || l.categorie === 'equipement') && !l.prime_id && !l.ressource_provisoire_id);

  async function copier() {
    setEnCours(true);
    const annee = anneeDe(rapport.date);
    try {
      const rows = aCopier.map((l) => {
        const t = tauxPourNouvelleLigne({ categorie: l.categorie, refId: l.ref_id, annee, presets: db.taux, employes: db.employes, tauxManuel: l.taux, tauxManuelSupp: l.taux_supp });
        return {
          rapport_id: rapport.id, categorie: l.categorie, ref_id: l.ref_id, libelle: l.libelle, detail: l.detail,
          quantite: l.quantite, quantite_supp: l.categorie === 'main_oeuvre' ? 0 : null, unite: l.unite,
          taux: t.taux, taux_supp: t.taux_supp, taux_preset: t.taux_preset, taux_supp_preset: t.taux_supp_preset,
          taux_annee: t.taux_annee, taux_source: t.taux_source, taux_preset_id: t.taux_preset_id, created_by: moi.membreId,
        };
      });
      await actions.insererPlusieurs('lignes', rows);
      actions.notifier(`${rows.length} lignes reprises du rapport du ${precedent.date}. Ajuste les heures au besoin.`);
    } catch (e) {
      actions.notifier(e.message || String(e), 'err');
    }
    setEnCours(false);
  }

  return (
    <div className="pd-encadre info pd-flex" style={{ justifyContent: 'space-between' }}>
      <span>Gagne du temps : reprends l’équipe et la machinerie de ton rapport du {precedent.date} ({aCopier.length} lignes).</span>
      <button className="pd-btn petit" onClick={copier} disabled={enCours}><Copy size={14} /> Reprendre</button>
    </div>
  );
}

// ---------------------------------------------------------------------------
function MiniaturePhoto({ photo, onOuvrir, onSupprimer }) {
  const { actions } = usePepday();
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let actif = true;
    actions.urlFichier(BUCKET_PHOTOS, photo.chemin).then((u) => { if (actif) setUrl(u); });
    return () => { actif = false; };
  }, [photo.chemin, actions]);
  return (
    <div className="pd-photo">
      {url ? <img src={url} alt={photo.legende || 'Photo du chantier'} onClick={() => onOuvrir(url)} /> : <div className="pd-section-vide">…</div>}
      {onSupprimer && <button className="pd-btn rouge petit" onClick={onSupprimer} aria-label="Supprimer la photo"><Trash2 size={12} /></button>}
    </div>
  );
}

function Photos({ rapport, photos, droits }) {
  const { actions, moi } = usePepday();
  const [envoi, setEnvoi] = useState(0);
  const [agrandie, setAgrandie] = useState(null);
  const entree = useRef(null);

  async function ajouter(fichiers) {
    const liste = Array.from(fichiers || []);
    setEnvoi(liste.length);
    for (const brut of liste) {
      try {
        const fichier = await compresserImage(brut);
        const chemin = `${rapport.projet_id}/${rapport.id}/${Date.now()}-${nomFichierPropre(fichier.name)}`;
        const { chemin: final } = await actions.televerser(BUCKET_PHOTOS, chemin, fichier);
        await actions.inserer('photos', { rapport_id: rapport.id, chemin: final, legende: '', prise_le: new Date(brut.lastModified || Date.now()).toISOString(), created_by: moi.membreId });
      } catch (e) {
        actions.notifier(`Photo non envoyée : ${e.message || e}`, 'err');
      }
      setEnvoi((n) => n - 1);
    }
    if (entree.current) entree.current.value = '';
  }

  return (
    <div className="pd-carte">
      <div className="pd-carte-titre">
        <h3 className="pd-flex" style={{ gap: 6 }}><Camera size={16} /> Photos ({photos.length})</h3>
        {droits.photos && (
          <>
            <input ref={entree} type="file" accept="image/*" capture="environment" multiple style={{ display: 'none' }} onChange={(e) => ajouter(e.target.files)} />
            <button className="pd-btn petit" onClick={() => entree.current?.click()} disabled={envoi > 0}>
              <Camera size={14} /> {envoi > 0 ? `Envoi… (${envoi})` : 'Prendre / ajouter'}
            </button>
          </>
        )}
      </div>
      {photos.length === 0 ? <div className="pd-section-vide" style={{ padding: 8 }}>Aucune photo.</div> : (
        <div className="pd-photos">
          {photos.map((p) => (
            <MiniaturePhoto
              key={p.id}
              photo={p}
              onOuvrir={setAgrandie}
              onSupprimer={droits.photos ? async () => {
                if (!window.confirm('Supprimer cette photo ?')) return;
                await actions.supprimer('photos', p.id);
                actions.supprimerFichier(BUCKET_PHOTOS, p.chemin);
              } : null}
            />
          ))}
        </div>
      )}
      {agrandie && (
        <Modal titre="Photo" onFermer={() => setAgrandie(null)} large>
          <img src={agrandie} alt="Photo du chantier" style={{ width: '100%', borderRadius: 6 }} />
        </Modal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function Commentaires({ rapport, commentaires, droits }) {
  const { actions, moi } = usePepday();
  const [texte, setTexte] = useState('');
  const [flag, setFlag] = useState(false);
  const [enCours, setEnCours] = useState(false);

  async function publier() {
    if (!texte.trim()) return;
    setEnCours(true);
    try {
      await actions.inserer('commentaires', {
        rapport_id: rapport.id, auteur_id: moi.membreId, auteur_nom: moi.nom, texte: texte.trim(),
        lecture_obligatoire: Boolean(flag && droits.flag), lu_par_id: null, lu_par_nom: null, lu_le: null,
      });
      setTexte('');
      setFlag(false);
    } catch (e) {
      actions.notifier(e.message || String(e), 'err');
    }
    setEnCours(false);
  }

  return (
    <div className="pd-carte">
      <h3 className="pd-flex" style={{ gap: 6 }}><MessageSquare size={16} /> Commentaires ({commentaires.length})</h3>
      {commentaires.map((c) => (
        <div key={c.id} className={`pd-comm ${c.lecture_obligatoire ? 'flag' : ''} ${c.lu_le ? 'lu' : ''}`}>
          <div className="pd-comm-tete">
            <span><strong style={{ color: 'var(--pd-texte)' }}>{c.auteur_nom}</strong> · {horodatage(c.created_at)}</span>
            {c.lecture_obligatoire && (c.lu_le
              ? <span className="pd-flag lu"><CheckCircle2 size={13} /> Lu par {c.lu_par_nom} · {horodatage(c.lu_le)}</span>
              : <span className="pd-flag"><Flag size={13} /> Lecture obligatoire</span>)}
          </div>
          <div className="pd-comm-texte">{c.texte}</div>
          {c.lecture_obligatoire && !c.lu_le && droits.accuserLecture && (
            <div style={{ marginTop: 10 }}>
              <button className="pd-btn vert" onClick={async () => {
                try { await actions.accuserLecture(c.id); actions.notifier('Lecture confirmée et horodatée.'); } catch (e) { actions.notifier(e.message, 'err'); }
              }}
              >
                <CheckCircle2 size={15} /> J’ai lu ce commentaire
              </button>
            </div>
          )}
        </div>
      ))}
      {commentaires.length === 0 && <div className="pd-section-vide" style={{ padding: 8 }}>Aucun commentaire.</div>}

      {droits.commentaires && (
        <div style={{ marginTop: 10 }}>
          <Champ label="Nouveau commentaire">
            <textarea className="pd-input" value={texte} onChange={(e) => setTexte(e.target.value)} placeholder="Écris ton commentaire…" />
          </Champ>
          <div className="pd-flex" style={{ justifyContent: 'space-between' }}>
            {droits.flag ? (
              <label className="pd-case" style={{ color: flag ? 'var(--pd-rouge)' : undefined, fontWeight: flag ? 700 : 400 }}>
                <input type="checkbox" checked={flag} onChange={(e) => setFlag(e.target.checked)} />
                <Flag size={14} /> Lecture obligatoire pour le chargé de projet
              </label>
            ) : <span />}
            <button className={`pd-btn ${flag ? 'rouge' : ''}`} onClick={publier} disabled={enCours || !texte.trim()}>Publier</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// RV02 — Quart du rapport (hérité de l'équipe, modifiable)
// ---------------------------------------------------------------------------
function ChampQuart({ rapport, sauver }) {
  const { db } = usePepday();
  return (
    <Champ label="Quart">
      <select className="pd-input" value={rapport.quart_id || ''} onChange={(e) => sauver({ quart_id: e.target.value || null })}>
        <option value="">—</option>
        {(db.quarts || []).filter((q) => q.actif !== false).map((q) => <option key={q.id} value={q.id}>{q.nom}</option>)}
      </select>
    </Champ>
  );
}

// ---------------------------------------------------------------------------
// RV02 — Activités : les sous-tâches travaillées dans la journée et la
// quantité réalisée de chacune. C'est ce qui permet le coût unitaire et la
// productivité en heures-personnes (MH) dans les rapports globaux.
// ---------------------------------------------------------------------------
function Activites({ rapport, activites, lignes, droits }) {
  const { db, index, actions, moi } = usePepday();
  const [ajout, setAjout] = useState(false);
  const [f, setF] = useState({ sousTache: '', quantite: null, unite: '' });
  const [erreur, setErreur] = useState('');
  const modifiable = droits.lignesAjout || droits.lignesQuantites;
  const options = useMemo(() => (db.sous_taches || []).filter((x) => x.actif !== false).map((st) => ({
    valeur: st.id, libelle: `${st.code ? `${st.code} ` : ''}${st.nom}`, detail: index.taches[st.tache_id]?.nom,
  })), [db.sous_taches, index.taches]);

  // Heures-personnes par sous-tâche (main-d'œuvre, primes exclues).
  const mh = (stId) => lignes
    .filter((l) => l.categorie === 'main_oeuvre' && !l.prime_id && (l.sous_tache_id === stId || (activites.length === 1 && !l.sous_tache_id)))
    .reduce((s, l) => s + (Number(l.quantite) || 0) + (Number(l.quantite_supp) || 0), 0);

  async function ajouter() {
    if (!f.sousTache) { setErreur('Choisis la sous-tâche.'); return; }
    if (activites.some((a) => a.sous_tache_id === f.sousTache)) { setErreur('Cette sous-tâche est déjà dans le rapport.'); return; }
    try {
      await actions.inserer('activites', {
        rapport_id: rapport.id, sous_tache_id: f.sousTache, quantite_realisee: f.quantite ?? null,
        unite: f.unite || index.sous_taches[f.sousTache]?.unite || null, note: '', created_by: moi.membreId,
      });
      setF({ sousTache: '', quantite: null, unite: '' });
      setAjout(false);
      setErreur('');
    } catch (e) { setErreur(e.message || String(e)); }
  }

  return (
    <div className="pd-carte">
      <div className="pd-carte-titre">
        <h3 className="pd-flex" style={{ gap: 6 }}><ListChecks size={17} /> Activités et quantités réalisées <span className="pd-dim pd-petit">({activites.length})</span></h3>
        {modifiable && !ajout && <button className="pd-btn petit" onClick={() => setAjout(true)}><Plus size={14} /> Sous-tâche</button>}
      </div>
      {activites.length === 0 && !ajout && <div className="pd-section-vide" style={{ padding: 8 }}>Aucune activité. Ajoute la ou les sous-tâches de la journée et la quantité réalisée.</div>}
      {activites.map((a) => {
        const st = index.sous_taches[a.sous_tache_id];
        const heures = mh(a.sous_tache_id);
        return (
          <div key={a.id} className="pd-ligne">
            <div className="pd-ligne-haut">
              <div style={{ minWidth: 0 }}>
                <div className="pd-ligne-nom">{st ? `${st.code ? `${st.code} ` : ''}${st.nom}` : 'Sous-tâche'}</div>
                <div className="pd-ligne-detail">{index.taches[st?.tache_id]?.nom}</div>
              </div>
              <div className="pd-petit pd-dim" style={{ textAlign: 'right' }}>
                {nombre(heures)} h-personnes
                {Number(a.quantite_realisee) > 0 && <div><strong style={{ color: 'var(--pd-texte)' }}>{nombre(heures / Number(a.quantite_realisee))} MH / {a.unite || 'unité'}</strong></div>}
              </div>
            </div>
            <div className="pd-ligne-champs">
              <Champ label="Quantité réalisée">
                {modifiable
                  ? <ChampNombre valeur={a.quantite_realisee} onChange={() => {}} onBlur={async (ev) => { const n = Number(String(ev.target.value).replace(',', '.')); if (n !== Number(a.quantite_realisee)) await actions.modifier('activites', a.id, { quantite_realisee: ev.target.value === '' ? null : n }); }} />
                  : <div style={{ padding: '10px 0' }}>{a.quantite_realisee == null ? '—' : nombre(a.quantite_realisee)}</div>}
              </Champ>
              <Champ label="Unité">
                {modifiable
                  ? <select className="pd-input" value={a.unite || ''} onChange={(e) => actions.modifier('activites', a.id, { unite: e.target.value || null })}><option value="">—</option>{UNITES.map((u) => <option key={u} value={u}>{u}</option>)}</select>
                  : <div style={{ padding: '10px 0' }}>{a.unite || '—'}</div>}
              </Champ>
            </div>
            {modifiable && (
              <div className="pd-actions droite" style={{ marginTop: 6 }}>
                <button className="pd-btn fantome petit" aria-label="Retirer" onClick={async () => { if (window.confirm('Retirer cette sous-tâche du rapport ?')) await actions.supprimer('activites', a.id); }}><Trash2 size={13} /></button>
              </div>
            )}
          </div>
        );
      })}
      {ajout && (
        <div className="pd-ligne" style={{ borderStyle: 'dashed', borderColor: 'var(--pd-lien)' }}>
          <Champ label="Sous-tâche">
            <ChampListe options={options} valeur={f.sousTache} onChange={(v) => setF({ ...f, sousTache: v, unite: index.sous_taches[v]?.unite || '' })} placeholder="Code ou nom (ex. 203, coffrage)…" />
          </Champ>
          <div className="pd-ligne-champs">
            <Champ label="Quantité réalisée"><ChampNombre valeur={f.quantite} onChange={(n) => setF({ ...f, quantite: n })} /></Champ>
            <Champ label="Unité">
              <select className="pd-input" value={f.unite} onChange={(e) => setF({ ...f, unite: e.target.value })}><option value="">—</option>{UNITES.map((u) => <option key={u} value={u}>{u}</option>)}</select>
            </Champ>
          </div>
          {erreur && <Encadre type="err">{erreur}</Encadre>}
          <div className="pd-actions droite">
            <button className="pd-btn fantome" onClick={() => { setAjout(false); setErreur(''); }}>Fermer</button>
            <button className="pd-btn" onClick={ajouter}><Plus size={15} /> Ajouter</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// RV02 — Charger l'équipe : les employés et les équipements rattachés à
// l'équipe du rapport, aux taux preset de l'année du rapport.
// ---------------------------------------------------------------------------
function ChargerEquipe({ rapport }) {
  const { db, index, moi, actions } = usePepday();
  const [enCours, setEnCours] = useState(false);
  const equipe = rapport.equipe_id ? index.equipes[rapport.equipe_id] : null;
  if (!equipe) return null;
  const emps = db.employes.filter((e) => e.actif !== false && e.equipe_id === equipe.id);
  const eqs = db.equipements.filter((q) => q.actif !== false && q.equipe_id === equipe.id);
  if (!emps.length && !eqs.length) return null;
  const heuresQuart = Number(index.quarts[rapport.quart_id]?.heures_normales) || 8;

  async function charger() {
    setEnCours(true);
    const annee = anneeDe(rapport.date);
    const ligne = (categorie, refId, libelle, detail) => {
      const t = tauxPourNouvelleLigne({ categorie, refId, annee, presets: db.taux, employes: db.employes });
      return {
        rapport_id: rapport.id, categorie, ref_id: refId, libelle, detail, quantite: heuresQuart, quantite_supp: categorie === 'main_oeuvre' ? 0 : null,
        unite: 'h', taux: t.taux, taux_supp: t.taux_supp, taux_preset: t.taux_preset, taux_supp_preset: t.taux_supp_preset,
        taux_annee: t.taux_annee, taux_source: t.taux_source, taux_preset_id: t.taux_preset_id, created_by: moi.membreId,
      };
    };
    try {
      await actions.insererPlusieurs('lignes', [
        ...emps.map((e) => ligne('main_oeuvre', e.id, e.nom, index.metiers[e.metier_id]?.nom || '')),
        ...eqs.map((q) => ligne('equipement', q.id, `${q.code} — ${q.nom}`, '')),
      ]);
      actions.notifier(`${emps.length} employés et ${eqs.length} équipements chargés à ${heuresQuart} h (quart). Ajuste les heures au besoin.`);
    } catch (e) {
      actions.notifier(e.message || String(e), 'err');
    }
    setEnCours(false);
  }

  return (
    <div className="pd-encadre info pd-flex" style={{ justifyContent: 'space-between' }}>
      <span>Charger <strong>{equipe.nom}</strong> : {emps.length} employés et {eqs.length} équipements, à {heuresQuart} h chacun.</span>
      <button className="pd-btn petit" onClick={charger} disabled={enCours}><UsersRound size={14} /> Charger l’équipe</button>
    </div>
  );
}

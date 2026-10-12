import { useMemo, useState } from 'react';
import { User, CalendarDays, Plus, UsersRound, Copy } from 'lucide-react';
import ChampListe from '../commun/ChampListe';
import { usePepday, BadgeFlag, Modal, Champ, Encadre, optionsDe } from './ui';
import { COULEURS_ETAPES, statutRapport } from '../../lib/pepday/constantes';
import { argent, dateCourte, aujourdhui } from '../../lib/pepday/couts';
import { aRole, estSuperviseur } from '../../lib/pepday/workflow';

// ---------------------------------------------------------------------------
// PEPDAY — BLOCS COMMUNS AUX LISTES DE RAPPORTS
//
// RV02 : un rapport appartient à une équipe (contremaître, quart, monde).
// Une équipe peut avoir DEUX rapports ou plus le même jour, sur des projets
// différents — chez Civalgo, PEP avait dû créer une dizaine de fausses
// équipes « 2 » pour contourner la limite d'un rapport par équipe par jour.
// ---------------------------------------------------------------------------

export function PastilleStatut({ rapport }) {
  const s = statutRapport(rapport);
  return <span className="pd-pastille" style={{ background: s.couleur }}>{s.libelle}</span>;
}

export function ItemRapport({ rapport, montrerProjet = true }) {
  const { index, derive, naviguer } = usePepday();
  const projet = index.projets[rapport.projet_id];
  const cm = index.membres[rapport.contremaitre_id];
  const equipe = index.equipes?.[rapport.equipe_id];
  const flags = derive.flagsParRapport[rapport.id] || { nonLus: 0, lus: 0 };
  const total = derive.totalParRapport[rapport.id] || 0;
  return (
    <button className="pd-item" style={{ borderLeftColor: rapport.abandonne ? '#5c6478' : COULEURS_ETAPES[rapport.etape], opacity: rapport.abandonne ? 0.65 : 1 }} onClick={() => naviguer('rapport', rapport.id)}>
      <div className="pd-item-haut">
        <div style={{ minWidth: 0 }}>
          <div className="pd-item-titre">{rapport.titre || (projet ? 'Rapport sans titre' : 'À planifier')}</div>
          {montrerProjet && <div className="pd-item-sous">{projet ? `${projet.numero} — ${projet.nom}` : 'Aucun projet assigné'}</div>}
        </div>
        <span className="pd-gras" style={{ fontVariantNumeric: 'tabular-nums' }}>{argent(total)}</span>
      </div>
      <div className="pd-item-bas">
        <PastilleStatut rapport={rapport} />
        <BadgeFlag nonLus={flags.nonLus} />
        <span className="pd-dim pd-petit pd-flex" style={{ gap: 4 }}><CalendarDays size={13} /> {dateCourte(rapport.date)}</span>
        {(equipe || cm) && <span className="pd-dim pd-petit pd-flex" style={{ gap: 4 }}><User size={13} /> {equipe?.nom || cm?.nom}</span>}
        <span className="pd-dim pd-petit">#{rapport.numero}</span>
      </div>
    </button>
  );
}

export function peutCreerRapport(moi) {
  return estSuperviseur(moi) || aRole(moi, 'dispatch');
}

// Création d'un rapport par le dispatch (étape 1). Sans projet, il est « À
// planifier ». « Créer et transmettre » l'envoie au contremaître (étape 2).
export function NouveauRapport({ onFermer, projetId = '', equipeId = '', date = '' }) {
  const { db, index, moi, actions, naviguer } = usePepday();
  const [f, setF] = useState(() => {
    const eq = index.equipes?.[equipeId];
    const p = index.projets[projetId];
    const eqDuProjet = !eq && p ? (db.equipes || []).find((x) => (p.contremaitre_ids || []).includes(x.contremaitre_id)) : null;
    const e0 = eq || eqDuProjet;
    return { projet_id: projetId, date: date || aujourdhui(), equipe_id: e0?.id || '', contremaitre_id: e0?.contremaitre_id || p?.contremaitre_ids?.[0] || '', quart_id: e0?.quart_id || '', titre: '' };
  });
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);

  const projetsOuverts = db.projets.filter((p) => ['en_cours', 'a_venir', 'suspendu'].includes(p.statut));
  const dejaCeJour = db.rapports.filter((r) => !r.abandonne && r.equipe_id && r.equipe_id === f.equipe_id && r.date === f.date);

  async function creer(transmettre) {
    if (!f.date) { setErreur('Choisis la date.'); return; }
    if (transmettre && !f.projet_id) { setErreur('Choisis le projet pour transmettre. Sans projet, le rapport reste « À planifier ».'); return; }
    if (transmettre && !f.contremaitre_id) { setErreur('Choisis l’équipe (ou le contremaître) pour transmettre.'); return; }
    setEnCours(true);
    setErreur('');
    try {
      const r = await actions.inserer('rapports', {
        projet_id: f.projet_id || null, date: f.date, titre: f.titre.trim(), equipe_id: f.equipe_id || null,
        contremaitre_id: f.contremaitre_id || null, quart_id: f.quart_id || null,
        description: '', etape: 1, created_by: moi.membreId, abandonne: false,
      });
      if (transmettre) await actions.transition(r.id, 'avancer', '');
      actions.notifier(transmettre ? 'Rapport créé et transmis au contremaître.' : (f.projet_id ? 'Rapport créé.' : 'Rapport créé « À planifier ».'));
      onFermer();
      naviguer('rapport', r.id);
    } catch (e) {
      setErreur(e.message || String(e));
      setEnCours(false);
    }
  }

  return (
    <Modal titre="Nouveau rapport journalier" onFermer={onFermer}>
      <div className="pd-grille c2">
        <Champ label="Date">
          <input className="pd-input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        </Champ>
        <Champ label="Équipe">
          <ChampListe
            options={optionsDe((db.equipes || []).filter((x) => x.actif !== false), { detail: (x) => index.membres[x.contremaitre_id]?.nom })}
            valeur={f.equipe_id}
            onChange={(v) => { const eq = index.equipes[v]; setF({ ...f, equipe_id: v, contremaitre_id: eq?.contremaitre_id || f.contremaitre_id, quart_id: eq?.quart_id || f.quart_id }); }}
            placeholder="Choisir…"
          />
        </Champ>
      </div>
      {dejaCeJour.length > 0 && (
        <Encadre type="info">
          Cette équipe a déjà {dejaCeJour.length} rapport{dejaCeJour.length > 1 ? 's' : ''} ce jour-là
          ({dejaCeJour.map((r) => index.projets[r.projet_id]?.numero || 'à planifier').join(', ')}). Celui-ci sera un rapport de plus, normalement sur un autre projet.
        </Encadre>
      )}
      <Champ label="Projet" aide="Facultatif : sans projet, le rapport est « À planifier ».">
        <ChampListe
          options={optionsDe(projetsOuverts, { libelle: (p) => `${p.numero} — ${p.nom}`, detail: (p) => p.client })}
          valeur={f.projet_id}
          onChange={(v) => setF({ ...f, projet_id: v })}
          placeholder="Chercher un projet…"
          videLabel="À planifier (aucun projet)"
        />
      </Champ>
      <div className="pd-grille c2">
        <Champ label="Quart">
          <select className="pd-input" value={f.quart_id} onChange={(e) => setF({ ...f, quart_id: e.target.value })}>
            <option value="">—</option>
            {(db.quarts || []).filter((q) => q.actif !== false).map((q) => <option key={q.id} value={q.id}>{q.nom}</option>)}
          </select>
        </Champ>
        <Champ label="Titre" aide="Ex. : Pose d’aqueduc, ch. 0+100 à 0+180">
          <input className="pd-input" value={f.titre} onChange={(e) => setF({ ...f, titre: e.target.value })} maxLength={140} />
        </Champ>
      </div>
      {erreur && <Encadre type="err">{erreur}</Encadre>}
      <div className="pd-actions droite">
        <button className="pd-btn fantome" onClick={onFermer} disabled={enCours}>Annuler</button>
        <button className="pd-btn fantome" onClick={() => creer(false)} disabled={enCours}>Créer {f.projet_id ? '(brouillon)' : '(à planifier)'}</button>
        <button className="pd-btn" onClick={() => creer(true)} disabled={enCours || !f.projet_id}>Créer et transmettre</button>
      </div>
    </Modal>
  );
}

// Le dispatch de la journée : une ligne par équipe active, avec le projet
// proposé (celui de son dernier rapport). On peut ajouter une deuxième ligne
// pour la même équipe, sur un autre projet.
export function DispatchJournee({ onFermer }) {
  const { db, index, moi, actions } = usePepday();
  const [date, setDate] = useState(aujourdhui());
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState('');

  const equipes = (db.equipes || []).filter((e) => e.actif !== false);
  const dernierProjet = useMemo(() => {
    const m = {};
    [...db.rapports].filter((r) => r.projet_id && r.equipe_id && !r.abandonne).sort((a, b) => a.date.localeCompare(b.date)).forEach((r) => { m[r.equipe_id] = r.projet_id; });
    return m;
  }, [db.rapports]);

  const [lignes, setLignes] = useState(() => equipes.map((e) => ({ cle: `${e.id}-0`, equipe_id: e.id, projet_id: dernierProjet[e.id] || '', coche: false })));
  const existants = (eqId) => db.rapports.filter((r) => r.equipe_id === eqId && r.date === date && !r.abandonne);
  const projetsOuverts = db.projets.filter((p) => ['en_cours', 'a_venir', 'suspendu'].includes(p.statut));
  const aCreer = lignes.filter((l) => l.coche);

  const maj = (cle, patch) => setLignes((ls) => ls.map((l) => (l.cle === cle ? { ...l, ...patch } : l)));
  const ajouterDeuxieme = (eqId) => setLignes((ls) => {
    const n = ls.filter((l) => l.equipe_id === eqId).length;
    const i = ls.map((l) => l.equipe_id).lastIndexOf(eqId);
    const copie = [...ls];
    copie.splice(i + 1, 0, { cle: `${eqId}-${n}`, equipe_id: eqId, projet_id: '', coche: true });
    return copie;
  });

  async function lancer() {
    setEnCours(true);
    setErreur('');
    try {
      let transmis = 0;
      for (const l of aCreer) {
        const eq = index.equipes[l.equipe_id];
        const r = await actions.inserer('rapports', {
          projet_id: l.projet_id || null, date, titre: '', equipe_id: eq.id, contremaitre_id: eq.contremaitre_id, quart_id: eq.quart_id || null,
          description: '', etape: 1, created_by: moi.membreId, abandonne: false,
        });
        // Sans projet, le rapport reste « À planifier » au dispatch.
        if (l.projet_id) { await actions.transition(r.id, 'avancer', ''); transmis += 1; }
      }
      const planif = aCreer.length - transmis;
      actions.notifier(`${aCreer.length} rapport${aCreer.length > 1 ? 's' : ''} créé${aCreer.length > 1 ? 's' : ''} : ${transmis} transmis${planif ? `, ${planif} à planifier` : ''}.`);
      onFermer();
    } catch (e) {
      setErreur(e.message || String(e));
      setEnCours(false);
    }
  }

  return (
    <Modal titre="Dispatch de la journée" onFermer={onFermer} large>
      <Champ label="Date des rapports">
        <input className="pd-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ maxWidth: 220 }} />
      </Champ>
      <p className="pd-dim pd-petit" style={{ marginTop: 0 }}>
        Une ligne par équipe. Le projet proposé est celui de son dernier rapport. « Deuxième rapport » ajoute une ligne pour la même équipe sur un autre projet.
        Sans projet, le rapport est créé « À planifier ».
      </p>
      {equipes.length === 0 && <div className="pd-section-vide">Aucune équipe active. Crée les équipes dans Répertoires &gt; Équipes.</div>}
      <div className="pd-liste" style={{ marginBottom: 12 }}>
        {lignes.map((l) => {
          const eq = index.equipes[l.equipe_id];
          const deja = existants(l.equipe_id);
          const premiere = lignes.find((x) => x.equipe_id === l.equipe_id) === l;
          return (
            <div key={l.cle} className="pd-ligne" style={{ marginBottom: 0 }}>
              <div className="pd-flex" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                <input type="checkbox" checked={l.coche} onChange={(e) => maj(l.cle, { coche: e.target.checked })} style={{ width: 20, height: 20, marginTop: 4 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="pd-gras"><UsersRound size={14} style={{ verticalAlign: -2 }} /> {eq?.nom}{!premiere && <span className="pd-tag" style={{ marginLeft: 6 }}>rapport de plus</span>}</div>
                  <div className="pd-dim pd-petit">{index.membres[eq?.contremaitre_id]?.nom} · {eq?.departement} · quart {index.quarts[eq?.quart_id]?.nom || '—'}
                    {premiere && deja.length > 0 && ` · déjà ${deja.length} rapport${deja.length > 1 ? 's' : ''} ce jour-là (${deja.map((r) => index.projets[r.projet_id]?.numero || 'à planifier').join(', ')})`}
                  </div>
                  <div style={{ marginTop: 6 }}>
                    <ChampListe
                      options={optionsDe(projetsOuverts, { libelle: (p) => `${p.numero} — ${p.nom}` })}
                      valeur={l.projet_id}
                      onChange={(v) => maj(l.cle, { projet_id: v, coche: true })}
                      videLabel="À planifier (aucun projet)"
                      placeholder="Projet…"
                    />
                  </div>
                </div>
                {premiere && <button className="pd-btn fantome petit" onClick={() => ajouterDeuxieme(l.equipe_id)} title="Deuxième rapport pour la même équipe"><Copy size={13} /> Deuxième rapport</button>}
              </div>
            </div>
          );
        })}
      </div>
      {erreur && <Encadre type="err">{erreur}</Encadre>}
      <div className="pd-actions droite">
        <button className="pd-btn fantome" onClick={() => setLignes((ls) => ls.map((l) => ({ ...l, coche: true })))}>Tout cocher</button>
        <button className="pd-btn" disabled={enCours || aCreer.length === 0} onClick={lancer}>
          <Plus size={15} /> Créer ({aCreer.length})
        </button>
      </div>
    </Modal>
  );
}

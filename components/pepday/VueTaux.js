import { useMemo, useState } from 'react';
import { Plus, Copy, Download, Trash2, Pencil } from 'lucide-react';
import ChampListe from '../commun/ChampListe';
import { usePepday, Champ, ChampNombre, Modal, Encadre, optionsDe } from './ui';
import { CATEGORIES, UNITES, UNITES_PRIME, typeOrganisation } from '../../lib/pepday/constantes';
import { argent } from '../../lib/pepday/couts';
import { copierPresets } from '../../lib/pepday/taux';
import { peutGererTaux } from '../../lib/pepday/workflow';
import { exporterExcel } from '../../lib/pepday/exportExcel';

// ---------------------------------------------------------------------------
// PEPDAY — TABLES DE TAUX « PRESET » PAR ANNÉE
//
// Quatre onglets (main-d'œuvre, équipements, matériaux, sous-traitants), une
// année à la fois. Changer un preset ici ne touche JAMAIS les rapports déjà
// saisis : chaque ligne de rapport a gardé sa propre copie du taux.
// ---------------------------------------------------------------------------

export default function VueTaux() {
  const { db, index, moi, actions } = usePepday();
  const annees = useMemo(() => {
    const s = new Set(db.taux.map((t) => Number(t.annee)));
    s.add(new Date().getFullYear());
    return [...s].sort((a, b) => b - a);
  }, [db.taux]);
  const [annee, setAnnee] = useState(new Date().getFullYear());
  const [cat, setCat] = useState('main_oeuvre');
  const [edition, setEdition] = useState(null);
  const [copie, setCopie] = useState(false);
  const [q, setQ] = useState('');
  const modifiable = peutGererTaux(moi);

  const nomRef = (t) => {
    if (t.ref_type === 'metier') return index.metiers[t.ref_id]?.nom || '?';
    if (t.ref_type === 'employe') return index.employes[t.ref_id]?.nom || '?';
    if (t.ref_type === 'equipement') { const x = index.equipements[t.ref_id]; return x ? `${x.code} — ${x.nom}` : '?'; }
    if (t.ref_type === 'materiau') return index.materiaux[t.ref_id]?.nom || '?';
    return index.organisations[t.ref_id]?.nom || '?';
  };

  const lignes = db.taux
    .filter((t) => Number(t.annee) === Number(annee) && t.categorie === cat)
    .filter((t) => !q || `${nomRef(t)} ${t.description || ''}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (a.ref_type || '').localeCompare(b.ref_type || '') || nomRef(a).localeCompare(nomRef(b), 'fr'));

  // Combien de lignes de rapport utilisent chaque preset — information, pas
  // blocage : on peut corriger un preset, les rapports passés ne bougent pas.
  const utilisations = useMemo(() => {
    const m = {};
    for (const l of db.lignes) if (l.taux_preset_id) m[l.taux_preset_id] = (m[l.taux_preset_id] || 0) + 1;
    return m;
  }, [db.lignes]);

  function exporter() {
    exporterExcel(`PEPday - taux preset ${annee}`, CATEGORIES.map((c) => ({
      nom: c.libelle,
      titre: `Taux preset ${annee} — ${c.libelle}`,
      colonnes: [
        { entete: 'Type', cle: 'type', largeur: 14 }, { entete: 'Élément', cle: 'nom', largeur: 36 },
        { entete: 'Description', cle: 'description', largeur: 26 }, { entete: 'Unité', cle: 'unite', largeur: 8 },
        { entete: c.code === 'main_oeuvre' ? 'Taux régulier' : c.code === 'equipement' ? 'Taux horaire' : 'Prix unitaire', cle: 'taux', format: 'argent' },
        ...(c.code === 'main_oeuvre' ? [{ entete: 'Taux supp.', cle: 'taux_supp', format: 'argent' }] : []),
      ],
      lignes: db.taux.filter((t) => Number(t.annee) === Number(annee) && t.categorie === c.code).map((t) => ({
        type: { metier: 'Métier', employe: 'Employé' }[t.ref_type] || '', nom: nomRef(t), description: t.description, unite: t.unite,
        taux: Number(t.taux), taux_supp: t.taux_supp == null ? null : Number(t.taux_supp),
      })),
    })));
  }

  return (
    <main className="pd-main pd-l1300">
      <div className="pd-carte">
        <div className="pd-carte-titre">
          <h2>Taux preset</h2>
          <div className="pd-actions">
            <button className="pd-btn fantome" onClick={exporter}><Download size={15} /> Excel</button>
            {modifiable && <button className="pd-btn fantome" onClick={() => setCopie(true)}><Copy size={15} /> Copier une année</button>}
            {modifiable && cat !== 'primes' && <button className="pd-btn" onClick={() => setEdition({ annee, categorie: cat })}><Plus size={15} /> Ajouter un taux</button>}
          </div>
        </div>
        <Encadre type="info">
          Chaque ligne de rapport prend le preset de l’année de sa date <strong>au moment de la saisie</strong> et le garde.
          Modifier un preset ici ne change jamais un rapport déjà saisi. Pour la main-d’œuvre, le taux propre à un employé passe avant celui de son métier.
        </Encadre>
        <div className="pd-flex" style={{ marginBottom: 10 }}>
          <Champ label="Année" style={{ marginBottom: 0, width: 130 }}>
            <select className="pd-input" value={annee} onChange={(e) => setAnnee(Number(e.target.value))}>
              {annees.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </Champ>
          <Champ label="Recherche" style={{ marginBottom: 0, flex: 1, minWidth: 180 }}>
            <input className="pd-input" value={q} onChange={(e) => setQ(e.target.value)} />
          </Champ>
        </div>
        <div className="pd-onglets">
          {CATEGORIES.map((c) => (
            <button key={c.code} className={`pd-onglet ${cat === c.code ? 'actif' : ''}`} onClick={() => setCat(c.code)}>
              {c.libelle} <span className="pd-dim" style={{ color: 'inherit', opacity: 0.7 }}>({db.taux.filter((t) => Number(t.annee) === Number(annee) && t.categorie === c.code).length})</span>
            </button>
          ))}
          <button className={`pd-onglet ${cat === 'primes' ? 'actif' : ''}`} onClick={() => setCat('primes')}>
            Primes <span style={{ opacity: 0.7 }}>({(db.primes || []).filter((x) => x.actif !== false).length})</span>
          </button>
        </div>
      </div>

      {cat === 'primes' ? <Primes modifiable={modifiable} /> : (<>
      <div className="pd-table-wrap">
        <table className="pd-table">
          <thead>
            <tr>
              {cat === 'main_oeuvre' && <th>Type</th>}
              <th>{cat === 'main_oeuvre' ? 'Métier / employé' : cat === 'equipement' ? 'Équipement' : cat === 'materiau' ? 'Matériau' : 'Sous-traitant'}</th>
              {cat === 'sous_traitant' && <th>Travail</th>}
              <th>Unité</th>
              <th className="num">{cat === 'main_oeuvre' ? 'Taux rég.' : cat === 'equipement' ? 'Taux horaire' : 'Prix unitaire'}</th>
              {cat === 'main_oeuvre' && <th className="num">Taux supp.</th>}
              <th className="num">Lignes</th>
              {modifiable && <th />}
            </tr>
          </thead>
          <tbody>
            {lignes.map((t) => (
              <tr key={t.id}>
                {cat === 'main_oeuvre' && <td><span className="pd-tag">{t.ref_type === 'employe' ? 'Employé' : 'Métier'}</span></td>}
                <td>{nomRef(t)}</td>
                {cat === 'sous_traitant' && <td>{t.description}</td>}
                <td>{t.unite}</td>
                <td className="num">{argent(t.taux)}</td>
                {cat === 'main_oeuvre' && <td className="num">{t.taux_supp == null ? '—' : argent(t.taux_supp)}</td>}
                <td className="num pd-dim">{utilisations[t.id] || 0}</td>
                {modifiable && (
                  <td className="num">
                    <button className="pd-btn fantome petit" onClick={() => setEdition(t)} aria-label="Modifier"><Pencil size={13} /></button>{' '}
                    <button className="pd-btn fantome petit" aria-label="Supprimer" onClick={async () => {
                      if (!window.confirm(`Supprimer ce taux ? Les ${utilisations[t.id] || 0} lignes de rapport qui l’ont utilisé gardent leur taux.`)) return;
                      await actions.supprimer('taux', t.id);
                    }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {lignes.length === 0 && <div className="pd-section-vide">Aucun taux pour {annee} dans cette catégorie.{modifiable ? ' Utilise « Copier une année » pour partir de l’année précédente.' : ''}</div>}
      </>)}

      {edition && <FormTaux taux={edition.id ? edition : null} defauts={edition} onFermer={() => setEdition(null)} />}
      {copie && <CopieAnnee annees={annees} onFermer={() => setCopie(false)} onFait={(a) => { setCopie(false); setAnnee(a); }} />}
    </main>
  );
}

function FormTaux({ taux, defauts, onFermer }) {
  const { db, actions } = usePepday();
  const [f, setF] = useState(() => ({
    annee: taux?.annee || defauts.annee, categorie: taux?.categorie || defauts.categorie,
    ref_type: taux?.ref_type || ({ main_oeuvre: 'metier', sous_traitant: 'organisation' }[defauts.categorie] || defauts.categorie),
    ref_id: taux?.ref_id || '', description: taux?.description || '', unite: taux?.unite || '',
    taux: taux?.taux ?? null, taux_supp: taux?.taux_supp ?? null,
  }));
  const [erreur, setErreur] = useState('');
  const mo = f.categorie === 'main_oeuvre';

  const options = f.ref_type === 'metier' ? optionsDe(db.metiers)
    : f.ref_type === 'employe' ? optionsDe(db.employes)
      : f.ref_type === 'equipement' ? optionsDe(db.equipements, { libelle: (x) => `${x.code} — ${x.nom}` })
        : f.ref_type === 'materiau' ? optionsDe(db.materiaux, { detail: (x) => x.unite })
          : optionsDe(db.organisations.filter((o) => !['client', 'entite_pep'].includes(o.type)), { detail: (x) => typeOrganisation(x.type).libelle });

  async function enregistrer() {
    if (!f.ref_id) { setErreur('Choisis l’élément.'); return; }
    if (f.taux == null) { setErreur('Inscris le taux.'); return; }
    if (f.categorie === 'sous_traitant' && !f.description.trim()) { setErreur('Décris le travail (ex. : pose d’enrobé).'); return; }
    const doublon = db.taux.find((t) => t.id !== taux?.id && Number(t.annee) === Number(f.annee) && t.categorie === f.categorie
      && t.ref_type === f.ref_type && t.ref_id === f.ref_id && (t.description || '') === f.description.trim());
    if (doublon) { setErreur('Ce taux existe déjà pour cette année. Modifie-le plutôt.'); return; }
    let unite = f.unite;
    if (f.categorie === 'main_oeuvre' || f.categorie === 'equipement') unite = 'h';
    if (f.categorie === 'materiau') unite = db.materiaux.find((m) => m.id === f.ref_id)?.unite || unite;
    const row = {
      annee: Number(f.annee), categorie: f.categorie, ref_type: f.ref_type, ref_id: f.ref_id, description: f.description.trim(),
      unite, taux: Number(f.taux), taux_supp: mo ? (f.taux_supp == null ? Math.round(Number(f.taux) * 150) / 100 : Number(f.taux_supp)) : null, actif: true,
    };
    try {
      if (taux) await actions.modifier('taux', taux.id, row); else await actions.inserer('taux', row);
      actions.notifier('Taux enregistré. Les rapports déjà saisis ne changent pas.');
      onFermer();
    } catch (e) { setErreur(e.message || String(e)); }
  }

  return (
    <Modal titre={taux ? 'Modifier le taux preset' : 'Nouveau taux preset'} onFermer={onFermer}>
      <div className="pd-grille c2">
        <Champ label="Année"><ChampNombre valeur={f.annee} onChange={(n) => setF({ ...f, annee: n })} /></Champ>
        {mo && (
          <Champ label="S’applique à">
            <select className="pd-input" value={f.ref_type} onChange={(e) => setF({ ...f, ref_type: e.target.value, ref_id: '' })}>
              <option value="metier">Un métier</option>
              <option value="employe">Un employé en particulier</option>
            </select>
          </Champ>
        )}
      </div>
      <Champ label={f.ref_type === 'metier' ? 'Métier' : f.ref_type === 'employe' ? 'Employé' : f.ref_type === 'equipement' ? 'Équipement' : f.ref_type === 'materiau' ? 'Matériau' : 'Sous-traitant'}>
        <ChampListe options={options} valeur={f.ref_id} onChange={(v) => setF({ ...f, ref_id: v })} autoriserVide={false} placeholder="Choisir…" />
      </Champ>
      {f.categorie === 'sous_traitant' && (
        <div className="pd-grille c2">
          <Champ label="Travail"><input className="pd-input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Champ>
          <Champ label="Unité">
            <select className="pd-input" value={f.unite} onChange={(e) => setF({ ...f, unite: e.target.value })}>
              <option value="">—</option>
              {UNITES.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </Champ>
        </div>
      )}
      <div className="pd-grille c2">
        <Champ label={mo ? 'Taux régulier ($/h)' : f.categorie === 'equipement' ? 'Taux horaire ($/h)' : 'Prix unitaire ($)'}><ChampNombre valeur={f.taux} onChange={(n) => setF({ ...f, taux: n })} /></Champ>
        {mo && <Champ label="Taux supp. ($/h)" aide="Vide = 1,5 × le taux régulier"><ChampNombre valeur={f.taux_supp} onChange={(n) => setF({ ...f, taux_supp: n })} /></Champ>}
      </div>
      {taux && <Encadre type="avis">Les lignes de rapport déjà saisies avec ce preset gardent l’ancien taux.</Encadre>}
      {erreur && <Encadre type="err">{erreur}</Encadre>}
      <div className="pd-actions droite">
        <button className="pd-btn fantome" onClick={onFermer}>Annuler</button>
        <button className="pd-btn" onClick={enregistrer}>Enregistrer</button>
      </div>
    </Modal>
  );
}

function CopieAnnee({ annees, onFermer, onFait }) {
  const { db, actions } = usePepday();
  const [de, setDe] = useState(annees.find((a) => db.taux.some((t) => Number(t.annee) === a)) || annees[0]);
  const [vers, setVers] = useState((annees[0] || new Date().getFullYear()) + 1);
  const [pourcent, setPourcent] = useState(3);
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);
  const existants = db.taux.filter((t) => Number(t.annee) === Number(vers)).length;
  const aCopier = db.taux.filter((t) => Number(t.annee) === Number(de)).length;

  async function copier() {
    if (Number(de) === Number(vers)) { setErreur('Choisis deux années différentes.'); return; }
    if (existants > 0) { setErreur(`L’année ${vers} a déjà ${existants} taux. Supprime-les d’abord ou choisis une autre année.`); return; }
    setEnCours(true);
    try {
      await actions.insererPlusieurs('taux', copierPresets(db.taux, de, vers, pourcent));
      actions.notifier(`${aCopier} taux copiés de ${de} vers ${vers} (+${pourcent} %).`);
      onFait(Number(vers));
    } catch (e) { setErreur(e.message || String(e)); setEnCours(false); }
  }

  return (
    <Modal titre="Copier les taux d’une année" onFermer={onFermer}>
      <div className="pd-grille c3">
        <Champ label="De l’année">
          <select className="pd-input" value={de} onChange={(e) => setDe(Number(e.target.value))}>
            {annees.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </Champ>
        <Champ label="Vers l’année"><ChampNombre valeur={vers} onChange={setVers} /></Champ>
        <Champ label="Augmentation (%)"><ChampNombre min={-100} valeur={pourcent} onChange={(n) => setPourcent(n ?? 0)} /></Champ>
      </div>
      <p className="pd-dim">{aCopier} taux seront créés pour {vers}, arrondis au cent. Tu pourras ensuite les ajuster un par un.</p>
      {erreur && <Encadre type="err">{erreur}</Encadre>}
      <div className="pd-actions droite">
        <button className="pd-btn fantome" onClick={onFermer}>Annuler</button>
        <button className="pd-btn" onClick={copier} disabled={enCours || !aCopier}>Copier</button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// RV02 — Catalogue des primes (forfait, par heure, par jour). Le montant est
// figé dans la ligne du rapport au moment où la prime est ajoutée, comme un
// taux preset : le changer ici ne touche pas les rapports passés.
// ---------------------------------------------------------------------------
function Primes({ modifiable }) {
  const { db, actions } = usePepday();
  const [edition, setEdition] = useState(null);
  const utilisations = useMemo(() => {
    const m = {};
    for (const l of db.lignes) if (l.prime_id) m[l.prime_id] = (m[l.prime_id] || 0) + 1;
    return m;
  }, [db.lignes]);
  const libelleUnite = (u) => UNITES_PRIME.find((x) => x.code === u)?.libelle || u;
  return (
    <>
      <Encadre type="info">Les primes s’ajoutent sous un employé, dans le rapport. Elles comptent dans la main-d’œuvre et ressortent à part dans les exports.</Encadre>
      {modifiable && <div className="pd-actions droite" style={{ marginBottom: 10 }}><button className="pd-btn" onClick={() => setEdition({})}><Plus size={15} /> Ajouter une prime</button></div>}
      <div className="pd-table-wrap">
        <table className="pd-table">
          <thead><tr><th>Code</th><th>Prime</th><th>Unité</th><th className="num">Montant</th><th className="num">Utilisée</th><th>Active</th>{modifiable && <th />}</tr></thead>
          <tbody>
            {(db.primes || []).map((p) => (
              <tr key={p.id} style={{ opacity: p.actif === false ? 0.5 : 1 }}>
                <td>{p.code}</td><td>{p.nom}</td><td>{libelleUnite(p.unite)}</td><td className="num">{argent(p.montant)}</td>
                <td className="num pd-dim">{utilisations[p.id] || 0}</td><td>{p.actif === false ? 'Non' : 'Oui'}</td>
                {modifiable && <td className="num"><button className="pd-btn fantome petit" onClick={() => setEdition(p)} aria-label="Modifier"><Pencil size={13} /></button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edition && <FormPrime prime={edition.id ? edition : null} onFermer={() => setEdition(null)} onEnregistrer={async (row) => {
        if (edition.id) await actions.modifier('primes', edition.id, row); else await actions.inserer('primes', row);
        actions.notifier('Prime enregistrée. Les rapports déjà saisis ne changent pas.');
        setEdition(null);
      }}
      />}
    </>
  );
}

function FormPrime({ prime, onFermer, onEnregistrer }) {
  const [f, setF] = useState({ nom: prime?.nom || '', code: prime?.code || '', montant: prime?.montant ?? null, unite: prime?.unite || 'forfait', actif: prime?.actif !== false });
  const [erreur, setErreur] = useState('');
  async function enregistrer() {
    if (!f.nom.trim()) { setErreur('Le nom est obligatoire.'); return; }
    if (f.montant == null) { setErreur('Inscris le montant.'); return; }
    try { await onEnregistrer({ nom: f.nom.trim(), code: f.code.trim() || null, montant: Number(f.montant), unite: f.unite, actif: f.actif }); } catch (e) { setErreur(e.message || String(e)); }
  }
  return (
    <Modal titre={prime ? 'Modifier la prime' : 'Nouvelle prime'} onFermer={onFermer}>
      <div className="pd-grille c2">
        <Champ label="Nom"><input className="pd-input" value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} /></Champ>
        <Champ label="Code (paie)"><input className="pd-input" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></Champ>
        <Champ label="Montant ($)"><ChampNombre valeur={f.montant} onChange={(n) => setF({ ...f, montant: n })} /></Champ>
        <Champ label="Unité">
          <select className="pd-input" value={f.unite} onChange={(e) => setF({ ...f, unite: e.target.value })}>
            {UNITES_PRIME.map((u) => <option key={u.code} value={u.code}>{u.libelle}</option>)}
          </select>
        </Champ>
      </div>
      {prime && <label className="pd-case" style={{ marginBottom: 12 }}><input type="checkbox" checked={f.actif} onChange={(e) => setF({ ...f, actif: e.target.checked })} /> Prime active</label>}
      {erreur && <Encadre type="err">{erreur}</Encadre>}
      <div className="pd-actions droite">
        <button className="pd-btn fantome" onClick={onFermer}>Annuler</button>
        <button className="pd-btn" onClick={enregistrer}>Enregistrer</button>
      </div>
    </Modal>
  );
}

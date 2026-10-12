import { useMemo, useState } from 'react';
import { Plus, Trash2, Pencil, Users, Truck, Package, HardHat, PackagePlus, BadgeDollarSign } from 'lucide-react';
import ChampListe from '../commun/ChampListe';
import { usePepday, Champ, ChampNombre, Modal, Encadre, optionsDe } from './ui';
import { libelleCategorie, UNITES, typeOrganisation } from '../../lib/pepday/constantes';
import { montantLigne, argent, nombre, horodatage } from '../../lib/pepday/couts';
import { anneeDe, tauxPourNouvelleLigne, trouverPreset, patchTauxCustom, patchRetourPreset } from '../../lib/pepday/taux';

// ---------------------------------------------------------------------------
// PEPDAY — UNE SECTION DE LIGNES D'UN RAPPORT (main-d'œuvre, machinerie,
// matériaux ou sous-traitants)
//
// Le taux d'une nouvelle ligne est le preset de l'année du rapport, copié dans
// la ligne. Un taux custom le remplace seulement avec une raison, et garde le
// nom de la personne qui l'a mis et l'heure. Le preset d'origine reste écrit
// dans la ligne (taux_preset) pour qu'on voie toujours l'écart.
//
// RV02 :
//   - « Hors catalogue » : un employé ou un équipement inscrit à la volée
//     (nom libre + taux + heures), sans attendre qu'on crée sa fiche. Il
//     compte dans le cost et ressort dans le rapport global « Ressources
//     hors catalogue » pour que le bureau régularise.
//   - Primes : sous chaque employé, une ou plusieurs primes du catalogue;
//     elles comptent dans la main-d'œuvre et ressortent à part à l'export.
//   - Sous-tâche : quand le rapport a plusieurs activités, chaque ligne de
//     main-d'œuvre ou d'équipement dit sur laquelle elle a travaillé.
// ---------------------------------------------------------------------------

const ICONES = { main_oeuvre: Users, equipement: Truck, materiau: Package, sous_traitant: HardHat };

export function TagTaux({ ligne }) {
  if (ligne.taux_source === 'custom') return <span className="pd-tag custom" title={`${ligne.custom_raison} — ${ligne.custom_par_nom}, ${horodatage(ligne.custom_le)}`}>Taux custom</span>;
  if (ligne.taux_source === 'manuel') return <span className="pd-tag manuel" title="Aucun preset pour cet élément : prix saisi">Prix saisi</span>;
  return <span className="pd-tag" title={`Preset ${ligne.taux_annee}`}>Preset {ligne.taux_annee}</span>;
}

export default function SectionLignes({ rapport, categorie, lignes, droits, activites = [] }) {
  const { actions } = usePepday();
  const [ajout, setAjout] = useState(false);
  const [horsCatalogue, setHorsCatalogue] = useState(false);
  const [custom, setCustom] = useState(null);
  const [primePour, setPrimePour] = useState(null);
  const Icone = ICONES[categorie];
  const total = lignes.reduce((s, l) => s + montantLigne(l), 0);
  const base = lignes.filter((l) => !l.prime_id);
  const heures = base.reduce((s, l) => s + (Number(l.quantite) || 0) + (Number(l.quantite_supp) || 0), 0);
  const primesDe = (id) => lignes.filter((l) => l.parent_ligne_id === id);
  const avecRessources = categorie === 'main_oeuvre' || categorie === 'equipement';

  return (
    <div className="pd-carte">
      <div className="pd-carte-titre">
        <h3 className="pd-flex" style={{ gap: 6 }}><Icone size={17} /> {libelleCategorie(categorie)} <span className="pd-dim pd-petit">({lignes.length})</span></h3>
        {droits.lignesAjout && !ajout && !horsCatalogue && (
          <span className="pd-actions">
            {avecRessources && <button className="pd-btn fantome petit" onClick={() => setHorsCatalogue(true)} title="Une ressource qui n’a pas encore de fiche"><PackagePlus size={14} /> Hors catalogue</button>}
            <button className="pd-btn petit" onClick={() => setAjout(true)}><Plus size={14} /> Ajouter</button>
          </span>
        )}
      </div>

      {lignes.length === 0 && !ajout && !horsCatalogue && <div className="pd-section-vide" style={{ padding: 8 }}>Aucune ligne.</div>}
      {base.map((l) => (
        <LigneRapport
          key={l.id}
          ligne={l}
          droits={droits}
          activites={activites}
          primes={primesDe(l.id)}
          onCustom={() => setCustom(l)}
          onPrime={categorie === 'main_oeuvre' && l.ref_id && droits.lignesAjout ? () => setPrimePour(l) : null}
        />
      ))}
      {ajout && <AjoutLigne rapport={rapport} categorie={categorie} activites={activites} onFermer={() => setAjout(false)} />}
      {horsCatalogue && <AjoutHorsCatalogue rapport={rapport} categorie={categorie} activites={activites} onFermer={() => setHorsCatalogue(false)} />}
      {primePour && <AjoutPrime rapport={rapport} ligne={primePour} onFermer={() => setPrimePour(null)} />}

      {lignes.length > 0 && (
        <div className="pd-total-cat">
          <span>Total {libelleCategorie(categorie).toLowerCase()}{(categorie === 'main_oeuvre' || categorie === 'equipement') ? ` · ${nombre(heures)} h` : ''}</span>
          <span>{argent(total)}</span>
        </div>
      )}

      {custom && (
        <TauxCustom
          ligne={custom}
          onFermer={() => setCustom(null)}
          onEnregistrer={async (patch) => { await actions.modifier('lignes', custom.id, patch); setCustom(null); actions.notifier('Taux mis à jour.'); }}
        />
      )}
    </div>
  );
}

function LigneRapport({ ligne, droits, onCustom, activites = [], primes = [], onPrime }) {
  const { actions, index } = usePepday();
  const [brouillon, setBrouillon] = useState(null);
  const [erreur, setErreur] = useState('');
  const v = brouillon || ligne;
  const mo = ligne.categorie === 'main_oeuvre';
  const peutQte = droits.lignesQuantites;
  const prixModifiable = peutQte && ligne.taux_source === 'manuel';

  async function sauver(champ, valeur) {
    if (ligne[champ] === valeur) return;
    setErreur('');
    try {
      await actions.modifier('lignes', ligne.id, { [champ]: valeur });
      setBrouillon(null);
    } catch (e) {
      setErreur(e.message || String(e));
    }
  }
  const changer = (champ, valeur) => setBrouillon({ ...(brouillon || ligne), [champ]: valeur });

  const organisation = ligne.organisation_id ? index.organisations[ligne.organisation_id] : null;
  const sousTache = ligne.sous_tache_id ? index.sous_taches[ligne.sous_tache_id] : null;
  const choixSousTache = activites.length > 1 && (ligne.categorie === 'main_oeuvre' || ligne.categorie === 'equipement');

  return (
    <div className="pd-ligne">
      <div className="pd-ligne-haut">
        <div style={{ minWidth: 0 }}>
          <div className="pd-ligne-nom">
            {ligne.libelle}
            {ligne.ressource_provisoire_id && <span className="pd-tag manuel" style={{ marginLeft: 6 }}>Hors catalogue</span>}
          </div>
          <div className="pd-ligne-detail">
            {[ligne.detail, organisation?.nom, sousTache && !choixSousTache ? `${sousTache.code || ''} ${sousTache.nom}`.trim() : null].filter(Boolean).join(' · ')}
          </div>
        </div>
        <div className="pd-ligne-montant">{argent(montantLigne(v))}</div>
      </div>

      {peutQte ? (
        <div className="pd-ligne-champs">
          <Champ label={mo ? 'Heures rég.' : ligne.categorie === 'equipement' ? 'Heures' : `Quantité (${ligne.unite || '—'})`}>
            <ChampNombre valeur={v.quantite} onChange={(n) => changer('quantite', n ?? 0)} onBlur={() => sauver('quantite', v.quantite ?? 0)} />
          </Champ>
          {mo && (
            <Champ label="Heures supp.">
              <ChampNombre valeur={v.quantite_supp} onChange={(n) => changer('quantite_supp', n ?? 0)} onBlur={() => sauver('quantite_supp', v.quantite_supp ?? 0)} />
            </Champ>
          )}
          {prixModifiable ? (
            <Champ label={ligne.categorie === 'materiau' || ligne.categorie === 'sous_traitant' ? 'Prix unitaire' : 'Taux'}>
              <ChampNombre valeur={v.taux} onChange={(n) => changer('taux', n ?? 0)} onBlur={() => sauver('taux', v.taux ?? 0)} />
            </Champ>
          ) : (
            <Champ label={mo ? 'Taux rég. / supp.' : ligne.categorie === 'equipement' ? 'Taux horaire' : 'Prix unitaire'}>
              <div style={{ padding: '10px 0', fontVariantNumeric: 'tabular-nums' }}>
                {argent(ligne.taux)}{mo ? ` / ${argent(ligne.taux_supp)}` : ''}
              </div>
            </Champ>
          )}
        </div>
      ) : (
        <div className="pd-ligne-detail" style={{ marginTop: 6 }}>
          {mo
            ? `${nombre(ligne.quantite)} h rég. × ${argent(ligne.taux)}${Number(ligne.quantite_supp) ? ` + ${nombre(ligne.quantite_supp)} h supp. × ${argent(ligne.taux_supp)}` : ''}`
            : `${nombre(ligne.quantite)} ${ligne.unite || ''} × ${argent(ligne.taux)}`}
        </div>
      )}

      {choixSousTache && (
        <Champ label="Sous-tâche" style={{ marginTop: 8, marginBottom: 0 }}>
          <select className="pd-input" value={ligne.sous_tache_id || ''} disabled={!peutQte} onChange={(e) => sauver('sous_tache_id', e.target.value || null)}>
            <option value="">— non précisée —</option>
            {activites.map((a) => {
              const st = index.sous_taches[a.sous_tache_id];
              return <option key={a.id} value={a.sous_tache_id}>{st ? `${st.code || ''} ${st.nom}`.trim() : '?'}</option>;
            })}
          </select>
        </Champ>
      )}

      {primes.map((p) => (
        <div key={p.id} className="pd-flex" style={{ marginTop: 6, padding: '6px 8px', borderRadius: 6, background: 'var(--pd-surligne)', justifyContent: 'space-between', flexWrap: 'nowrap' }}>
          <span className="pd-petit"><BadgeDollarSign size={13} style={{ verticalAlign: -2 }} /> {index.primes[p.prime_id]?.nom || 'Prime'} · {nombre(p.quantite)} {p.unite} × {argent(p.taux)}</span>
          <span className="pd-flex" style={{ flexWrap: 'nowrap' }}>
            <strong className="pd-petit">{argent(montantLigne(p))}</strong>
            {droits.lignesSupprimer && (
              <button className="pd-btn fantome petit" aria-label="Retirer la prime" onClick={async () => { try { await actions.supprimer('lignes', p.id); } catch (e) { setErreur(e.message); } }}><Trash2 size={12} /></button>
            )}
          </span>
        </div>
      ))}

      <div className="pd-flex" style={{ marginTop: 8, justifyContent: 'space-between' }}>
        <span className="pd-flex" style={{ gap: 6 }}>
          <TagTaux ligne={ligne} />
          {ligne.taux_source === 'custom' && (
            <span className="pd-petit pd-dim">
              preset {argent(ligne.taux_preset)} · {ligne.custom_raison} — {ligne.custom_par_nom}, {horodatage(ligne.custom_le)}
            </span>
          )}
        </span>
        <span className="pd-flex" style={{ gap: 6 }}>
          {onPrime && <button className="pd-btn fantome petit" onClick={onPrime}><BadgeDollarSign size={13} /> Prime</button>}
          {droits.tauxCustom && (
            <button className="pd-btn fantome petit" onClick={onCustom}><Pencil size={13} /> Taux custom</button>
          )}
          {droits.lignesSupprimer && (
            <button
              className="pd-btn fantome petit"
              aria-label="Supprimer la ligne"
              onClick={async () => {
                if (!window.confirm(`Supprimer « ${ligne.libelle} » ?`)) return;
                try { await actions.supprimer('lignes', ligne.id); } catch (e) { setErreur(e.message); }
              }}
            >
              <Trash2 size={13} />
            </button>
          )}
        </span>
      </div>
      {erreur && <div style={{ marginTop: 8 }}><Encadre type="err">{erreur}</Encadre></div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ajout d'une ligne
// ---------------------------------------------------------------------------
function AjoutLigne({ rapport, categorie, onFermer, activites = [] }) {
  const { db, index, moi, actions } = usePepday();
  const annee = anneeDe(rapport.date);
  const [f, setF] = useState({ ref: '', libre: '', quantite: null, supp: null, unite: '', prix: null, prixSupp: null, item: '', organisation: '', detail: '', sousTache: '' });
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);

  const options = useMemo(() => {
    if (categorie === 'main_oeuvre') {
      return optionsDe(db.employes.filter((e) => e.actif !== false), { detail: (e) => index.metiers[e.metier_id]?.nom });
    }
    if (categorie === 'equipement') return optionsDe(db.equipements.filter((q) => q.actif !== false), { libelle: (q) => `${q.code} — ${q.nom}`, detail: (q) => (q.titulaire === 'location_externe' ? 'location externe' : q.type) });
    if (categorie === 'materiau') return optionsDe(db.materiaux.filter((m) => m.actif !== false), { libelle: (m) => (m.code ? `${m.code} — ${m.nom}` : m.nom), detail: (m) => m.unite });
    // Sous-traitants : tout le registre sauf les clients et les entités PEP,
    // les sous-traitants en tête.
    const rang = { sous_traitant: 0, signalisation: 1, transporteur: 2 };
    return optionsDe(
      db.organisations.filter((o) => o.actif !== false && !['client', 'entite_pep'].includes(o.type))
        .sort((a, b) => (rang[a.type] ?? 9) - (rang[b.type] ?? 9) || a.nom.localeCompare(b.nom, 'fr')),
      { detail: (o) => typeOrganisation(o.type).libelle },
    );
  }, [categorie, db, index]);

  // Fournisseurs du matériau choisi en tête (un matériau a plusieurs fournisseurs).
  const optionsOrganisations = useMemo(() => {
    const lies = new Set(db.materiau_organisations.filter((x) => x.materiau_id === f.ref).map((x) => x.organisation_id));
    return db.organisations.filter((o) => o.actif !== false && o.type !== 'client')
      .sort((a, b) => (lies.has(b.id) ? 1 : 0) - (lies.has(a.id) ? 1 : 0) || a.nom.localeCompare(b.nom, 'fr'))
      .map((o) => ({ valeur: o.id, libelle: o.nom, detail: lies.has(o.id) ? 'fournit ce matériau' : typeOrganisation(o.type).libelle }));
  }, [db.organisations, db.materiau_organisations, f.ref]);

  // Les prix preset d'un sous-traitant pour l'année du rapport.
  const itemsST = categorie === 'sous_traitant' && f.ref
    ? db.taux.filter((t) => t.categorie === 'sous_traitant' && t.ref_id === f.ref && Number(t.annee) === annee && t.actif !== false)
    : [];
  const itemST = itemsST.find((t) => t.id === f.item);

  const preset = f.ref
    ? trouverPreset({ categorie, refId: f.ref, annee, presets: db.taux, employes: db.employes, description: itemST?.description })
    : null;
  const sansPreset = categorie === 'sous_traitant'
    ? !itemST
    : (!f.ref || !preset);

  async function ajouter() {
    setErreur('');
    if (categorie !== 'materiau' && categorie !== 'sous_traitant' && !f.ref) { setErreur('Choisis un élément dans la liste.'); return; }
    if ((categorie === 'materiau') && !f.ref && !f.libre.trim()) { setErreur('Choisis un matériau ou écris sa description.'); return; }
    if (categorie === 'sous_traitant' && !f.ref) { setErreur('Choisis le sous-traitant.'); return; }
    if (categorie === 'sous_traitant' && !itemST && !f.libre.trim()) { setErreur('Choisis un prix preset ou décris le travail.'); return; }
    if (!f.quantite && !f.supp) { setErreur(categorie === 'main_oeuvre' || categorie === 'equipement' ? 'Inscris les heures.' : 'Inscris la quantité.'); return; }

    const taux = tauxPourNouvelleLigne({
      categorie, refId: f.ref || null, annee, presets: db.taux, employes: db.employes,
      description: itemST?.description, tauxManuel: f.prix, tauxManuelSupp: f.prixSupp,
    });
    // Un sous-traitant sans prix preset choisi : prix saisi.
    if (categorie === 'sous_traitant' && !itemST) {
      Object.assign(taux, { taux: Number(f.prix) || 0, taux_preset: null, taux_source: 'manuel', taux_preset_id: null });
    }

    let libelle = '';
    let detail = f.detail.trim();
    let unite = f.unite;
    if (categorie === 'main_oeuvre') {
      const e = index.employes[f.ref];
      libelle = e.nom;
      detail = [index.metiers[e.metier_id]?.nom, detail].filter(Boolean).join(' · ');
      unite = 'h';
    } else if (categorie === 'equipement') {
      const q = index.equipements[f.ref];
      libelle = `${q.code} — ${q.nom}`;
      unite = 'h';
    } else if (categorie === 'materiau') {
      const m = index.materiaux[f.ref];
      libelle = m ? m.nom : f.libre.trim();
      unite = m ? m.unite : (f.unite || 'chq');
    } else {
      const s = index.organisations[f.ref];
      libelle = `${s.nom} — ${itemST ? itemST.description : f.libre.trim()}`;
      unite = itemST ? itemST.unite : (f.unite || 'forf');
    }

    setEnCours(true);
    try {
      await actions.inserer('lignes', {
        rapport_id: rapport.id, categorie, ref_id: f.ref || null, libelle, detail,
        quantite: Number(f.quantite) || 0, quantite_supp: categorie === 'main_oeuvre' ? Number(f.supp) || 0 : null,
        unite: taux.unite || unite,
        taux: taux.taux, taux_supp: taux.taux_supp, taux_preset: taux.taux_preset, taux_supp_preset: taux.taux_supp_preset,
        taux_annee: taux.taux_annee, taux_source: taux.taux_source, taux_preset_id: taux.taux_preset_id,
        organisation_id: f.organisation || null, created_by: moi.membreId,
        sous_tache_id: (categorie === 'main_oeuvre' || categorie === 'equipement') ? (f.sousTache || (activites.length === 1 ? activites[0].sous_tache_id : null)) : null,
      });
      // On garde le formulaire ouvert, vidé : on ajoute souvent plusieurs
      // personnes d'affilée.
      setF({ ref: '', libre: '', quantite: f.quantite, supp: null, unite: '', prix: null, prixSupp: null, item: '', organisation: f.organisation, detail: '', sousTache: f.sousTache });
      setEnCours(false);
    } catch (e) {
      setErreur(e.message || String(e));
      setEnCours(false);
    }
  }

  const mo = categorie === 'main_oeuvre';
  const heures = mo || categorie === 'equipement';

  return (
    <div className="pd-ligne" style={{ borderStyle: 'dashed', borderColor: 'var(--pd-lien)' }}>
      <div className="pd-gras" style={{ marginBottom: 8 }}>Nouvelle ligne — {libelleCategorie(categorie).toLowerCase()}</div>
      <Champ label={mo ? 'Employé' : categorie === 'equipement' ? 'Équipement' : categorie === 'materiau' ? 'Matériau (catalogue)' : 'Sous-traitant'}>
        <ChampListe options={options} valeur={f.ref} onChange={(v) => setF({ ...f, ref: v, item: '' })} placeholder="Chercher…" />
      </Champ>
      {categorie === 'materiau' && !f.ref && (
        <div className="pd-grille c2">
          <Champ label="… ou description libre"><input className="pd-input" value={f.libre} onChange={(e) => setF({ ...f, libre: e.target.value })} /></Champ>
          <Champ label="Unité">
            <select className="pd-input" value={f.unite} onChange={(e) => setF({ ...f, unite: e.target.value })}>
              <option value="">—</option>
              {UNITES.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </Champ>
        </div>
      )}
      {categorie === 'sous_traitant' && f.ref && (
        <Champ label={`Prix preset ${annee}`}>
          <select className="pd-input" value={f.item} onChange={(e) => setF({ ...f, item: e.target.value })}>
            <option value="">Autre travail (prix saisi)</option>
            {itemsST.map((t) => <option key={t.id} value={t.id}>{t.description} — {argent(t.taux)} / {t.unite}</option>)}
          </select>
        </Champ>
      )}
      {categorie === 'sous_traitant' && f.ref && !itemST && (
        <div className="pd-grille c2">
          <Champ label="Description du travail"><input className="pd-input" value={f.libre} onChange={(e) => setF({ ...f, libre: e.target.value })} /></Champ>
          <Champ label="Unité">
            <select className="pd-input" value={f.unite} onChange={(e) => setF({ ...f, unite: e.target.value })}>
              <option value="">—</option>
              {UNITES.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </Champ>
        </div>
      )}

      <div className="pd-ligne-champs">
        <Champ label={mo ? 'Heures rég.' : heures ? 'Heures' : 'Quantité'}>
          <ChampNombre valeur={f.quantite} onChange={(n) => setF({ ...f, quantite: n })} />
        </Champ>
        {mo && <Champ label="Heures supp."><ChampNombre valeur={f.supp} onChange={(n) => setF({ ...f, supp: n })} /></Champ>}
        {sansPreset && (f.ref || f.libre) ? (
          <>
            <Champ label={heures ? 'Taux (aucun preset)' : 'Prix unitaire'}><ChampNombre valeur={f.prix} onChange={(n) => setF({ ...f, prix: n })} /></Champ>
            {mo && <Champ label="Taux supp."><ChampNombre valeur={f.prixSupp} onChange={(n) => setF({ ...f, prixSupp: n })} /></Champ>}
          </>
        ) : preset ? (
          <Champ label={`Preset ${annee}`}>
            <div style={{ padding: '10px 0' }}>{argent(preset.taux)}{mo ? ` / ${argent(preset.taux_supp ?? preset.taux * 1.5)}` : ''}{preset.unite && !heures ? ` / ${preset.unite}` : ''}</div>
          </Champ>
        ) : null}
      </div>

      {(categorie === 'materiau') && (
        <Champ label="Fournisseur">
          <ChampListe options={optionsOrganisations} valeur={f.organisation} onChange={(v) => setF({ ...f, organisation: v })} placeholder="Facultatif" />
        </Champ>
      )}
      {(mo || categorie === 'equipement') && activites.length > 1 && (
        <Champ label="Sous-tâche">
          <select className="pd-input" value={f.sousTache} onChange={(e) => setF({ ...f, sousTache: e.target.value })}>
            <option value="">— non précisée —</option>
            {activites.map((a) => { const st = index.sous_taches[a.sous_tache_id]; return <option key={a.id} value={a.sous_tache_id}>{st ? `${st.code || ''} ${st.nom}`.trim() : '?'}</option>; })}
          </select>
        </Champ>
      )}
      {(mo || categorie === 'equipement') && (
        <Champ label="Note (activité, chaînage…)"><input className="pd-input" value={f.detail} onChange={(e) => setF({ ...f, detail: e.target.value })} /></Champ>
      )}

      {f.ref && sansPreset && categorie !== 'materiau' && categorie !== 'sous_traitant' && (
        <Encadre type="avis">Aucun taux preset {annee} pour cet élément. Le taux saisi sera marqué « Prix saisi ». Ajoute le preset dans l’onglet Taux pour les prochains rapports.</Encadre>
      )}
      {erreur && <Encadre type="err">{erreur}</Encadre>}
      <div className="pd-actions droite">
        <button className="pd-btn fantome" onClick={onFermer}>Fermer</button>
        <button className="pd-btn" onClick={ajouter} disabled={enCours}><Plus size={15} /> Ajouter la ligne</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Taux custom : remplace le taux de la ligne, avec la raison et l'auteur.
// ---------------------------------------------------------------------------
function TauxCustom({ ligne, onFermer, onEnregistrer }) {
  const { moi } = usePepday();
  const mo = ligne.categorie === 'main_oeuvre';
  const [taux, setTaux] = useState(ligne.taux);
  const [tauxSupp, setTauxSupp] = useState(ligne.taux_supp);
  const [raison, setRaison] = useState(ligne.taux_source === 'custom' ? ligne.custom_raison || '' : '');
  const [erreur, setErreur] = useState('');

  async function enregistrer() {
    if (!raison.trim()) { setErreur('La raison est obligatoire pour un taux custom.'); return; }
    if (taux == null || taux < 0) { setErreur('Inscris un taux valide.'); return; }
    try {
      await onEnregistrer(patchTauxCustom({ ligne, taux, tauxSupp, raison, moi }));
    } catch (e) { setErreur(e.message || String(e)); }
  }

  return (
    <Modal titre="Taux custom" onFermer={onFermer}>
      <div style={{ marginBottom: 12 }}>
        <div className="pd-gras">{ligne.libelle}</div>
        <div className="pd-dim pd-petit">
          {ligne.taux_preset != null ? `Preset ${ligne.taux_annee} : ${argent(ligne.taux_preset)}${mo ? ` / ${argent(ligne.taux_supp_preset)} supp.` : ''}` : 'Aucun preset : prix saisi'}
        </div>
      </div>
      <div className="pd-grille c2">
        <Champ label={mo ? 'Nouveau taux régulier' : 'Nouveau taux'}><ChampNombre valeur={taux} onChange={setTaux} autoFocus /></Champ>
        {mo && <Champ label="Nouveau taux supp."><ChampNombre valeur={tauxSupp} onChange={setTauxSupp} /></Champ>}
      </div>
      <Champ label="Raison (obligatoire)" aide={`Enregistré au nom de ${moi.nom}, avec la date et l’heure.`}>
        <textarea className="pd-input" value={raison} onChange={(e) => setRaison(e.target.value)} placeholder="Ex. : taux négocié avec le client, équipement loué au mois…" />
      </Champ>
      {erreur && <Encadre type="err">{erreur}</Encadre>}
      <div className="pd-actions droite">
        {ligne.taux_source === 'custom' && (
          <button className="pd-btn fantome" onClick={() => onEnregistrer(patchRetourPreset(ligne)).catch((e) => setErreur(e.message))}>Revenir au preset</button>
        )}
        <button className="pd-btn fantome" onClick={onFermer}>Annuler</button>
        <button className="pd-btn" onClick={enregistrer}>Appliquer le taux custom</button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// RV02 — Ressource hors catalogue : nom libre + taux + heures (+ type pour un
// équipement). Elle est gardée dans ressources_provisoires, liée au rapport,
// pas au catalogue; le bureau la régularise ensuite (Répertoires).
// ---------------------------------------------------------------------------
function AjoutHorsCatalogue({ rapport, categorie, onFermer, activites = [] }) {
  const { actions, moi } = usePepday();
  const mo = categorie === 'main_oeuvre';
  const [f, setF] = useState({ nom: '', type: '', taux: null, tauxSupp: null, heures: null, supp: null });
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);

  async function ajouter() {
    if (!f.nom.trim()) { setErreur(mo ? 'Écris le nom de la personne.' : 'Écris le nom de l’équipement.'); return; }
    if (f.taux == null) { setErreur('Inscris le taux horaire.'); return; }
    if (!f.heures && !f.supp) { setErreur('Inscris les heures.'); return; }
    setEnCours(true);
    try {
      const rp = await actions.inserer('ressources_provisoires', {
        rapport_id: rapport.id, categorie, nom: f.nom.trim(), type: mo ? null : (f.type.trim() || null), created_by: moi.membreId,
      });
      await actions.inserer('lignes', {
        rapport_id: rapport.id, categorie, ref_id: null, libelle: f.nom.trim(), detail: mo ? 'Hors catalogue' : ['Hors catalogue', f.type.trim()].filter(Boolean).join(' · '),
        quantite: Number(f.heures) || 0, quantite_supp: mo ? Number(f.supp) || 0 : null, unite: 'h',
        taux: Number(f.taux) || 0, taux_supp: mo ? Number(f.tauxSupp ?? f.taux * 1.5) : null, taux_preset: null, taux_supp_preset: null,
        taux_annee: anneeDe(rapport.date), taux_source: 'manuel', taux_preset_id: null, ressource_provisoire_id: rp.id,
        sous_tache_id: activites.length === 1 ? activites[0].sous_tache_id : null, created_by: moi.membreId,
      });
      actions.notifier('Ressource hors catalogue ajoutée. Le bureau pourra créer sa fiche plus tard.');
      onFermer();
    } catch (e) {
      setErreur(e.message || String(e));
      setEnCours(false);
    }
  }

  return (
    <div className="pd-ligne" style={{ borderStyle: 'dashed', borderColor: '#8a93a8' }}>
      <div className="pd-gras" style={{ marginBottom: 4 }}>Hors catalogue — {mo ? 'main-d’œuvre' : 'équipement'}</div>
      <div className="pd-dim pd-petit" style={{ marginBottom: 8 }}>Pour une personne ou un équipement qui n’a pas encore de fiche (sous-traitant arrivé ce matin, location de dernière minute).</div>
      <div className="pd-grille c2">
        <Champ label={mo ? 'Nom' : 'Nom de l’équipement'}><input className="pd-input" value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} autoFocus /></Champ>
        {!mo && <Champ label="Type"><input className="pd-input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} placeholder="Ex. : Excavation, Transport" /></Champ>}
      </div>
      <div className="pd-ligne-champs">
        <Champ label={mo ? 'Heures rég.' : 'Heures'}><ChampNombre valeur={f.heures} onChange={(n) => setF({ ...f, heures: n })} /></Champ>
        {mo && <Champ label="Heures supp."><ChampNombre valeur={f.supp} onChange={(n) => setF({ ...f, supp: n })} /></Champ>}
        <Champ label="Taux horaire"><ChampNombre valeur={f.taux} onChange={(n) => setF({ ...f, taux: n })} /></Champ>
        {mo && <Champ label="Taux supp."><ChampNombre valeur={f.tauxSupp} onChange={(n) => setF({ ...f, tauxSupp: n })} placeholder="1,5 × rég." /></Champ>}
      </div>
      {erreur && <Encadre type="err">{erreur}</Encadre>}
      <div className="pd-actions droite">
        <button className="pd-btn fantome" onClick={onFermer}>Fermer</button>
        <button className="pd-btn" onClick={ajouter} disabled={enCours}><PackagePlus size={15} /> Ajouter</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RV02 — Prime sur la ligne d'un employé. Le montant du catalogue est figé
// dans la ligne, comme un taux preset.
// ---------------------------------------------------------------------------
function AjoutPrime({ rapport, ligne, onFermer }) {
  const { db, actions, moi } = usePepday();
  const actives = db.primes.filter((p) => p.actif !== false);
  const [primeId, setPrimeId] = useState(actives[0]?.id || '');
  const prime = actives.find((p) => p.id === primeId);
  const heures = (Number(ligne.quantite) || 0) + (Number(ligne.quantite_supp) || 0);
  const [quantite, setQuantite] = useState(null);
  const qte = quantite ?? (prime?.unite === 'heure' ? heures : 1);
  const [erreur, setErreur] = useState('');

  async function ajouter() {
    if (!prime) { setErreur('Aucune prime au catalogue (onglet Taux > Primes).'); return; }
    try {
      await actions.inserer('lignes', {
        rapport_id: rapport.id, categorie: 'main_oeuvre', ref_id: ligne.ref_id, libelle: `${prime.nom} — ${ligne.libelle}`, detail: '',
        quantite: Number(qte) || 0, quantite_supp: 0, unite: prime.unite === 'heure' ? 'h' : prime.unite === 'jour' ? 'jour' : 'forf',
        taux: Number(prime.montant), taux_supp: 0, taux_preset: Number(prime.montant), taux_supp_preset: 0,
        taux_annee: anneeDe(rapport.date), taux_source: 'preset', taux_preset_id: null,
        prime_id: prime.id, parent_ligne_id: ligne.id, created_by: moi.membreId,
      });
      onFermer();
    } catch (e) { setErreur(e.message || String(e)); }
  }

  return (
    <Modal titre={`Prime — ${ligne.libelle}`} onFermer={onFermer}>
      <Champ label="Prime">
        <select className="pd-input" value={primeId} onChange={(e) => { setPrimeId(e.target.value); setQuantite(null); }}>
          {actives.map((p) => <option key={p.id} value={p.id}>{p.nom} — {argent(p.montant)} {p.unite === 'heure' ? '/ h' : p.unite === 'jour' ? '/ jour' : '(forfait)'}</option>)}
        </select>
      </Champ>
      <Champ label={prime?.unite === 'heure' ? 'Heures' : prime?.unite === 'jour' ? 'Jours' : 'Quantité'}>
        <ChampNombre valeur={qte} onChange={setQuantite} />
      </Champ>
      <div className="pd-gras" style={{ marginBottom: 12 }}>Montant : {argent((Number(qte) || 0) * (Number(prime?.montant) || 0))}</div>
      {erreur && <Encadre type="err">{erreur}</Encadre>}
      <div className="pd-actions droite">
        <button className="pd-btn fantome" onClick={onFermer}>Annuler</button>
        <button className="pd-btn" onClick={ajouter}>Ajouter la prime</button>
      </div>
    </Modal>
  );
}

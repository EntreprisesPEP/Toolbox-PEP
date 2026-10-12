import { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Search, Download, Link2 } from 'lucide-react';
import ChampListe from '../commun/ChampListe';
import { usePepday, Champ, ChampNombre, Modal, Encadre, optionsDe } from './ui';
import CarteLeaflet from './CarteLeaflet';
import {
  ROLES, libelleRole, UNITES, TYPES_ORGANISATION, typeOrganisation, DEPARTEMENTS, TYPES_MATERIAU, TITULAIRES_EQUIPEMENT,
} from '../../lib/pepday/constantes';
import { peutGererRepertoires, peutGererMembres } from '../../lib/pepday/workflow';
import { geocoder, aPosition } from '../../lib/pepday/geo';
import { dateCourte, horodatage } from '../../lib/pepday/couts';
import { exporterExcel } from '../../lib/pepday/exportExcel';

// ---------------------------------------------------------------------------
// PEPDAY — RÉPERTOIRES (RV02)
//
// L'équipe PEPday (qui a quel rôle), les équipes de chantier, les employés,
// les équipements, le catalogue de matériaux, le registre unique des
// organisations, les quarts, les métiers, la structure des tâches et les
// ressources hors catalogue à régulariser.
//
// Un seul tableau et un seul formulaire génériques, décrits par la liste de
// champs de chaque répertoire. Tout champ a un nom lisible (chez Civalgo, un
// champ nommé « 125 » dont personne ne connaît le sens).
//
// On ne supprime pas une fiche déjà utilisée : on la désactive. Elle disparaît
// des listes de saisie, mais les rapports passés gardent leur nom.
// ---------------------------------------------------------------------------

// Types de champ : texte (défaut), email, tel, nombre, oui_non, liste
// (options fixes), ref (une autre table), adresse, long (texte long), roles,
// organisations (plusieurs, pour les matériaux).
const REF_CIVALGO = { cle: 'ref_civalgo', libelle: 'Référence Civalgo (pour un import futur)' };

const REPERTOIRES = [
  {
    table: 'membres', libelle: 'Équipe PEPday', droit: peutGererMembres,
    aide: 'Les personnes qui se connectent à PEPday et leurs rôles. Le compte Toolbox est rattaché automatiquement par le courriel à la première ouverture.',
    champs: [
      { cle: 'nom', libelle: 'Nom', requis: true },
      { cle: 'titre', libelle: 'Titre du poste' },
      { cle: 'courriel', libelle: 'Courriel (celui du compte Toolbox)', type: 'email', requis: true },
      { cle: 'roles', libelle: 'Rôles', type: 'roles' },
    ],
    colonnes: [['nom', 'Nom'], ['titre', 'Titre'], ['courriel', 'Courriel'], ['roles', 'Rôles'], ['user_id', 'Compte lié']],
  },
  {
    table: 'equipes', libelle: 'Équipes',
    aide: 'Une équipe = un contremaître, son quart et son monde. Les employés et les équipements y sont rattachés dans leur fiche; « Charger l’équipe » les inscrit d’un coup dans un rapport.',
    champs: [
      { cle: 'nom', libelle: 'Nom de l’équipe', requis: true },
      { cle: 'contremaitre_id', libelle: 'Contremaître', type: 'ref', table: 'membres', filtre: (m) => (m.roles || []).includes('contremaitre'), requis: true },
      { cle: 'departement', libelle: 'Département', type: 'liste', options: DEPARTEMENTS, requis: true },
      { cle: 'quart_id', libelle: 'Quart', type: 'ref', table: 'quarts' },
    ],
    colonnes: [['nom', 'Équipe'], ['contremaitre_id', 'Contremaître'], ['departement', 'Département'], ['quart_id', 'Quart'], ['_membres', 'Employés'], ['_equipements', 'Équipements']],
  },
  {
    table: 'employes', libelle: 'Employés',
    aide: 'La main-d’œuvre inscrite dans les rapports. Le taux vient du métier, sauf si l’employé a son propre taux preset.',
    champs: [
      { cle: 'code', libelle: 'Code' },
      { cle: 'nom', libelle: 'Nom', requis: true },
      { cle: 'metier_id', libelle: 'Métier', type: 'ref', table: 'metiers', requis: true },
      { cle: 'equipe_id', libelle: 'Équipe', type: 'ref', table: 'equipes' },
      { cle: 'departement', libelle: 'Département', type: 'liste', options: DEPARTEMENTS },
      { cle: 'quart_id', libelle: 'Quart', type: 'ref', table: 'quarts' },
      { cle: 'type', libelle: 'Type (horaire, salarié…)' },
      { cle: 'opere', libelle: 'Opère (équipements qu’il conduit)' },
      { cle: 'organisation_id', libelle: 'Organisation (employeur)', type: 'ref', table: 'organisations', filtre: (o) => o.type === 'entite_pep' },
      { cle: 'courriel', libelle: 'Courriel', type: 'email' },
      { cle: 'telephone', libelle: 'Téléphone', type: 'tel' },
      { cle: 'attestation', libelle: 'Attestation (ASP, signaleur…)' },
      { cle: 'ccq', libelle: 'Assujetti CCQ', type: 'oui_non' },
      { cle: 'manoeuvre_paysager', libelle: 'Manœuvre paysager', type: 'oui_non' },
      REF_CIVALGO,
    ],
    colonnes: [['code', 'Code'], ['nom', 'Nom'], ['metier_id', 'Métier'], ['equipe_id', 'Équipe'], ['quart_id', 'Quart'], ['ccq', 'CCQ'], ['attestation', 'Attestation']],
  },
  {
    table: 'equipements', libelle: 'Équipements',
    aide: 'Le titulaire compte : une location externe se coste autrement qu’un équipement de PEP (taux preset propre à l’unité).',
    champs: [
      { cle: 'code', libelle: 'Code / numéro d’unité', requis: true },
      { cle: 'nom', libelle: 'Description', requis: true },
      { cle: 'type', libelle: 'Type (excavation, transport…)' },
      { cle: 'titulaire', libelle: 'Titulaire', type: 'liste', options: TITULAIRES_EQUIPEMENT.map((t) => ({ valeur: t.code, libelle: t.libelle })), requis: true },
      { cle: 'marque', libelle: 'Marque' },
      { cle: 'modele', libelle: 'Modèle' },
      { cle: 'plaque', libelle: 'Plaque d’immatriculation' },
      { cle: 'niv', libelle: 'NIV (numéro de série)' },
      { cle: 'organisation_id', libelle: 'Organisation (propriétaire ou loueur)', type: 'ref', table: 'organisations' },
      { cle: 'equipe_id', libelle: 'Équipe', type: 'ref', table: 'equipes' },
      { cle: 'operateur_id', libelle: 'Opérateur habituel', type: 'ref', table: 'employes' },
      REF_CIVALGO,
    ],
    colonnes: [['code', 'Code'], ['nom', 'Description'], ['type', 'Type'], ['titulaire', 'Titulaire'], ['equipe_id', 'Équipe'], ['operateur_id', 'Opérateur'], ['plaque', 'Plaque']],
  },
  {
    table: 'materiaux', libelle: 'Matériaux',
    aide: 'Un matériau peut venir de plusieurs fournisseurs (l’enrobé ESG-10 est lié à 24 carrières chez PEP).',
    champs: [
      { cle: 'code', libelle: 'Code' },
      { cle: 'nom', libelle: 'Description', requis: true },
      { cle: 'type', libelle: 'Type', type: 'liste', options: TYPES_MATERIAU },
      { cle: 'unite', libelle: 'Unité', type: 'liste', options: UNITES, requis: true },
      { cle: '_organisations', libelle: 'Fournisseurs / carrières', type: 'organisations' },
      REF_CIVALGO,
    ],
    colonnes: [['code', 'Code'], ['nom', 'Matériau'], ['type', 'Type'], ['unite', 'Unité'], ['_organisations', 'Fournisseurs']],
  },
  {
    table: 'organisations', libelle: 'Organisations', geo: true,
    aide: 'Un seul registre pour les clients, fournisseurs, carrières, transporteurs, sous-traitants, la signalisation et les entités PEP. Le type est obligatoire, et deux organisations ne peuvent pas porter le même nom.',
    champs: [
      { cle: 'nom', libelle: 'Nom', requis: true },
      { cle: 'type', libelle: 'Type', type: 'liste', options: TYPES_ORGANISATION.map((t) => ({ valeur: t.code, libelle: t.libelle })), requis: true },
      { cle: 'contact_nom', libelle: 'Contact principal' },
      { cle: 'telephone', libelle: 'Téléphone', type: 'tel' },
      { cle: 'courriel', libelle: 'Courriel', type: 'email' },
      { cle: 'adresse', libelle: 'Emplacement (adresse)', type: 'adresse' },
      { cle: 'notes', libelle: 'Note', type: 'long' },
      REF_CIVALGO,
    ],
    colonnes: [['nom', 'Nom'], ['type', 'Type'], ['contact_nom', 'Contact'], ['telephone', 'Téléphone'], ['adresse', 'Emplacement'], ['lat', 'GPS']],
  },
  {
    table: 'quarts', libelle: 'Quarts',
    aide: 'Le quart est porté par l’équipe, l’employé et le rapport. Le seuil de temps supplémentaire par quart reste à confirmer : PEPday n’en calcule pas encore.',
    champs: [
      { cle: 'nom', libelle: 'Nom', requis: true },
      { cle: 'heures_normales', libelle: 'Heures normales par jour', type: 'nombre' },
      { cle: 'code_paie', libelle: 'Code de paie' },
    ],
    colonnes: [['nom', 'Quart'], ['heures_normales', 'Heures normales'], ['code_paie', 'Code de paie']],
  },
  {
    table: 'metiers', libelle: 'Métiers',
    aide: 'Les taux preset de main-d’œuvre se donnent par métier (ou par employé).',
    champs: [{ cle: 'nom', libelle: 'Métier', requis: true }],
    colonnes: [['nom', 'Métier'], ['_employes', 'Employés']],
  },
];

const ONGLETS_SPECIAUX = [
  { table: '_taches', libelle: 'Structure des tâches' },
  { table: '_hors_catalogue', libelle: 'Hors catalogue' },
];

// Nom normalisé pour l'unicité (« PEP Pavage » = « ENTREPRISE PEP PAVAGE » ?
// non, mais « pep pavage » = « PEP  Pavage »).
export function nomNormalise(nom) {
  return String(nom || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Une fiche est-elle déjà utilisée quelque part ?
function estUtilisee(db, table, id) {
  if (table === 'membres') {
    return db.rapports.some((r) => r.contremaitre_id === id || r.created_by === id)
      || db.projets.some((p) => [p.charge_projet_id, p.coordonnateur_id, p.surintendant_id].includes(id) || (p.contremaitre_ids || []).includes(id))
      || (db.equipes || []).some((e) => e.contremaitre_id === id);
  }
  if (table === 'metiers') return db.employes.some((e) => e.metier_id === id) || db.taux.some((t) => t.ref_id === id);
  if (table === 'quarts') return db.rapports.some((r) => r.quart_id === id) || (db.equipes || []).some((e) => e.quart_id === id) || db.employes.some((e) => e.quart_id === id);
  if (table === 'equipes') return db.rapports.some((r) => r.equipe_id === id) || db.employes.some((e) => e.equipe_id === id);
  if (table === 'organisations') {
    return db.lignes.some((l) => l.organisation_id === id || (l.categorie === 'sous_traitant' && l.ref_id === id)) || db.taux.some((t) => t.ref_id === id)
      || db.trajets.some((t) => (t.points || []).some((p) => p.ref_id === id)) || (db.materiau_organisations || []).some((x) => x.organisation_id === id);
  }
  return db.lignes.some((l) => l.ref_id === id) || db.taux.some((t) => t.ref_id === id);
}

export default function VueRepertoires() {
  const { db, index, moi, nav, actions } = usePepday();
  const tous = [...REPERTOIRES, ...ONGLETS_SPECIAUX];
  const [table, setTable] = useState(tous.some((r) => r.table === nav.onglet) ? nav.onglet : 'membres');
  const [edition, setEdition] = useState(null);
  const [q, setQ] = useState('');
  const [inactifs, setInactifs] = useState(false);
  const rep = REPERTOIRES.find((r) => r.table === table);
  const modifiable = rep ? (rep.droit || peutGererRepertoires)(moi) : peutGererRepertoires(moi);

  const valeur = (x, cle) => {
    if (cle === 'roles') return (x.roles || []).map(libelleRole).join(', ');
    if (cle === 'user_id') return x.user_id ? 'Oui' : 'Pas encore';
    if (cle === 'lat') return aPosition(x) ? '✓' : '—';
    if (cle === 'type' && table === 'organisations') return typeOrganisation(x.type).libelle;
    if (cle === 'titulaire') return TITULAIRES_EQUIPEMENT.find((t) => t.code === x.titulaire)?.libelle || '';
    if (cle === 'ccq' || cle === 'manoeuvre_paysager') return x[cle] ? 'Oui' : 'Non';
    if (cle === 'metier_id') return index.metiers[x.metier_id]?.nom || '';
    if (cle === 'equipe_id') return index.equipes[x.equipe_id]?.nom || '';
    if (cle === 'quart_id') return index.quarts[x.quart_id]?.nom || '';
    if (cle === 'contremaitre_id') return index.membres[x.contremaitre_id]?.nom || '';
    if (cle === 'operateur_id') return index.employes[x.operateur_id]?.nom || '';
    if (cle === '_membres') return db.employes.filter((e) => e.equipe_id === x.id && e.actif !== false).length;
    if (cle === '_equipements') return db.equipements.filter((e) => e.equipe_id === x.id && e.actif !== false).length;
    if (cle === '_employes') return db.employes.filter((e) => e.metier_id === x.id).length;
    if (cle === '_organisations') return (db.materiau_organisations || []).filter((m) => m.materiau_id === x.id).map((m) => index.organisations[m.organisation_id]?.nom).filter(Boolean).join(', ');
    return x[cle] ?? '';
  };

  const lignes = useMemo(() => (rep ? (db[table] || []) : [])
    .filter((x) => inactifs || x.actif !== false)
    .filter((x) => !q || rep.colonnes.some(([c]) => String(valeur(x, c)).toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => String(a.nom || a.code || '').localeCompare(String(b.nom || b.code || ''), 'fr')),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [db, table, q, inactifs]);

  function exporter() {
    if (!rep) return;
    exporterExcel(`PEPday - ${rep.libelle}`, [{
      nom: rep.libelle,
      titre: rep.libelle,
      colonnes: [...rep.colonnes.map(([c, l]) => ({ entete: l, cle: c, largeur: 24 })), { entete: 'Actif', cle: 'actif_txt', largeur: 8 }],
      lignes: lignes.map((x) => ({ ...Object.fromEntries(rep.colonnes.map(([c]) => [c, valeur(x, c)])), actif_txt: x.actif === false ? 'Non' : 'Oui' })),
    }]);
  }

  return (
    <main className="pd-main pd-l1300">
      <div className="pd-carte">
        <div className="pd-carte-titre">
          <h2>Répertoires</h2>
          {rep && (
            <div className="pd-actions">
              <button className="pd-btn fantome" onClick={exporter}><Download size={15} /> Excel</button>
              {modifiable && <button className="pd-btn" onClick={() => setEdition({})}><Plus size={15} /> Ajouter</button>}
            </div>
          )}
        </div>
        <div className="pd-onglets" style={{ marginBottom: 10 }}>
          {tous.map((r) => {
            const n = r.table === '_taches' ? (db.sous_taches || []).length
              : r.table === '_hors_catalogue' ? (db.ressources_provisoires || []).filter((x) => !x.regularise_ref_id).length
                : (db[r.table] || []).filter((x) => x.actif !== false).length;
            return (
              <button key={r.table} className={`pd-onglet ${table === r.table ? 'actif' : ''}`} onClick={() => { setTable(r.table); setQ(''); }}>
                {r.libelle} <span style={{ opacity: 0.7 }}>({n})</span>
              </button>
            );
          })}
        </div>
        {rep?.aide && <Encadre type="info">{rep.aide}</Encadre>}
        {rep && (
          <div className="pd-flex">
            <input className="pd-input" style={{ maxWidth: 360 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher…" />
            <label className="pd-case"><input type="checkbox" checked={inactifs} onChange={(e) => setInactifs(e.target.checked)} /> Voir les fiches désactivées</label>
            {!modifiable && <span className="pd-dim pd-petit">Lecture seule</span>}
          </div>
        )}
      </div>

      {table === '_taches' && <StructureTaches />}
      {table === '_hors_catalogue' && <HorsCatalogue modifiable={modifiable} />}

      {rep && (
        <>
          <div className="pd-table-wrap">
            <table className="pd-table">
              <thead><tr>{rep.colonnes.map(([c, l]) => <th key={c}>{l}</th>)}{modifiable && <th />}</tr></thead>
              <tbody>
                {lignes.map((x) => (
                  <tr key={x.id} style={{ opacity: x.actif === false ? 0.5 : 1 }}>
                    {rep.colonnes.map(([c]) => <td key={c}>{String(valeur(x, c))}</td>)}
                    {modifiable && (
                      <td className="num" style={{ whiteSpace: 'nowrap' }}>
                        <button className="pd-btn fantome petit" onClick={() => setEdition(x)} aria-label="Modifier"><Pencil size={13} /></button>{' '}
                        {!estUtilisee(db, table, x.id) && (
                          <button className="pd-btn fantome petit" aria-label="Supprimer" onClick={async () => {
                            if (!window.confirm(`Supprimer « ${x.nom || x.code} » ?`)) return;
                            try { await actions.supprimer(table, x.id); } catch (e) { actions.notifier(e.message, 'err'); }
                          }}
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {lignes.length === 0 && <div className="pd-section-vide">Aucune fiche.</div>}
        </>
      )}

      {edition && rep && <FormFiche rep={rep} fiche={edition.id ? edition : null} onFermer={() => setEdition(null)} />}
    </main>
  );
}

function FormFiche({ rep, fiche, onFermer }) {
  const { db, index, actions } = usePepday();
  const [f, setF] = useState(() => {
    const base = Object.fromEntries(rep.champs.map((c) => [c.cle, c.type === 'roles' ? [] : c.type === 'oui_non' ? false : '']));
    const orgs = rep.table === 'materiaux' && fiche ? (db.materiau_organisations || []).filter((m) => m.materiau_id === fiche.id).map((m) => m.organisation_id) : [];
    const defauts = rep.table === 'equipements' && !fiche ? { titulaire: 'proprietaire' } : {};
    return { ...base, actif: true, lat: null, lng: null, ...defauts, ...(fiche || {}), _organisations: orgs };
  });
  const [erreur, setErreur] = useState('');
  const [recherche, setRecherche] = useState(false);
  const utilisee = fiche && estUtilisee(db, rep.table, fiche.id);

  async function localiser() {
    setRecherche(true);
    setErreur('');
    try {
      const r = await geocoder(f.adresse);
      if (r.length) setF((x) => ({ ...x, lat: r[0].lat, lng: r[0].lng }));
      else setErreur('Adresse introuvable : clique sur la carte pour placer l’épingle.');
    } catch (e) { setErreur(e.message); }
    setRecherche(false);
  }

  async function enregistrer() {
    for (const c of rep.champs) {
      if (!c.requis) continue;
      const v = f[c.cle];
      if (v == null || String(v).trim() === '') { setErreur(`« ${c.libelle} » est obligatoire.`); return; }
    }
    if (rep.table === 'membres') {
      const doublon = db.membres.find((m) => m.id !== fiche?.id && (m.courriel || '').toLowerCase() === f.courriel.trim().toLowerCase());
      if (doublon) { setErreur(`Ce courriel est déjà celui de ${doublon.nom}.`); return; }
    }
    if (rep.table === 'organisations') {
      const doublon = db.organisations.find((o) => o.id !== fiche?.id && nomNormalise(o.nom) === nomNormalise(f.nom));
      if (doublon) { setErreur(`« ${doublon.nom} » existe déjà (${typeOrganisation(doublon.type).libelle}). Une organisation = une fiche.`); return; }
    }
    if (rep.table === 'equipements' || rep.table === 'employes') {
      const doublon = f.code && db[rep.table].find((x) => x.id !== fiche?.id && (x.code || '').trim().toLowerCase() === String(f.code).trim().toLowerCase());
      if (doublon) { setErreur(`Le code ${f.code} est déjà utilisé par « ${doublon.nom} ».`); return; }
    }
    const row = {};
    rep.champs.forEach((c) => {
      if (c.cle.startsWith('_')) return;
      let v = f[c.cle];
      if (typeof v === 'string') v = v.trim();
      if ((c.type === 'ref' || c.type === 'liste' || c.cle === 'ref_civalgo') && v === '') v = null;
      if (c.type === 'nombre') v = v === '' || v == null ? null : Number(v);
      row[c.cle] = v;
    });
    if (rep.table === 'membres') row.courriel = row.courriel.toLowerCase();
    if (rep.table === 'equipements') row.categorie = row.type || '';
    if (rep.table === 'materiaux') row.categorie = row.type || '';
    row.actif = f.actif !== false;
    if (rep.geo) { row.lat = aPosition(f) ? Number(f.lat) : null; row.lng = aPosition(f) ? Number(f.lng) : null; }
    try {
      const enreg = fiche ? await actions.modifier(rep.table, fiche.id, row) : await actions.inserer(rep.table, row);
      // Matériau : les liens vers ses fournisseurs (plusieurs-à-plusieurs).
      if (rep.table === 'materiaux') {
        const avant = (db.materiau_organisations || []).filter((m) => m.materiau_id === enreg.id);
        for (const m of avant) if (!f._organisations.includes(m.organisation_id)) await actions.supprimer('materiau_organisations', m.id);
        for (const o of f._organisations) if (!avant.some((m) => m.organisation_id === o)) await actions.inserer('materiau_organisations', { materiau_id: enreg.id, organisation_id: o });
      }
      actions.notifier('Fiche enregistrée.');
      onFermer();
    } catch (e) { setErreur(e.message || String(e)); }
  }

  const optionsRef = (c) => optionsDe((db[c.table] || []).filter((x) => x.actif !== false && (!c.filtre || c.filtre(x))), {
    libelle: (x) => (c.table === 'equipes' || c.table === 'quarts' || c.table === 'metiers' ? x.nom : x.code ? `${x.code} — ${x.nom}` : x.nom),
    detail: c.table === 'organisations' ? (x) => typeOrganisation(x.type).libelle : undefined,
  });

  return (
    <Modal titre={`${fiche ? 'Modifier' : 'Ajouter'} — ${rep.libelle}`} onFermer={onFermer} large={rep.geo || rep.champs.length > 6}>
      <div className="pd-grille c2">
        {rep.champs.map((c) => {
          const pleine = ['roles', 'long', 'adresse', 'organisations'].includes(c.type);
          const style = pleine ? { gridColumn: '1 / -1' } : undefined;
          if (c.type === 'roles') {
            return (
              <Champ key={c.cle} label={c.libelle} style={style}>
                <div className="pd-flex" style={{ gap: '4px 16px' }}>
                  {ROLES.map((r) => (
                    <label key={r.code} className="pd-case">
                      <input type="checkbox" checked={(f.roles || []).includes(r.code)} onChange={() => setF({ ...f, roles: (f.roles || []).includes(r.code) ? f.roles.filter((x) => x !== r.code) : [...(f.roles || []), r.code] })} />
                      {r.libelle}
                    </label>
                  ))}
                </div>
              </Champ>
            );
          }
          if (c.type === 'organisations') {
            return (
              <Champ key={c.cle} label={c.libelle} style={style}>
                <div className="pd-flex" style={{ gap: '4px 16px' }}>
                  {db.organisations.filter((o) => o.actif !== false && ['fournisseur', 'carriere'].includes(o.type)).map((o) => (
                    <label key={o.id} className="pd-case">
                      <input type="checkbox" checked={f._organisations.includes(o.id)} onChange={() => setF({ ...f, _organisations: f._organisations.includes(o.id) ? f._organisations.filter((x) => x !== o.id) : [...f._organisations, o.id] })} />
                      {o.nom}
                    </label>
                  ))}
                </div>
              </Champ>
            );
          }
          if (c.type === 'ref') {
            return (
              <Champ key={c.cle} label={c.libelle}>
                <ChampListe options={optionsRef(c)} valeur={f[c.cle] || ''} onChange={(v) => setF({ ...f, [c.cle]: v })} placeholder="Choisir…" />
              </Champ>
            );
          }
          if (c.type === 'liste') {
            const opts = c.options.map((o) => (typeof o === 'string' ? { valeur: o, libelle: o } : o));
            return (
              <Champ key={c.cle} label={c.libelle}>
                <select className="pd-input" value={f[c.cle] || ''} onChange={(e) => setF({ ...f, [c.cle]: e.target.value })}>
                  <option value="">—</option>
                  {opts.map((o) => <option key={o.valeur} value={o.valeur}>{o.libelle}</option>)}
                </select>
              </Champ>
            );
          }
          if (c.type === 'oui_non') {
            return <Champ key={c.cle} label={c.libelle}><label className="pd-case" style={{ minHeight: 44 }}><input type="checkbox" checked={Boolean(f[c.cle])} onChange={(e) => setF({ ...f, [c.cle]: e.target.checked })} /> Oui</label></Champ>;
          }
          if (c.type === 'nombre') {
            return <Champ key={c.cle} label={c.libelle}><ChampNombre valeur={f[c.cle] === '' ? null : f[c.cle]} onChange={(n) => setF({ ...f, [c.cle]: n })} /></Champ>;
          }
          if (c.type === 'long') {
            return <Champ key={c.cle} label={c.libelle} style={style}><textarea className="pd-input" value={f[c.cle] || ''} onChange={(e) => setF({ ...f, [c.cle]: e.target.value })} /></Champ>;
          }
          if (c.type === 'adresse') {
            return (
              <Champ key={c.cle} label={c.libelle} style={style}>
                <div className="pd-flex" style={{ flexWrap: 'nowrap' }}>
                  <input className="pd-input" value={f.adresse || ''} onChange={(e) => setF({ ...f, adresse: e.target.value })} />
                  <button className="pd-btn fantome" onClick={localiser} disabled={recherche || !String(f.adresse || '').trim()}><Search size={15} /> Localiser</button>
                </div>
              </Champ>
            );
          }
          return (
            <Champ key={c.cle} label={c.libelle}>
              <input className="pd-input" type={c.type || 'text'} value={f[c.cle] || ''} onChange={(e) => setF({ ...f, [c.cle]: e.target.value })} />
            </Champ>
          );
        })}
      </div>
      {rep.geo && (
        <>
          <CarteLeaflet
            petite
            epingle={aPosition(f) ? { lat: f.lat, lng: f.lng } : null}
            onDeplacerEpingle={(p) => setF((x) => ({ ...x, lat: p.lat, lng: p.lng }))}
            onClicCarte={(p) => setF((x) => ({ ...x, lat: p.lat, lng: p.lng }))}
            cleAjustement={`${fiche?.id || 'n'}-${f.adresse && aPosition(f) ? 1 : 0}`}
          />
          <div className="pd-dim pd-petit" style={{ margin: '6px 0 12px' }}>
            Clique sur la carte ou glisse l’épingle. {aPosition(f) ? `${Number(f.lat).toFixed(5)}, ${Number(f.lng).toFixed(5)}` : 'Aucune position.'}
          </div>
        </>
      )}
      {fiche && (
        <label className="pd-case" style={{ marginBottom: 12 }}>
          <input type="checkbox" checked={f.actif !== false} onChange={(e) => setF({ ...f, actif: e.target.checked })} /> Fiche active
          {utilisee && <span className="pd-dim pd-petit"> (déjà utilisée : on la désactive plutôt que de la supprimer)</span>}
        </label>
      )}
      {erreur && <Encadre type="err">{erreur}</Encadre>}
      <div className="pd-actions droite">
        <button className="pd-btn fantome" onClick={onFermer}>Annuler</button>
        <button className="pd-btn" onClick={enregistrer}>Enregistrer</button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Structure des tâches, reprise telle quelle de Civalgo (lecture seule : ne
// rien renommer, c'est le vocabulaire des contremaîtres).
// ---------------------------------------------------------------------------
function StructureTaches() {
  const { db } = usePepday();
  return (
    <div className="pd-carte">
      <Encadre type="info">Repris tel quel de Civalgo : 6 tâches et 35 sous-tâches. L’unité par défaut est l’heure; elle se change sur la ligne d’activité du rapport (mètres, tonnes…).</Encadre>
      {(db.taches || []).map((t) => (
        <div key={t.id} style={{ marginBottom: 14 }}>
          <h3 style={{ marginBottom: 6 }}>{t.code} · {t.nom}</h3>
          <div className="pd-table-wrap">
            <table className="pd-table">
              <thead><tr><th style={{ width: 90 }}>Code</th><th>Sous-tâche</th><th style={{ width: 90 }}>Unité</th></tr></thead>
              <tbody>
                {(db.sous_taches || []).filter((st) => st.tache_id === t.id).map((st) => (
                  <tr key={st.id}><td>{st.code || '—'}</td><td>{st.nom}</td><td>{st.unite || '—'}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ressources hors catalogue : inscrites à la volée sur un rapport. Le bureau
// les régularise en les rattachant à une fiche du catalogue (existante ou à
// créer). Les rapports gardent leur taux; seul le lien est ajouté.
// ---------------------------------------------------------------------------
function HorsCatalogue({ modifiable }) {
  const { db, index, moi, actions, naviguer } = usePepday();
  const [voirRegularisees, setVoirRegularisees] = useState(false);
  const [lien, setLien] = useState(null);
  const liste = (db.ressources_provisoires || []).filter((x) => voirRegularisees || !x.regularise_ref_id)
    .sort((a, b) => (index.rapports[b.rapport_id]?.date || '').localeCompare(index.rapports[a.rapport_id]?.date || ''));

  return (
    <div className="pd-carte">
      <Encadre type="info">Des personnes ou des équipements inscrits dans un rapport sans fiche au catalogue. Crée la fiche (onglet Employés ou Équipements) puis rattache-la ici : la ressource comptera alors dans les rapports par employé et par équipement.</Encadre>
      <label className="pd-case" style={{ marginBottom: 10 }}><input type="checkbox" checked={voirRegularisees} onChange={(e) => setVoirRegularisees(e.target.checked)} /> Voir aussi les ressources déjà régularisées</label>
      <div className="pd-table-wrap">
        <table className="pd-table">
          <thead><tr><th>Date</th><th>Rapport</th><th>Projet</th><th>Catégorie</th><th>Nom saisi</th><th>Type</th><th>Régularisé</th>{modifiable && <th />}</tr></thead>
          <tbody>
            {liste.map((x) => {
              const r = index.rapports[x.rapport_id];
              const p = r ? index.projets[r.projet_id] : null;
              const cible = x.regularise_ref_id ? (x.categorie === 'main_oeuvre' ? index.employes[x.regularise_ref_id]?.nom : index.equipements[x.regularise_ref_id]?.nom) : null;
              return (
                <tr key={x.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{r ? dateCourte(r.date) : ''}</td>
                  <td><button className="pd-btn lien" onClick={() => naviguer('rapport', x.rapport_id)}>#{r?.numero}</button></td>
                  <td>{p ? p.numero : ''}</td>
                  <td>{x.categorie === 'main_oeuvre' ? 'Main-d’œuvre' : 'Équipement'}</td>
                  <td className="pd-gras">{x.nom}</td>
                  <td>{x.type || ''}</td>
                  <td>{cible ? `${cible} · ${x.regularise_par_nom || ''} ${horodatage(x.regularise_le)}` : <span className="pd-alerte orange">À régulariser</span>}</td>
                  {modifiable && <td><button className="pd-btn fantome petit" onClick={() => setLien(x)}><Link2 size={13} /> Rattacher</button></td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {liste.length === 0 && <div className="pd-section-vide">Rien à régulariser.</div>}
      {lien && (
        <ModalRattacher
          ressource={lien}
          onFermer={() => setLien(null)}
          onRattacher={async (refId) => {
            await actions.modifier('ressources_provisoires', lien.id, { regularise_ref_id: refId || null, regularise_le: refId ? new Date().toISOString() : null, regularise_par_nom: refId ? moi.nom : null });
            actions.notifier(refId ? 'Ressource rattachée à sa fiche.' : 'Rattachement retiré.');
            setLien(null);
          }}
        />
      )}
    </div>
  );
}

function ModalRattacher({ ressource, onFermer, onRattacher }) {
  const { db } = usePepday();
  const [refId, setRefId] = useState(ressource.regularise_ref_id || '');
  const liste = ressource.categorie === 'main_oeuvre' ? db.employes : db.equipements;
  return (
    <Modal titre={`Rattacher « ${ressource.nom} »`} onFermer={onFermer}>
      <Champ label={ressource.categorie === 'main_oeuvre' ? 'Employé du catalogue' : 'Équipement du catalogue'}>
        <ChampListe options={optionsDe(liste.filter((x) => x.actif !== false), { libelle: (x) => (x.code ? `${x.code} — ${x.nom}` : x.nom) })} valeur={refId} onChange={setRefId} placeholder="Chercher…" />
      </Champ>
      <div className="pd-actions droite">
        <button className="pd-btn fantome" onClick={onFermer}>Annuler</button>
        <button className="pd-btn" onClick={() => onRattacher(refId)}>Enregistrer</button>
      </div>
    </Modal>
  );
}

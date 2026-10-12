import { useState } from 'react';
import { MapPin, Search } from 'lucide-react';
import ChampListe from '../commun/ChampListe';
import { usePepday, Modal, Champ, ChampNombre, Encadre, optionsDe } from './ui';
import CarteLeaflet from './CarteLeaflet';
import { STATUTS_PROJET, CATEGORIES_BUDGET, DEPARTEMENTS } from '../../lib/pepday/constantes';
import { argent } from '../../lib/pepday/couts';
import { geocoder, aPosition } from '../../lib/pepday/geo';

// ---------------------------------------------------------------------------
// PEPDAY — FORMULAIRE D'UN PROJET (création et modification)
//
// Géolocalisation : « Localiser l'adresse » interroge Nominatim (OSM); on
// peut ensuite cliquer sur la carte pour poser l'épingle ou la glisser à la
// main — l'adresse d'un chantier de rang tombe rarement au bon endroit.
// ---------------------------------------------------------------------------

const VIDE = {
  numero: '', nom: '', client: '', adresse: '', lat: null, lng: null, date_debut: '', date_fin: '',
  montant_contrat: null, statut: 'a_venir', charge_projet_id: null, coordonnateur_id: null, surintendant_id: null,
  contremaitre_ids: [], notes: '', departement: '', ref_civalgo: '',
};

export default function FormProjet({ projet = null, onFermer, onEnregistre }) {
  const { db, actions } = usePepday();
  const [f, setF] = useState(() => ({ ...VIDE, ...(projet || {}) }));
  const [budget, setBudget] = useState(() => Object.fromEntries(CATEGORIES_BUDGET.map((c) => [
    c.code, db.budgets.filter((b) => projet && b.projet_id === projet.id && b.categorie === c.code).reduce((s, b) => s + Number(b.montant || 0), 0) || null,
  ])));
  const [resultats, setResultats] = useState([]);
  const [recherche, setRecherche] = useState(false);
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);

  const membres = (role) => optionsDe(db.membres.filter((m) => m.actif !== false && (m.roles || []).includes(role)));
  const contremaitres = db.membres.filter((m) => m.actif !== false && (m.roles || []).includes('contremaitre'));
  const totalBudget = Object.values(budget).reduce((s, v) => s + (Number(v) || 0), 0);

  async function localiser() {
    setRecherche(true);
    setErreur('');
    try {
      const r = await geocoder(f.adresse);
      setResultats(r);
      if (r.length === 0) setErreur('Adresse introuvable. Place l’épingle à la main en cliquant sur la carte.');
      else setF((x) => ({ ...x, lat: r[0].lat, lng: r[0].lng }));
    } catch (e) {
      setErreur(`${e.message} Place l’épingle à la main en cliquant sur la carte.`);
    }
    setRecherche(false);
  }

  async function enregistrer() {
    setErreur('');
    if (!f.numero.trim() || !f.nom.trim()) { setErreur('Le numéro et le nom du projet sont obligatoires.'); return; }
    const doublon = db.projets.find((p) => p.numero.trim().toLowerCase() === f.numero.trim().toLowerCase() && p.id !== projet?.id);
    if (doublon) { setErreur(`Le numéro ${f.numero} est déjà utilisé par « ${doublon.nom} ».`); return; }
    if (f.date_debut && f.date_fin && f.date_fin < f.date_debut) { setErreur('La date de fin est avant la date de début.'); return; }
    setEnCours(true);
    try {
      const row = {
        numero: f.numero.trim(), nom: f.nom.trim(), client: f.client.trim(), adresse: f.adresse.trim(),
        lat: aPosition(f) ? Number(f.lat) : null, lng: aPosition(f) ? Number(f.lng) : null,
        date_debut: f.date_debut || null, date_fin: f.date_fin || null, montant_contrat: Number(f.montant_contrat) || 0,
        statut: f.statut, charge_projet_id: f.charge_projet_id || null, coordonnateur_id: f.coordonnateur_id || null,
        surintendant_id: f.surintendant_id || null, contremaitre_ids: f.contremaitre_ids || [], notes: f.notes,
        departement: f.departement || null, ref_civalgo: (f.ref_civalgo || '').trim() || null,
      };
      const p = projet ? await actions.modifier('projets', projet.id, row) : await actions.inserer('projets', row);

      // Budget : une rangée par catégorie, mise à jour ou créée.
      for (const c of CATEGORIES_BUDGET) {
        const montant = Number(budget[c.code]) || 0;
        const existante = db.budgets.find((b) => b.projet_id === p.id && b.categorie === c.code);
        if (existante && Number(existante.montant) !== montant) await actions.modifier('budgets', existante.id, { montant });
        else if (!existante && montant) await actions.inserer('budgets', { projet_id: p.id, categorie: c.code, montant });
      }
      actions.notifier(projet ? 'Projet mis à jour.' : 'Projet créé.');
      onEnregistre(p);
    } catch (e) {
      setErreur(e.message || String(e));
      setEnCours(false);
    }
  }

  const basculerCm = (id) => setF((x) => ({
    ...x, contremaitre_ids: x.contremaitre_ids.includes(id) ? x.contremaitre_ids.filter((y) => y !== id) : [...x.contremaitre_ids, id],
  }));

  return (
    <Modal titre={projet ? `Modifier ${projet.numero}` : 'Nouveau projet'} onFermer={onFermer} large>
      <div className="pd-grille c3">
        <Champ label="Numéro"><input className="pd-input" value={f.numero} onChange={(e) => setF({ ...f, numero: e.target.value })} placeholder="26-120" /></Champ>
        <Champ label="Nom du projet" style={{ gridColumn: 'span 2' }}><input className="pd-input" value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} /></Champ>
      </div>
      <div className="pd-grille c3">
        <Champ label="Client"><input className="pd-input" value={f.client} onChange={(e) => setF({ ...f, client: e.target.value })} /></Champ>
        <Champ label="Statut">
          <select className="pd-input" value={f.statut} onChange={(e) => setF({ ...f, statut: e.target.value })}>
            {STATUTS_PROJET.map((s) => <option key={s.code} value={s.code}>{s.libelle}</option>)}
          </select>
        </Champ>
        <Champ label="Montant du contrat ($)"><ChampNombre valeur={f.montant_contrat} onChange={(n) => setF({ ...f, montant_contrat: n })} /></Champ>
      </div>
      <div className="pd-grille c3">
        <Champ label="Département">
          <select className="pd-input" value={f.departement || ''} onChange={(e) => setF({ ...f, departement: e.target.value })}>
            <option value="">—</option>
            {DEPARTEMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </Champ>
        <Champ label="Début prévu"><input className="pd-input" type="date" value={f.date_debut || ''} onChange={(e) => setF({ ...f, date_debut: e.target.value })} /></Champ>
        <Champ label="Fin prévue"><input className="pd-input" type="date" value={f.date_fin || ''} onChange={(e) => setF({ ...f, date_fin: e.target.value })} /></Champ>
      </div>

      <h3 style={{ marginTop: 6 }}>Emplacement</h3>
      <Champ label="Adresse">
        <div className="pd-flex" style={{ flexWrap: 'nowrap' }}>
          <input className="pd-input" value={f.adresse} onChange={(e) => setF({ ...f, adresse: e.target.value })} placeholder="No, rue, ville" onKeyDown={(e) => { if (e.key === 'Enter') localiser(); }} />
          <button className="pd-btn fantome" onClick={localiser} disabled={recherche || !f.adresse.trim()}><Search size={15} /> Localiser</button>
        </div>
      </Champ>
      {resultats.length > 1 && (
        <Champ label="Plusieurs résultats — choisis le bon">
          <select className="pd-input" onChange={(e) => { const r = resultats[Number(e.target.value)]; setF({ ...f, lat: r.lat, lng: r.lng }); }}>
            {resultats.map((r, i) => <option key={r.libelle} value={i}>{r.libelle}</option>)}
          </select>
        </Champ>
      )}
      <CarteLeaflet
        petite
        epingle={aPosition(f) ? { lat: f.lat, lng: f.lng } : null}
        onDeplacerEpingle={(p) => setF((x) => ({ ...x, lat: p.lat, lng: p.lng }))}
        onClicCarte={(p) => setF((x) => ({ ...x, lat: p.lat, lng: p.lng }))}
        cleAjustement={`${resultats.length}-${resultats[0]?.lat || ''}-${projet?.id || ''}`}
      />
      <div className="pd-flex pd-petit pd-dim" style={{ margin: '6px 0 12px', justifyContent: 'space-between' }}>
        <span><MapPin size={12} /> Clique sur la carte pour placer l’épingle, ou glisse-la.</span>
        <span>{aPosition(f) ? `${Number(f.lat).toFixed(5)}, ${Number(f.lng).toFixed(5)}` : 'Aucune position'}</span>
      </div>

      <h3>Équipe</h3>
      <div className="pd-grille c3">
        <Champ label="Chargé de projet"><ChampListe options={membres('charge_projet')} valeur={f.charge_projet_id || ''} onChange={(v) => setF({ ...f, charge_projet_id: v || null })} /></Champ>
        <Champ label="Coordonnateur"><ChampListe options={membres('coordonnateur')} valeur={f.coordonnateur_id || ''} onChange={(v) => setF({ ...f, coordonnateur_id: v || null })} /></Champ>
        <Champ label="Surintendant"><ChampListe options={membres('surintendant')} valeur={f.surintendant_id || ''} onChange={(v) => setF({ ...f, surintendant_id: v || null })} /></Champ>
      </div>
      <Champ label="Contremaîtres">
        <div className="pd-flex" style={{ gap: '4px 16px' }}>
          {contremaitres.map((m) => (
            <label key={m.id} className="pd-case"><input type="checkbox" checked={f.contremaitre_ids.includes(m.id)} onChange={() => basculerCm(m.id)} /> {m.nom}</label>
          ))}
          {contremaitres.length === 0 && <span className="pd-dim">Aucun membre n’a le rôle contremaître.</span>}
        </div>
      </Champ>

      <h3>Budget par catégorie</h3>
      <div className="pd-grille c3">
        {CATEGORIES_BUDGET.map((c) => (
          <Champ key={c.code} label={`${c.libelle} ($)`}><ChampNombre valeur={budget[c.code]} onChange={(n) => setBudget({ ...budget, [c.code]: n })} /></Champ>
        ))}
        <Champ label="Total du budget"><div style={{ padding: '10px 0', fontWeight: 800 }}>{argent(totalBudget)}</div></Champ>
      </div>

      <Champ label="Référence Civalgo (pour un import futur)"><input className="pd-input" value={f.ref_civalgo || ''} onChange={(e) => setF({ ...f, ref_civalgo: e.target.value })} /></Champ>
      <Champ label="Notes"><textarea className="pd-input" value={f.notes || ''} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Champ>

      {erreur && <Encadre type="err">{erreur}</Encadre>}
      <div className="pd-actions droite">
        <button className="pd-btn fantome" onClick={onFermer} disabled={enCours}>Annuler</button>
        <button className="pd-btn" onClick={enregistrer} disabled={enCours}>{projet ? 'Enregistrer' : 'Créer le projet'}</button>
      </div>
    </Modal>
  );
}

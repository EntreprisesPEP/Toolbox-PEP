import { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import AuthGate from '../../components/petits-outils/AuthGate';
import { ARTICLES } from '../../lib/petits-outils/articles';
import { Send, CheckCircle2, Upload, X, Plus, Trash2 } from 'lucide-react';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Client sur le schema petits_outils (demandes + demande_items + demande_personnes)
const supabasePO = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { db: { schema: 'petits_outils' } });
// Client sur le schema liste_projets (projets + personnel — déjà en place
// pour Liste des projets / Demandes d'arpentage, on le réutilise ici)
const supabaseLP = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { db: { schema: 'liste_projets' } });

const BUCKET_FICHIERS = 'petits-outils-fichiers';
const TAILLE_MAX_FICHIER = 20 * 1024 * 1024; // 20 Mo
const LOGO_PEP_BLANC = '/pep-logo-blanc.png';

function sanitizeNomFichier(nom) {
  return nom
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // retire les accents
    .replace(/[^a-zA-Z0-9._-]/g, '_');
}

function nouvelItem() {
  return { id: Math.random().toString(36).slice(2), outil: '', details: '' };
}

function creerFormulaireInitial() {
  return {
    votreNom: '',
    projetNo: '',
    personnesAdditionnelles: [],
    modeReception: 'cueillette',
    dateRequise: '',
    touteJournee: true,
    heureRequise: '',
    dateAutorisee: '',
    items: [nouvelItem()],
    endroitTravaux: '',
    infosComplementaires: '',
    photoFiles: [],
  };
}

function joursEntre(dateA, dateB) {
  if (!dateA || !dateB) return null;
  const a = new Date(dateA + 'T00:00:00');
  const b = new Date(dateB + 'T00:00:00');
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

const inputStyle = {
  width: '100%', padding: '9px 10px', border: '1px solid #D7DBE0', fontSize: 14,
  fontFamily: "'Inter',sans-serif", boxSizing: 'border-box',
};
const labelStyle = {
  display: 'block', fontSize: 11.5, fontWeight: 600, color: '#495260', marginBottom: 5,
  textTransform: 'uppercase', letterSpacing: '0.03em',
};

// ---------------------------------------------------------------------------
// Sélecteur d'outil — recherche parmi les articles connus, ou permet
// d'écrire un outil qui n'est pas dans la liste (Entrée pour l'utiliser).
// ---------------------------------------------------------------------------
function SelecteurOutil({ value, onChange }) {
  const [ouvert, setOuvert] = useState(false);
  const [recherche, setRecherche] = useState('');
  const ref = useRef(null);

  function fermerEtValider() {
    setOuvert(false);
    if (recherche.trim()) onChange(recherche.trim());
  }

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) fermerEtValider();
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [ouvert, recherche]);

  const filtres = recherche.trim()
    ? ARTICLES.filter((a) => a.toLowerCase().includes(recherche.trim().toLowerCase()))
    : ARTICLES;

  const correspondExactement = ARTICLES.some((a) => a.toLowerCase() === recherche.trim().toLowerCase());

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input
        type="text"
        value={ouvert ? recherche : value}
        placeholder="Rechercher ou écrire un outil…"
        onFocus={() => { setOuvert(true); setRecherche(value || ''); }}
        onChange={(e) => setRecherche(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); onChange(recherche.trim()); setOuvert(false); }
          if (e.key === 'Escape') { setOuvert(false); setRecherche(value || ''); }
        }}
        style={inputStyle}
      />
      {ouvert && (
        <div style={{
          position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0,
          background: '#fff', border: '1px solid #D7DBE0', maxHeight: 260, overflowY: 'auto',
          boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
        }}>
          {recherche.trim() && !correspondExactement && (
            <div
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(recherche.trim()); setOuvert(false); }}
              style={{ padding: '8px 12px', fontSize: 13.5, cursor: 'pointer', borderBottom: '1px solid #D7DBE0', background: '#FFF8EE', color: '#495260', fontStyle: 'italic' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#FCEFD6'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#FFF8EE'; }}
            >
              Outil ne figurant pas dans la liste (Faite Enter pour l&apos;utiliser quand même)
            </div>
          )}
          {filtres.length === 0 && !recherche.trim() && <div style={{ padding: 10, color: '#8a93a0', fontSize: 13 }}>Aucun résultat.</div>}
          {filtres.map((a) => (
            <div
              key={a}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(a); setOuvert(false); }}
              style={{ padding: '8px 12px', fontSize: 13.5, cursor: 'pointer', borderBottom: '1px solid #F0F1F3' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#F7F8FA'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; }}
            >
              {a}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DemandePetitsOutils({ accessToken }) {
  const [projets, setProjets] = useState([]);
  const [personnel, setPersonnel] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreurChargement, setErreurChargement] = useState('');
  const [form, setForm] = useState(creerFormulaireInitial());
  const [errors, setErrors] = useState({});
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [erreurNotification, setErreurNotification] = useState('');
  const [erreurFichiers, setErreurFichiers] = useState('');

  useEffect(() => {
    async function charger() {
      setChargement(true);
      const [{ data: projetsData, error: eProjets }, { data: personnelData, error: ePersonnel }] = await Promise.all([
        supabaseLP.from('projets').select('no, nom, client, charge, courriel_cp, adresse').order('no', { ascending: false }),
        supabaseLP.from('personnel').select('nom, courriel').eq('actif', true).order('nom'),
      ]);
      if (eProjets || ePersonnel) {
        setErreurChargement("Impossible de charger les données. Réessaie dans un instant, ou avertis William si ça persiste.");
        setChargement(false);
        return;
      }
      setProjets(projetsData || []);
      setPersonnel(personnelData || []);
      setChargement(false);
    }
    charger();
  }, []);

  function updateField(champ, valeur) {
    setForm((f) => ({ ...f, [champ]: valeur }));
    setErrors((e) => ({ ...e, [champ]: undefined }));
  }

  function updateItem(id, champ, valeur) {
    setForm((f) => ({
      ...f,
      items: f.items.map((it) => (it.id === id ? { ...it, [champ]: valeur } : it)),
    }));
  }

  function ajouterItem() {
    setForm((f) => ({ ...f, items: [...f.items, nouvelItem()] }));
  }

  function retirerItem(id) {
    setForm((f) => ({ ...f, items: f.items.length > 1 ? f.items.filter((it) => it.id !== id) : f.items }));
  }

  function ajouterPersonne() {
    setForm((f) => ({ ...f, personnesAdditionnelles: [...f.personnesAdditionnelles, ''] }));
  }
  function updatePersonne(index, nom) {
    setForm((f) => ({
      ...f,
      personnesAdditionnelles: f.personnesAdditionnelles.map((p, i) => (i === index ? nom : p)),
    }));
  }
  function retirerPersonne(index) {
    setForm((f) => ({ ...f, personnesAdditionnelles: f.personnesAdditionnelles.filter((_, i) => i !== index) }));
  }

  function ajouterFichiers(fichiers) {
    const nouveaux = Array.from(fichiers).filter((f) => f.size <= TAILLE_MAX_FICHIER);
    const troGros = Array.from(fichiers).length - nouveaux.length;
    if (troGros > 0) {
      setErreurFichiers(`${troGros} fichier${troGros > 1 ? 's dépassent' : ' dépasse'} la limite de 20 Mo et n'${troGros > 1 ? 'ont' : 'a'} pas été ajouté${troGros > 1 ? 's' : ''}.`);
    }
    setForm((f) => ({ ...f, photoFiles: [...f.photoFiles, ...nouveaux] }));
  }

  function retirerFichier(index) {
    setForm((f) => ({ ...f, photoFiles: f.photoFiles.filter((_, i) => i !== index) }));
  }

  const projetSelectionne = projets.find((p) => p.no === form.projetNo);
  const votreNomSelectionne = personnel.find((p) => p.nom === form.votreNom);
  const delaiJours = joursEntre(new Date().toISOString().slice(0, 10), form.dateRequise);

  function validate() {
    const errs = {};
    if (!form.votreNom) errs.votreNom = 'Requis';
    if (!form.projetNo) errs.projetNo = 'Requis';
    if (!form.dateRequise) errs.dateRequise = 'Requis';
    if (!form.dateAutorisee) errs.dateAutorisee = 'Requis';
    if (!form.touteJournee && !form.heureRequise) errs.heureRequise = 'Requis';
    const auMoinsUnOutil = form.items.some((it) => it.outil.trim());
    if (!auMoinsUnOutil) errs.items = 'Ajoute au moins un outil.';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit() {
    if (!validate() || envoiEnCours) return;
    setEnvoiEnCours(true);
    setErreurNotification('');
    setErreurFichiers('');

    const payload = {
      demandeur_nom: form.votreNom,
      demandeur_email: votreNomSelectionne?.courriel || '',
      projet_no: form.projetNo,
      projet_nom: projetSelectionne?.nom || null,
      nom_charge: projetSelectionne?.charge || null,
      courriel_cp: projetSelectionne?.courriel_cp || null,
      mode_reception: form.modeReception,
      date_requise: form.dateRequise,
      toute_journee: form.touteJournee,
      heure_requise: form.touteJournee ? null : form.heureRequise,
      date_autorisee: form.dateAutorisee,
      endroit_travaux: form.endroitTravaux || null,
      infos_complementaires: form.infosComplementaires || null,
    };

    const { data: demande, error } = await supabasePO.from('demandes').insert(payload).select().single();
    if (error) {
      setEnvoiEnCours(false);
      setErrors({ general: "Impossible de soumettre la demande. Réessaie dans un instant." });
      return;
    }

    // Items (liste des outils demandés)
    const itemsValides = form.items.filter((it) => it.outil.trim());
    await supabasePO.from('demande_items').insert(
      itemsValides.map((it, i) => ({
        demande_id: demande.id,
        outil: it.outil,
        details: it.details || null,
        sort_order: i,
      }))
    );

    // Personnes additionnelles à aviser (0, 1 ou plusieurs)
    const personnesValides = form.personnesAdditionnelles.filter(Boolean);
    if (personnesValides.length > 0) {
      await supabasePO.from('demande_personnes').insert(
        personnesValides.map((nomP) => {
          const p = personnel.find((x) => x.nom === nomP);
          return { demande_id: demande.id, nom: nomP, courriel: p?.courriel || null };
        })
      );
    }

    // Téléversement réel des fichiers/photos — la demande est déjà
    // enregistrée à ce stade, donc un échec ici n'annule rien.
    if (form.photoFiles.length > 0) {
      const resultats = await Promise.all(form.photoFiles.map(async (fichier) => {
        const chemin = `${demande.numero}/${sanitizeNomFichier(fichier.name)}`;
        const { error: eUpload } = await supabasePO.storage
          .from(BUCKET_FICHIERS)
          .upload(chemin, fichier, { upsert: true, contentType: fichier.type || undefined });
        if (eUpload) console.error('Erreur téléversement fichier:', fichier.name, eUpload); // eslint-disable-line no-console
        return eUpload ? null : chemin;
      }));
      const cheminsFichiers = resultats.filter(Boolean);
      if (cheminsFichiers.length < form.photoFiles.length) {
        setErreurFichiers("La demande est enregistrée, mais un ou plusieurs fichiers n'ont pas pu être téléversés.");
      }
    }

    setEnvoiEnCours(false);
    setConfirmation({ numero: demande.numero, projet: projetSelectionne });
    setForm(creerFormulaireInitial());

    // Envoi du courriel de notification — la demande est déjà enregistrée,
    // donc un échec ici n'annule rien, on informe juste.
    try {
      const reponse = await fetch('/api/petits-outils/notifier/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ numero: demande.numero }),
      });
      if (!reponse.ok) {
        const detail = await reponse.json().catch(() => ({}));
        console.error('Notification petits outils — erreur serveur:', detail.error || reponse.status); // eslint-disable-line no-console
        setErreurNotification("La demande est enregistrée, mais l'envoi du courriel de notification a échoué.");
      }
    } catch (e) {
      console.error('Notification petits outils — erreur réseau:', e); // eslint-disable-line no-console
      setErreurNotification("La demande est enregistrée, mais l'envoi du courriel de notification a échoué.");
    }
  }

  if (chargement) {
    return <div style={{ padding: 40, fontFamily: "'Inter',sans-serif", color: '#6b7480' }}>Chargement…</div>;
  }

  return (
    <div style={{ minHeight: '100vh', background: '#EDEFF1', fontFamily: "'Inter',sans-serif" }}>
      <div style={{ background: '#0F2138', borderTop: '4px solid #E4022E', padding: '18px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 16 }}>
          <img src={LOGO_PEP_BLANC} alt="Les Entreprises PEP" style={{ height: 96, width: 'auto', flexShrink: 0 }} />
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: 96 }}>
            <div>
              <div style={{ color: '#AEC0F5', fontSize: 12, letterSpacing: '0.14em', fontWeight: 600 }}>LES ENTREPRISES</div>
              <div style={{ color: '#fff', fontSize: 24, fontWeight: 700 }}>PEP2000 INC.</div>
              <div style={{ color: '#B9C2CC', fontSize: 13, marginTop: 2 }}>Demande petits outils</div>
            </div>
            <a href="/" style={{ color: '#B9C2CC', fontSize: 13, textDecoration: 'underline', display: 'inline-block' }}>
              → Retour au Toolbox PEP
            </a>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '28px 20px 60px' }}>
        {erreurChargement && (
          <div style={{ background: '#FDECEC', border: '1px solid #E4022E', padding: 14, marginBottom: 20, color: '#C23B3B', fontSize: 13.5 }}>
            {erreurChargement}
          </div>
        )}

        {confirmation && (
          <div style={{ background: '#EAF7EE', border: '1px solid #2E9F58', padding: 16, marginBottom: 20, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <CheckCircle2 size={20} color="#2E9F58" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontWeight: 600, color: '#15181B', fontSize: 14.5 }}>
                Demande #{confirmation.numero} envoyée !
              </div>
              <div style={{ fontSize: 13, color: '#495260', marginTop: 2 }}>
                {confirmation.projet ? `${confirmation.projet.no} — ${confirmation.projet.nom}` : ''}
              </div>
              {erreurNotification && <div style={{ color: '#C23B3B', fontSize: 13, marginTop: 6 }}>{erreurNotification}</div>}
              {erreurFichiers && <div style={{ color: '#C23B3B', fontSize: 13, marginTop: 6 }}>{erreurFichiers}</div>}
            </div>
          </div>
        )}

        <div style={{ background: '#fff', border: '1px solid #D7DBE0', padding: 24 }}>
          <h1 style={{ fontFamily: "'Oswald',sans-serif", fontSize: 22, margin: '0 0 20px', color: '#15181B' }}>
            Les Entreprises PEP - Demande petits outils
          </h1>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Votre nom *</label>
              <select
                value={form.votreNom}
                onChange={(e) => updateField('votreNom', e.target.value)}
                style={{ ...inputStyle, borderColor: errors.votreNom ? '#E4022E' : '#D7DBE0' }}
              >
                <option value="">— Choisir votre nom —</option>
                {personnel.map((p) => <option key={p.nom} value={p.nom}>{p.nom}</option>)}
              </select>
              {errors.votreNom && <div style={{ color: '#C23B3B', fontSize: 12, marginTop: 4 }}>{errors.votreNom}</div>}
            </div>
            <div>
              <label style={labelStyle}>Date du jour</label>
              <input value={new Date().toISOString().slice(0, 10)} disabled style={{ ...inputStyle, background: '#F7F8FA', color: '#6b7480' }} />
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Projet *</label>
            <select
              value={form.projetNo}
              onChange={(e) => updateField('projetNo', e.target.value)}
              style={{ ...inputStyle, borderColor: errors.projetNo ? '#E4022E' : '#D7DBE0' }}
            >
              <option value="">— Choisir un projet —</option>
              {projets.map((p) => <option key={p.no} value={p.no}>{p.no} — {p.nom}</option>)}
            </select>
            {errors.projetNo && <div style={{ color: '#C23B3B', fontSize: 12, marginTop: 4 }}>{errors.projetNo}</div>}
          </div>

          {projetSelectionne && (
            <div style={{ background: '#F7F8FA', border: '1px solid #EDEFF1', padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#495260' }}>
              Chargé de projet : <strong style={{ color: '#15181B' }}>{projetSelectionne.charge || '—'}</strong>
              {projetSelectionne.courriel_cp ? ` (${projetSelectionne.courriel_cp})` : ''}
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Aviser des personnes additionnelles</label>
            {form.personnesAdditionnelles.map((nomP, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                <select value={nomP} onChange={(e) => updatePersonne(i, e.target.value)} style={inputStyle}>
                  <option value="">— Choisir —</option>
                  {personnel.map((p) => <option key={p.nom} value={p.nom}>{p.nom}</option>)}
                </select>
                <button type="button" onClick={() => retirerPersonne(i)} style={{ background: 'transparent', border: 'none', color: '#C23B3B', cursor: 'pointer', padding: '0 8px' }}>
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={ajouterPersonne}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: '1px solid #495260', color: '#495260', padding: '6px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', marginTop: 2 }}
            >
              <Plus size={13} /> Ajouter une personne
            </button>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Comment souhaitez-vous recevoir votre commande?</label>
            <div style={{ display: 'flex', gap: 20, marginTop: 4 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
                <input type="radio" checked={form.modeReception === 'cueillette'} onChange={() => updateField('modeReception', 'cueillette')} />
                Cueillette
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
                <input type="radio" checked={form.modeReception === 'livraison'} onChange={() => updateField('modeReception', 'livraison')} />
                Livraison au chantier
              </label>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 8, alignItems: 'end' }}>
            <div>
              <label style={labelStyle}>Date requise *</label>
              <input
                type="date"
                value={form.dateRequise}
                onChange={(e) => updateField('dateRequise', e.target.value)}
                style={{ ...inputStyle, borderColor: errors.dateRequise ? '#E4022E' : '#D7DBE0' }}
              />
            </div>
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, marginBottom: 5 }}>
                <input type="checkbox" checked={form.touteJournee} onChange={(e) => updateField('touteJournee', e.target.checked)} />
                Toute journée
              </label>
              {!form.touteJournee && (
                <input
                  type="time"
                  value={form.heureRequise}
                  onChange={(e) => updateField('heureRequise', e.target.value)}
                  style={{ ...inputStyle, borderColor: errors.heureRequise ? '#E4022E' : '#D7DBE0' }}
                />
              )}
            </div>
            <div>
              <label style={labelStyle}>Date autorisée *</label>
              <input
                type="date"
                value={form.dateAutorisee}
                onChange={(e) => updateField('dateAutorisee', e.target.value)}
                style={{ ...inputStyle, borderColor: errors.dateAutorisee ? '#E4022E' : '#D7DBE0' }}
              />
            </div>
          </div>
          {delaiJours !== null && (
            <div style={{ fontSize: 12.5, color: '#8a93a0', marginBottom: 20 }}>
              Délai avant travaux : <strong style={{ color: delaiJours < 0 ? '#C23B3B' : '#495260' }}>
                {delaiJours < 0 ? `dépassé de ${Math.abs(delaiJours)} jour${Math.abs(delaiJours) > 1 ? 's' : ''}` : `${delaiJours} jour${delaiJours > 1 ? 's' : ''}`}
              </strong>
            </div>
          )}

          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Liste</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, marginBottom: 6, fontSize: 11, color: '#8a93a0', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              <div>Outil</div><div>Détails</div><div></div>
            </div>
            {form.items.map((it) => (
              <div key={it.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, marginBottom: 8, alignItems: 'start' }}>
                <SelecteurOutil value={it.outil} onChange={(v) => updateItem(it.id, 'outil', v)} />
                <input
                  value={it.details}
                  onChange={(e) => updateItem(it.id, 'details', e.target.value)}
                  placeholder="ex : quantité, précision…"
                  style={inputStyle}
                />
                <button
                  type="button"
                  onClick={() => retirerItem(it.id)}
                  style={{ background: 'transparent', border: 'none', color: '#C23B3B', cursor: 'pointer', padding: 8 }}
                  title="Retirer cette ligne"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={ajouterItem}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, background: 'transparent',
                border: '1px solid #E4022E', color: '#E4022E', padding: '7px 14px', fontSize: 13,
                fontWeight: 600, cursor: 'pointer', marginTop: 4,
              }}
            >
              <Plus size={14} /> Ajouter Item
            </button>
            {errors.items && <div style={{ color: '#C23B3B', fontSize: 12, marginTop: 6 }}>{errors.items}</div>}
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Endroit des travaux</label>
            <input
              value={form.endroitTravaux}
              onChange={(e) => updateField('endroitTravaux', e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Informations complémentaires</label>
            <textarea
              value={form.infosComplementaires}
              onChange={(e) => updateField('infosComplementaires', e.target.value)}
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle}>Fichiers ou photos</label>
            <div style={{
              border: '1px dashed #D7DBE0', padding: 16, textAlign: 'center', cursor: 'pointer',
            }}
              onClick={() => document.getElementById('input-fichiers-po').click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); ajouterFichiers(e.dataTransfer.files); }}
            >
              <Upload size={20} color="#8a93a0" style={{ marginBottom: 6 }} />
              <div style={{ fontSize: 13, color: '#8a93a0' }}>Téléverser ou faites glisser les fichiers ici (max 20 Mo chacun)</div>
              <input
                id="input-fichiers-po" type="file" multiple style={{ display: 'none' }}
                onChange={(e) => ajouterFichiers(e.target.files)}
              />
            </div>
            {form.photoFiles.length > 0 && (
              <div style={{ marginTop: 10 }}>
                {form.photoFiles.map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, padding: '5px 0', borderBottom: '1px solid #F0F1F3' }}>
                    <span>{f.name}</span>
                    <button type="button" onClick={() => retirerFichier(i)} style={{ background: 'none', border: 'none', color: '#C23B3B', cursor: 'pointer' }}>
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {errors.general && <div style={{ color: '#C23B3B', fontSize: 13.5, marginBottom: 14 }}>{errors.general}</div>}

          <button
            onClick={handleSubmit}
            disabled={envoiEnCours}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, background: '#E4022E', color: '#fff',
              border: 'none', padding: '12px 24px', fontFamily: "'Oswald',sans-serif", fontWeight: 600,
              fontSize: 14, letterSpacing: '0.03em', textTransform: 'uppercase', cursor: 'pointer',
              opacity: envoiEnCours ? 0.6 : 1,
            }}
          >
            <Send size={16} /> {envoiEnCours ? 'Envoi…' : 'Envoyer'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  const [session, setSession] = useState(null);
  if (!session) return <AuthGate onDone={setSession} />;
  return <DemandePetitsOutils accessToken={session.accessToken} />;
}

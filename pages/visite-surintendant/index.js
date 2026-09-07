import { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import GardeConnexion from '../../components/commun/GardeConnexion';
import EnTeteApp from '../../components/commun/EnTeteApp';
import { useModePep } from '../../components/commun/ThemeToolbox';
import { SURINTENDANTS, TRAVAUX_EN_COURS_OPTIONS, DESTINATAIRES_FIXES } from '../../lib/visite-surintendant/surintendants';
import { Send, CheckCircle2, Upload, X, Plus, Trash2, Moon, Sun, AlertTriangle, Info, Users } from 'lucide-react';

// Logo PEP — texte blanc pour la nuit (fond navy), texte noir pour le
// jour (fond clair). Mêmes fichiers que Demandes d'arpentage.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabaseVS = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { db: { schema: 'visite_surintendant' } });
const supabaseLP = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { db: { schema: 'liste_projets' } });
const supabasePersonnel = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { db: { schema: 'personnel' } });

// Nom du groupe de l'app Liste de personnel qui alimente le menu
// "Aviser des personnes additionnelles". Comparé sans tenir compte de la
// casse, pour qu'un renommage en "Projet" ou "PROJET" ne casse rien.
const GROUPE_PERSONNES_ADDITIONNELLES = 'projets';

const BUCKET_FICHIERS = 'visite-surintendant-fichiers';
const TAILLE_MAX_FICHIER = 20 * 1024 * 1024; // 20 Mo

// Budget de pièces jointes, AVANT encodage base64. Doit rester identique à
// TAILLE_MAX_TOTAL_PIECES dans pages/api/visite-surintendant/notifier.js,
// sinon la jauge affichée mentirait au surintendant.
const BUDGET_PIECES_JOINTES = 12 * 1024 * 1024; // 12 Mo

function formatTaille(octets) {
  if (octets >= 1024 * 1024) return `${(octets / (1024 * 1024)).toFixed(1)} Mo`;
  return `${Math.round(octets / 1024)} Ko`;
}

const BRAND_RED = '#c41230';
const ORANGE_AVIS = '#e8a33d';
const BLEU_INFO = '#5f9ad4';

// Deux natures de mention — même bandeau orange, message différent.
// Chaque nature de mention a sa couleur, reprise à l'identique dans le
// bandeau du courriel : orange pour une réponse attendue, bleu pâle pour
// une information à lire.
const MENTIONS = {
  reponse: { libelle: 'Réponse requise', couleur: ORANGE_AVIS, fond: (th) => th.avisBg },
  info: { libelle: 'À lire', couleur: BLEU_INFO, fond: (th) => th.infoBg },
};

// Mêmes thèmes jour/nuit que Demandes d'arpentage, pour que les deux apps
// se ressemblent au pixel près.
const THEMES = {
  night: {
    bg: '#10192e',
    panel: '#182238',
    inputBg: '#10192e',
    line: '#2c3752',
    text: '#e7eaf0',
    textDim: '#8a93a8',
    toggleInactiveText: '#9aa5c0',
    avisBg: '#2a2213',
    infoBg: '#132132',
  },
  day: {
    bg: '#eef1f7',
    panel: '#ffffff',
    inputBg: '#f4f6fb',
    line: '#dde1ea',
    text: '#1a2035',
    textDim: '#6b7488',
    toggleInactiveText: '#5c6478',
    avisBg: '#fff8ee',
    infoBg: '#eef5fd',
  },
};

function sanitizeNomFichier(nom) {
  return nom.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
}

// Version allégée d'une photo, faite dans le navigateur avant le
// téléversement : 1920 px sur le plus grand côté, JPEG qualité 0,85. Une
// photo d'iPhone de 4 Mo tombe typiquement autour de 500 Ko, ce qui garde le
// courriel sous la limite d'Outlook et accélère beaucoup l'envoi depuis un
// chantier. L'originale, elle, est archivée intacte.
// Si quoi que ce soit échoue, on retourne le fichier d'origine — mieux vaut
// une grosse photo qu'aucune photo.
async function compresserImage(fichier, maxDim = 1920, qualite = 0.85) {
  if (!fichier.type || !fichier.type.startsWith('image/')) return fichier;
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return fichier;
  try {
    const bitmap = await createImageBitmap(fichier, { imageOrientation: 'from-image' });
    const plusGrandCote = Math.max(bitmap.width, bitmap.height);
    const ratio = Math.min(1, maxDim / plusGrandCote);

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    const ctx = canvas.getContext('2d');
    if (!ctx) return fichier;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    if (bitmap.close) bitmap.close();

    const blob = await new Promise((resoudre) => canvas.toBlob(resoudre, 'image/jpeg', qualite));
    // Si la compression n'aide pas (photo déjà minuscule, PNG d'écran, etc.),
    // on garde l'originale plutôt que de la grossir.
    if (!blob || blob.size >= fichier.size) return fichier;

    const nom = `${fichier.name.replace(/\.[^.]+$/, '')}.jpg`;
    return new File([blob], nom, { type: 'image/jpeg' });
  } catch (e) {
    console.error('Compression impossible, envoi de la photo originale:', fichier.name, e); // eslint-disable-line no-console
    return fichier;
  }
}

function creerFormulaireInitial() {
  const maintenant = new Date();
  return {
    surintendantNom: '',
    projetNo: '',
    projetTexteLibre: '',
    personnesAdditionnelles: [],
    dateVisite: maintenant.toISOString().slice(0, 10),
    heureVisite: maintenant.toTimeString().slice(0, 5),
    travauxEnCours: [],
    travauxAutre: '',
    detailsActivitesEnCours: '',
    activitesAVenir: '',
    infosSpecialesChargeProjet: '',
    mentions: [],
    photoFiles: [],
  };
}

// ---------------------------------------------------------------------------
// Petits blocs réutilisables — copiés sur ceux de Demandes d'arpentage
// ---------------------------------------------------------------------------
function Field({ label, error, children, th }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{
        fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5,
        color: th.textDim, display: 'block', marginBottom: 6,
      }}>
        {label}
      </label>
      {children}
      {error && <div style={{ color: BRAND_RED, fontSize: 11, marginTop: 4 }}>{error}</div>}
    </div>
  );
}

function champStyle(th, enErreur) {
  return {
    width: '100%', background: th.inputBg, border: `1px solid ${enErreur ? BRAND_RED : th.line}`,
    color: th.text, padding: '9px 12px', borderRadius: 4, fontSize: 13.5,
    boxSizing: 'border-box', fontFamily: 'inherit',
  };
}

// Champ date/heure — cliquer n'importe où dans le rectangle ouvre le
// sélecteur, pas seulement sur la petite icône.
function ChampTemps({ type, value, onChange, th, error }) {
  const ref = useRef(null);
  return (
    <input
      ref={ref}
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      onClick={() => { if (ref.current?.showPicker) { try { ref.current.showPicker(); } catch (e) {} } }}
      style={{ ...champStyle(th, error), cursor: 'pointer' }}
    />
  );
}

// ---------------------------------------------------------------------------
// Sélecteur de projet — recherche parmi liste_projets.projets, ou permet
// d'écrire un projet qui n'y figure pas encore.
// ---------------------------------------------------------------------------
function SelecteurProjet({ value, projets, onChange, th, error }) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouvert, recherche]);

  const options = projets.map((p) => `${p.no} — ${p.nom}`);
  const filtres = recherche.trim()
    ? options.filter((o) => o.toLowerCase().includes(recherche.trim().toLowerCase()))
    : options;
  const correspondExactement = options.some((o) => o.toLowerCase() === recherche.trim().toLowerCase());

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input
        type="text"
        value={ouvert ? recherche : value}
        placeholder="Tape un numéro ou un nom de projet…"
        onFocus={() => { setOuvert(true); setRecherche(value || ''); }}
        onChange={(e) => setRecherche(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); onChange(recherche.trim()); setOuvert(false); }
          if (e.key === 'Escape') { setOuvert(false); setRecherche(value || ''); }
        }}
        style={champStyle(th, error)}
      />
      {ouvert && (
        <div style={{
          position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0, marginTop: 2,
          background: th.panel, border: `1px solid ${th.line}`, borderRadius: 4,
          maxHeight: 260, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
        }}>
          {recherche.trim() && !correspondExactement && (
            <div
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(recherche.trim()); setOuvert(false); }}
              style={{
                padding: '9px 12px', fontSize: 12.5, cursor: 'pointer',
                borderBottom: `1px solid ${th.line}`, background: th.avisBg,
                color: th.textDim, fontStyle: 'italic',
              }}
            >
              Projet ne figurant pas dans la liste (fais Entrée pour l&apos;utiliser quand même)
            </div>
          )}
          {filtres.length === 0 && !recherche.trim() && (
            <div style={{ padding: '10px 12px', fontSize: 12.5, color: th.textDim }}>Aucun projet trouvé</div>
          )}
          {filtres.map((o) => (
            <div
              key={o}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(o); setOuvert(false); }}
              style={{
                padding: '9px 12px', fontSize: 13, cursor: 'pointer',
                background: o === value ? `${BRAND_RED}22` : 'transparent',
              }}
            >
              {o}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function VisiteSurintendant({ nom, poste, accessToken }) {
  const [mode, setMode] = useModePep();
  const th = THEMES[mode];

  const [projets, setProjets] = useState([]);
  const [personnel, setPersonnel] = useState([]);
  const [personnesGroupe, setPersonnesGroupe] = useState([]);
  const [groupeIntrouvable, setGroupeIntrouvable] = useState(false);
  const [chargement, setChargement] = useState(true);
  const [erreurChargement, setErreurChargement] = useState('');
  const [form, setForm] = useState(creerFormulaireInitial());
  const [errors, setErrors] = useState({});
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [erreurNotification, setErreurNotification] = useState('');
  const [erreurFichiers, setErreurFichiers] = useState('');
  const [compressionEnCours, setCompressionEnCours] = useState(0);

  useEffect(() => {
    async function charger() {
      setChargement(true);
      const [{ data: projetsData, error: eProjets }, { data: personnelData, error: ePersonnel }] = await Promise.all([
        supabaseLP.from('projets').select('no, nom, charge, courriel_cp').order('no', { ascending: false }),
        supabaseLP.from('personnel').select('nom, courriel').eq('actif', true).order('nom'),
      ]);
      if (eProjets || ePersonnel) {
        setErreurChargement("Impossible de charger les données. Réessaie dans un instant, ou avertis William si ça persiste.");
        setChargement(false);
        return;
      }
      setProjets(projetsData || []);
      setPersonnel(personnelData || []);
      await chargerGroupe();
      setChargement(false);
    }
    // Résout le groupe "projet" de l'app Liste de personnel en une liste de
    // personnes : les membres de ses départements, plus celles ajoutées à
    // l'unité, dédoublonnées. Si le groupe n'existe pas ou si le schéma n'est
    // pas accessible, on retombe sur l'ancienne liste plutôt que de laisser un
    // menu vide — un surintendant sur un chantier ne doit jamais rester bloqué.
    async function chargerGroupe() {
      try {
        const [resG, resGD, resGP, resP] = await Promise.all([
          supabasePersonnel.from('groupes').select('nom'),
          supabasePersonnel.from('groupe_departements').select('groupe, departement'),
          supabasePersonnel.from('groupe_personnes').select('groupe, personne_id'),
          supabasePersonnel.from('personnes').select('id, nom, courriel, departement, actif'),
        ]);
        if (resG.error || resGD.error || resGP.error || resP.error) { setGroupeIntrouvable(true); return; }

        const cible = (resG.data || []).find(
          (g) => (g.nom || '').trim().toLowerCase() === GROUPE_PERSONNES_ADDITIONNELLES
        );
        if (!cible) { setGroupeIntrouvable(true); return; }

        const depts = (resGD.data || []).filter((x) => x.groupe === cible.nom).map((x) => x.departement);
        const ids = new Set((resGP.data || []).filter((x) => x.groupe === cible.nom).map((x) => x.personne_id));

        const membres = (resP.data || [])
          .filter((p) => p.actif !== false)
          .filter((p) => (p.departement && depts.includes(p.departement)) || ids.has(p.id))
          .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));

        setPersonnesGroupe(membres);
        setGroupeIntrouvable(membres.length === 0);
      } catch (e) {
        setGroupeIntrouvable(true);
      }
    }

    charger();
  }, []);

  function updateField(champ, valeur) {
    setForm((f) => ({ ...f, [champ]: valeur }));
    setErrors((e) => ({ ...e, [champ]: undefined }));
  }

  function toggleTravail(nomTravail) {
    setForm((f) => ({
      ...f,
      travauxEnCours: f.travauxEnCours.includes(nomTravail)
        ? f.travauxEnCours.filter((t) => t !== nomTravail)
        : [...f.travauxEnCours, nomTravail],
    }));
    setErrors((e) => ({ ...e, travauxEnCours: undefined }));
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

  function ajouterMention(type) {
    setForm((f) => ({ ...f, mentions: [...f.mentions, { nom: '', type }] }));
  }
  function updateMention(index, nom) {
    setForm((f) => ({ ...f, mentions: f.mentions.map((m, i) => (i === index ? { ...m, nom } : m)) }));
  }
  function retirerMention(index) {
    setForm((f) => ({ ...f, mentions: f.mentions.filter((_, i) => i !== index) }));
  }

  // La compression se fait dès l'ajout, pas à l'envoi : c'est la seule façon
  // de connaître le poids réel des pièces jointes et de l'afficher au
  // surintendant pendant qu'il peut encore agir dessus. Bonus : au moment de
  // soumettre, il n'y a plus rien à calculer, seulement à téléverser.
  async function ajouterFichiers(fichiers) {
    const tous = Array.from(fichiers);
    const nouveaux = tous.filter((f) => f.size <= TAILLE_MAX_FICHIER);
    const tropGros = tous.length - nouveaux.length;
    if (tropGros > 0) {
      setErreurFichiers(`${tropGros} fichier${tropGros > 1 ? 's dépassent' : ' dépasse'} la limite de 20 Mo.`);
    }
    if (nouveaux.length === 0) return;

    setCompressionEnCours((n) => n + nouveaux.length);
    setErrors((e) => ({ ...e, photoFiles: undefined }));
    for (const original of nouveaux) {
      const compressee = await compresserImage(original);
      setForm((f) => ({ ...f, photoFiles: [...f.photoFiles, { original, compressee }] }));
      setCompressionEnCours((n) => n - 1);
    }
  }
  function retirerFichier(index) {
    setForm((f) => ({ ...f, photoFiles: f.photoFiles.filter((_, i) => i !== index) }));
  }

  // Menu "Aviser des personnes additionnelles" : le groupe de l'app Liste de
  // personnel. Repli sur l'ancienne liste si le groupe est introuvable.
  const optionsAviser = (!groupeIntrouvable && personnesGroupe.length > 0) ? personnesGroupe : personnel;

  // Le courriel d'une personne avisée se cherche d'abord dans le groupe, puis
  // dans l'ancienne liste : une visite enregistrée avant le branchement peut
  // contenir un nom qui ne figure que là.
  function courrielDe(nom) {
    return optionsAviser.find((x) => x.nom === nom)?.courriel
      || personnel.find((x) => x.nom === nom)?.courriel
      || null;
  }

  const surintendantSelectionne = SURINTENDANTS.find((s) => s.nom === form.surintendantNom);
  const projetSelectionneTexte = form.projetNo; // texte libre "No — Nom" ou juste un texte
  const projetTrouve = projets.find((p) => projetSelectionneTexte.startsWith(`${p.no} —`));

  // Qui recevra le courriel, recalculé à chaque frappe pour que le
  // surintendant le voie avant d'envoyer. Même logique de dédoublonnage que
  // dans pages/api/visite-surintendant/notifier.js.
  function calculerDestinataires() {
    const brut = [];
    if (surintendantSelectionne) {
      brut.push({ nom: surintendantSelectionne.nom, email: surintendantSelectionne.courriel, raison: 'surintendant' });
    }
    if (projetTrouve?.courriel_cp) {
      brut.push({ nom: projetTrouve.charge || projetTrouve.courriel_cp, email: projetTrouve.courriel_cp, raison: 'chargé de projet' });
    }
    form.personnesAdditionnelles.filter(Boolean).forEach((nomP) => {
      const courriel = courrielDe(nomP);
      if (courriel) brut.push({ nom: nomP, email: courriel, raison: 'avisé' });
    });
    form.mentions.filter((m) => m.nom).forEach((m) => {
      const p = personnel.find((x) => x.nom === m.nom);
      if (p?.courriel) brut.push({
        nom: p.nom, email: p.courriel,
        raison: m.type === 'info' ? 'mention · à lire' : 'mention · réponse requise',
        couleur: MENTIONS[m.type].couleur,
      });
    });
    DESTINATAIRES_FIXES.forEach((d) => brut.push({ nom: d.nom, email: d.email, raison: 'fixe', fixe: true }));

    const vus = new Set();
    return brut.filter((d) => {
      const cle = (d.email || '').trim().toLowerCase();
      if (!cle || vus.has(cle)) return false;
      vus.add(cle);
      return true;
    });
  }

  const destinataires = calculerDestinataires();

  // Même accumulation séquentielle que le serveur : les photos sont jointes
  // dans l'ordre jusqu'à épuisement du budget, donc la jauge et les mentions
  // "non jointe" reflètent exactement ce qui va réellement partir.
  let cumul = 0;
  const photosAvecEtat = form.photoFiles.map(({ original, compressee }) => {
    const taille = compressee.size;
    const rentre = cumul + taille <= BUDGET_PIECES_JOINTES;
    if (rentre) cumul += taille;
    return { original, compressee, taille, jointe: rentre };
  });
  const totalJoint = cumul;
  const pourcentage = Math.min(100, Math.round((totalJoint / BUDGET_PIECES_JOINTES) * 100));
  const nbNonJointes = photosAvecEtat.filter((p) => !p.jointe).length;
  const couleurJauge = nbNonJointes > 0 ? BRAND_RED : (pourcentage >= 75 ? ORANGE_AVIS : '#2E9F58');

  function validate() {
    const errs = {};
    if (!form.surintendantNom) errs.surintendantNom = 'Requis';
    if (!form.projetNo.trim()) errs.projetNo = 'Requis';
    if (!form.dateVisite) errs.dateVisite = 'Requis';
    if (!form.heureVisite) errs.heureVisite = 'Requis';
    if (form.travauxEnCours.length === 0 && !form.travauxAutre.trim()) errs.travauxEnCours = 'Choisis au moins un type de travaux, ou précise "Autre".';
    if (form.photoFiles.length === 0) errs.photoFiles = 'Au moins une photo est requise.';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit() {
    if (!validate() || envoiEnCours) return;
    setEnvoiEnCours(true);
    setErreurNotification('');
    setErreurFichiers('');

    const payload = {
      surintendant_nom: form.surintendantNom,
      surintendant_courriel: surintendantSelectionne?.courriel || '',
      projet_no: projetTrouve?.no || null,
      projet_nom: projetTrouve?.nom || form.projetNo,
      charge_projet_nom: projetTrouve?.charge || null,
      charge_projet_courriel: projetTrouve?.courriel_cp || null,
      date_visite: form.dateVisite,
      heure_visite: form.heureVisite,
      travaux_en_cours: form.travauxEnCours,
      travaux_autre: form.travauxAutre || null,
      details_activites_en_cours: form.detailsActivitesEnCours || null,
      activites_a_venir: form.activitesAVenir || null,
      infos_speciales_charge_projet: form.infosSpecialesChargeProjet || null,
    };

    const { data: visite, error } = await supabaseVS.from('visites').insert(payload).select().single();
    if (error) {
      setEnvoiEnCours(false);
      setErrors({ general: "Impossible de soumettre la visite. Réessaie dans un instant." });
      return;
    }

    const personnesValides = form.personnesAdditionnelles.filter(Boolean);
    if (personnesValides.length > 0) {
      await supabaseVS.from('visite_personnes').insert(
        personnesValides.map((nomP) => (
          { visite_id: visite.id, nom: nomP, courriel: courrielDe(nomP) }
        ))
      );
    }

    // Mentions importantes — chaque personne mentionnée génère son propre
    // bandeau orange dans le courriel, et devient destinataire même si elle
    // n'a pas été ajoutée dans "Aviser des personnes additionnelles".
    const vues = new Set();
    const mentionsValides = form.mentions.filter((m) => {
      if (!m.nom) return false;
      const cle = `${m.type}|${m.nom}`;
      if (vues.has(cle)) return false;
      vues.add(cle);
      return true;
    });
    if (mentionsValides.length > 0) {
      await supabaseVS.from('visite_mentions').insert(
        mentionsValides.map((m) => {
          const p = personnel.find((x) => x.nom === m.nom);
          return { visite_id: visite.id, nom: m.nom, courriel: p?.courriel || null, type: m.type };
        })
      );
    }

    if (form.photoFiles.length > 0) {
      // Deux copies par photo : l'originale pleine résolution est archivée
      // dans "originaux/", et une version allégée part en pièce jointe
      // depuis "courriel/". Le notifier ne lit que "courriel/".
      const resultats = await Promise.all(form.photoFiles.map(async ({ original, compressee }) => {
        const { error: eOriginal } = await supabaseVS.storage
          .from(BUCKET_FICHIERS)
          .upload(`${visite.numero}/originaux/${sanitizeNomFichier(original.name)}`, original, {
            upsert: true, contentType: original.type || undefined,
          });
        if (eOriginal) console.error('Erreur téléversement original:', original.name, eOriginal); // eslint-disable-line no-console

        const { error: eCourriel } = await supabaseVS.storage
          .from(BUCKET_FICHIERS)
          .upload(`${visite.numero}/courriel/${sanitizeNomFichier(compressee.name)}`, compressee, {
            upsert: true, contentType: compressee.type || undefined,
          });
        if (eCourriel) console.error('Erreur téléversement copie courriel:', original.name, eCourriel); // eslint-disable-line no-console

        return (eOriginal || eCourriel) ? null : true;
      }));
      if (resultats.filter(Boolean).length < form.photoFiles.length) {
        setErreurFichiers("La visite est enregistrée, mais une ou plusieurs photos n'ont pas pu être téléversées.");
      }
    }

    setEnvoiEnCours(false);
    setConfirmation({ numero: visite.numero, projetNom: payload.projet_nom, destinataires });
    setForm(creerFormulaireInitial());

    try {
      const reponse = await fetch('/api/visite-surintendant/notifier/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ numero: visite.numero }),
      });
      if (!reponse.ok) {
        setErreurNotification("La visite est enregistrée, mais l'envoi du courriel de notification a échoué.");
      }
    } catch (e) {
      setErreurNotification("La visite est enregistrée, mais l'envoi du courriel de notification a échoué.");
    }
  }

  const styleCase = {
    display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5,
    padding: '9px 12px', background: th.inputBg, border: `1px solid ${th.line}`,
    borderRadius: 4, cursor: 'pointer', color: th.text,
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: th.bg,
      fontFamily: "Calibri, 'Segoe UI', Candara, Optima, Arial, sans-serif",
      color: th.text,
      transition: 'background 0.2s ease, color 0.2s ease',
    }}>
      <EnTeteApp
        titre="Visite surintendant"
        sousTitre="Rapport de visite de chantier"
        mode={mode}
        onChangerMode={setMode}
        nom={nom}
        poste={poste}
      />

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 16px 40px' }}>

        {erreurChargement && (
          <div style={{
            background: th.panel, border: `1px solid ${BRAND_RED}`, borderRadius: 6,
            padding: 14, marginBottom: 20, color: BRAND_RED, fontSize: 13.5,
          }}>
            {erreurChargement}
          </div>
        )}

        {confirmation && (
          <div style={{
            background: th.panel, border: '1px solid #2E9F58', borderRadius: 6,
            padding: 16, marginBottom: 20, display: 'flex', gap: 12, alignItems: 'flex-start',
          }}>
            <CheckCircle2 size={20} color="#2E9F58" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 14.5 }}>Visite #{confirmation.numero} enregistrée !</div>
              <div style={{ fontSize: 13, color: th.textDim, marginTop: 2 }}>{confirmation.projetNom}</div>
              {confirmation.destinataires?.length > 0 && (
                <div style={{ marginTop: 10, fontSize: 12.5, color: th.textDim, lineHeight: 1.6 }}>
                  Courriel envoyé à : {confirmation.destinataires.map((d) => d.nom).join(', ')}
                </div>
              )}
              {erreurNotification && <div style={{ color: BRAND_RED, fontSize: 13, marginTop: 6 }}>{erreurNotification}</div>}
              {erreurFichiers && <div style={{ color: BRAND_RED, fontSize: 13, marginTop: 6 }}>{erreurFichiers}</div>}
            </div>
          </div>
        )}

        {chargement ? (
          <div style={{
            background: th.panel, border: `1px solid ${th.line}`, borderRadius: 6,
            padding: 24, color: th.textDim, fontSize: 13.5,
          }}>
            Chargement…
          </div>
        ) : (
          <div style={{ background: th.panel, border: `1px solid ${th.line}`, borderRadius: 6, padding: 24 }}>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <Field th={th} label="Date de la visite" error={errors.dateVisite}>
                  <ChampTemps type="date" value={form.dateVisite} onChange={(v) => updateField('dateVisite', v)} th={th} error={errors.dateVisite} />
                </Field>
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <Field th={th} label="Heure de la visite" error={errors.heureVisite}>
                  <ChampTemps type="time" value={form.heureVisite} onChange={(v) => updateField('heureVisite', v)} th={th} error={errors.heureVisite} />
                </Field>
              </div>
            </div>

            <Field th={th} label="Votre nom" error={errors.surintendantNom}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
                {SURINTENDANTS.map((s) => (
                  <label key={s.nom} style={{
                    ...styleCase,
                    borderColor: form.surintendantNom === s.nom ? BRAND_RED : th.line,
                    background: form.surintendantNom === s.nom ? `${BRAND_RED}18` : th.inputBg,
                  }}>
                    <input type="radio" checked={form.surintendantNom === s.nom} onChange={() => updateField('surintendantNom', s.nom)} style={{ accentColor: BRAND_RED }} />
                    {s.nom}
                  </label>
                ))}
              </div>
            </Field>

            <Field th={th} label="Projet" error={errors.projetNo}>
              <SelecteurProjet value={form.projetNo} projets={projets} onChange={(v) => updateField('projetNo', v)} th={th} error={errors.projetNo} />
            </Field>

            {projetTrouve && (
              <div style={{
                background: th.inputBg, border: `1px solid ${th.line}`, borderRadius: 4,
                padding: '10px 14px', marginBottom: 16, fontSize: 12.5, color: th.textDim,
              }}>
                Chargé de projet : <strong style={{ color: th.text }}>{projetTrouve.charge || '—'}</strong>
                {projetTrouve.courriel_cp ? ` (${projetTrouve.courriel_cp})` : ''}
              </div>
            )}

            <Field th={th} label="Aviser des personnes additionnelles">
              {groupeIntrouvable && (
                <div style={{ fontSize: 12, color: ORANGE_AVIS, marginBottom: 8 }}>
                  Le groupe « Projets » n&apos;a pas pu être chargé — la liste complète du personnel est affichée à la place.
                </div>
              )}
              {form.personnesAdditionnelles.map((nomP, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                  <select value={nomP} onChange={(e) => updatePersonne(i, e.target.value)} style={champStyle(th)}>
                    <option value="">— Choisir une personne —</option>
                    {optionsAviser.map((p) => <option key={p.nom} value={p.nom}>{p.nom}</option>)}
                  </select>
                  <button type="button" onClick={() => retirerPersonne(i)} title="Retirer"
                    style={{
                      background: 'transparent', border: 'none', color: BRAND_RED, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', padding: '0 6px',
                    }}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              <button type="button" onClick={ajouterPersonne}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, background: 'transparent',
                  border: `1px solid ${th.line}`, color: th.text, padding: '7px 14px', borderRadius: 6,
                  fontSize: 12.5, fontWeight: 600, cursor: 'pointer', marginTop: 2, fontFamily: 'inherit',
                }}>
                <Plus size={13} /> Ajouter une personne
              </button>
            </Field>

            <Field th={th} label="Travaux en cours" error={errors.travauxEnCours}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
                {TRAVAUX_EN_COURS_OPTIONS.map((t) => (
                  <label key={t} style={{
                    ...styleCase,
                    borderColor: form.travauxEnCours.includes(t) ? BRAND_RED : th.line,
                    background: form.travauxEnCours.includes(t) ? `${BRAND_RED}18` : th.inputBg,
                  }}>
                    <input type="checkbox" checked={form.travauxEnCours.includes(t)} onChange={() => toggleTravail(t)} style={{ accentColor: BRAND_RED }} />
                    {t}
                  </label>
                ))}
              </div>
              <input
                type="text" placeholder="Autre — précise au besoin" value={form.travauxAutre}
                onChange={(e) => { updateField('travauxAutre', e.target.value); setErrors((er) => ({ ...er, travauxEnCours: undefined })); }}
                style={{ ...champStyle(th), marginTop: 8 }}
              />
            </Field>

            <Field th={th} label="Détails activités en cours">
              <textarea value={form.detailsActivitesEnCours} onChange={(e) => updateField('detailsActivitesEnCours', e.target.value)} rows={3}
                style={{ ...champStyle(th), resize: 'vertical' }} />
            </Field>

            <Field th={th} label="Activités à venir">
              <textarea value={form.activitesAVenir} onChange={(e) => updateField('activitesAVenir', e.target.value)} rows={3}
                style={{ ...champStyle(th), resize: 'vertical' }} />
            </Field>

            <Field th={th} label="Informations spéciales pour chargé de projet">
              <textarea value={form.infosSpecialesChargeProjet} onChange={(e) => updateField('infosSpecialesChargeProjet', e.target.value)} rows={3}
                style={{ ...champStyle(th), resize: 'vertical' }} />
            </Field>

            <Field th={th} label="Mentions importantes">
              <div style={{ fontSize: 12, color: th.textDim, marginBottom: 8 }}>
                Chaque personne choisie reçoit le courriel et apparaît dans son propre bandeau orange, en haut du message.
              </div>
              {form.mentions.map((m, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                  <span style={{
                    fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, whiteSpace: 'nowrap',
                    color: MENTIONS[m.type].couleur, border: `1px solid ${MENTIONS[m.type].couleur}`,
                    background: MENTIONS[m.type].fond(th),
                    borderRadius: 4, padding: '5px 9px', flexShrink: 0,
                  }}>
                    {MENTIONS[m.type].libelle}
                  </span>
                  <select value={m.nom} onChange={(e) => updateMention(i, e.target.value)}
                    style={{ ...champStyle(th), borderColor: m.nom ? MENTIONS[m.type].couleur : th.line, background: m.nom ? MENTIONS[m.type].fond(th) : th.inputBg }}>
                    <option value="">— Choisir une personne —</option>
                    {personnel.map((p) => <option key={p.nom} value={p.nom}>{p.nom}</option>)}
                  </select>
                  <button type="button" onClick={() => retirerMention(i)} title="Retirer"
                    style={{
                      background: 'transparent', border: 'none', color: BRAND_RED, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', padding: '0 6px',
                    }}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
                {[
                  { type: 'reponse', texte: 'Ajouter une mention : réponse requise', Icon: AlertTriangle },
                  { type: 'info', texte: 'Ajouter une mention : lire information importante', Icon: Info },
                ].map(({ type, texte, Icon }) => (
                  <button key={type} type="button" onClick={() => ajouterMention(type)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, background: 'transparent',
                      border: `1px solid ${MENTIONS[type].couleur}`, color: th.text, padding: '7px 14px', borderRadius: 6,
                      fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                    }}>
                    <Icon size={13} color={MENTIONS[type].couleur} /> {texte}
                  </button>
                ))}
              </div>
            </Field>

            <Field th={th} label="Photos" error={errors.photoFiles}>
              <div
                style={{
                  border: `1px dashed ${errors.photoFiles ? BRAND_RED : th.line}`, borderRadius: 4,
                  background: th.inputBg, padding: 18, textAlign: 'center', cursor: 'pointer',
                }}
                onClick={() => document.getElementById('input-fichiers-vs').click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); ajouterFichiers(e.dataTransfer.files); }}
              >
                <Upload size={20} color={th.textDim} style={{ marginBottom: 6 }} />
                <div style={{ fontSize: 12.5, color: th.textDim }}>Téléverser ou faites glisser les photos ici (max 20 Mo chacune)</div>
                <input id="input-fichiers-vs" type="file" multiple accept="image/*" style={{ display: 'none' }} onChange={(e) => ajouterFichiers(e.target.files)} />
              </div>
              {compressionEnCours > 0 && (
                <div style={{ marginTop: 10, fontSize: 12.5, color: th.textDim }}>
                  Préparation de {compressionEnCours} photo{compressionEnCours > 1 ? 's' : ''}…
                </div>
              )}

              {photosAvecEtat.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                    fontSize: 12, marginBottom: 6,
                  }}>
                    <span style={{ color: th.textDim }}>
                      Espace utilisé dans le courriel
                    </span>
                    <span style={{ color: couleurJauge, fontWeight: 600 }}>
                      {formatTaille(totalJoint)} sur {formatTaille(BUDGET_PIECES_JOINTES)}
                    </span>
                  </div>
                  <div style={{ height: 6, background: th.line, borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{
                      width: `${pourcentage}%`, height: '100%', background: couleurJauge,
                      transition: 'width 0.25s ease, background 0.25s ease',
                    }} />
                  </div>
                  {nbNonJointes > 0 && (
                    <div style={{ fontSize: 12, color: BRAND_RED, marginTop: 6 }}>
                      {nbNonJointes} photo{nbNonJointes > 1 ? 's ne seront pas jointes' : ' ne sera pas jointe'} au courriel,
                      faute d&apos;espace. {nbNonJointes > 1 ? 'Elles restent' : 'Elle reste'} conservée{nbNonJointes > 1 ? 's' : ''} avec la visite.
                    </div>
                  )}

                  <div style={{ marginTop: 10 }}>
                    {photosAvecEtat.map((p, i) => (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                        fontSize: 13, padding: '6px 0', borderBottom: `1px solid ${th.line}`,
                        opacity: p.jointe ? 1 : 0.55,
                      }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.original.name}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                          <span style={{ fontSize: 11.5, color: p.jointe ? th.textDim : BRAND_RED }}>
                            {p.jointe ? formatTaille(p.taille) : 'non jointe'}
                          </span>
                          <button type="button" onClick={() => retirerFichier(i)}
                            style={{ background: 'none', border: 'none', color: BRAND_RED, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                            <X size={14} />
                          </button>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Field>

            <div style={{
              background: th.inputBg, border: `1px solid ${th.line}`, borderRadius: 4,
              padding: 16, marginBottom: 18,
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
                fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase', color: th.textDim,
              }}>
                <Users size={14} /> Ce courriel sera envoyé à
              </div>
              {destinataires.length === 0 ? (
                <div style={{ fontSize: 12.5, color: th.textDim }}>
                  Choisis ton nom et un projet pour voir la liste.
                </div>
              ) : (
                <div style={{ fontSize: 13, lineHeight: 1.7 }}>
                  {destinataires.map((d) => (
                    <div key={d.email} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <span>{d.nom} <span style={{ color: th.textDim }}>({d.email})</span></span>
                      <span style={{ fontSize: 10.5, whiteSpace: 'nowrap', color: d.couleur || th.textDim }}>
                        {d.raison}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {errors.general && <div style={{ color: BRAND_RED, fontSize: 13.5, marginBottom: 14 }}>{errors.general}</div>}

            <button
              onClick={handleSubmit}
              disabled={envoiEnCours}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%',
                background: BRAND_RED, color: '#fff', border: 'none', borderRadius: 6,
                padding: '13px 24px', fontFamily: 'inherit', fontWeight: 700, fontSize: 13.5,
                letterSpacing: 0.5, textTransform: 'uppercase',
                cursor: envoiEnCours ? 'default' : 'pointer', opacity: envoiEnCours ? 0.6 : 1,
              }}
            >
              <Send size={16} /> {envoiEnCours ? 'Envoi…' : 'Envoyer la visite'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Page() {
  const [session, setSession] = useState(null);

  if (!session) {
    return <GardeConnexion appSlug="visite-surintendant" nomApp="Visite surintendant" onPret={setSession} />;
  }

  return (
    <VisiteSurintendant
      nom={session.nom}
      poste={session.poste}
      accessToken={session.accessToken}
    />
  );
}

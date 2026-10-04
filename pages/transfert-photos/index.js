import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import GardeConnexion from '../../components/commun/GardeConnexion';
import EnTeteApp from '../../components/commun/EnTeteApp';
import { PALETTES, useModePep } from '../../components/commun/ThemeToolbox';
import {
  Upload, Download, Trash2, Check, AlertTriangle, Clock, Image as ImageIcon,
  Loader2, X, CheckSquare, Square,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// TRANSFERT DE PHOTOS — le casier personnel
//
// Une seule chose : sortir des photos d'un telephone pour les reprendre sur un
// ordinateur, en les allegeant au passage. Ce n'est pas une archive, c'est un
// tuyau — d'ou l'effacement automatique apres 7 jours, affiche sur chaque
// photo pour que personne ne s'y fie comme a un rangement.
//
// Chaque photo est rangee sous l'identifiant de la personne, et les politiques
// du seau n'autorisent la lecture qu'au proprietaire du dossier. Il n'y a
// volontairement AUCUNE politique d'administrateur : un casier est prive, meme
// pour un admin du Toolbox.
//
// La reduction se fait dans le navigateur, avant l'envoi — c'est la seule
// facon de rendre l'envoi rapide sur un lien de chantier, et ca evite de
// stocker des originaux de 4 Mo qu'on effacera dans une semaine.
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const SEAU = 'transfert-photos-fichiers';
const JOURS_CONSERVATION = 7;
const VIGNETTE_MAX = 320;
const THEMES = PALETTES;
const ROUGE = '#c41230';

const TAILLES = [
  { id: 'leger', label: 'Léger', max: 1280, q: 0.80, aide: 'pour un courriel' },
  { id: 'standard', label: 'Standard', max: 1920, q: 0.85, aide: 'recommandé' },
  { id: 'original', label: 'Original', max: 0, q: 1, aide: 'aucune réduction' },
];

// ---------------------------------------------------------------------------
// Petits utilitaires
// ---------------------------------------------------------------------------

function formaterTaille(octets) {
  if (!Number.isFinite(octets)) return '—';
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`;
  return `${(octets / (1024 * 1024)).toFixed(1)} Mo`;
}

function nettoyerNom(nom) {
  return (nom || 'photo')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}

function estHeic(fichier) {
  const t = (fichier.type || '').toLowerCase();
  const n = (fichier.name || '').toLowerCase();
  return t.includes('heic') || t.includes('heif') || n.endsWith('.heic') || n.endsWith('.heif');
}

// Jours entiers restants avant l'effacement automatique.
function joursRestants(creeLe) {
  const t = new Date(creeLe).getTime();
  if (!Number.isFinite(t)) return JOURS_CONSERVATION;
  const limite = t + JOURS_CONSERVATION * 86400000;
  return Math.max(0, Math.ceil((limite - Date.now()) / 86400000));
}

// Redessine l'image a maxDim sur le plus grand cote, en JPEG. Retourne null si
// le navigateur n'arrive pas a lire le fichier (cas typique : un HEIC glisse
// depuis un PC) — l'appelant decide alors quoi faire, plutot que de recevoir
// l'original sans le savoir.
async function redessiner(fichier, maxDim, qualite) {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null;
  try {
    const bitmap = await createImageBitmap(fichier, { imageOrientation: 'from-image' });
    const plusGrand = Math.max(bitmap.width, bitmap.height);
    const ratio = maxDim > 0 ? Math.min(1, maxDim / plusGrand) : 1;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    const ctx = canvas.getContext('2d');
    if (!ctx) { if (bitmap.close) bitmap.close(); return null; }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    if (bitmap.close) bitmap.close();
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', qualite));
    return blob || null;
  } catch (e) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Archive ZIP « stockee » (sans compression). Des JPEG sont deja compresses :
// les recompresser ne gagne rien et couterait plusieurs secondes de calcul sur
// un telephone. Ecrit a la main plutot qu'avec une librairie — ca evite
// d'ajouter une dependance au depot pour 70 lignes.
// ---------------------------------------------------------------------------

const TABLE_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(octets) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < octets.length; i++) c = TABLE_CRC[(c ^ octets[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function ecrire32(vue, pos, val) { vue.setUint32(pos, val >>> 0, true); }
function ecrire16(vue, pos, val) { vue.setUint16(pos, val & 0xFFFF, true); }

// entrees : [{ nom, octets: Uint8Array }]
function construireZip(entrees) {
  const encodeur = new TextEncoder();
  const morceaux = [];
  const central = [];
  let decalage = 0;

  for (const e of entrees) {
    const nomOctets = encodeur.encode(e.nom);
    const somme = crc32(e.octets);
    const taille = e.octets.length;

    const entete = new Uint8Array(30 + nomOctets.length);
    const v = new DataView(entete.buffer);
    ecrire32(v, 0, 0x04034b50);
    ecrire16(v, 4, 20);          // version minimale
    ecrire16(v, 6, 0x0800);      // nom de fichier en UTF-8
    ecrire16(v, 8, 0);           // methode 0 = stocke
    ecrire16(v, 10, 0); ecrire16(v, 12, 0); // heure et date, sans importance ici
    ecrire32(v, 14, somme);
    ecrire32(v, 18, taille);
    ecrire32(v, 22, taille);
    ecrire16(v, 26, nomOctets.length);
    ecrire16(v, 28, 0);
    entete.set(nomOctets, 30);

    morceaux.push(entete, e.octets);

    const fiche = new Uint8Array(46 + nomOctets.length);
    const w = new DataView(fiche.buffer);
    ecrire32(w, 0, 0x02014b50);
    ecrire16(w, 4, 20); ecrire16(w, 6, 20);
    ecrire16(w, 8, 0x0800);
    ecrire16(w, 10, 0);
    ecrire16(w, 12, 0); ecrire16(w, 14, 0);
    ecrire32(w, 16, somme);
    ecrire32(w, 20, taille);
    ecrire32(w, 24, taille);
    ecrire16(w, 28, nomOctets.length);
    ecrire16(w, 30, 0); ecrire16(w, 32, 0); ecrire16(w, 34, 0); ecrire16(w, 36, 0);
    ecrire32(w, 38, 0);
    ecrire32(w, 42, decalage);
    fiche.set(nomOctets, 46);
    central.push(fiche);

    decalage += entete.length + taille;
  }

  let tailleCentral = 0;
  for (const c of central) tailleCentral += c.length;

  const fin = new Uint8Array(22);
  const f = new DataView(fin.buffer);
  ecrire32(f, 0, 0x06054b50);
  ecrire16(f, 4, 0); ecrire16(f, 6, 0);
  ecrire16(f, 8, central.length);
  ecrire16(f, 10, central.length);
  ecrire32(f, 12, tailleCentral);
  ecrire32(f, 16, decalage);
  ecrire16(f, 20, 0);

  return new Blob([...morceaux, ...central, fin], { type: 'application/zip' });
}

function telechargerBlob(blob, nom) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// ---------------------------------------------------------------------------
// L'APP
// ---------------------------------------------------------------------------

function TransfertPhotos({ userId, nom, poste }) {
  const [mode, setMode] = useModePep();
  const th = THEMES[mode];

  const [tailleChoisie, setTailleChoisie] = useState('standard');
  const [enPreparation, setEnPreparation] = useState(0);
  const [file, setFile] = useState([]);          // photos preparees, pas encore envoyees
  const [envoi, setEnvoi] = useState(null);      // { fait, total }
  const [photos, setPhotos] = useState([]);      // casier
  const [vignettes, setVignettes] = useState({});
  const [selection, setSelection] = useState(() => new Set());
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [info, setInfo] = useState('');
  const [zipEnCours, setZipEnCours] = useState(false);
  const [survol, setSurvol] = useState(false);
  const champFichier = useRef(null);

  const prefixe = `${userId}/p`;
  const prefixeV = `${userId}/v`;

  // --- Lecture du casier, avec menage des photos expirees ------------------
  const charger = useCallback(async () => {
    setChargement(true);
    setErreur('');
    try {
      const { data, error } = await sb.storage.from(SEAU).list(prefixe, {
        limit: 300,
        sortBy: { column: 'created_at', order: 'desc' },
      });
      if (error) throw error;

      const fichiers = (data || []).filter((o) => o.id);
      const limite = Date.now() - JOURS_CONSERVATION * 86400000;
      const expirees = fichiers.filter((o) => new Date(o.created_at).getTime() < limite);
      const vivantes = fichiers.filter((o) => new Date(o.created_at).getTime() >= limite);

      // Le menage se fait aussi a l'ouverture, pas seulement par la tache
      // quotidienne : une photo qui a depasse 7 jours ne doit jamais
      // s'afficher, meme si la tache a saute une nuit.
      if (expirees.length > 0) {
        const aEffacer = [];
        expirees.forEach((o) => { aEffacer.push(`${prefixe}/${o.name}`, `${prefixeV}/${o.name}`); });
        await sb.storage.from(SEAU).remove(aEffacer);
      }

      setPhotos(vivantes);
      setSelection(new Set());

      if (vivantes.length > 0) {
        const chemins = vivantes.map((o) => `${prefixeV}/${o.name}`);
        const { data: liens } = await sb.storage.from(SEAU).createSignedUrls(chemins, 3600);
        const table = {};
        (liens || []).forEach((l, i) => { if (l?.signedUrl) table[vivantes[i].name] = l.signedUrl; });
        setVignettes(table);
      } else {
        setVignettes({});
      }
    } catch (e) {
      setErreur(e.message || "Impossible de lire ton casier.");
    } finally {
      setChargement(false);
    }
  }, [prefixe, prefixeV]);

  useEffect(() => { charger(); }, [charger]);

  // --- Preparation : reduction dans le navigateur --------------------------
  async function ajouterFichiers(listeFichiers) {
    const fichiers = Array.from(listeFichiers || []).filter((f) => f.type.startsWith('image/') || estHeic(f));
    if (fichiers.length === 0) return;
    setInfo('');
    setErreur('');
    setEnPreparation((n) => n + fichiers.length);

    const reglage = TAILLES.find((t) => t.id === tailleChoisie) || TAILLES[1];

    for (const original of fichiers) {
      let reduit = null;
      let heicNonLu = false;

      if (reglage.id === 'original') {
        reduit = original;
      } else {
        const blob = await redessiner(original, reglage.max, reglage.q);
        if (blob && blob.size < original.size) {
          reduit = new File([blob], `${original.name.replace(/\.[^.]+$/, '')}.jpg`, { type: 'image/jpeg' });
        } else {
          // Le navigateur n'a pas su lire le fichier, ou la reduction ne
          // gagnait rien : on envoie l'original. Si c'est un HEIC, on le dit,
          // parce qu'un .heic telecharge sur un PC Windows ne s'ouvre pas.
          reduit = original;
          heicNonLu = !blob && estHeic(original);
        }
      }

      const vignetteBlob = await redessiner(reduit, VIGNETTE_MAX, 0.7);

      setFile((f) => [...f, {
        cle: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        nomAffiche: original.name,
        tailleOrigine: original.size,
        fichier: reduit,
        vignette: vignetteBlob,
        apercu: vignetteBlob ? URL.createObjectURL(vignetteBlob) : null,
        heicNonLu,
      }]);
      setEnPreparation((n) => Math.max(0, n - 1));
    }
  }

  function retirerDeLaFile(cle) {
    setFile((f) => {
      const cible = f.find((x) => x.cle === cle);
      if (cible?.apercu) URL.revokeObjectURL(cible.apercu);
      return f.filter((x) => x.cle !== cle);
    });
  }

  // --- Envoi ---------------------------------------------------------------
  async function envoyer() {
    if (file.length === 0) return;
    setEnvoi({ fait: 0, total: file.length });
    setErreur('');
    setInfo('');
    let echecs = 0;

    for (let i = 0; i < file.length; i++) {
      const item = file[i];
      const nomObjet = `${Date.now()}-${i}-${nettoyerNom(item.fichier.name)}`;
      try {
        const { error } = await sb.storage.from(SEAU)
          .upload(`${prefixe}/${nomObjet}`, item.fichier, {
            contentType: item.fichier.type || 'image/jpeg',
            upsert: false,
          });
        if (error) throw error;
        if (item.vignette) {
          await sb.storage.from(SEAU)
            .upload(`${prefixeV}/${nomObjet}`, item.vignette, { contentType: 'image/jpeg', upsert: true });
        }
      } catch (e) {
        echecs++;
      }
      setEnvoi({ fait: i + 1, total: file.length });
    }

    file.forEach((x) => { if (x.apercu) URL.revokeObjectURL(x.apercu); });
    setFile([]);
    setEnvoi(null);
    if (echecs > 0) setErreur(`${echecs} photo(s) n'ont pas pu être envoyées. Vérifie ta connexion et réessaie.`);
    else setInfo('Envoyé. Les photos sont dans ton casier, prêtes à récupérer sur ton ordinateur.');
    await charger();
  }

  // --- Telechargement ------------------------------------------------------
  async function telechargerUne(photo) {
    try {
      const { data, error } = await sb.storage.from(SEAU).createSignedUrl(`${prefixe}/${photo.name}`, 120);
      if (error) throw error;
      const rep = await fetch(data.signedUrl);
      telechargerBlob(await rep.blob(), photo.name);
    } catch (e) {
      setErreur("Le téléchargement a échoué. Réessaie dans un instant.");
    }
  }

  async function telechargerSelection() {
    const choisies = photos.filter((p) => selection.has(p.name));
    if (choisies.length === 0) return;
    if (choisies.length === 1) { await telechargerUne(choisies[0]); return; }
    setZipEnCours(true);
    setErreur('');
    try {
      const chemins = choisies.map((p) => `${prefixe}/${p.name}`);
      const { data: liens, error } = await sb.storage.from(SEAU).createSignedUrls(chemins, 300);
      if (error) throw error;
      const entrees = [];
      for (let i = 0; i < choisies.length; i++) {
        const lien = liens?.[i]?.signedUrl;
        if (!lien) continue;
        const rep = await fetch(lien);
        entrees.push({ nom: choisies[i].name, octets: new Uint8Array(await rep.arrayBuffer()) });
      }
      const jour = new Date().toISOString().slice(0, 10);
      telechargerBlob(construireZip(entrees), `photos-${jour}.zip`);
    } catch (e) {
      setErreur("L'archive n'a pas pu être créée. Essaie avec moins de photos à la fois.");
    } finally {
      setZipEnCours(false);
    }
  }

  async function supprimerSelection() {
    const choisies = photos.filter((p) => selection.has(p.name));
    if (choisies.length === 0) return;
    const aEffacer = [];
    choisies.forEach((p) => { aEffacer.push(`${prefixe}/${p.name}`, `${prefixeV}/${p.name}`); });
    try {
      const { error } = await sb.storage.from(SEAU).remove(aEffacer);
      if (error) throw error;
      setInfo(`${choisies.length} photo(s) supprimée(s).`);
      await charger();
    } catch (e) {
      setErreur("La suppression a échoué.");
    }
  }

  function basculer(nomPhoto) {
    setSelection((s) => {
      const n = new Set(s);
      if (n.has(nomPhoto)) n.delete(nomPhoto); else n.add(nomPhoto);
      return n;
    });
  }

  const toutSelectionne = photos.length > 0 && selection.size === photos.length;
  const poidsAvant = file.reduce((t, f) => t + f.tailleOrigine, 0);
  const poidsApres = file.reduce((t, f) => t + f.fichier.size, 0);

  // --- Styles partages -----------------------------------------------------
  const carte = { background: th.panel, border: `1px solid ${th.line}`, borderRadius: 10, boxShadow: th.ombre };
  const btnPlein = {
    background: ROUGE, color: '#fff', border: 'none', borderRadius: 8, padding: '12px 18px',
    fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8,
  };
  const btnLeger = {
    background: 'transparent', color: th.text, border: `1px solid ${th.line}`, borderRadius: 8,
    padding: '9px 14px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 7,
  };

  return (
    <div style={{ minHeight: '100vh', background: th.bg, color: th.text }}>
      <EnTeteApp
        titre="Transfert de photos"
        sousTitre="Ton casier personnel — 7 jours, puis effacé"
        mode={mode}
        onChangerMode={setMode}
        nom={nom}
        poste={poste}
        onAccueil={() => { window.location.href = '/'; }}
      />

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '22px 16px 60px' }}>

        {/* --- Dépôt ------------------------------------------------------ */}
        <div
          onDragOver={(e) => { e.preventDefault(); setSurvol(true); }}
          onDragLeave={() => setSurvol(false)}
          onDrop={(e) => { e.preventDefault(); setSurvol(false); ajouterFichiers(e.dataTransfer.files); }}
          style={{
            ...carte,
            borderStyle: 'dashed',
            borderWidth: 2,
            borderColor: survol ? ROUGE : th.line,
            padding: '30px 20px',
            textAlign: 'center',
          }}
        >
          <input
            id="champ-photos"
            ref={champFichier}
            type="file"
            multiple
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => { ajouterFichiers(e.target.files); e.target.value = ''; }}
          />
          <button type="button" style={btnPlein} onClick={() => champFichier.current?.click()}>
            <Upload size={17} /> Choisir des photos
          </button>
          <div style={{ color: th.textDim, fontSize: 13.5, marginTop: 12, lineHeight: 1.5 }}>
            Sur un téléphone, ça ouvre directement la pellicule.<br />
            Sur un ordinateur, tu peux aussi les glisser ici.
          </div>
        </div>

        {/* --- Taille ------------------------------------------------------ */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', margin: '16px 0 4px' }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: th.textDim }}>
            Réduction
          </span>
          {TAILLES.map((t) => {
            const actif = t.id === tailleChoisie;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTailleChoisie(t.id)}
                style={{
                  ...btnLeger,
                  padding: '7px 13px',
                  background: actif ? ROUGE : 'transparent',
                  color: actif ? '#fff' : th.text,
                  borderColor: actif ? ROUGE : th.line,
                }}
              >
                {t.label}
                <span style={{ fontSize: 11.5, opacity: 0.75, fontWeight: 500 }}>{t.aide}</span>
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: 12.5, color: th.textDim, marginBottom: 18 }}>
          La réduction se fait dans ton appareil, avant l&rsquo;envoi. Le réglage s&rsquo;applique aux prochaines photos ajoutées.
        </div>

        {/* --- Messages ---------------------------------------------------- */}
        {erreur && (
          <div style={{ background: th.errBg, border: `1px solid ${th.errTexte}`, borderRadius: 8, padding: '12px 14px', color: th.errTexte, fontSize: 14, marginBottom: 16, display: 'flex', gap: 9 }}>
            <AlertTriangle size={17} style={{ flexShrink: 0, marginTop: 1 }} /> <span>{erreur}</span>
          </div>
        )}
        {info && (
          <div style={{ background: th.okBg, border: `1px solid ${th.okLigne}`, borderRadius: 8, padding: '12px 14px', color: th.text, fontSize: 14, marginBottom: 16, display: 'flex', gap: 9 }}>
            <Check size={17} style={{ flexShrink: 0, marginTop: 1, color: th.okLigne }} /> <span>{info}</span>
          </div>
        )}

        {/* --- File d'attente ---------------------------------------------- */}
        {(file.length > 0 || enPreparation > 0) && (
          <div style={{ ...carte, padding: 18, marginBottom: 24 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>
                {file.length} photo{file.length > 1 ? 's' : ''} prête{file.length > 1 ? 's' : ''} à envoyer
              </div>
              {file.length > 0 && (
                <div style={{ fontSize: 13.5, color: th.textDim, fontVariantNumeric: 'tabular-nums' }}>
                  {formaterTaille(poidsAvant)} <span style={{ opacity: 0.6 }}>→</span>{' '}
                  <b style={{ color: th.text }}>{formaterTaille(poidsApres)}</b>
                  {poidsAvant > 0 && poidsApres < poidsAvant && (
                    <span style={{ color: th.okLigne, marginLeft: 8 }}>
                      −{Math.round((1 - poidsApres / poidsAvant) * 100)} %
                    </span>
                  )}
                </div>
              )}
            </div>

            {enPreparation > 0 && (
              <div style={{ fontSize: 13.5, color: th.textDim, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Loader2 size={15} /> Préparation de {enPreparation} photo{enPreparation > 1 ? 's' : ''}…
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))', gap: 10 }}>
              {file.map((f) => (
                <div key={f.cle} style={{ position: 'relative', border: `1px solid ${f.heicNonLu ? th.avisTexte : th.line}`, borderRadius: 8, overflow: 'hidden', background: th.panelAlt }}>
                  {f.apercu
                    ? <img src={f.apercu} alt="" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} />
                    : <div style={{ width: '100%', aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: th.textDim }}><ImageIcon size={22} /></div>}
                  <div style={{ padding: '6px 7px', fontSize: 10.5, color: th.textDim, fontVariantNumeric: 'tabular-nums' }}>
                    {formaterTaille(f.fichier.size)}
                  </div>
                  {f.heicNonLu && (
                    <div style={{ padding: '0 7px 7px', fontSize: 10, color: th.avisTexte, lineHeight: 1.3 }}>
                      HEIC — non réduit
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => retirerDeLaFile(f.cle)}
                    aria-label="Retirer"
                    style={{ position: 'absolute', top: 5, right: 5, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: 6, width: 24, height: 24, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>

            {file.some((f) => f.heicNonLu) && (
              <div style={{ background: th.avisBg, border: `1px solid ${th.avisTexte}`, borderRadius: 8, padding: '11px 13px', color: th.avisTexte, fontSize: 13, marginTop: 14, lineHeight: 1.5 }}>
                Certaines photos sont en format <b>HEIC</b> et n&rsquo;ont pas pu être réduites. Elles s&rsquo;enverront quand même,
                mais risquent de ne pas s&rsquo;ouvrir sur un PC Windows. Pour l&rsquo;éviter sur un iPhone :
                Réglages → Appareil photo → Formats → <b>Le plus compatible</b>.
              </div>
            )}

            <div style={{ marginTop: 16 }}>
              <button type="button" style={{ ...btnPlein, opacity: envoi ? 0.6 : 1, cursor: envoi ? 'default' : 'pointer' }} disabled={!!envoi} onClick={envoyer}>
                <Upload size={17} />
                {envoi ? `Envoi ${envoi.fait} / ${envoi.total}…` : `Envoyer ${file.length} photo${file.length > 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        )}

        {/* --- Le casier ---------------------------------------------------- */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>
            Mon casier {photos.length > 0 && <span style={{ color: th.textDim, fontWeight: 500 }}>· {photos.length}</span>}
          </h2>
          {photos.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button type="button" style={btnLeger} onClick={() => setSelection(toutSelectionne ? new Set() : new Set(photos.map((p) => p.name)))}>
                {toutSelectionne ? <Square size={15} /> : <CheckSquare size={15} />}
                {toutSelectionne ? 'Tout décocher' : 'Tout cocher'}
              </button>
              <button
                type="button"
                style={{ ...btnLeger, opacity: selection.size === 0 || zipEnCours ? 0.5 : 1 }}
                disabled={selection.size === 0 || zipEnCours}
                onClick={telechargerSelection}
              >
                <Download size={15} />
                {zipEnCours ? 'Préparation…' : `Télécharger${selection.size > 1 ? ` (${selection.size}) en .zip` : selection.size === 1 ? '' : ''}`}
              </button>
              <button
                type="button"
                style={{ ...btnLeger, color: selection.size ? th.errTexte : th.textDim, borderColor: selection.size ? th.errTexte : th.line, opacity: selection.size === 0 ? 0.5 : 1 }}
                disabled={selection.size === 0}
                onClick={supprimerSelection}
              >
                <Trash2 size={15} /> Supprimer
              </button>
            </div>
          )}
        </div>

        {chargement ? (
          <div style={{ ...carte, padding: 34, textAlign: 'center', color: th.textDim, fontSize: 14 }}>Chargement…</div>
        ) : photos.length === 0 ? (
          <div style={{ ...carte, padding: 34, textAlign: 'center', color: th.textDim, fontSize: 14.5 }}>
            <ImageIcon size={22} style={{ opacity: 0.5, marginBottom: 8 }} />
            <div>Ton casier est vide. Les photos que tu envoies apparaissent ici,<br />et s&rsquo;effacent toutes seules après {JOURS_CONSERVATION} jours.</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
            {photos.map((p) => {
              const choisie = selection.has(p.name);
              const reste = joursRestants(p.created_at);
              return (
                <div
                  key={p.name}
                  style={{
                    ...carte,
                    overflow: 'hidden',
                    borderColor: choisie ? ROUGE : th.line,
                    borderWidth: choisie ? 2 : 1,
                    cursor: 'pointer',
                  }}
                  onClick={() => basculer(p.name)}
                >
                  <div style={{ position: 'relative', background: th.panelAlt }}>
                    {vignettes[p.name]
                      ? <img src={vignettes[p.name]} alt="" loading="lazy" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} />
                      : <div style={{ width: '100%', aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: th.textDim }}><ImageIcon size={24} /></div>}
                    <div style={{ position: 'absolute', top: 7, left: 7, width: 24, height: 24, borderRadius: 6, background: choisie ? ROUGE : 'rgba(0,0,0,0.5)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {choisie ? <Check size={15} /> : <Square size={13} />}
                    </div>
                  </div>
                  <div style={{ padding: '9px 10px 11px' }}>
                    <div style={{ fontSize: 12.5, color: th.textDim, fontVariantNumeric: 'tabular-nums', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span>{formaterTaille(p.metadata?.size)}</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: reste <= 1 ? th.avisTexte : th.textDim }}>
                        <Clock size={12} /> {reste} j
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); telechargerUne(p); }}
                      style={{ ...btnLeger, width: '100%', justifyContent: 'center', marginTop: 9, padding: '7px 10px', fontSize: 12.5 }}
                    >
                      <Download size={14} /> Télécharger
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p style={{ fontSize: 12.5, color: th.textDim, marginTop: 26, lineHeight: 1.6 }}>
          Ton casier est visible par toi seulement — aucun autre compte du Toolbox n&rsquo;y a accès, pas même un administrateur.
          Les photos s&rsquo;effacent automatiquement {JOURS_CONSERVATION} jours après leur envoi : c&rsquo;est un tuyau de transfert, pas un rangement.
        </p>
      </div>
    </div>
  );
}

// ===========================================================================
export default function TransfertPhotosPage() {
  const [session, setSession] = useState(null);

  if (!session) {
    return <GardeConnexion appSlug="transfert-photos" nomApp="Transfert de photos" onPret={setSession} />;
  }

  return <TransfertPhotos userId={session.userId} nom={session.nom} poste={session.poste} />;
}

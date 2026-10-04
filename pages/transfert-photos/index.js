import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import GardeConnexion from '../../components/commun/GardeConnexion';
import EnTeteApp from '../../components/commun/EnTeteApp';
import { PALETTES, useModePep } from '../../components/commun/ThemeToolbox';
import {
  Upload, Download, Trash2, Check, AlertTriangle, Clock, Image as ImageIcon,
  Loader2, X, CheckSquare, Square, ChevronDown, ChevronRight,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// TRANSFERT DE PHOTOS — le casier personnel
//
// Une seule chose : sortir des photos d'un telephone pour les reprendre sur un
// ordinateur. Ce n'est pas une archive, c'est un tuyau — d'ou l'effacement
// automatique apres 7 jours, affiche sur chaque lot.
//
// Chaque lot est range sous l'identifiant de la personne, et la politique du
// seau n'autorise la lecture qu'au proprietaire du dossier. Il n'y a
// volontairement AUCUNE politique d'administrateur : un casier est prive, meme
// pour un admin du Toolbox.
//
// ---- Revision 70 : deux changements demandes par William -------------------
//
// 1. LA REDUCTION SE FAIT AU TELECHARGEMENT, PLUS A L'ENVOI.
//    Avant, on reduisait dans le telephone et l'original n'existait plus : le
//    reglage choisi apres coup ne changeait donc rien. Maintenant l'ORIGINAL
//    monte dans le casier et la reduction se fait au moment ou on telecharge,
//    cote ordinateur. On peut donc essayer Leger, puis Standard, puis
//    l'original, sur les memes photos.
//    Le prix a payer : l'envoi depuis le telephone est plus lourd. C'est le
//    compromis assume pour pouvoir changer d'avis apres.
//
// 2. LE CASIER EST RANGE PAR LOT D'IMPORT.
//    Chaque envoi devient un dossier numerote — 0001, 0002… — avec sa date et
//    son nombre de photos. Le numero vit dans le chemin de stockage, pas dans
//    l'etat de la page : il survit a un rechargement et se lit depuis
//    n'importe quel appareil.
//
// ---- Revision 71 : deux changements demandes par William -------------------
//
// 3. ON VOIT CE QUE LE FORMAT DONNE, EN CHIFFRES.
//    Le gain n'est PAS calcule par une formule : une formule ne sait pas si
//    une photo est deja compressee. On prend jusqu'a trois vraies photos du
//    casier — la plus petite, une moyenne, la plus grosse — on les reduit pour
//    de bon dans le navigateur, et on affiche le rapport MESURE. Tant que la
//    mesure vient de l'echantillon, les chiffres portent un « ~ ». Des qu'un
//    vrai telechargement a eu lieu, son chiffre exact remplace l'estimation et
//    le « ~ » disparait. Si la mesure echoue, on n'affiche rien plutot que
//    d'inventer un pourcentage.
//
// 4. LE CHOIX DE FORMAT EST FIGE EN HAUT (sticky).
//    Il reste visible pendant qu'on descend dans le casier, pour qu'on sache
//    toujours dans quel format part le prochain lot. La phrase d'explication
//    est sortie de la barre : une barre figee doit rester courte sur un
//    telephone.
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const SEAU = 'transfert-photos-fichiers';
const JOURS_CONSERVATION = 7;
const VIGNETTE_MAX = 320;
const THEMES = PALETTES;
const ROUGE = '#c41230';

// Les formats proposes au telechargement. « max: 0 » = on ne touche a rien.
const FORMATS = [
  { id: 'leger', label: 'Léger', max: 1280, q: 0.80, aide: 'pour un courriel' },
  { id: 'standard', label: 'Standard', max: 1920, q: 0.85, aide: 'recommandé' },
  { id: 'original', label: 'Original', max: 0, q: 1, aide: 'tel quel' },
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

function joursRestants(creeLe) {
  const t = new Date(creeLe).getTime();
  if (!Number.isFinite(t)) return JOURS_CONSERVATION;
  const limite = t + JOURS_CONSERVATION * 86400000;
  return Math.max(0, Math.ceil((limite - Date.now()) / 86400000));
}

function dateLongue(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Redessine une image a maxDim sur le plus grand cote, en JPEG. Retourne null
// si le navigateur n'arrive pas a lire le fichier (cas typique : un HEIC) —
// l'appelant decide alors quoi faire, plutot que de recevoir l'original sans
// le savoir.
async function redessiner(source, maxDim, qualite) {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null;
  try {
    const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' });
    const plusGrand = Math.max(bitmap.width, bitmap.height);
    const ratio = maxDim > 0 ? Math.min(1, maxDim / plusGrand) : 1;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    const ctx = canvas.getContext('2d');
    if (!ctx) { if (bitmap.close) bitmap.close(); return null; }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    if (bitmap.close) bitmap.close();
    return await new Promise((r) => canvas.toBlob(r, 'image/jpeg', qualite));
  } catch (e) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Archive ZIP « stockee » (sans compression). Des JPEG sont deja compresses :
// les recompresser ne gagne rien. Ecrit a la main plutot qu'avec une
// librairie — ca evite d'ajouter une dependance au depot pour 70 lignes.
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
    ecrire16(v, 4, 20);
    ecrire16(v, 6, 0x0800);      // nom de fichier en UTF-8
    ecrire16(v, 8, 0);           // methode 0 = stocke
    ecrire16(v, 10, 0); ecrire16(v, 12, 0);
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

  const [format, setFormat] = useState('standard');
  const [enPreparation, setEnPreparation] = useState(0);
  const [file, setFile] = useState([]);          // photos choisies, pas encore envoyees
  const [envoi, setEnvoi] = useState(null);      // { fait, total }
  const [lots, setLots] = useState([]);          // casier, du plus recent au plus ancien
  const [vignettes, setVignettes] = useState({});
  const [replies, setReplies] = useState(() => new Set()); // lots refermes
  const [selection, setSelection] = useState(() => new Set());
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [info, setInfo] = useState('');
  const [travail, setTravail] = useState('');    // texte pendant un telechargement
  const [survol, setSurvol] = useState(false);
  // Ce que chaque format donne vraiment : { leger: { ratio, n, reel } }.
  // « reel: false » = mesure sur un echantillon du casier (affichee avec un ~).
  // « reel: true »  = chiffre d'un vrai telechargement (affiche sans ~).
  const [apercu, setApercu] = useState({});
  const [mesure, setMesure] = useState(false);
  const champFichier = useRef(null);

  const racineP = `${userId}/p`;
  const racineV = `${userId}/v`;

  // --- Lecture du casier, avec menage des lots expires ---------------------
  const charger = useCallback(async () => {
    setChargement(true);
    setErreur('');
    try {
      const { data: dossiers, error } = await sb.storage.from(SEAU).list(racineP, { limit: 200 });
      if (error) throw error;

      // Un dossier n'a pas d'id. On trie a l'envers : le dernier lot en haut.
      const numeros = (dossiers || []).filter((d) => !d.id).map((d) => d.name).sort().reverse();

      const bruts = await Promise.all(numeros.map(async (num) => {
        const { data: fichiers } = await sb.storage.from(SEAU)
          .list(`${racineP}/${num}`, { limit: 500, sortBy: { column: 'name', order: 'asc' } });
        const photos = (fichiers || []).filter((f) => f.id && f.name !== '.emptyFolderPlaceholder');
        return { num, photos };
      }));

      const limite = Date.now() - JOURS_CONSERVATION * 86400000;
      const vivants = [];
      const aEffacer = [];

      for (const lot of bruts) {
        if (lot.photos.length === 0) continue;
        const quand = lot.photos[0].created_at;
        // Le menage se fait aussi a l'ouverture, pas seulement par la tache
        // quotidienne : un lot qui a depasse 7 jours ne doit jamais s'afficher,
        // meme si la tache a saute une nuit.
        if (new Date(quand).getTime() < limite) {
          lot.photos.forEach((p) => {
            aEffacer.push(`${racineP}/${lot.num}/${p.name}`, `${racineV}/${lot.num}/${p.name}`);
          });
          continue;
        }
        vivants.push({
          num: lot.num,
          quand,
          jours: joursRestants(quand),
          photos: lot.photos,
          octets: lot.photos.reduce((t, p) => t + (p.metadata?.size || 0), 0),
        });
      }

      if (aEffacer.length > 0) await sb.storage.from(SEAU).remove(aEffacer);

      setLots(vivants);
      setSelection(new Set());

      const chemins = [];
      vivants.forEach((l) => l.photos.forEach((p) => chemins.push(`${racineV}/${l.num}/${p.name}`)));
      if (chemins.length > 0) {
        const { data: liens } = await sb.storage.from(SEAU).createSignedUrls(chemins, 3600);
        const table = {};
        (liens || []).forEach((lien, i) => { if (lien?.signedUrl) table[chemins[i]] = lien.signedUrl; });
        setVignettes(table);
      } else {
        setVignettes({});
      }
    } catch (e) {
      setErreur(e.message || "Impossible de lire ton casier.");
    } finally {
      setChargement(false);
    }
  }, [racineP, racineV]);

  useEffect(() => { charger(); }, [charger]);

  // --- Choix des photos ----------------------------------------------------
  // On ne touche PAS a l'image ici : c'est l'original qui partira. On ne
  // fabrique que la vignette, pour que la galerie reste legere.
  async function ajouterFichiers(listeFichiers) {
    const fichiers = Array.from(listeFichiers || []).filter((f) => f.type.startsWith('image/') || estHeic(f));
    if (fichiers.length === 0) return;
    setInfo('');
    setErreur('');
    setEnPreparation((n) => n + fichiers.length);

    for (const original of fichiers) {
      const vignetteBlob = await redessiner(original, VIGNETTE_MAX, 0.7);
      setFile((f) => [...f, {
        cle: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        fichier: original,
        vignette: vignetteBlob,
        apercu: vignetteBlob ? URL.createObjectURL(vignetteBlob) : null,
        illisible: !vignetteBlob,
        heic: estHeic(original),
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

  // --- Envoi : un lot numerote --------------------------------------------
  async function envoyer() {
    if (file.length === 0) return;
    setEnvoi({ fait: 0, total: file.length });
    setErreur('');
    setInfo('');

    // Le numero du lot se deduit de ce qui existe deja. Quand le casier est
    // vide, on repart a 0001 — sinon les numeros grimperaient pour toujours
    // alors que rien ne reste plus de sept jours.
    let numero = '0001';
    try {
      const { data: dossiers } = await sb.storage.from(SEAU).list(racineP, { limit: 200 });
      const existants = (dossiers || []).filter((d) => !d.id)
        .map((d) => parseInt(d.name, 10)).filter((n) => Number.isFinite(n));
      if (existants.length > 0) numero = String(Math.max(...existants) + 1).padStart(4, '0');
    } catch (e) { /* casier vide ou illisible : on garde 0001 */ }

    let echecs = 0;
    for (let i = 0; i < file.length; i++) {
      const item = file[i];
      const nomObjet = `${String(i + 1).padStart(3, '0')}-${nettoyerNom(item.fichier.name)}`;
      try {
        const { error } = await sb.storage.from(SEAU)
          .upload(`${racineP}/${numero}/${nomObjet}`, item.fichier, {
            contentType: item.fichier.type || 'image/jpeg',
            upsert: false,
          });
        if (error) throw error;
        if (item.vignette) {
          await sb.storage.from(SEAU)
            .upload(`${racineV}/${numero}/${nomObjet}`, item.vignette, { contentType: 'image/jpeg', upsert: true });
        }
      } catch (e) {
        echecs++;
      }
      setEnvoi({ fait: i + 1, total: file.length });
    }

    file.forEach((x) => { if (x.apercu) URL.revokeObjectURL(x.apercu); });
    setFile([]);
    setEnvoi(null);
    if (echecs > 0) setErreur(`${echecs} photo(s) n'ont pas pu être envoyées. Une photo de plus de 20 Mo est refusée; sinon, vérifie ta connexion et réessaie.`);
    else setInfo(`Lot ${numero} envoyé. Choisis le format, puis récupère-les sur ton ordinateur.`);
    await charger();
  }

  // --- Mesure du format choisi ---------------------------------------------
  // On ne devine pas le gain : le taux de compression depend de la photo, pas
  // d'une regle. On prend jusqu'a trois vraies photos du casier (la plus
  // petite, une moyenne, la plus grosse), on les reduit pour de bon, et on
  // garde le rapport obtenu. Une seule mesure par format, gardee en memoire.
  useEffect(() => {
    if (format === 'original' || apercu[format] || lots.length === 0) return;
    let annule = false;

    (async () => {
      // Petite pause : si on tape Leger puis Standard puis Original, on ne
      // declenche pas trois mesures pour rien.
      await new Promise((r) => setTimeout(r, 400));
      if (annule) return;

      const reglage = FORMATS.find((f) => f.id === format);
      const toutes = [];
      lots.forEach((l) => l.photos.forEach((p) => toutes.push({ lot: l.num, photo: p })));
      toutes.sort((a, b) => (a.photo.metadata?.size || 0) - (b.photo.metadata?.size || 0));
      const indices = Array.from(new Set([0, Math.floor(toutes.length / 2), toutes.length - 1]));

      setMesure(true);
      let avant = 0;
      let apres = 0;
      let n = 0;
      try {
        for (const i of indices) {
          const { lot, photo } = toutes[i];
          const { data, error } = await sb.storage.from(SEAU)
            .createSignedUrl(`${racineP}/${lot}/${photo.name}`, 300);
          if (error || annule) return;
          const brut = await (await fetch(data.signedUrl)).blob();
          if (annule) return;
          const petit = await redessiner(brut, reglage.max, reglage.q);
          if (annule) return;
          avant += brut.size;
          apres += petit && petit.size < brut.size ? petit.size : brut.size;
          n += 1;
        }
      } catch (e) {
        return; // Pas de mesure : on n'affichera aucun chiffre plutot qu'un chiffre invente.
      } finally {
        if (!annule) setMesure(false);
      }
      if (!annule && avant > 0) {
        setApercu((a) => ({ ...a, [format]: { ratio: apres / avant, n, reel: false } }));
      }
    })();

    return () => { annule = true; };
  }, [format, lots, apercu, racineP]);

  // --- Telechargement : c'est ICI que la reduction se fait -----------------
  async function recuperer(cheminComplet, nomFichier) {
    const reglage = FORMATS.find((f) => f.id === format) || FORMATS[1];
    const { data, error } = await sb.storage.from(SEAU).createSignedUrl(cheminComplet, 300);
    if (error) throw error;
    const rep = await fetch(data.signedUrl);
    const brut = await rep.blob();
    if (reglage.id === 'original') return { blob: brut, nom: nomFichier, reduit: false, avant: brut.size };

    const petit = await redessiner(brut, reglage.max, reglage.q);
    // Si le navigateur n'a pas su lire le fichier, ou si la reduction ne gagne
    // rien, on rend l'original — mais on le dit a l'appelant.
    if (!petit || petit.size >= brut.size) return { blob: brut, nom: nomFichier, reduit: false, avant: brut.size };
    return { blob: petit, nom: `${nomFichier.replace(/\.[^.]+$/, '')}.jpg`, reduit: true, avant: brut.size };
  }

  async function telechargerUne(lotNum, photo) {
    setErreur(''); setTravail('Préparation…');
    try {
      const r = await recuperer(`${racineP}/${lotNum}/${photo.name}`, photo.name);
      telechargerBlob(r.blob, r.nom);
      if (!r.reduit && format !== 'original') {
        setInfo("Cette photo n'a pas pu être réduite (format non lisible par le navigateur) — tu as reçu l'original.");
      } else if (r.reduit && r.avant > 0) {
        const pc = Math.round((1 - r.blob.size / r.avant) * 100);
        setInfo(`${photo.name} : ${formaterTaille(r.avant)} → ${formaterTaille(r.blob.size)}, soit ${pc} % de moins.`);
        // Un chiffre vrai vaut mieux qu'une estimation : il la remplace.
        setApercu((a) => ({ ...a, [format]: { ratio: r.blob.size / r.avant, n: 1, reel: true } }));
      }
    } catch (e) {
      setErreur("Le téléchargement a échoué. Réessaie dans un instant.");
    } finally {
      setTravail('');
    }
  }

  async function telechargerPlusieurs(items, nomArchive) {
    if (items.length === 0) return;
    if (items.length === 1) { await telechargerUne(items[0].lot, items[0].photo); return; }
    setErreur(''); setInfo('');
    try {
      const entrees = [];
      let nonReduites = 0;
      let avant = 0;
      let apres = 0;
      for (let i = 0; i < items.length; i++) {
        setTravail(`Préparation ${i + 1} / ${items.length}…`);
        const r = await recuperer(`${racineP}/${items[i].lot}/${items[i].photo.name}`, items[i].photo.name);
        if (!r.reduit && format !== 'original') nonReduites++;
        avant += r.avant;
        apres += r.blob.size;
        entrees.push({ nom: r.nom, octets: new Uint8Array(await r.blob.arrayBuffer()) });
      }
      setTravail('Création de l’archive…');
      const archive = construireZip(entrees);
      telechargerBlob(archive, nomArchive);

      // Le chiffre affiche est celui du fichier qui vient d'atterrir sur le
      // disque — taille de l'archive, pas la somme theorique des photos.
      const messages = [];
      if (format !== 'original' && avant > 0 && archive.size < avant) {
        const pc = Math.round((1 - archive.size / avant) * 100);
        messages.push(`${items.length} photos : ${formaterTaille(avant)} → ${formaterTaille(archive.size)} dans le .zip, soit ${pc} % de moins.`);
        setApercu((a) => ({ ...a, [format]: { ratio: apres / avant, n: items.length, reel: true } }));
      }
      if (nonReduites > 0) {
        messages.push(`${nonReduites} photo(s) n'ont pas pu être réduites (format non lisible par le navigateur) — elles sont dans l'archive en taille originale.`);
      }
      if (messages.length > 0) setInfo(messages.join(' '));
    } catch (e) {
      setErreur("L'archive n'a pas pu être créée. Essaie avec moins de photos à la fois.");
    } finally {
      setTravail('');
    }
  }

  async function supprimer(items) {
    if (items.length === 0) return;
    const aEffacer = [];
    items.forEach(({ lot, photo }) => {
      aEffacer.push(`${racineP}/${lot}/${photo.name}`, `${racineV}/${lot}/${photo.name}`);
    });
    try {
      const { error } = await sb.storage.from(SEAU).remove(aEffacer);
      if (error) throw error;
      setInfo(`${items.length} photo(s) supprimée(s).`);
      await charger();
    } catch (e) {
      setErreur("La suppression a échoué.");
    }
  }

  // --- Selection -----------------------------------------------------------
  function cle(lotNum, photo) { return `${lotNum}/${photo.name}`; }

  function basculer(lotNum, photo) {
    setSelection((s) => {
      const n = new Set(s);
      const k = cle(lotNum, photo);
      if (n.has(k)) n.delete(k); else n.add(k);
      return n;
    });
  }

  function basculerLot(lot) {
    const cles = lot.photos.map((p) => cle(lot.num, p));
    const toutes = cles.every((k) => selection.has(k));
    setSelection((s) => {
      const n = new Set(s);
      cles.forEach((k) => { if (toutes) n.delete(k); else n.add(k); });
      return n;
    });
  }

  const itemsSelectionnes = [];
  lots.forEach((l) => l.photos.forEach((p) => {
    if (selection.has(cle(l.num, p))) itemsSelectionnes.push({ lot: l.num, photo: p });
  }));

  const poidsFile = file.reduce((t, f) => t + f.fichier.size, 0);
  const occupe = () => !!travail || !!envoi;

  // --- Ce qu'on affiche a partir de la mesure ------------------------------
  const infoFormat = apercu[format];
  const ratioFormat = format === 'original' ? 1 : (infoFormat ? infoFormat.ratio : null);
  const chiffreExact = format === 'original' || (infoFormat ? infoFormat.reel : false);
  const pourcentage = ratioFormat == null ? null : Math.round((1 - ratioFormat) * 100);
  const poidsCasier = lots.reduce((t, l) => t + l.octets, 0);
  const poidsSelection = itemsSelectionnes.reduce((t, i) => t + (i.photo.metadata?.size || 0), 0);
  const reglageActif = FORMATS.find((f) => f.id === format) || FORMATS[1];

  // Taille attendue pour un poids donne. Rend null si on n'a rien mesure :
  // mieux vaut ne rien montrer qu'un chiffre sorti de nulle part.
  function texteProjete(octets) {
    if (format === 'original' || ratioFormat == null || !Number.isFinite(octets) || octets <= 0) return null;
    return `${chiffreExact ? '' : '~'}${formaterTaille(Math.round(octets * ratioFormat))}`;
  }

  // Le petit « → 0,8 Mo » rouge accroche a une taille.
  function fleche(octets) {
    const t = texteProjete(octets);
    if (!t) return null;
    return <span style={{ color: ROUGE, fontWeight: 600 }}> → {t}</span>;
  }

  // --- Styles partages -----------------------------------------------------
  const carte = { background: th.panel, border: `1px solid ${th.line}`, borderRadius: 10, boxShadow: th.ombre };
  const btnPlein = {
    background: ROUGE, color: '#fff', border: 'none', borderRadius: 8, padding: '12px 18px',
    fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8,
  };
  const btnLeger = {
    background: 'transparent', color: th.text, border: `1px solid ${th.line}`, borderRadius: 8,
    padding: '8px 13px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
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
          style={{ ...carte, borderStyle: 'dashed', borderWidth: 2, borderColor: survol ? ROUGE : th.line, padding: '30px 20px', textAlign: 'center' }}
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
            Les photos partent en taille originale — tu choisis le format en les récupérant.
          </div>
        </div>

        {/* --- Messages ---------------------------------------------------- */}
        {erreur && (
          <div style={{ background: th.errBg, border: `1px solid ${th.errTexte}`, borderRadius: 8, padding: '12px 14px', color: th.errTexte, fontSize: 14, margin: '16px 0', display: 'flex', gap: 9 }}>
            <AlertTriangle size={17} style={{ flexShrink: 0, marginTop: 1 }} /> <span>{erreur}</span>
          </div>
        )}
        {info && (
          <div style={{ background: th.okBg, border: `1px solid ${th.okLigne}`, borderRadius: 8, padding: '12px 14px', color: th.text, fontSize: 14, margin: '16px 0', display: 'flex', gap: 9 }}>
            <Check size={17} style={{ flexShrink: 0, marginTop: 1, color: th.okLigne }} /> <span>{info}</span>
          </div>
        )}

        {/* --- File d'attente ---------------------------------------------- */}
        {(file.length > 0 || enPreparation > 0) && (
          <div style={{ ...carte, padding: 18, margin: '18px 0 24px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>
                {file.length} photo{file.length > 1 ? 's' : ''} à envoyer
              </div>
              <div style={{ fontSize: 13.5, color: th.textDim, fontVariantNumeric: 'tabular-nums' }}>
                {formaterTaille(poidsFile)}
              </div>
            </div>

            {enPreparation > 0 && (
              <div style={{ fontSize: 13.5, color: th.textDim, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Loader2 size={15} /> Préparation de {enPreparation} photo{enPreparation > 1 ? 's' : ''}…
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))', gap: 10 }}>
              {file.map((f) => (
                <div key={f.cle} style={{ position: 'relative', border: `1px solid ${f.illisible ? th.avisTexte : th.line}`, borderRadius: 8, overflow: 'hidden', background: th.panelAlt }}>
                  {f.apercu
                    ? <img src={f.apercu} alt="" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} />
                    : <div style={{ width: '100%', aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: th.textDim }}><ImageIcon size={22} /></div>}
                  <div style={{ padding: '6px 7px', fontSize: 10.5, color: th.textDim, fontVariantNumeric: 'tabular-nums' }}>
                    {formaterTaille(f.fichier.size)}
                  </div>
                  {f.illisible && (
                    <div style={{ padding: '0 7px 7px', fontSize: 10, color: th.avisTexte, lineHeight: 1.3 }}>
                      {f.heic ? 'HEIC' : 'Format inconnu'}
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

            {file.some((f) => f.illisible) && (
              <div style={{ background: th.avisBg, border: `1px solid ${th.avisTexte}`, borderRadius: 8, padding: '11px 13px', color: th.avisTexte, fontSize: 13, marginTop: 14, lineHeight: 1.5 }}>
                Le navigateur n&rsquo;arrive pas à lire certaines photos — souvent du <b>HEIC</b>. Elles s&rsquo;enverront
                quand même, mais elles ne pourront pas être réduites au téléchargement, et un <code>.heic</code> ne
                s&rsquo;ouvre pas sur un PC Windows. Pour l&rsquo;éviter sur un iPhone :
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

        {/* --- Format de téléchargement — figé en haut ---------------------- */}
        {/* La barre colle au haut de l'écran : en descendant dans le casier,
            on sait toujours dans quel format partira le prochain lot. Elle
            reste volontairement courte — la phrase d'explication est sortie
            en dessous, dans le flux normal. */}
        <div style={{ position: 'sticky', top: 0, zIndex: 30, margin: '18px 0 0', padding: '8px 0', background: th.bg }}>
          <div style={{ ...carte, padding: '12px 14px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: th.textDim, marginRight: 4 }}>
                Format au téléchargement
              </span>
              {FORMATS.map((f) => {
                const actif = f.id === format;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFormat(f.id)}
                    style={{ ...btnLeger, padding: '7px 13px', background: actif ? ROUGE : 'transparent', color: actif ? '#fff' : th.text, borderColor: actif ? ROUGE : th.line }}
                  >
                    {f.label}
                    <span style={{ fontSize: 11.5, opacity: 0.75, fontWeight: 500 }}>{f.aide}</span>
                  </button>
                );
              })}
            </div>

            <div style={{ fontSize: 12.5, color: th.textDim, marginTop: 9, lineHeight: 1.45 }}>
              {format === 'original' ? (
                <>
                  <strong style={{ color: th.text }}>Original : aucune réduction.</strong>{' '}
                  Tu reçois le fichier exactement comme il a été envoyé
                  {poidsCasier > 0 ? <> — <strong style={{ color: th.text }}>{formaterTaille(poidsCasier)}</strong> pour tout le casier</> : null}.
                </>
              ) : mesure ? (
                <><Loader2 size={12} style={{ verticalAlign: -1, marginRight: 5 }} /> Mesure en cours sur de vraies photos du casier…</>
              ) : ratioFormat != null ? (
                <>
                  <strong style={{ color: th.text }}>
                    {reglageActif.label} ({reglageActif.max} px) : {pourcentage} % de moins
                  </strong>
                  {poidsCasier > 0 ? (
                    <> — le casier passerait de {formaterTaille(poidsCasier)} à <span style={{ color: ROUGE, fontWeight: 700 }}>{texteProjete(poidsCasier)}</span>.</>
                  ) : '.'}
                  {' '}
                  <span style={{ opacity: 0.85 }}>
                    {chiffreExact
                      ? `Chiffre exact, relevé sur ${infoFormat.n} photo${infoFormat.n > 1 ? 's' : ''} que tu as déjà téléchargée${infoFormat.n > 1 ? 's' : ''}.`
                      : `Estimation mesurée sur ${infoFormat.n} photo${infoFormat.n > 1 ? 's' : ''} de ton casier — d'où le « ~ ».`}
                  </span>
                </>
              ) : lots.length === 0 ? (
                <>Le gain s&rsquo;affichera ici dès qu&rsquo;il y aura des photos à mesurer.</>
              ) : (
                <>Impossible de mesurer le gain pour l&rsquo;instant — aucun chiffre ne sera inventé.</>
              )}
            </div>
          </div>
        </div>

        <p style={{ fontSize: 12.5, color: th.textDim, margin: '0 0 18px', lineHeight: 1.5 }}>
          Le choix s&rsquo;applique au moment où tu télécharges, pas à l&rsquo;envoi : tes photos restent en taille
          originale dans le casier. Tu peux prendre un lot en Léger, puis le reprendre en Original.
        </p>

        {/* --- Barre de sélection ------------------------------------------- */}
        {itemsSelectionnes.length > 0 && (
          <div style={{ ...carte, padding: '12px 16px', marginBottom: 18, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>
              {itemsSelectionnes.length} photo{itemsSelectionnes.length > 1 ? 's' : ''} cochée{itemsSelectionnes.length > 1 ? 's' : ''}
              {poidsSelection > 0 && (
                <span style={{ fontWeight: 500, color: th.textDim, fontVariantNumeric: 'tabular-nums' }}>
                  {' · '}{formaterTaille(poidsSelection)}{fleche(poidsSelection)}
                </span>
              )}
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button
                type="button"
                style={{ ...btnLeger, opacity: occupe() ? 0.5 : 1 }}
                disabled={occupe()}
                onClick={() => telechargerPlusieurs(itemsSelectionnes, `photos-${new Date().toISOString().slice(0,10)}.zip`)}
              >
                <Download size={15} /> {travail || `Télécharger la sélection${itemsSelectionnes.length > 1 ? ' (.zip)' : ''}`}
              </button>
              <button type="button" style={btnLeger} onClick={() => setSelection(new Set())}>
                <X size={15} /> Tout décocher
              </button>
              <button
                type="button"
                style={{ ...btnLeger, color: th.errTexte, borderColor: th.errTexte }}
                onClick={() => supprimer(itemsSelectionnes)}
              >
                <Trash2 size={15} /> Supprimer
              </button>
            </div>
          </div>
        )}

        {/* --- Le casier, par lot -------------------------------------------- */}
        <h2 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 12px' }}>
          Mon casier {lots.length > 0 && <span style={{ color: th.textDim, fontWeight: 500 }}>· {lots.length} lot{lots.length > 1 ? 's' : ''}</span>}
        </h2>

        {chargement ? (
          <div style={{ ...carte, padding: 34, textAlign: 'center', color: th.textDim, fontSize: 14 }}>Chargement…</div>
        ) : lots.length === 0 ? (
          <div style={{ ...carte, padding: 34, textAlign: 'center', color: th.textDim, fontSize: 14.5 }}>
            <ImageIcon size={22} style={{ opacity: 0.5, marginBottom: 8 }} />
            <div>Ton casier est vide. Chaque envoi forme un lot numéroté,<br />et s&rsquo;efface tout seul après {JOURS_CONSERVATION} jours.</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 16 }}>
            {lots.map((lot) => {
              const ferme = replies.has(lot.num);
              const cles = lot.photos.map((p) => cle(lot.num, p));
              const toutCoche = cles.every((k) => selection.has(k));
              return (
                <div key={lot.num} style={{ ...carte, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between', padding: '13px 15px', background: th.panelAlt, borderBottom: ferme ? 'none' : `1px solid ${th.line}` }}>
                    <button
                      type="button"
                      onClick={() => setReplies((s) => { const n = new Set(s); if (n.has(lot.num)) n.delete(lot.num); else n.add(lot.num); return n; })}
                      style={{ background: 'transparent', border: 'none', color: th.text, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 9, padding: 0, textAlign: 'left', minWidth: 0 }}
                    >
                      {ferme ? <ChevronRight size={17} /> : <ChevronDown size={17} />}
                      <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 15, fontWeight: 700, color: ROUGE }}>{lot.num}</span>
                      <span style={{ fontSize: 14.5, fontWeight: 600 }}>{dateLongue(lot.quand)}</span>
                      <span style={{ fontSize: 13, color: th.textDim, fontVariantNumeric: 'tabular-nums' }}>
                        · {lot.photos.length} photo{lot.photos.length > 1 ? 's' : ''} · {formaterTaille(lot.octets)}{fleche(lot.octets)}
                      </span>
                    </button>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12.5, color: lot.jours <= 1 ? th.avisTexte : th.textDim }}>
                        <Clock size={13} /> expire dans {lot.jours} j
                      </span>
                      <button type="button" style={btnLeger} onClick={() => basculerLot(lot)}>
                        {toutCoche ? <Square size={14} /> : <CheckSquare size={14} />}
                        {toutCoche ? 'Décocher' : 'Cocher'}
                      </button>
                      <button
                        type="button"
                        style={{ ...btnLeger, opacity: occupe() ? 0.5 : 1 }}
                        disabled={occupe()}
                        onClick={() => telechargerPlusieurs(
                          lot.photos.map((p) => ({ lot: lot.num, photo: p })),
                          `lot-${lot.num}-${new Date(lot.quand).toISOString().slice(0,10)}.zip`,
                        )}
                      >
                        <Download size={14} /> Télécharger le lot
                      </button>
                    </div>
                  </div>

                  {!ferme && (
                    <div style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))', gap: 11 }}>
                      {lot.photos.map((p) => {
                        const k = cle(lot.num, p);
                        const choisie = selection.has(k);
                        const url = vignettes[`${racineV}/${lot.num}/${p.name}`];
                        return (
                          <div
                            key={k}
                            onClick={() => basculer(lot.num, p)}
                            style={{ border: `${choisie ? 2 : 1}px solid ${choisie ? ROUGE : th.line}`, borderRadius: 8, overflow: 'hidden', cursor: 'pointer', background: th.panel }}
                          >
                            <div style={{ position: 'relative', background: th.panelAlt }}>
                              {url
                                ? <img src={url} alt="" loading="lazy" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} />
                                : <div style={{ width: '100%', aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: th.textDim }}><ImageIcon size={24} /></div>}
                              <div style={{ position: 'absolute', top: 7, left: 7, width: 24, height: 24, borderRadius: 6, background: choisie ? ROUGE : 'rgba(0,0,0,0.5)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {choisie ? <Check size={15} /> : <Square size={13} />}
                              </div>
                            </div>
                            <div style={{ padding: '8px 9px 10px' }}>
                              <div style={{ fontSize: 12, color: th.textDim, fontVariantNumeric: 'tabular-nums' }}>
                                {formaterTaille(p.metadata?.size)}{fleche(p.metadata?.size)}
                              </div>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); telechargerUne(lot.num, p); }}
                                disabled={occupe()}
                                style={{ ...btnLeger, width: '100%', justifyContent: 'center', marginTop: 8, padding: '6px 9px', fontSize: 12, opacity: occupe() ? 0.5 : 1 }}
                              >
                                <Download size={13} /> Télécharger
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <p style={{ fontSize: 12.5, color: th.textDim, marginTop: 26, lineHeight: 1.6 }}>
          Ton casier est visible par toi seulement — aucun autre compte du Toolbox n&rsquo;y a accès, pas même un administrateur.
          Les lots s&rsquo;effacent automatiquement {JOURS_CONSERVATION} jours après leur envoi : c&rsquo;est un tuyau de transfert, pas un rangement.
          La numérotation repart à 0001 quand le casier est complètement vide.
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

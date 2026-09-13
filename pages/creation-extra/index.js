import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import GardeConnexion from '../../components/commun/GardeConnexion';
import EnTeteApp from '../../components/commun/EnTeteApp';
import { PALETTES, useModePep } from '../../components/commun/ThemeToolbox';
import {
  Plus, Trash2, Save, FileSpreadsheet, FileText, AlertTriangle, CheckCircle2,
  Search, Copy, ListPlus, Info, Type, Table2, ImageIcon, SeparatorHorizontal,
  ChevronUp, ChevronDown, Settings2, Upload,
} from 'lucide-react';
import {
  CATEGORIES, UNITES, TAUX_TPS, TAUX_TVQ,
  analyserNombre, totalLigneCents, enDollars, calculerTotaux,
  formaterArgent, formaterPrixSaisie, ligneEstVide, validerExtra,
  numeroAffiche, projetDuNumero,
  GABARITS, gabaritDe, MORCEAUX_ENTETE, affichageParDefaut, estAffiche,
  TYPES_BLOCS, EMPLACEMENTS, blocsDe, totalTableauCents,
} from '../../lib/extras/calculs';

const PANIER_IMAGES = 'extras-images';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabaseEx = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { db: { schema: 'extras' } });
const supabaseLP = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { db: { schema: 'liste_projets' } });
const supabasePers = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { db: { schema: 'personnel' } });

const THEMES = PALETTES;
const ROUGE = '#c41230';

const ONGLETS = [
  { id: 'liste', libelle: 'Les extras' },
  { id: 'editeur', libelle: 'Extra en cours' },
  { id: 'prix', libelle: 'Liste de prix' },
];

const aujourdhui = () => new Date().toISOString().slice(0, 10);
const nouvelId = () => `l${Date.now()}${Math.random().toString(36).slice(2, 7)}`;

function extraVide(nom, gabarit = 'tm') {
  return {
    id: null,
    numero: '',
    revision: 0,
    gabarit,
    prix_forfaitaire: '',
    affichage: affichageParDefaut(gabarit),
    blocs: [],
    projet_no: '',
    sujet: '',
    description: '',
    date_extra: aujourdhui(),
    destinataire_nom: '',
    destinataire_courriel: '',
    afficher_soumis_par: true,
    soumis_par: nom || '',
    majoration: 0,
    taux_tps: TAUX_TPS,
    taux_tvq: TAUX_TVQ,
    statut: 'brouillon',
  };
}

function ligneVide(categorie) {
  const cat = CATEGORIES.find((c) => c.id === categorie);
  return {
    id: nouvelId(),
    categorie,
    description: '',
    quantite: '',
    unite: cat ? cat.uniteDefaut : 'un',
    prix_unitaire: '',
    note: '',
  };
}

function blocVide(type, emplacement) {
  const base = { id: nouvelId(), type, emplacement: emplacement || 'avant', titre: '' };
  if (type === 'texte') return { ...base, corps: '' };
  if (type === 'image') return { ...base, chemin: '', legende: '', largeur: 'pleine' };
  if (type === 'tableau') {
    return {
      ...base,
      titre: 'Tableau',
      colonnes: [{ libelle: 'Description' }, { libelle: 'Quantité' }, { libelle: 'Montant' }],
      rangees: [['', '', ''], ['', '', '']],
      compteDansTotal: false,
      colonneMontant: 2,
    };
  }
  return base;
}

// ===========================================================================
// L'APP
// ===========================================================================
function CreationExtraApp({ nom, poste }) {
  const [mode, setMode] = useModePep();
  const th = THEMES[mode];

  const [onglet, setOnglet] = useState('liste');
  const [chargement, setChargement] = useState(true);
  const [erreurChargement, setErreurChargement] = useState('');

  const [projets, setProjets] = useState([]);
  const [personnes, setPersonnes] = useState([]);
  const [prix, setPrix] = useState([]);
  const [extras, setExtras] = useState([]);

  // Le document en cours d'edition. Il vit ici, au-dessus des onglets : on
  // peut aller consulter la liste de prix et revenir sans rien perdre.
  const [extra, setExtra] = useState(() => extraVide(nom));
  const [lignes, setLignes] = useState([]);
  const [modifie, setModifie] = useState(false);

  const [message, setMessage] = useState(null);
  const minuterie = useRef(null);
  useEffect(() => () => { if (minuterie.current) clearTimeout(minuterie.current); }, []);

  function afficher(texte, ok) {
    if (minuterie.current) clearTimeout(minuterie.current);
    setMessage({ texte, ok });
    if (ok) minuterie.current = setTimeout(() => setMessage(null), 5000);
  }

  // ---- chargement ---------------------------------------------------------
  const charger = useCallback(async () => {
    setChargement(true);
    setErreurChargement('');
    const [pr, pe, px, ex] = await Promise.all([
      supabaseLP.from('projets').select('no, nom, client, adresse, charge, surintendant, archive')
        .or('archive.is.null,archive.eq.false').order('no', { ascending: false }),
      supabasePers.from('personnes').select('nom, courriel').order('nom'),
      supabaseEx.from('prix_reference').select('*').order('categorie').order('description'),
      supabaseEx.from('extras').select('id, numero, revision, gabarit, projet_no, sujet, date_extra, statut, total_avec_taxes, cree_par, maj_le')
        .order('date_extra', { ascending: false }).order('numero', { ascending: false }).limit(300),
    ]);
    if (px.error || ex.error) {
      setErreurChargement(
        "Impossible de charger les données. Vérifie que le schéma « extras » est exposé dans Supabase, puis réessaie."
      );
      setChargement(false);
      return;
    }
    setProjets(pr.data || []);
    setPersonnes((pe.data || []).filter((p) => p.courriel));
    setPrix(px.data || []);
    setExtras(ex.data || []);
    setChargement(false);
  }, []);

  useEffect(() => { charger(); }, [charger]);

  // ---- edition ------------------------------------------------------------
  function majExtra(champs) {
    setExtra((e) => ({ ...e, ...champs }));
    setModifie(true);
  }
  function majLigne(id, champs) {
    setLignes((ls) => ls.map((l) => (l.id === id ? { ...l, ...champs } : l)));
    setModifie(true);
  }
  function ajouterLigne(categorie, base) {
    setLignes((ls) => [...ls, { ...ligneVide(categorie), ...(base || {}) }]);
    setModifie(true);
  }
  function retirerLigne(id) {
    setLignes((ls) => ls.filter((l) => l.id !== id));
    setModifie(true);
  }

  // ---- les blocs libres ---------------------------------------------------
  function majBlocs(f) {
    setExtra((e) => ({ ...e, blocs: f(e.blocs || []) }));
    setModifie(true);
  }
  function ajouterBloc(type, emplacement) {
    majBlocs((bs) => [...bs, blocVide(type, emplacement)]);
  }
  function majBloc(id, champs) {
    majBlocs((bs) => bs.map((b) => (b.id === id ? { ...b, ...champs } : b)));
  }
  function retirerBloc(id) {
    majBlocs((bs) => bs.filter((b) => b.id !== id));
  }
  // Deplacer un bloc a l'interieur de SON emplacement. Les deux listes
  // (avant / apres) vivent dans le meme tableau : on echange donc avec le
  // voisin qui partage le meme emplacement, pas avec le voisin d'index.
  function deplacerBloc(id, sens) {
    majBlocs((bs) => {
      const i = bs.findIndex((b) => b.id === id);
      if (i < 0) return bs;
      const emp = bs[i].emplacement || 'avant';
      let j = i + sens;
      while (j >= 0 && j < bs.length && (bs[j].emplacement || 'avant') !== emp) j += sens;
      if (j < 0 || j >= bs.length) return bs;
      const copie = [...bs];
      [copie[i], copie[j]] = [copie[j], copie[i]];
      return copie;
    });
  }

  // ---- le gabarit ---------------------------------------------------------
  // Changer de gabarit ne jette RIEN : les lignes, les blocs et le texte
  // restent. Seul ce qui parait au client change. Les cases du haut se
  // reinitialisent aux valeurs du nouveau gabarit — c'est la seule chose
  // qu'on ecrase, et c'est ce que le monde attend en changeant de gabarit.
  function changerGabarit(id) {
    setExtra((e) => ({ ...e, gabarit: id, affichage: affichageParDefaut(id) }));
    setModifie(true);
  }

  // ---- les images ---------------------------------------------------------
  async function televerserImage(fichier, bloc) {
    if (!fichier) return;
    if (fichier.size > 10 * 1024 * 1024) {
      afficher('Cette image dépasse 10 Mo. Réduis-la avant de l’ajouter.', false);
      return;
    }
    const ext = (fichier.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
    const chemin = `${extra.projet_no || 'sans-projet'}/${extra.id || 'brouillon'}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
    setEnCours(true);
    const { error } = await supabaseEx.storage.from(PANIER_IMAGES)
      .upload(chemin, fichier, { upsert: false, contentType: fichier.type || undefined });
    setEnCours(false);
    if (error) { afficher(`L’image n’est pas montée : ${error.message}`, false); return; }
    majBloc(bloc.id, { chemin, nomFichier: fichier.name });
    afficher('Image ajoutée ✓', true);
  }

  // Sert aux exports ET a l'apercu dans l'app.
  const telechargerImage = useCallback(async (chemin) => {
    const { data, error } = await supabaseEx.storage.from(PANIER_IMAGES).download(chemin);
    if (error) throw error;
    return data;
  }, []);

  function nouvelExtra(gabarit = 'tm') {
    if (modifie && typeof window !== 'undefined'
      && !window.confirm("L'extra en cours n'est pas enregistré. Le remplacer par un nouveau ?")) return;
    setExtra(extraVide(nom, gabarit));
    setLignes([]);
    setModifie(false);
    setMessage(null);
    setOnglet('editeur');
  }

  // Retourne true seulement si l'extra a vraiment ete charge. Le duplicateur
  // s'en sert : sans ca, annuler le « tu vas perdre ton brouillon ? » viderait
  // quand meme le numero du document ouvert.
  async function ouvrirExtra(id) {
    if (modifie && typeof window !== 'undefined'
      && !window.confirm("L'extra en cours n'est pas enregistré. L'abandonner ?")) return false;
    const { data, error } = await supabaseEx.from('extras').select('*').eq('id', id).maybeSingle();
    if (error || !data) { afficher("Impossible d'ouvrir cet extra.", false); return false; }
    const { lignes: l, ...entete } = data;
    setExtra({
      ...entete,
      // numeric(6,3) revient de Postgres en « 7.500 ». Tel quel, le champ
      // afficherait 7.500 avec un point. On le remet comme on l'ecrirait.
      majoration: String(analyserNombre(entete.majoration) || 0).replace('.', ','),
      revision: entete.revision ?? 0,
      gabarit: entete.gabarit || 'tm',
      prix_forfaitaire: entete.prix_forfaitaire === null || entete.prix_forfaitaire === undefined
        ? '' : formaterPrixSaisie(entete.prix_forfaitaire),
      affichage: entete.affichage && Object.keys(entete.affichage).length
        ? entete.affichage : affichageParDefaut(entete.gabarit || 'tm'),
      blocs: Array.isArray(entete.blocs)
        ? entete.blocs.map((b) => ({ ...b, id: b.id || nouvelId() })) : [],
      taux_tps: Number(entete.taux_tps),
      taux_tvq: Number(entete.taux_tvq),
    });
    setLignes(Array.isArray(l) ? l.map((x) => ({ ...x, id: x.id || nouvelId() })) : []);
    setModifie(false);
    setMessage(null);
    setOnglet('editeur');
    return true;
  }

  async function dupliquer(id) {
    const ouvert = await ouvrirExtra(id);
    if (!ouvert) return;
    // On garde le contenu, on repart le document a neuf : nouveau numero,
    // nouvelle date. Un extra duplique qui garderait le numero de l'autre
    // ecraserait l'original a la premiere sauvegarde.
    setExtra((e) => ({ ...e, id: null, numero: '', revision: 0, date_extra: aujourdhui(), statut: 'brouillon' }));
    setModifie(true);
    afficher('Copie créée — elle recevra son propre numéro à l’enregistrement.', true);
  }

  const totaux = useMemo(
    () => calculerTotaux(lignes, extra.majoration, { tps: extra.taux_tps, tvq: extra.taux_tvq },
      { blocs: extra.blocs, gabarit: extra.gabarit, prixForfaitaire: extra.prix_forfaitaire }),
    [lignes, extra.majoration, extra.taux_tps, extra.taux_tvq,
     extra.blocs, extra.gabarit, extra.prix_forfaitaire]
  );
  const validation = useMemo(() => validerExtra(extra, lignes), [extra, lignes]);
  const projet = projets.find((p) => p.no === extra.projet_no) || null;

  // ---- enregistrement -----------------------------------------------------
  const [enCours, setEnCours] = useState(false);

  async function enregistrer() {
    if (!validation.valide) {
      afficher('Il reste des choses à corriger avant d’enregistrer.', false);
      return null;
    }
    setEnCours(true);
    let numero = extra.numero;
    // Le numero porte le projet. S'il n'y en a pas encore, ou si quelqu'un a
    // change de projet en cours de route, on en tire un neuf — sinon le
    // document annoncerait un projet dans son entete et un autre dans son
    // numero.
    const numeroNeVaPlus = !!numero && projetDuNumero(numero) !== extra.projet_no;
    if (!numero || numeroNeVaPlus) {
      const { data, error } = await supabaseEx.rpc('prochain_numero', { p_projet: extra.projet_no });
      if (error) {
        setEnCours(false);
        afficher(`Impossible d’obtenir un numéro : ${error.message}`, false);
        return null;
      }
      numero = data;
    }
    const propres = lignes.filter((l) => !ligneEstVide(l));
    const g = gabaritDe(extra.gabarit);
    // Le signe ne sert qu'ici : les montants se saisissent en positif, mais un
    // credit doit s'additionner en negatif dans la liste des extras d'un
    // projet, sinon le net du projet est faux.
    const totalRange = Math.round(totaux.total * g.signe * 100) / 100;
    const charge = {
      numero,
      revision: Math.max(0, Math.round(analyserNombre(extra.revision) || 0)),
      gabarit: g.id,
      prix_forfaitaire: g.id === 'forfait' && analyserNombre(extra.prix_forfaitaire) !== null
        ? analyserNombre(extra.prix_forfaitaire) : null,
      affichage: extra.affichage || {},
      blocs: (extra.blocs || []).map(({ dataUrl, ...b }) => b),
      projet_no: extra.projet_no,
      sujet: extra.sujet.trim(),
      description: extra.description || '',
      date_extra: extra.date_extra,
      destinataire_nom: extra.destinataire_nom || null,
      destinataire_courriel: extra.destinataire_courriel || null,
      afficher_soumis_par: !!extra.afficher_soumis_par,
      soumis_par: extra.afficher_soumis_par ? extra.soumis_par : null,
      lignes: propres,
      majoration: analyserNombre(extra.majoration) || 0,
      taux_tps: extra.taux_tps,
      taux_tvq: extra.taux_tvq,
      total_avec_taxes: totalRange,
      statut: extra.statut || 'brouillon',
      maj_par: nom,
      maj_le: new Date().toISOString(),
    };
    let resultat;
    if (extra.id) {
      resultat = await supabaseEx.from('extras').update(charge).eq('id', extra.id).select().maybeSingle();
    } else {
      resultat = await supabaseEx.from('extras').insert({ ...charge, cree_par: nom }).select().maybeSingle();
    }
    setEnCours(false);
    if (resultat.error) {
      afficher(`Échec, rien n’a été enregistré : ${resultat.error.message}`, false);
      return null;
    }
    const enregistre = resultat.data;
    setExtra((e) => ({ ...e, id: enregistre.id, numero: enregistre.numero }));
    setLignes(propres);
    setModifie(false);
    afficher(
      `${numeroAffiche(enregistre.numero, enregistre.revision)} enregistré ✓`
      + (numeroNeVaPlus ? ' — nouveau numéro, le projet a changé.' : ''),
      true
    );
    charger();
    return { ...extra, id: enregistre.id, numero: enregistre.numero };
  }

  async function supprimer() {
    if (!extra.id) return;
    if (typeof window !== 'undefined'
      && !window.confirm(`Supprimer définitivement ${numeroAffiche(extra.numero, extra.revision)} ?`)) return;
    setEnCours(true);
    const { error } = await supabaseEx.from('extras').delete().eq('id', extra.id);
    setEnCours(false);
    if (error) { afficher(`Échec de la suppression : ${error.message}`, false); return; }
    setExtra(extraVide(nom));
    setLignes([]);
    setModifie(false);
    afficher('Extra supprimé ✓', true);
    charger();
    setOnglet('liste');
  }

  // ---- exports ------------------------------------------------------------
  // On enregistre AVANT d'exporter. Un PDF qui porte un numero mais qui
  // n'existe pas dans la base, c'est un document qu'on ne retrouvera jamais.
  async function exporter(format) {
    if (!validation.valide) {
      afficher('Corrige les points ci-dessous avant d’exporter.', false);
      return;
    }
    let courant = extra;
    if (modifie || !extra.id) {
      const sauve = await enregistrer();
      if (!sauve) return;
      courant = sauve;
    }
    courant = { ...courant, blocs: extra.blocs || [], affichage: extra.affichage || {} };
    setEnCours(true);
    try {
      const mod = await import('../../lib/extras/exports');
      const args = {
        extra: courant, lignes: lignes.filter((l) => !ligneEstVide(l)),
        totaux, projet, telechargerImage,
      };
      const r = format === 'excel' ? await mod.exporterExcel(args) : await mod.exporterPdf(args);
      const manquantes = (r && r.manquantes) || [];
      afficher(
        `Export ${format === 'excel' ? 'Excel' : 'PDF'} téléchargé ✓`
        + (manquantes.length
          ? ` — mais ${manquantes.length} image(s) n’ont pas pu être lues et ne sont pas dans le document : ${manquantes.join(', ')}.`
          : ''),
        manquantes.length === 0
      );
    } catch (e) {
      afficher(`Erreur à l’export : ${e.message}`, false);
    }
    setEnCours(false);
  }

  return (
    <div style={{ minHeight: '100vh', background: th.bg, color: th.text,
      fontFamily: "Calibri, 'Segoe UI', Candara, Optima, Arial, sans-serif" }}>
      <EnTeteApp
        titre="Création d'un extra"
        sousTitre="Frais additionnels — main-d'œuvre, matériaux, sous-traitants"
        mode={mode}
        onChangerMode={setMode}
        nom={nom}
        poste={poste}
        onAccueil={() => setOnglet('liste')}
      />

      <div style={{ maxWidth: 1150, margin: '0 auto', padding: '0 16px 60px' }}>

        <div style={{ display: 'flex', gap: 4, marginBottom: 16, overflowX: 'auto', alignItems: 'center' }}>
          {ONGLETS.map((o) => {
            const actif = onglet === o.id;
            return (
              <button key={o.id} onClick={() => setOnglet(o.id)} style={{
                background: actif ? ROUGE : th.panel,
                color: actif ? '#fff' : th.textDim,
                border: `1px solid ${actif ? ROUGE : th.line}`,
                borderRadius: 5, padding: '9px 15px', fontSize: 13.5, fontWeight: 600,
                cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
              }}>
                {o.libelle}
                {o.id === 'editeur' && modifie ? ' •' : ''}
              </button>
            );
          })}
          <button onClick={nouvelExtra} style={{
            marginLeft: 'auto', background: th.btnBg, color: '#fff', border: 'none', borderRadius: 5,
            padding: '9px 15px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: 'inherit', whiteSpace: 'nowrap',
          }}>
            <Plus size={15} /> Nouvel extra
          </button>
        </div>

        {erreurChargement && (
          <div style={{ background: th.errBg, border: `1px solid ${th.errTexte}`, color: th.errTexte,
            borderRadius: 5, padding: '11px 13px', fontSize: 14, marginBottom: 16 }}>
            {erreurChargement}
          </div>
        )}

        {message && (
          <div style={{
            background: message.ok ? th.okBg : th.errBg,
            border: `1px solid ${message.ok ? th.okLigne : th.errTexte}`,
            color: message.ok ? th.text : th.errTexte,
            borderRadius: 5, padding: '11px 13px', fontSize: 14, marginBottom: 16,
            display: 'flex', alignItems: 'center', gap: 9,
          }}>
            {message.ok ? <CheckCircle2 size={16} style={{ color: th.okLigne, flexShrink: 0 }} />
                        : <AlertTriangle size={16} style={{ flexShrink: 0 }} />}
            <span>{message.texte}</span>
          </div>
        )}

        {chargement ? (
          <div style={{ color: th.textDim, fontSize: 14, padding: 20 }}>Chargement…</div>
        ) : (
          <>
            {onglet === 'liste' && (
              <OngletListe th={th} extras={extras} projets={projets}
                onOuvrir={ouvrirExtra} onDupliquer={dupliquer} onNouveau={nouvelExtra} />
            )}
            {onglet === 'editeur' && (
              <OngletEditeur
                th={th} extra={extra} lignes={lignes} totaux={totaux} validation={validation}
                projets={projets} projet={projet} personnes={personnes} prix={prix}
                majExtra={majExtra} majLigne={majLigne} ajouterLigne={ajouterLigne}
                retirerLigne={retirerLigne} onEnregistrer={enregistrer} onSupprimer={supprimer}
                onExporter={exporter} enCours={enCours} modifie={modifie}
                onVoirPrix={() => setOnglet('prix')}
                changerGabarit={changerGabarit} ajouterBloc={ajouterBloc} majBloc={majBloc}
                retirerBloc={retirerBloc} deplacerBloc={deplacerBloc}
                televerserImage={televerserImage} telechargerImage={telechargerImage} />
            )}
            {onglet === 'prix' && (
              <OngletPrix th={th} prix={prix} nom={nom} recharger={charger} afficher={afficher} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ===========================================================================
// ONGLET 1 — LA LISTE DES EXTRAS
// ===========================================================================
function OngletListe({ th, extras, projets, onOuvrir, onDupliquer, onNouveau }) {
  const [recherche, setRecherche] = useState('');
  const [filtreProjet, setFiltreProjet] = useState('');

  const visibles = extras.filter((e) => {
    if (filtreProjet && e.projet_no !== filtreProjet) return false;
    const q = recherche.trim().toLowerCase();
    if (!q) return true;
    return [numeroAffiche(e.numero, e.revision), e.projet_no, e.sujet, e.cree_par]
      .filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
  });

  const totalVisible = visibles.reduce((s, e) => s + Number(e.total_avec_taxes || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ background: th.panel, border: `1px solid ${th.line}`, borderRadius: 8,
        padding: 14, boxShadow: th.ombre, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 240px' }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: 11, color: th.textDim }} />
          <input value={recherche} onChange={(e) => setRecherche(e.target.value)}
            placeholder="Numéro, projet, sujet…"
            style={{ width: '100%', padding: '9px 11px 9px 32px', fontSize: 14.5, background: th.inputBg,
              color: th.text, border: `1px solid ${th.line}`, borderRadius: 5, fontFamily: 'inherit' }} />
        </div>
        <select value={filtreProjet} onChange={(e) => setFiltreProjet(e.target.value)}
          style={{ flex: '1 1 240px', padding: '9px 11px', fontSize: 14.5, background: th.inputBg,
            color: th.text, border: `1px solid ${th.line}`, borderRadius: 5, fontFamily: 'inherit' }}>
          <option value="">Tous les projets</option>
          {projets.map((p) => <option key={p.no} value={p.no}>{p.no} — {p.nom}</option>)}
        </select>
      </div>

      <div style={{ background: th.panel, border: `1px solid ${th.line}`, borderRadius: 8,
        boxShadow: th.ombre, overflow: 'hidden',
        '--ex-ligne': th.line, '--ex-dim': th.textDim }}>
        <div style={{ padding: '13px 18px', borderBottom: `1px solid ${th.line}`, fontSize: 12,
          fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: th.textDim,
          display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <span>Extras {visibles.length !== extras.length ? `(${visibles.length} de ${extras.length})` : `(${extras.length})`}</span>
          <span>{formaterArgent(totalVisible)} avec taxes</span>
        </div>

        {visibles.length === 0 ? (
          <div style={{ padding: 28, textAlign: 'center', color: th.textDim, fontSize: 14.5 }}>
            <FileText size={22} style={{ opacity: 0.5, marginBottom: 8 }} />
            <div>{extras.length === 0
              ? "Aucun extra pour l'instant."
              : 'Aucun extra ne correspond à cette recherche.'}</div>
            {extras.length === 0 && (
              <button onClick={onNouveau} style={{
                marginTop: 14, background: ROUGE, color: '#fff', border: 'none', borderRadius: 5,
                padding: '10px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              }}>Créer le premier</button>
            )}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="ex-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14.5, minWidth: 700 }}>
              <thead>
                <tr>
                  <Th th={th}>Numéro</Th>
                  <Th th={th}>Projet</Th>
                  <Th th={th}>Sujet</Th>
                  <Th th={th}>Date</Th>
                  <Th th={th} droite>Total avec taxes</Th>
                  <Th th={th}></Th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((e) => (
                  <tr key={e.id} style={{ borderTop: `1px solid ${th.line}` }}>
                    <td data-libelle="Numéro" style={{ padding: '9px 12px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                      <button onClick={() => onOuvrir(e.id)} style={{
                        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                        color: th.lien, fontWeight: 700, fontSize: 14.5, fontFamily: 'inherit',
                        textDecoration: 'underline',
                      }}>{numeroAffiche(e.numero, e.revision)}</button>
                    </td>
                    <td data-libelle="Projet" style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>{e.projet_no || '—'}</td>
                    <td data-libelle="Sujet" className="ex-sujet" style={{ padding: '9px 12px' }}>
                      <div>{e.sujet || '—'}</div>
                      {e.gabarit && e.gabarit !== 'tm' ? (
                        <div style={{ display: 'inline-block', marginTop: 3, fontSize: 11.5,
                          fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase',
                          color: e.gabarit === 'credit' ? th.errTexte : th.textDim,
                          border: `1px solid ${e.gabarit === 'credit' ? th.errTexte : th.line}`,
                          borderRadius: 4, padding: '1px 6px' }}>
                          {gabaritDe(e.gabarit).libelle}
                        </div>
                      ) : null}
                      {e.cree_par ? (
                        <div style={{ fontSize: 12, color: th.textDim, marginTop: 2 }}>par {e.cree_par}</div>
                      ) : null}
                    </td>
                    <td data-libelle="Date" style={{ padding: '9px 12px', whiteSpace: 'nowrap', color: th.textDim }}>{e.date_extra}</td>
                    <td data-libelle="Total avec taxes" style={{ padding: '9px 12px', textAlign: 'right',
                      fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                      color: Number(e.total_avec_taxes) < 0 ? th.errTexte : undefined }}>
                      {formaterArgent(Number(e.total_avec_taxes || 0))}
                    </td>
                    <td className="ex-actions" style={{ padding: '9px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button onClick={() => onDupliquer(e.id)} title="Dupliquer"
                        aria-label={`Dupliquer ${numeroAffiche(e.numero, e.revision)}`} style={{
                          background: 'none', border: 'none', cursor: 'pointer', color: th.textDim,
                          padding: 4, display: 'inline-flex',
                        }}><Copy size={15} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style jsx>{`
        @media (max-width: 720px) {
          :global(.ex-table) { min-width: 0 !important; display: block; }
          :global(.ex-table thead) { display: none; }
          :global(.ex-table tbody), :global(.ex-table tr) { display: block; }
          :global(.ex-table tr) {
            border-top: none !important; border: 1px solid var(--ex-ligne);
            border-radius: 7px; margin: 10px 12px; padding: 4px 0;
          }
          :global(.ex-table td) {
            display: flex; justify-content: space-between; align-items: baseline; gap: 12px;
            text-align: right !important; padding: 5px 12px !important; white-space: normal !important;
          }
          :global(.ex-table td[data-libelle]::before) {
            content: attr(data-libelle); font-size: 11.5px; font-weight: 700; letter-spacing: .05em;
            text-transform: uppercase; color: var(--ex-dim); text-align: left; flex: 0 0 auto;
          }
          :global(.ex-table td.ex-actions) { justify-content: flex-end; }
        }
      `}</style>
    </div>
  );
}

// ===========================================================================
// ONGLET 2 — L'EDITEUR
// ===========================================================================
function OngletEditeur({
  th, extra, lignes, totaux, validation, projets, projet, personnes, prix,
  majExtra, majLigne, ajouterLigne, retirerLigne, onEnregistrer, onSupprimer,
  onExporter, enCours, modifie, onVoirPrix,
  changerGabarit, ajouterBloc, majBloc, retirerBloc, deplacerBloc,
  televerserImage, telechargerImage,
}) {
  const g = gabaritDe(extra.gabarit);
  const [reglagesOuverts, setReglagesOuverts] = useState(false);
  const styleChamp = {
    width: '100%', padding: '9px 11px', fontSize: 14.5, background: th.inputBg, color: th.text,
    border: `1px solid ${th.line}`, borderRadius: 5, fontFamily: 'inherit',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ---------- 0. le gabarit ---------- */}
      <div style={{ background: th.panel, border: `1px solid ${th.line}`, borderRadius: 8,
        padding: 14, boxShadow: th.ombre }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '.06em',
          textTransform: 'uppercase', color: th.textDim, marginBottom: 10 }}>Type d’extra</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(215px, 1fr))', gap: 9 }}>
          {GABARITS.map((x) => {
            const actif = x.id === g.id;
            return (
              <button key={x.id} onClick={() => changerGabarit(x.id)} style={{
                textAlign: 'left', background: actif ? th.infoBg : th.panelAlt,
                border: `2px solid ${actif ? ROUGE : th.line}`, borderRadius: 7,
                padding: '10px 12px', cursor: 'pointer', fontFamily: 'inherit', color: th.text,
              }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 3 }}>{x.libelle}</div>
                <div style={{ fontSize: 12.5, color: th.textDim, lineHeight: 1.4 }}>{x.resume}</div>
              </button>
            );
          })}
        </div>

        <button onClick={() => setReglagesOuverts((v) => !v)} style={{
          marginTop: 12, background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          color: th.lien, fontSize: 13.5, fontFamily: 'inherit', display: 'inline-flex',
          alignItems: 'center', gap: 7, textDecoration: 'underline',
        }}>
          <Settings2 size={15} /> Ce qui paraît sur le document
        </button>

        {reglagesOuverts && (
          <div style={{ marginTop: 11, paddingTop: 11, borderTop: `1px solid ${th.line}` }}>
            <div style={{ fontSize: 13, color: th.textDim, marginBottom: 9 }}>
              Décoche ce que tu ne veux pas voir imprimer. L’information reste enregistrée —
              elle est seulement retirée du PDF et de l’Excel.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(235px, 1fr))', gap: 7 }}>
              {MORCEAUX_ENTETE.map((m) => (
                <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8,
                  fontSize: 14, cursor: 'pointer' }}>
                  <input type="checkbox" checked={estAffiche(extra.affichage, m.id)}
                    onChange={(e) => majExtra({
                      affichage: { ...(extra.affichage || {}), [m.id]: e.target.checked },
                    })}
                    style={{ width: 16, height: 16, cursor: 'pointer' }} />
                  <span>{m.libelle}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ---------- 1. l'entete du document ---------- */}
      <Carte th={th} titre="Le document">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>
          <div>
            <Etiquette th={th} obligatoire>Projet</Etiquette>
            <select value={extra.projet_no} onChange={(e) => majExtra({ projet_no: e.target.value })}
              style={styleChamp}>
              <option value="">— Choisir —</option>
              {projets.map((p) => <option key={p.no} value={p.no}>{p.no} — {p.nom}</option>)}
            </select>
            {projet && (
              <div style={{ marginTop: 6, fontSize: 12.5, color: th.textDim }}>
                {projet.client ? <>Client : <strong style={{ color: th.text }}>{projet.client}</strong></> : null}
                {projet.charge ? <> · Chargé : <strong style={{ color: th.text }}>{projet.charge}</strong></> : null}
              </div>
            )}
          </div>
          <div>
            <Etiquette th={th}>Date</Etiquette>
            <input type="date" value={extra.date_extra || ''}
              onChange={(e) => majExtra({ date_extra: e.target.value })} style={styleChamp} />
          </div>
          <div>
            <Etiquette th={th}>Révision</Etiquette>
            <input value={extra.revision ?? 0}
              onChange={(e) => majExtra({ revision: e.target.value })}
              inputMode="numeric" style={styleChamp} autoComplete="off" />
            <div style={{ marginTop: 6, fontSize: 12.5, color: th.textDim }}>
              0 = l’originale. Monte-la quand tu renvoies l’extra corrigé.
            </div>
          </div>
          <div>
            <Etiquette th={th}>Numéro</Etiquette>
            <div style={{ ...styleChamp, background: th.panelAlt, color: extra.numero ? th.text : th.textDim,
              fontWeight: extra.numero ? 700 : 400, display: 'flex', alignItems: 'center', minHeight: 38 }}>
              {extra.numero
                ? numeroAffiche(extra.numero, extra.revision)
                : 'attribué à l’enregistrement'}
            </div>
            <div style={{ marginTop: 6, fontSize: 12.5,
              color: extra.numero && projetDuNumero(extra.numero) !== extra.projet_no
                ? th.avisTexte : th.textDim }}>
              {extra.numero && projetDuNumero(extra.numero) !== extra.projet_no
                ? 'Le projet a changé — un nouveau numéro sera attribué à l’enregistrement.'
                : (extra.numero
                    ? 'Le rang est celui de cet extra dans le projet; R00 est l’originale.'
                    : 'Format : EX-projet-rang-Rrévision, par exemple EX-24-118-001-R00.')}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <Etiquette th={th} obligatoire>Sujet</Etiquette>
          <input value={extra.sujet} onChange={(e) => majExtra({ sujet: e.target.value })}
            placeholder="Ex. : Excavation supplémentaire — secteur nord"
            style={styleChamp} autoComplete="off" />
        </div>

        {g.id === 'forfait' && (
          <div style={{ marginTop: 12, background: th.infoBg, border: `1px solid ${th.line}`,
            borderRadius: 6, padding: '11px 13px' }}>
            <Etiquette th={th}>Prix forfaitaire soumis (avant taxes)</Etiquette>
            <input value={extra.prix_forfaitaire || ''}
              onChange={(e) => majExtra({ prix_forfaitaire: e.target.value })}
              inputMode="decimal" placeholder="laisse vide pour prendre le coût calculé"
              style={{ ...styleChamp, maxWidth: 260, textAlign: 'right' }} autoComplete="off" />
            <div style={{ marginTop: 7, fontSize: 13, color: th.textDim, lineHeight: 1.5 }}>
              Coût calculé à partir des lignes : <strong style={{ color: th.text }}>
                {formaterArgent(totaux.coutCalcule)}</strong>
              {totaux.forfaitImpose ? (
                <> · écart avec le prix soumis : <strong style={{
                  color: Math.abs(totaux.ecartForfait) < 0.005 ? th.text : th.avisTexte }}>
                  {totaux.ecartForfait > 0 ? '+' : ''}{formaterArgent(totaux.ecartForfait)}</strong></>
              ) : null}
              <br />Le détail des lignes ne s’imprime pas sur le PDF du client — il reste dans
              l’app et dans l’Excel.
            </div>
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          <Etiquette th={th}>Description des travaux</Etiquette>
          <textarea value={extra.description || ''} onChange={(e) => majExtra({ description: e.target.value })}
            rows={3}
            placeholder="Ce qui a été demandé, par qui, et pourquoi ça sort du contrat. C’est ce paragraphe qui justifie l’extra au client."
            style={{ ...styleChamp, resize: 'vertical', lineHeight: 1.5 }} />
        </div>
      </Carte>

      {/* ---------- 2. destinataire et signature ---------- */}
      <Carte th={th} titre="Destinataire et signature">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>
          <div>
            <Etiquette th={th}>À l’attention de (facultatif)</Etiquette>
            <input value={extra.destinataire_nom || ''} list="ex-personnes"
              onChange={(e) => {
                const choisi = personnes.find((p) => p.nom === e.target.value);
                majExtra({
                  destinataire_nom: e.target.value,
                  ...(choisi ? { destinataire_courriel: choisi.courriel } : {}),
                });
              }}
              placeholder="Nom" style={styleChamp} autoComplete="off" />
            <datalist id="ex-personnes">
              {personnes.map((p) => <option key={p.courriel} value={p.nom} />)}
            </datalist>
          </div>
          <div>
            <Etiquette th={th}>Courriel (facultatif)</Etiquette>
            <input value={extra.destinataire_courriel || ''} type="email"
              onChange={(e) => majExtra({ destinataire_courriel: e.target.value })}
              placeholder="nom@exemple.com" style={styleChamp} autoComplete="off" />
          </div>
        </div>

        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${th.line}` }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', fontSize: 14.5 }}>
            <input type="checkbox" checked={!!extra.afficher_soumis_par}
              onChange={(e) => majExtra({ afficher_soumis_par: e.target.checked })}
              style={{ width: 16, height: 16, cursor: 'pointer' }} />
            <span>Afficher mon nom sur le document, comme personne ayant soumis l’extra</span>
          </label>
          {extra.afficher_soumis_par && (
            <div style={{ marginTop: 10, maxWidth: 340 }}>
              <input value={extra.soumis_par || ''} onChange={(e) => majExtra({ soumis_par: e.target.value })}
                placeholder="Nom affiché" style={styleChamp} autoComplete="off" />
            </div>
          )}
          {!extra.afficher_soumis_par && (
            <div style={{ marginTop: 8, fontSize: 13, color: th.textDim }}>
              Le document sortira au nom de la compagnie seulement.
            </div>
          )}
        </div>
      </Carte>

      {/* ---------- 2b. les blocs libres, avant les couts ---------- */}
      <Blocs th={th} extra={extra} emplacement="avant"
        ajouterBloc={ajouterBloc} majBloc={majBloc} retirerBloc={retirerBloc}
        deplacerBloc={deplacerBloc} televerserImage={televerserImage}
        telechargerImage={telechargerImage} enCours={enCours} />

      {/* ---------- 3. les quatre sections ---------- */}
      {CATEGORIES.map((cat) => (
        <SectionLignes key={cat.id} th={th} categorie={cat} lignes={lignes} prix={prix}
          resume={totaux.categories[cat.id]}
          majLigne={majLigne} ajouterLigne={ajouterLigne} retirerLigne={retirerLigne}
          onVoirPrix={onVoirPrix} />
      ))}

      {/* ---------- 4. les totaux ---------- */}
      <Totaux th={th} totaux={totaux} majoration={extra.majoration} majExtra={majExtra} gabarit={g} />

      {/* ---------- 4b. les blocs libres, apres les totaux ---------- */}
      <Blocs th={th} extra={extra} emplacement="apres"
        ajouterBloc={ajouterBloc} majBloc={majBloc} retirerBloc={retirerBloc}
        deplacerBloc={deplacerBloc} televerserImage={televerserImage}
        telechargerImage={telechargerImage} enCours={enCours} />

      {/* ---------- 5. ce qui bloque ---------- */}
      {(validation.bloquants.length > 0 || validation.avertissements.length > 0) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {validation.bloquants.length > 0 && (
            <div style={{ background: th.errBg, border: `1px solid ${th.errTexte}`, borderRadius: 8,
              padding: '12px 15px', fontSize: 14, color: th.errTexte }}>
              <div style={{ fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={16} /> À corriger avant d’enregistrer
              </div>
              <ul style={{ margin: 0, paddingLeft: 22, lineHeight: 1.7 }}>
                {validation.bloquants.map((b, i) => <li key={i}>{b}</li>)}
              </ul>
            </div>
          )}
          {validation.avertissements.length > 0 && (
            <div style={{ background: th.avisBg, border: `1px solid ${th.avisTexte}`, borderRadius: 8,
              padding: '12px 15px', fontSize: 14, color: th.avisTexte }}>
              <div style={{ fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Info size={16} /> À vérifier — ça n’empêche pas d’enregistrer
              </div>
              <ul style={{ margin: 0, paddingLeft: 22, lineHeight: 1.7 }}>
                {validation.avertissements.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ---------- 6. les actions ---------- */}
      <div style={{ background: th.panel, border: `1px solid ${th.line}`, borderRadius: 8,
        padding: 14, boxShadow: th.ombre, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={onEnregistrer} disabled={enCours || !validation.valide} style={{
          background: validation.valide ? ROUGE : th.panelAlt,
          color: validation.valide ? '#fff' : th.textDim,
          border: `1px solid ${validation.valide ? ROUGE : th.line}`, borderRadius: 5,
          padding: '11px 20px', fontSize: 14, fontWeight: 600,
          cursor: enCours || !validation.valide ? 'not-allowed' : 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'inherit',
        }}>
          <Save size={15} /> {enCours ? 'En cours…' : 'Enregistrer'}
        </button>

        <button onClick={() => onExporter('excel')} disabled={enCours || !validation.valide} style={{
          background: th.panelAlt, color: validation.valide ? th.text : th.textDim,
          border: `1px solid ${th.line}`, borderRadius: 5, padding: '11px 18px', fontSize: 14,
          fontWeight: 600, cursor: enCours || !validation.valide ? 'not-allowed' : 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'inherit',
        }}>
          <FileSpreadsheet size={15} /> Excel
        </button>

        <button onClick={() => onExporter('pdf')} disabled={enCours || !validation.valide} style={{
          background: th.panelAlt, color: validation.valide ? th.text : th.textDim,
          border: `1px solid ${th.line}`, borderRadius: 5, padding: '11px 18px', fontSize: 14,
          fontWeight: 600, cursor: enCours || !validation.valide ? 'not-allowed' : 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'inherit',
        }}>
          <FileText size={15} /> PDF
        </button>

        <span style={{ fontSize: 13, color: modifie ? th.avisTexte : th.textDim, marginLeft: 4 }}>
          {modifie ? 'Modifications non enregistrées' : (extra.id ? 'À jour' : 'Nouveau document')}
        </span>

        {extra.id && (
          <button onClick={onSupprimer} disabled={enCours} style={{
            marginLeft: 'auto', background: 'none', color: th.errTexte,
            border: `1px solid ${th.line}`, borderRadius: 5, padding: '10px 15px', fontSize: 13.5,
            fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7,
            fontFamily: 'inherit',
          }}>
            <Trash2 size={15} /> Supprimer
          </button>
        )}
      </div>

      <div style={{ background: th.infoBg, border: `1px solid ${th.line}`, borderRadius: 8,
        padding: '13px 15px', fontSize: 13.5, color: th.textDim, lineHeight: 1.6 }}>
        L’export enregistre d’abord le document, pour qu’un PDF envoyé au client corresponde
        toujours à un extra qu’on peut retrouver par son numéro.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// UNE SECTION DE LIGNES
// ---------------------------------------------------------------------------
function SectionLignes({
  th, categorie, lignes, prix, resume, majLigne, ajouterLigne, retirerLigne,
  onVoirPrix,
}) {
  const miennes = lignes.filter((l) => l.categorie === categorie.id);
  const prixCat = prix.filter((p) => p.categorie === categorie.id && p.actif);
  const [choixPrix, setChoixPrix] = useState('');

  function insererDepuisPrix(id) {
    const p = prixCat.find((x) => x.id === id);
    if (!p) return;
    ajouterLigne(categorie.id, {
      description: p.description,
      unite: p.unite || categorie.uniteDefaut,
      prix_unitaire: Number(p.prix_unitaire) === 0 ? '' : formaterPrixSaisie(p.prix_unitaire),
      quantite: '',
    });
    setChoixPrix('');
  }

  const petitChamp = {
    width: '100%', padding: '8px 9px', fontSize: 14, background: th.inputBg, color: th.text,
    border: `1px solid ${th.line}`, borderRadius: 4, fontFamily: 'inherit',
  };

  return (
    <div style={{ background: th.panel, border: `1px solid ${th.line}`, borderRadius: 8,
      boxShadow: th.ombre, overflow: 'hidden', '--ex-ligne': th.line, '--ex-dim': th.textDim }}>
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${th.line}`,
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '.06em',
          textTransform: 'uppercase', color: th.text }}>{categorie.libelle}</span>
        <span style={{ fontSize: 13, color: th.textDim }}>
          {resume.nb} ligne{resume.nb > 1 ? 's' : ''}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 15, fontWeight: 700,
          fontVariantNumeric: 'tabular-nums' }}>{formaterArgent(resume.total)}</span>
      </div>

      {miennes.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="ex-lignes" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 720 }}>
            <thead>
              <tr>
                <Th th={th}>Description</Th>
                <Th th={th} droite>Quantité</Th>
                <Th th={th}>Unité</Th>
                <Th th={th} droite>Prix unitaire</Th>
                <Th th={th} droite>Total</Th>
                <Th th={th}></Th>
              </tr>
            </thead>
            <tbody>
              {miennes.map((l) => {
                const q = analyserNombre(l.quantite);
                const p = analyserNombre(l.prix_unitaire);
                const incomplete = !ligneEstVide(l) && (!String(l.description || '').trim() || q === null || p === null);
                return (
                  <tr key={l.id} style={{ borderTop: `1px solid ${th.line}` }}>
                    <td data-libelle="Description" style={{ padding: '7px 10px' }}>
                      <input value={l.description} list={`prix-${categorie.id}`}
                        onChange={(e) => {
                          const trouve = prixCat.find((x) => x.description === e.target.value);
                          majLigne(l.id, {
                            description: e.target.value,
                            ...(trouve ? {
                              unite: trouve.unite || l.unite,
                              prix_unitaire: Number(trouve.prix_unitaire) === 0
                                ? l.prix_unitaire : formaterPrixSaisie(trouve.prix_unitaire),
                            } : {}),
                          });
                        }}
                        placeholder="Description" style={petitChamp} autoComplete="off" />
                      <input value={l.note || ''} onChange={(e) => majLigne(l.id, { note: e.target.value })}
                        placeholder="Note (facultatif)"
                        style={{ ...petitChamp, marginTop: 5, fontSize: 12.5, color: th.textDim }}
                        autoComplete="off" />
                    </td>
                    <td data-libelle="Quantité" style={{ padding: '7px 10px', width: 110 }}>
                      <input value={l.quantite} onChange={(e) => majLigne(l.id, { quantite: e.target.value })}
                        inputMode="decimal" placeholder="0"
                        style={{ ...petitChamp, textAlign: 'right',
                          borderColor: !ligneEstVide(l) && q === null ? th.errTexte : th.line }} />
                    </td>
                    <td data-libelle="Unité" style={{ padding: '7px 10px', width: 96 }}>
                      <select value={l.unite || ''} onChange={(e) => majLigne(l.id, { unite: e.target.value })}
                        style={petitChamp}>
                        {UNITES.map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </td>
                    <td data-libelle="Prix unitaire" style={{ padding: '7px 10px', width: 130 }}>
                      <input value={l.prix_unitaire} onChange={(e) => majLigne(l.id, { prix_unitaire: e.target.value })}
                        inputMode="decimal" placeholder="0,00"
                        style={{ ...petitChamp, textAlign: 'right',
                          borderColor: !ligneEstVide(l) && p === null ? th.errTexte : th.line }} />
                    </td>
                    <td data-libelle="Total" style={{ padding: '7px 10px', textAlign: 'right', width: 120,
                      fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                      color: incomplete ? th.textDim : th.text }}>
                      {formaterArgent(enDollars(totalLigneCents(l)))}
                    </td>
                    <td className="ex-actions" style={{ padding: '7px 10px', textAlign: 'right', width: 42 }}>
                      <button onClick={() => retirerLigne(l.id)} title="Retirer la ligne"
                        aria-label="Retirer la ligne" style={{
                          background: 'none', border: 'none', cursor: 'pointer', color: th.textDim,
                          padding: 4, display: 'inline-flex',
                        }}><Trash2 size={15} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <datalist id={`prix-${categorie.id}`}>
        {prixCat.map((p) => <option key={p.id} value={p.description} />)}
      </datalist>

      <div style={{ padding: '12px 16px', borderTop: miennes.length > 0 ? `1px solid ${th.line}` : 'none',
        display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={() => ajouterLigne(categorie.id)} style={{
          background: th.panelAlt, color: th.text, border: `1px solid ${th.line}`, borderRadius: 5,
          padding: '8px 14px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: 'inherit',
        }}>
          <Plus size={14} /> Ligne vide
        </button>

        {prixCat.length > 0 ? (
          <select value={choixPrix} onChange={(e) => insererDepuisPrix(e.target.value)}
            style={{ padding: '8px 10px', fontSize: 13.5, background: th.inputBg, color: th.text,
              border: `1px solid ${th.line}`, borderRadius: 5, fontFamily: 'inherit',
              maxWidth: 320, flex: '1 1 220px' }}>
            <option value="">＋ Depuis la liste de prix…</option>
            {prixCat.map((p) => (
              <option key={p.id} value={p.id}>
                {p.description}{Number(p.prix_unitaire) > 0
                  ? ` — ${formaterArgent(Number(p.prix_unitaire))}/${p.unite}` : ' — prix à entrer'}
              </option>
            ))}
          </select>
        ) : (
          <button onClick={onVoirPrix} style={{
            background: 'none', color: th.lien, border: 'none', padding: '8px 4px', fontSize: 13.5,
            cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            <ListPlus size={14} /> Aucun prix de référence dans cette catégorie
          </button>
        )}

      </div>

      <style jsx>{`
        @media (max-width: 820px) {
          :global(.ex-lignes) { min-width: 0 !important; display: block; }
          :global(.ex-lignes thead) { display: none; }
          :global(.ex-lignes tbody), :global(.ex-lignes tr) { display: block; }
          :global(.ex-lignes tr) {
            border-top: none !important; border: 1px solid var(--ex-ligne);
            border-radius: 7px; margin: 10px 12px; padding: 6px 0;
          }
          :global(.ex-lignes td) {
            display: block; width: auto !important; padding: 5px 12px !important;
          }
          :global(.ex-lignes td[data-libelle]::before) {
            content: attr(data-libelle); display: block; font-size: 11px; font-weight: 700;
            letter-spacing: .05em; text-transform: uppercase; color: var(--ex-dim); margin-bottom: 3px;
          }
          :global(.ex-lignes td[data-libelle="Total"]) { text-align: right !important; font-size: 16px; }
          :global(.ex-lignes td.ex-actions) { text-align: right !important; }
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LES BLOCS LIBRES
//
// Un endroit du document ou on met ce qu'on veut : du texte, un tableau
// maison, une photo, un saut de page. Le meme composant sert avant les couts
// et apres les totaux — c'est « emplacement » qui decide.
// ---------------------------------------------------------------------------
const ICONES_BLOCS = { texte: Type, tableau: Table2, image: ImageIcon, saut: SeparatorHorizontal };

function Blocs({ th, extra, emplacement, ajouterBloc, majBloc, retirerBloc, deplacerBloc,
  televerserImage, telechargerImage, enCours }) {
  const miens = blocsDe(extra.blocs, emplacement);
  const libelle = emplacement === 'avant' ? 'Avant le détail des coûts' : 'Après les totaux';

  return (
    <div style={{ background: th.panel, border: `1px dashed ${th.line}`, borderRadius: 8,
      padding: miens.length ? 14 : '11px 14px', boxShadow: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.06em',
          textTransform: 'uppercase', color: th.textDim }}>{libelle}</span>
        <span style={{ fontSize: 13, color: th.textDim }}>
          {miens.length === 0 ? 'aucun bloc' : `${miens.length} bloc${miens.length > 1 ? 's' : ''}`}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {TYPES_BLOCS.map((t) => {
            const Icone = ICONES_BLOCS[t.id];
            return (
              <button key={t.id} onClick={() => ajouterBloc(t.id, emplacement)} style={{
                background: th.panelAlt, color: th.text, border: `1px solid ${th.line}`,
                borderRadius: 5, padding: '6px 11px', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
                fontFamily: 'inherit',
              }}>
                <Icone size={14} /> {t.libelle}
              </button>
            );
          })}
        </div>
      </div>

      {miens.map((b, i) => (
        <UnBloc key={b.id} th={th} bloc={b} premier={i === 0} dernier={i === miens.length - 1}
          majBloc={majBloc} retirerBloc={retirerBloc} deplacerBloc={deplacerBloc}
          televerserImage={televerserImage} telechargerImage={telechargerImage} enCours={enCours}
          gabaritForfait={!gabaritDe(extra.gabarit).detailImprime} />
      ))}
    </div>
  );
}

function UnBloc({ th, bloc, premier, dernier, majBloc, retirerBloc, deplacerBloc,
  televerserImage, telechargerImage, enCours, gabaritForfait }) {
  const champ = {
    width: '100%', padding: '8px 10px', fontSize: 14, background: th.inputBg, color: th.text,
    border: `1px solid ${th.line}`, borderRadius: 4, fontFamily: 'inherit',
  };
  const Icone = ICONES_BLOCS[bloc.type] || Type;
  const nomType = (TYPES_BLOCS.find((t) => t.id === bloc.type) || {}).libelle || bloc.type;

  const petitBouton = {
    background: 'none', border: `1px solid ${th.line}`, borderRadius: 4, cursor: 'pointer',
    color: th.textDim, padding: '4px 6px', display: 'inline-flex', alignItems: 'center',
  };

  return (
    <div style={{ marginTop: 12, border: `1px solid ${th.line}`, borderRadius: 7,
      background: th.panelAlt, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px',
        borderBottom: `1px solid ${th.line}` }}>
        <Icone size={15} style={{ color: th.textDim, flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.05em',
          textTransform: 'uppercase', color: th.textDim }}>{nomType}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 5 }}>
          <button onClick={() => deplacerBloc(bloc.id, -1)} disabled={premier}
            aria-label="Monter le bloc" title="Monter"
            style={{ ...petitBouton, opacity: premier ? 0.35 : 1,
              cursor: premier ? 'not-allowed' : 'pointer' }}><ChevronUp size={14} /></button>
          <button onClick={() => deplacerBloc(bloc.id, 1)} disabled={dernier}
            aria-label="Descendre le bloc" title="Descendre"
            style={{ ...petitBouton, opacity: dernier ? 0.35 : 1,
              cursor: dernier ? 'not-allowed' : 'pointer' }}><ChevronDown size={14} /></button>
          <button onClick={() => retirerBloc(bloc.id)} aria-label="Retirer le bloc" title="Retirer"
            style={{ ...petitBouton, color: th.errTexte }}><Trash2 size={14} /></button>
        </div>
      </div>

      <div style={{ padding: 12 }}>
        {bloc.type === 'saut' ? (
          <div style={{ fontSize: 13.5, color: th.textDim }}>
            Le document repart à la page suivante à cet endroit.
          </div>
        ) : (
          <>
            <input value={bloc.titre || ''} onChange={(e) => majBloc(bloc.id, { titre: e.target.value })}
              placeholder="Titre du bloc (facultatif)" style={{ ...champ, fontWeight: 600 }}
              autoComplete="off" />

            {bloc.type === 'texte' && (
              <textarea value={bloc.corps || ''} onChange={(e) => majBloc(bloc.id, { corps: e.target.value })}
                rows={4} placeholder="Ce que tu veux écrire ici."
                style={{ ...champ, marginTop: 8, resize: 'vertical', lineHeight: 1.5 }} />
            )}

            {bloc.type === 'image' && (
              <BlocImage th={th} bloc={bloc} champ={champ} majBloc={majBloc}
                televerserImage={televerserImage} telechargerImage={telechargerImage}
                enCours={enCours} />
            )}

            {bloc.type === 'tableau' && (
              <BlocTableau th={th} bloc={bloc} champ={champ} majBloc={majBloc}
                gabaritForfait={gabaritForfait} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function BlocImage({ th, bloc, champ, majBloc, televerserImage, telechargerImage, enCours }) {
  const [apercu, setApercu] = useState(null);
  const [erreur, setErreur] = useState('');

  // L'apercu descend l'image avec le jeton de la personne connectee — le
  // panier est prive, une balise <img src="..."> vers Supabase ne marcherait
  // pas. On libere l'URL en quittant, sinon le navigateur la garde en memoire.
  useEffect(() => {
    let vivant = true;
    let url = null;
    setErreur('');
    if (!bloc.chemin) { setApercu(null); return undefined; }
    telechargerImage(bloc.chemin)
      .then((blob) => {
        if (!vivant) return;
        url = URL.createObjectURL(blob);
        setApercu(url);
      })
      .catch(() => { if (vivant) { setApercu(null); setErreur('Image introuvable dans le rangement.'); } });
    return () => { vivant = false; if (url) URL.revokeObjectURL(url); };
  }, [bloc.chemin, telechargerImage]);

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ background: th.btnBg, color: '#fff', border: 'none', borderRadius: 5,
          padding: '9px 14px', fontSize: 13.5, fontWeight: 600, cursor: enCours ? 'wait' : 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <Upload size={14} /> {bloc.chemin ? 'Remplacer l’image' : 'Choisir une image'}
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={enCours}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; televerserImage(f, bloc); }}
            style={{ display: 'none' }} />
        </label>
        <select value={bloc.largeur || 'pleine'}
          onChange={(e) => majBloc(bloc.id, { largeur: e.target.value })}
          style={{ ...champ, width: 'auto' }}>
          <option value="pleine">Pleine largeur</option>
          <option value="moitie">Demi-largeur</option>
        </select>
        <span style={{ fontSize: 12.5, color: th.textDim }}>PNG, JPG, WEBP ou GIF · 10 Mo max</span>
      </div>

      <input value={bloc.legende || ''} onChange={(e) => majBloc(bloc.id, { legende: e.target.value })}
        placeholder="Légende sous l’image (facultatif)"
        style={{ ...champ, marginTop: 8 }} autoComplete="off" />

      {erreur ? (
        <div style={{ marginTop: 8, fontSize: 13, color: th.errTexte }}>{erreur}</div>
      ) : apercu ? (
        <img src={apercu} alt="" style={{ marginTop: 10, maxWidth: '100%', maxHeight: 260,
          borderRadius: 5, border: `1px solid ${th.line}`, display: 'block' }} />
      ) : bloc.chemin ? (
        <div style={{ marginTop: 8, fontSize: 13, color: th.textDim }}>Chargement de l’image…</div>
      ) : null}
    </div>
  );
}

function BlocTableau({ th, bloc, champ, majBloc, gabaritForfait }) {
  const colonnes = bloc.colonnes || [];
  const rangees = bloc.rangees || [];
  const petit = { ...champ, padding: '6px 8px', fontSize: 13.5 };

  function majColonne(i, libelle) {
    majBloc(bloc.id, { colonnes: colonnes.map((c, j) => (j === i ? { ...c, libelle } : c)) });
  }
  function ajouterColonne() {
    if (colonnes.length >= 5) return;   // au-dela, la colonne ne se lit plus a l'impression
    majBloc(bloc.id, {
      colonnes: [...colonnes, { libelle: '' }],
      rangees: rangees.map((r) => [...r, '']),
    });
  }
  function retirerColonne(i) {
    if (colonnes.length <= 1) return;
    const nouvelIndexMontant = Number(bloc.colonneMontant) === i
      ? -1
      : (Number(bloc.colonneMontant) > i ? Number(bloc.colonneMontant) - 1 : bloc.colonneMontant);
    majBloc(bloc.id, {
      colonnes: colonnes.filter((_, j) => j !== i),
      rangees: rangees.map((r) => r.filter((_, j) => j !== i)),
      colonneMontant: nouvelIndexMontant,
      compteDansTotal: nouvelIndexMontant === -1 ? false : bloc.compteDansTotal,
    });
  }
  function majCellule(ri, ci, valeur) {
    majBloc(bloc.id, {
      rangees: rangees.map((r, j) => (j === ri ? r.map((c, k) => (k === ci ? valeur : c)) : r)),
    });
  }

  const total = enDollars(totalTableauCents(bloc));
  const sansColonneMontant = bloc.compteDansTotal
    && !(Number(bloc.colonneMontant) >= 0 && colonnes[Number(bloc.colonneMontant)]);

  return (
    <div style={{ marginTop: 8, '--ex-ligne': th.line, '--ex-dim': th.textDim }}>
      <div style={{ overflowX: 'auto' }}>
        <table className="ex-maison" style={{ borderCollapse: 'collapse', width: '100%',
          minWidth: 120 * colonnes.length + 60 }}>
          <thead>
            <tr>
              {colonnes.map((c, i) => (
                <th key={i} style={{ padding: 4, textAlign: 'left', verticalAlign: 'bottom' }}>
                  <input value={c.libelle || ''} onChange={(e) => majColonne(i, e.target.value)}
                    placeholder={`Colonne ${i + 1}`}
                    style={{ ...petit, fontWeight: 700 }} autoComplete="off" />
                  <button onClick={() => retirerColonne(i)} disabled={colonnes.length <= 1}
                    aria-label={`Retirer la colonne ${i + 1}`}
                    style={{ background: 'none', border: 'none', color: th.textDim, fontSize: 11.5,
                      cursor: colonnes.length <= 1 ? 'not-allowed' : 'pointer', padding: '3px 0 0',
                      opacity: colonnes.length <= 1 ? 0.4 : 1 }}>retirer</button>
                </th>
              ))}
              <th style={{ width: 34 }} />
            </tr>
          </thead>
          <tbody>
            {rangees.map((r, ri) => (
              <tr key={ri}>
                {colonnes.map((c, ci) => (
                  <td key={ci} style={{ padding: 4 }}>
                    <input value={r[ci] || ''} onChange={(e) => majCellule(ri, ci, e.target.value)}
                      style={{ ...petit,
                        textAlign: Number(bloc.colonneMontant) === ci ? 'right' : 'left' }}
                      autoComplete="off" />
                  </td>
                ))}
                <td style={{ padding: 4, textAlign: 'right' }}>
                  <button onClick={() => majBloc(bloc.id, { rangees: rangees.filter((_, j) => j !== ri) })}
                    aria-label={`Retirer la rangée ${ri + 1}`}
                    style={{ background: 'none', border: 'none', cursor: 'pointer',
                      color: th.textDim, padding: 4, display: 'inline-flex' }}><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', alignItems: 'center', marginTop: 9 }}>
        <button onClick={() => majBloc(bloc.id, { rangees: [...rangees, colonnes.map(() => '')] })}
          style={{ background: th.panel, color: th.text, border: `1px solid ${th.line}`,
            borderRadius: 5, padding: '7px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}>
          <Plus size={13} /> Rangée
        </button>
        <button onClick={ajouterColonne} disabled={colonnes.length >= 5}
          style={{ background: th.panel, color: colonnes.length >= 5 ? th.textDim : th.text,
            border: `1px solid ${th.line}`, borderRadius: 5, padding: '7px 12px', fontSize: 13,
            fontWeight: 600, cursor: colonnes.length >= 5 ? 'not-allowed' : 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}>
          <Plus size={13} /> Colonne {colonnes.length >= 5 ? '(5 maximum)' : ''}
        </button>
      </div>

      <div style={{ marginTop: 11, paddingTop: 10, borderTop: `1px solid ${th.line}`,
        display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14,
          cursor: 'pointer' }}>
          <input type="checkbox" checked={!!bloc.compteDansTotal}
            onChange={(e) => majBloc(bloc.id, {
              compteDansTotal: e.target.checked,
              // Un tableau qui compte doit paraitre AVANT les totaux : sinon le
              // document annonce un total, puis montre en dessous un tableau
              // qui en fait partie. Sur papier comme dans l'Excel, ca ne se
              // lit pas.
              ...(e.target.checked ? { emplacement: 'avant' } : {}),
            })}
            style={{ width: 16, height: 16, cursor: 'pointer' }} />
          <span>Ce tableau compte dans le total de l’extra</span>
        </label>
        {bloc.compteDansTotal && (
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13.5,
            color: th.textDim }}>
            Colonne des montants
            <select value={Number(bloc.colonneMontant) >= 0 ? bloc.colonneMontant : ''}
              onChange={(e) => majBloc(bloc.id, { colonneMontant: e.target.value === '' ? -1 : Number(e.target.value) })}
              style={{ ...petit, width: 'auto',
                borderColor: sansColonneMontant ? th.errTexte : th.line }}>
              <option value="">— à choisir —</option>
              {colonnes.map((c, i) => (
                <option key={i} value={i}>{c.libelle || `Colonne ${i + 1}`}</option>
              ))}
            </select>
          </label>
        )}
        {bloc.compteDansTotal && !sansColonneMontant && (
          <span style={{ marginLeft: 'auto', fontSize: 14, fontWeight: 700,
            fontVariantNumeric: 'tabular-nums' }}>{formaterArgent(total)}</span>
        )}
      </div>

      {!bloc.compteDansTotal && (
        <div style={{ marginTop: 7, fontSize: 12.5, color: th.textDim }}>
          Ce tableau est de l’information : il s’imprime, mais il n’entre pas dans les totaux.
        </div>
      )}
      {bloc.compteDansTotal && bloc.emplacement === 'avant' && (
        <div style={{ marginTop: 7, fontSize: 12.5, color: th.textDim }}>
          Un tableau qui compte se place avant les totaux — sinon le document annoncerait un
          total, puis montrerait en dessous un tableau qui en fait partie.
        </div>
      )}
      {bloc.compteDansTotal && gabaritForfait && (
        <div style={{ marginTop: 7, fontSize: 12.5, color: th.avisTexte }}>
          Comme il compte dans le total, ce tableau est du coût : dans un forfait il reste à
          l’interne et ne s’imprime PAS sur le PDF du client. Décoche « compte dans le total »
          si tu veux qu’il paraisse.
        </div>
      )}

      <style jsx>{`
        @media (max-width: 720px) {
          :global(.ex-maison) { min-width: 520px !important; }
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LES TOTAUX
// ---------------------------------------------------------------------------
function Totaux({ th, totaux, majoration, majExtra, gabarit }) {
  const g = gabarit || gabaritDe('tm');
  const pct = (t) => `${(t * 100).toLocaleString('fr-CA', { maximumFractionDigits: 3 })} %`;
  const Ligne = ({ libelle, valeur, fort, fond }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16,
      padding: '9px 16px', background: fond || 'transparent',
      borderTop: `1px solid ${th.line}`, fontSize: fort ? 15 : 14 }}>
      <span style={{ fontWeight: fort ? 700 : 400, color: fort ? th.text : th.textDim }}>{libelle}</span>
      <span style={{ fontWeight: fort ? 700 : 600, fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap' }}>{valeur}</span>
    </div>
  );

  return (
    <div style={{ background: th.panel, border: `1px solid ${th.line}`, borderRadius: 8,
      boxShadow: th.ombre, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', fontSize: 12.5, fontWeight: 700, letterSpacing: '.06em',
        textTransform: 'uppercase', color: th.textDim }}>Totaux</div>

      {CATEGORIES.filter((c) => totaux.categories[c.id].nb > 0).map((c) => (
        <Ligne key={c.id} libelle={c.libelle} valeur={formaterArgent(totaux.categories[c.id].total)} />
      ))}

      {totaux.totalBlocs !== 0 && (
        <Ligne libelle="Tableaux maison" valeur={formaterArgent(totaux.totalBlocs)} />
      )}

      <Ligne libelle={g.id === 'credit' ? 'Total des travaux retirés' : 'Total des travaux'}
        valeur={formaterArgent(totaux.totalTravaux)} fort fond={th.panelAlt} />

      {/* L'administration et le profit : un seul pourcentage, une seule fois,
          ici en bas. C'est le seul endroit de l'app ou on le tape. */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center',
        padding: '9px 16px', borderTop: `1px solid ${th.line}`, fontSize: 14 }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: th.textDim }}>
          Administration et profit
          <input value={majoration ?? 0}
            onChange={(e) => majExtra({ majoration: e.target.value })}
            inputMode="decimal" aria-label="Pourcentage d'administration et profit"
            style={{ width: 66, padding: '6px 8px', fontSize: 14, textAlign: 'right',
              background: th.inputBg, color: th.text, border: `1px solid ${th.line}`,
              borderRadius: 4, fontFamily: 'inherit' }} />
          %
        </label>
        <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {formaterArgent(totaux.majoration)}
        </span>
      </div>

      {totaux.forfaitImpose && (
        <Ligne libelle="Écart avec le prix soumis"
          valeur={`${totaux.ecartForfait > 0 ? '+' : ''}${formaterArgent(totaux.ecartForfait)}`} />
      )}

      <Ligne libelle={g.id === 'forfait' ? 'Prix forfaitaire' : 'Sous-total'}
        valeur={formaterArgent(totaux.sousTotal)} fort fond={th.panelAlt} />
      <Ligne libelle={`TPS (${pct(totaux.tauxTps)})`} valeur={formaterArgent(totaux.tps)} />
      <Ligne libelle={`TVQ (${pct(totaux.tauxTvq)})`} valeur={formaterArgent(totaux.tvq)} />

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16,
        padding: '15px 16px', background: th.btnBg, color: '#fff' }}>
        <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: '.03em' }}>{g.libelleTotal}</span>
        <span style={{ fontWeight: 700, fontSize: 20, fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap' }}>{formaterArgent(totaux.total)}</span>
      </div>

      {g.signe < 0 && (
        <div style={{ padding: '9px 16px', background: th.avisBg, color: th.avisTexte,
          fontSize: 13.5, fontWeight: 600, textAlign: 'right' }}>
          Montant à déduire du contrat — il s’enregistre en négatif dans la liste des extras.
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// ONGLET 3 — LA LISTE DE PRIX
// ===========================================================================
function OngletPrix({ th, prix, nom, recharger, afficher }) {
  const [filtre, setFiltre] = useState('');
  const [categorie, setCategorie] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [nouveau, setNouveau] = useState({
    categorie: 'main_oeuvre', code: '', description: '', unite: 'h', prix_unitaire: '', note: '',
  });

  const visibles = prix.filter((p) => {
    if (categorie && p.categorie !== categorie) return false;
    const q = filtre.trim().toLowerCase();
    if (!q) return true;
    return [p.code, p.description, p.note].filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q));
  });

  const styleChamp = {
    width: '100%', padding: '8px 10px', fontSize: 14, background: th.inputBg, color: th.text,
    border: `1px solid ${th.line}`, borderRadius: 4, fontFamily: 'inherit',
  };

  async function enregistrerLigne(p, champs) {
    const { error } = await supabaseEx.from('prix_reference')
      .update({ ...champs, maj_par: nom, maj_le: new Date().toISOString() }).eq('id', p.id);
    if (error) { afficher(`Échec : ${error.message}`, false); return; }
    recharger();
  }

  async function ajouter() {
    if (!nouveau.description.trim()) { afficher('Donne une description au prix.', false); return; }
    const pu = analyserNombre(nouveau.prix_unitaire);
    setEnCours(true);
    const { error } = await supabaseEx.from('prix_reference').insert({
      categorie: nouveau.categorie,
      code: nouveau.code.trim() || null,
      description: nouveau.description.trim(),
      unite: nouveau.unite,
      prix_unitaire: pu === null ? 0 : pu,
      note: nouveau.note.trim() || null,
      maj_par: nom,
    });
    setEnCours(false);
    if (error) { afficher(`Échec : ${error.message}`, false); return; }
    setNouveau({ categorie: nouveau.categorie, code: '', description: '', unite: nouveau.unite, prix_unitaire: '', note: '' });
    afficher('Prix ajouté ✓', true);
    recharger();
  }

  async function supprimerPrix(p) {
    if (typeof window !== 'undefined'
      && !window.confirm(`Supprimer « ${p.description} » de la liste de prix ?`)) return;
    const { error } = await supabaseEx.from('prix_reference').delete().eq('id', p.id);
    if (error) { afficher(`Échec : ${error.message}`, false); return; }
    afficher('Prix supprimé ✓', true);
    recharger();
  }

  const sansPrix = prix.filter((p) => Number(p.prix_unitaire) === 0).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {sansPrix > 0 && (
        <div style={{ background: th.avisBg, border: `1px solid ${th.avisTexte}`, borderRadius: 8,
          padding: '12px 15px', fontSize: 14, color: th.avisTexte, lineHeight: 1.6 }}>
          <strong>{sansPrix} article{sansPrix > 1 ? 's' : ''} à 0 $.</strong> Ce sont les exemples livrés
          avec l’app — ils attendent tes vrais taux. Ils sont volontairement à zéro plutôt qu’à un montant
          inventé : un faux taux qui a l’air vrai se retrouve dans un extra sans que personne le remarque.
        </div>
      )}

      <div style={{ background: th.panel, border: `1px solid ${th.line}`, borderRadius: 8,
        padding: 14, boxShadow: th.ombre, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 240px' }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: 11, color: th.textDim }} />
          <input value={filtre} onChange={(e) => setFiltre(e.target.value)}
            placeholder="Chercher un article…"
            style={{ ...styleChamp, padding: '9px 11px 9px 32px', fontSize: 14.5 }} />
        </div>
        <select value={categorie} onChange={(e) => setCategorie(e.target.value)}
          style={{ ...styleChamp, flex: '1 1 200px', padding: '9px 11px', fontSize: 14.5 }}>
          <option value="">Toutes les catégories</option>
          {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.libelle}</option>)}
        </select>
      </div>

      <Carte th={th} titre="Ajouter un article">
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.1fr) minmax(0,0.7fr) minmax(0,2fr) minmax(0,0.7fr) minmax(0,0.9fr) auto',
          gap: 9, alignItems: 'end' }} className="ex-ajout-prix">
          <div>
            <Etiquette th={th}>Catégorie</Etiquette>
            <select value={nouveau.categorie} onChange={(e) => setNouveau({ ...nouveau, categorie: e.target.value })}
              style={styleChamp}>
              {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.libelle}</option>)}
            </select>
          </div>
          <div>
            <Etiquette th={th}>Code</Etiquette>
            <input value={nouveau.code} onChange={(e) => setNouveau({ ...nouveau, code: e.target.value })}
              placeholder="facultatif" style={styleChamp} autoComplete="off" />
          </div>
          <div>
            <Etiquette th={th}>Description</Etiquette>
            <input value={nouveau.description} onChange={(e) => setNouveau({ ...nouveau, description: e.target.value })}
              placeholder="Ex. : Pelle hydraulique 200" style={styleChamp} autoComplete="off" />
          </div>
          <div>
            <Etiquette th={th}>Unité</Etiquette>
            <select value={nouveau.unite} onChange={(e) => setNouveau({ ...nouveau, unite: e.target.value })}
              style={styleChamp}>
              {UNITES.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <Etiquette th={th}>Prix</Etiquette>
            <input value={nouveau.prix_unitaire} onChange={(e) => setNouveau({ ...nouveau, prix_unitaire: e.target.value })}
              inputMode="decimal" placeholder="0,00"
              style={{ ...styleChamp, textAlign: 'right' }} autoComplete="off" />
          </div>
          <button onClick={ajouter} disabled={enCours} style={{
            background: ROUGE, color: '#fff', border: 'none', borderRadius: 5, padding: '9px 15px',
            fontSize: 13.5, fontWeight: 600, cursor: 'pointer', display: 'inline-flex',
            alignItems: 'center', gap: 7, fontFamily: 'inherit', whiteSpace: 'nowrap',
          }}><Plus size={14} /> Ajouter</button>
        </div>
      </Carte>

      <div style={{ background: th.panel, border: `1px solid ${th.line}`, borderRadius: 8,
        boxShadow: th.ombre, overflow: 'hidden', '--ex-ligne': th.line, '--ex-dim': th.textDim }}>
        <div style={{ padding: '13px 18px', borderBottom: `1px solid ${th.line}`, fontSize: 12,
          fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: th.textDim,
          display: 'flex', justifyContent: 'space-between' }}>
          <span>Liste de prix</span><span>{visibles.length}</span>
        </div>
        {visibles.length === 0 ? (
          <div style={{ padding: 24, color: th.textDim, fontSize: 14 }}>Aucun article.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="ex-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 760 }}>
              <thead>
                <tr>
                  <Th th={th}>Catégorie</Th>
                  <Th th={th}>Code</Th>
                  <Th th={th}>Description</Th>
                  <Th th={th}>Unité</Th>
                  <Th th={th} droite>Prix</Th>
                  <Th th={th}></Th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((p) => (
                  <LignePrix key={p.id} th={th} p={p} styleChamp={styleChamp}
                    onEnregistrer={enregistrerLigne} onSupprimer={supprimerPrix} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style jsx>{`
        @media (max-width: 900px) {
          :global(.ex-ajout-prix) { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 720px) {
          :global(.ex-ajout-prix) { grid-template-columns: 1fr !important; }
          :global(.ex-table) { min-width: 0 !important; display: block; }
          :global(.ex-table thead) { display: none; }
          :global(.ex-table tbody), :global(.ex-table tr) { display: block; }
          :global(.ex-table tr) {
            border-top: none !important; border: 1px solid var(--ex-ligne);
            border-radius: 7px; margin: 10px 12px; padding: 6px 0;
          }
          :global(.ex-table td) { display: block; padding: 5px 12px !important; }
          :global(.ex-table td[data-libelle]::before) {
            content: attr(data-libelle); display: block; font-size: 11px; font-weight: 700;
            letter-spacing: .05em; text-transform: uppercase; color: var(--ex-dim); margin-bottom: 3px;
          }
        }
      `}</style>
    </div>
  );
}

// Une ligne de la liste de prix. Elle garde sa propre copie du champ pendant
// qu'on tape et n'ecrit en base qu'a la sortie du champ — sinon chaque touche
// ferait un appel reseau.
function LignePrix({ th, p, styleChamp, onEnregistrer, onSupprimer }) {
  const [local, setLocal] = useState({
    description: p.description, code: p.code || '', unite: p.unite,
    prix_unitaire: formaterPrixSaisie(p.prix_unitaire), note: p.note || '',
  });
  useEffect(() => {
    setLocal({
      description: p.description, code: p.code || '', unite: p.unite,
      prix_unitaire: formaterPrixSaisie(p.prix_unitaire), note: p.note || '',
    });
  }, [p.id, p.description, p.code, p.unite, p.prix_unitaire, p.note]);

  const libelleCat = CATEGORIES.find((c) => c.id === p.categorie)?.libelle || p.categorie;
  const aZero = analyserNombre(local.prix_unitaire) === 0;

  function sortie(champ, transformer) {
    const brut = local[champ];
    const valeur = transformer ? transformer(brut) : (brut.trim() || null);
    const avant = champ === 'prix_unitaire' ? Number(p.prix_unitaire) : (p[champ] || null);
    if (String(valeur ?? '') === String(avant ?? '')) return;
    onEnregistrer(p, { [champ]: valeur });
  }

  return (
    <tr style={{ borderTop: `1px solid ${th.line}` }}>
      <td data-libelle="Catégorie" style={{ padding: '7px 10px', whiteSpace: 'nowrap', color: th.textDim }}>
        {libelleCat}
      </td>
      <td data-libelle="Code" style={{ padding: '7px 10px', width: 130 }}>
        <input value={local.code} onChange={(e) => setLocal({ ...local, code: e.target.value })}
          onBlur={() => sortie('code')} style={{ ...styleChamp, fontSize: 13 }} autoComplete="off" />
      </td>
      <td data-libelle="Description" style={{ padding: '7px 10px' }}>
        <input value={local.description} onChange={(e) => setLocal({ ...local, description: e.target.value })}
          onBlur={() => sortie('description', (v) => v.trim() || p.description)}
          style={styleChamp} autoComplete="off" />
      </td>
      <td data-libelle="Unité" style={{ padding: '7px 10px', width: 92 }}>
        <select value={local.unite}
          onChange={(e) => { setLocal({ ...local, unite: e.target.value }); onEnregistrer(p, { unite: e.target.value }); }}
          style={styleChamp}>
          {UNITES.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      </td>
      <td data-libelle="Prix" style={{ padding: '7px 10px', width: 120 }}>
        <input value={local.prix_unitaire}
          onChange={(e) => setLocal({ ...local, prix_unitaire: e.target.value })}
          onBlur={() => sortie('prix_unitaire', (v) => { const n = analyserNombre(v); return n === null ? 0 : n; })}
          inputMode="decimal"
          style={{ ...styleChamp, textAlign: 'right',
            borderColor: aZero ? th.avisTexte : th.line,
            color: aZero ? th.avisTexte : th.text }} autoComplete="off" />
      </td>
      <td style={{ padding: '7px 10px', textAlign: 'right', width: 42 }}>
        <button onClick={() => onSupprimer(p)} title="Supprimer" aria-label={`Supprimer ${p.description}`}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: th.textDim,
            padding: 4, display: 'inline-flex' }}><Trash2 size={15} /></button>
      </td>
    </tr>
  );
}

// ===========================================================================
// PETITES PIECES PARTAGEES
// ===========================================================================
function Carte({ th, titre, children }) {
  return (
    <div style={{ background: th.panel, border: `1px solid ${th.line}`, borderRadius: 8,
      padding: 16, boxShadow: th.ombre }}>
      {titre && (
        <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '.06em',
          textTransform: 'uppercase', color: th.textDim, marginBottom: 12 }}>{titre}</div>
      )}
      {children}
    </div>
  );
}

function Etiquette({ th, children, obligatoire }) {
  return (
    <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, letterSpacing: '.05em',
      textTransform: 'uppercase', color: th.textDim, marginBottom: 6 }}>
      {children}{obligatoire ? <span style={{ color: ROUGE }}> *</span> : null}
    </label>
  );
}

function Th({ th, children, droite }) {
  return (
    <th style={{ textAlign: droite ? 'right' : 'left', padding: '9px 12px', fontSize: 11.5,
      fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: th.textDim,
      background: th.panelAlt, whiteSpace: 'nowrap' }}>
      {children}
    </th>
  );
}

// ===========================================================================
export default function CreationExtraPage() {
  const [session, setSession] = useState(null);

  if (!session) {
    return (
      <GardeConnexion
        appSlug="creation-extra"
        nomApp="Création d'un extra"
        onPret={setSession}
      />
    );
  }

  return <CreationExtraApp nom={session.nom} poste={session.poste} />;
}

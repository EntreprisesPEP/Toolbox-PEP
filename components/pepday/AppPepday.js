import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ClipboardCheck, FileText, FolderKanban, Map as IconeCarte, BarChart3, DollarSign, BookUser, RotateCcw, LayoutDashboard,
  PanelLeft, PanelTop,
} from 'lucide-react';
import EnTeteApp from '../commun/EnTeteApp';
import { useModePep } from '../commun/ThemeToolbox';
import SessionPepday from './SessionPepday';
import { CSS_PEPDAY, variablesTheme } from './StylesPepday';
import { ContextePepday, Chargement, Encadre } from './ui';
import { creerDepotDemo } from '../../lib/pepday/depotDemo';
import { creerDepotSupabase, supabaseConfigure } from '../../lib/pepday/depotSupabase';
import { MEMBRE_DEMO_PAR_DEFAUT } from '../../lib/pepday/donneesDemo';
import { libelleRole, NOM_APP, VERSION } from '../../lib/pepday/constantes';
import { montantLigne, coutsParProjet, aujourdhui } from '../../lib/pepday/couts';
import { indicateursProjets } from '../../lib/pepday/direction';
import { rapportsAValider, flagsNonLus, estChargeDuProjet, peutVoirRapport } from '../../lib/pepday/workflow';
import VueAccueil from './VueAccueil';
import VueRapports from './VueRapports';
import VueRapport from './VueRapport';
import VueProjets from './VueProjets';
import VueProjet from './VueProjet';
import VueCarte from './VueCarte';
import VueGlobaux from './VueGlobaux';
import VueTaux from './VueTaux';
import VueRepertoires from './VueRepertoires';
import VueDirection from './VueDirection';

// ---------------------------------------------------------------------------
// PEPDAY — LA COQUILLE DE L'APP
//
// 1. SessionPepday fournit la session (fictive ici, Toolbox après l'import).
// 2. On choisit le dépôt : démonstration (en mémoire) ou Supabase.
// 3. On charge les données, on résout « moi » (fiche pepday.membres et ses
//    rôles), puis on affiche le bandeau commun, la barre d'outils de l'app
//    et l'écran demandé.
//
// La navigation suit l'adresse (?vue=rapport&id=…) : le bouton « retour » du
// cellulaire ramène à l'écran précédent, et un lien vers un rapport peut être
// envoyé par texto.
// ---------------------------------------------------------------------------

const ONGLETS = [
  { vue: 'accueil', libelle: 'À valider', Icone: ClipboardCheck },
  { vue: 'direction', libelle: 'Vue Direction', Icone: LayoutDashboard, cacherPour: ['contremaitre', 'dispatch'] },
  { vue: 'rapports', libelle: 'Rapports', Icone: FileText },
  { vue: 'projets', libelle: 'Projets', Icone: FolderKanban },
  { vue: 'carte', libelle: 'Carte', Icone: IconeCarte },
  { vue: 'globaux', libelle: 'Rapports globaux', Icone: BarChart3, cacherPour: ['contremaitre'] },
  { vue: 'taux', libelle: 'Taux', Icone: DollarSign, cacherPour: ['contremaitre'] },
  { vue: 'repertoires', libelle: 'Répertoires', Icone: BookUser },
];

// Écran parent de chaque écran de détail (onglet à allumer).
const PARENT = { rapport: 'rapports', projet: 'projets' };

function lireAdresse() {
  if (typeof window === 'undefined') return { vue: 'accueil' };
  const q = new URLSearchParams(window.location.search);
  return { vue: q.get('vue') || 'accueil', id: q.get('id') || null, onglet: q.get('onglet') || null };
}

function indexer(liste) {
  const m = {};
  for (const x of liste || []) m[x.id] = x;
  return m;
}

export default function AppPepday() {
  return <SessionPepday>{(session) => <AppAvecSession session={session} />}</SessionPepday>;
}

function AppAvecSession({ session }) {
  const [mode, setMode] = useModePep();

  // Position des filtres : « gauche » (rail collant le long du contenu, comme
  // Civalgo) ou « haut » (en ligne dans la carte de tête, la mise en page
  // d'origine). Réglage par personne, gardé dans le navigateur — il ne touche
  // pas la base. Lu après le premier rendu pour ne pas casser l'hydratation.
  const [positionFiltres, setPositionFiltresEtat] = useState('gauche');
  useEffect(() => {
    try {
      const v = window.localStorage.getItem('pepday-filtres-position');
      if (v === 'haut' || v === 'gauche') setPositionFiltresEtat(v);
    } catch (e) { /* stockage bloqué : on garde le défaut */ }
  }, []);
  const setPositionFiltres = useCallback((v) => {
    setPositionFiltresEtat(v);
    try { window.localStorage.setItem('pepday-filtres-position', v); } catch (e) { /* tant pis */ }
  }, []);

  const demoDemandee = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('demo') === '1';
  const enDemo = session.source === 'fictive' || demoDemandee || !supabaseConfigure();

  const depot = useMemo(() => (enDemo ? creerDepotDemo() : creerDepotSupabase()), [enDemo]);
  const [db, setDb] = useState(null);
  const [erreurChargement, setErreurChargement] = useState('');
  const [monMembre, setMonMembre] = useState(null);
  // Le personnage choisi en démo survit au rechargement de la page.
  const [personaDemo, setPersonaDemoEtat] = useState(() => {
    try { return window.localStorage.getItem('pepday-demo-persona'); } catch (e) { return null; }
  });
  const setPersonaDemo = (id) => {
    setPersonaDemoEtat(id);
    try { window.localStorage.setItem('pepday-demo-persona', id); } catch (e) { /* stockage bloqué : tant pis */ }
  };
  const [nav, setNav] = useState(lireAdresse);
  const [message, setMessage] = useState(null);

  const charger = useCallback(async () => {
    setErreurChargement('');
    try {
      if (depot.mode === 'supabase') {
        // Rattache le compte Toolbox à sa fiche membre avant de tout lire :
        // les règles RLS en dépendent.
        try { setMonMembre(await depot.monMembre()); } catch (e) { setMonMembre(null); }
      }
      setDb(await depot.chargerTout());
    } catch (e) {
      setErreurChargement(e.message || String(e));
    }
  }, [depot]);

  useEffect(() => { charger(); }, [charger]);

  useEffect(() => {
    const surRetour = () => setNav(lireAdresse());
    window.addEventListener('popstate', surRetour);
    return () => window.removeEventListener('popstate', surRetour);
  }, []);

  const naviguer = useCallback((vue, id = null, extra = {}) => {
    const q = new URLSearchParams();
    if (vue && vue !== 'accueil') q.set('vue', vue);
    if (id) q.set('id', id);
    Object.entries(extra).forEach(([k, v]) => { if (v) q.set(k, v); });
    if (demoDemandee) q.set('demo', '1');
    const chaine = q.toString();
    window.history.pushState(null, '', `${window.location.pathname}${chaine ? `?${chaine}` : ''}`);
    setNav({ vue, id, ...extra });
    window.scrollTo({ top: 0 });
  }, [demoDemandee]);

  // Index par id de chaque table, recalculés seulement quand la table change.
  const index = useMemo(() => {
    if (!db) return null;
    return Object.fromEntries(Object.entries(db).map(([t, liste]) => [t, indexer(liste)]));
  }, [db]);

  // « moi » : la personne connectée, avec ses rôles PEPday.
  const moi = useMemo(() => {
    if (!db) return null;
    if (depot.mode === 'demo') {
      const id = personaDemo
        || db.membres.find((m) => m.user_id === session.userId)?.id
        || MEMBRE_DEMO_PAR_DEFAUT;
      const m = db.membres.find((x) => x.id === id) || db.membres[0];
      return { membreId: m.id, nom: m.nom, titre: m.titre, roles: m.roles || [], estAdmin: false };
    }
    const m = monMembre || db.membres.find((x) => x.user_id === session.userId);
    return {
      membreId: m?.id || null,
      nom: m?.nom || session.nom,
      titre: m?.titre || session.poste,
      roles: m?.roles || [],
      estAdmin: session.estAdmin,
    };
  }, [db, depot.mode, personaDemo, monMembre, session]);

  // --- Actions sur les données : appellent le dépôt, puis mettent à jour
  // l'état local avec la rangée renvoyée (pas de rechargement complet).
  const actions = useMemo(() => ({
    async inserer(table, row) {
      const res = await depot.inserer(table, row);
      setDb((d) => {
        const suivant = { ...d, [table]: [...(d[table] || []), res] };
        // La ligne « Création » de l'historique est écrite par le dépôt (ou
        // le déclencheur SQL); on l'affiche tout de suite sans tout relire.
        if (table === 'rapports') {
          suivant.historique = [...d.historique, {
            id: `local-${res.id}`, rapport_id: res.id, de_etape: null, a_etape: res.etape || 1, action: 'creer',
            commentaire: '', par_id: moi?.membreId || null, par_nom: moi?.nom || '', le: res.created_at || new Date().toISOString(),
          }];
        }
        return suivant;
      });
      return res;
    },
    async insererPlusieurs(table, rows) {
      const res = await depot.insererPlusieurs(table, rows);
      setDb((d) => ({ ...d, [table]: [...(d[table] || []), ...res] }));
      return res;
    },
    async modifier(table, id, patch) {
      const res = await depot.modifier(table, id, patch);
      setDb((d) => ({ ...d, [table]: d[table].map((x) => (x.id === id ? res : x)) }));
      return res;
    },
    async supprimer(table, id) {
      await depot.supprimer(table, id);
      setDb((d) => {
        const suivant = { ...d, [table]: d[table].filter((x) => x.id !== id) };
        if (table === 'rapports') {
          ['lignes', 'photos', 'commentaires', 'historique', 'activites', 'ressources_provisoires'].forEach((t) => { suivant[t] = (d[t] || []).filter((x) => x.rapport_id !== id); });
        }
        if (table === 'lignes') {
          suivant.lignes = suivant.lignes.filter((x) => x.parent_ligne_id !== id);
        }
        if (table === 'projets') {
          ['budgets', 'documents'].forEach((t) => { suivant[t] = d[t].filter((x) => x.projet_id !== id); });
        }
        return suivant;
      });
    },
    async transition(rapportId, action, commentaire) {
      const { rapport, historique } = await depot.transition({ rapportId, action, commentaire, moi });
      setDb((d) => ({
        ...d,
        rapports: d.rapports.map((x) => (x.id === rapportId ? rapport : x)),
        historique: [...d.historique, historique],
      }));
      return rapport;
    },
    async accuserLecture(commentaireId) {
      const c = await depot.accuserLecture({ commentaireId, moi });
      setDb((d) => ({ ...d, commentaires: d.commentaires.map((x) => (x.id === commentaireId ? c : x)) }));
      return c;
    },
    televerser: (bucket, chemin, fichier) => depot.televerser(bucket, chemin, fichier),
    urlFichier: (bucket, chemin) => depot.urlFichier(bucket, chemin),
    supprimerFichier: (bucket, chemin) => depot.supprimerFichier(bucket, chemin),
    recharger: charger,
    notifier: (texte, type = 'ok') => setMessage({ texte, type, cle: Date.now() }),
  }), [depot, moi, charger]);

  // Le message de confirmation s'efface tout seul.
  useEffect(() => {
    if (!message) return undefined;
    const t = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(t);
  }, [message]);

  // Compteurs de la barre d'outils.
  const compteurs = useMemo(() => {
    if (!db || !moi || !index) return {};
    const aValider = rapportsAValider(moi, db.rapports, index.projets).length;
    const flags = flagsNonLus(db.commentaires).filter((c) => {
      const r = index.rapports[c.rapport_id];
      return r && estChargeDuProjet(moi, index.projets[r.projet_id]) && peutVoirRapport(moi, r);
    }).length;
    return { accueil: aValider + flags };
  }, [db, moi, index]);

  // Valeurs dérivées partagées par les écrans : total et nombre de flags de
  // chaque rapport, calculés une fois par changement de données.
  const derive = useMemo(() => {
    if (!db) return null;
    const totalParRapport = {};
    const lignesParRapport = {};
    for (const l of db.lignes) {
      totalParRapport[l.rapport_id] = (totalParRapport[l.rapport_id] || 0) + montantLigne(l);
      (lignesParRapport[l.rapport_id] = lignesParRapport[l.rapport_id] || []).push(l);
    }
    const flagsParRapport = {};
    for (const c of db.commentaires) {
      if (!c.lecture_obligatoire) continue;
      const f = (flagsParRapport[c.rapport_id] = flagsParRapport[c.rapport_id] || { nonLus: 0, lus: 0 });
      if (c.lu_le) f.lus += 1; else f.nonLus += 1;
    }
    return {
      totalParRapport, lignesParRapport, flagsParRapport,
      coutsProjet: coutsParProjet(db.rapports, db.lignes),
      indicateurs: indicateursProjets(db, aujourdhui()),
    };
  }, [db]);

  const contexte = useMemo(() => ({
    db, index, moi, depot, actions, naviguer, nav, enDemo, session, derive,
    positionFiltres, setPositionFiltres,
  }), [db, index, moi, depot, actions, naviguer, nav, enDemo, session, derive,
    positionFiltres, setPositionFiltres]);

  const ongletActif = PARENT[nav.vue] || nav.vue;
  const ongletsVisibles = ONGLETS.filter((o) => !o.cacherPour || !moi || moi.estAdmin
    || (moi.roles || []).some((r) => !o.cacherPour.includes(r)));

  let ecran;
  if (erreurChargement) {
    ecran = (
      <main className="pd-main pd-l900">
        <Encadre type="err">
          <strong>Impossible de charger les données PEPday.</strong><br />
          {erreurChargement}<br />
          <span className="pd-petit">Vérifie que les migrations du schéma « pepday » sont appliquées et que le schéma est exposé dans l’API Supabase.</span>
        </Encadre>
        <button className="pd-btn" onClick={charger}>Réessayer</button>
      </main>
    );
  } else if (!db || !moi) {
    ecran = <Chargement texte="Chargement de PEPday…" />;
  } else {
    switch (nav.vue) {
      case 'rapports': ecran = <VueRapports />; break;
      case 'rapport': ecran = <VueRapport id={nav.id} />; break;
      case 'projets': ecran = <VueProjets />; break;
      case 'projet': ecran = <VueProjet id={nav.id} />; break;
      case 'carte': ecran = <VueCarte />; break;
      case 'globaux': ecran = <VueGlobaux />; break;
      case 'taux': ecran = <VueTaux />; break;
      case 'repertoires': ecran = <VueRepertoires />; break;
      case 'direction': ecran = <VueDirection />; break;
      default: ecran = <VueAccueil />;
    }
  }

  const sansRole = db && moi && !moi.estAdmin && (moi.roles || []).length === 0;

  return (
    <div className="pd-scope" data-theme={mode === 'night' ? 'nuit' : 'jour'} style={variablesTheme(mode)}>
      <style jsx global>{CSS_PEPDAY}</style>
      <EnTeteApp
        titre={NOM_APP}
        sousTitre={`Rapports journaliers, validation et costs de chantier · ${VERSION}`}
        mode={mode}
        onChangerMode={setMode}
        nom={enDemo && moi ? moi.nom : session.nom}
        poste={enDemo && moi ? moi.titre : session.poste}
        onAccueil={() => naviguer('accueil')}
      />

      <div className="pd-barre pd-pas-imprimer">
        <nav className="pd-onglets" aria-label="Sections de PEPday">
          {ongletsVisibles.map(({ vue, libelle, Icone }) => (
            <button key={vue} className={`pd-onglet ${ongletActif === vue ? 'actif' : ''}`} onClick={() => naviguer(vue)}>
              <Icone size={15} /> {libelle}
              {compteurs[vue] > 0 && <span className="pd-compte">{compteurs[vue]}</span>}
            </button>
          ))}
        </nav>

        {/* Où mettre les filtres. Caché sur cellulaire : sous 1100 px le rail
            redevient de toute façon une carte empilée. */}
        <div className="pd-reglages">
          <span>Filtres</span>
          <button
            type="button"
            className={`pd-bascule ${positionFiltres === 'gauche' ? 'actif' : ''}`}
            onClick={() => setPositionFiltres('gauche')}
            aria-pressed={positionFiltres === 'gauche'}
          >
            <PanelLeft size={14} /> À gauche
          </button>
          <button
            type="button"
            className={`pd-bascule ${positionFiltres === 'haut' ? 'actif' : ''}`}
            onClick={() => setPositionFiltres('haut')}
            aria-pressed={positionFiltres === 'haut'}
          >
            <PanelTop size={14} /> En haut
          </button>
        </div>

        {enDemo && db && (
          <div className="pd-demo">
            <strong>Mode démo</strong>
            <span>— données fictives en mémoire. Voir l’app comme :</span>
            <select
              className="pd-input"
              style={{ width: 'auto', minHeight: 34, padding: '4px 8px', fontSize: 14 }}
              value={moi?.membreId || ''}
              onChange={(e) => setPersonaDemo(e.target.value)}
            >
              {db.membres.filter((m) => m.actif !== false).map((m) => (
                <option key={m.id} value={m.id}>{m.nom} — {(m.roles || []).map(libelleRole).join(', ') || 'aucun rôle'}</option>
              ))}
            </select>
            {depot.mode === 'demo' && (
              <button
                className="pd-btn fantome petit"
                onClick={async () => {
                  if (!window.confirm('Effacer toutes les modifications et repartir des données fictives d’origine ?')) return;
                  setDb(await depot.reinitialiser());
                  actions.notifier('Démo réinitialisée.');
                }}
              >
                <RotateCcw size={13} /> Réinitialiser la démo
              </button>
            )}
          </div>
        )}

        {sansRole && (
          <Encadre type="avis">
            Ton compte n’a encore aucun rôle dans PEPday : tu peux consulter, mais pas saisir ni valider.
            Un directeur construction t’ajoute dans <strong>Répertoires &gt; Équipe PEPday</strong>.
          </Encadre>
        )}
        {message && <div style={{ marginTop: 8 }}><Encadre type={message.type} onFermer={() => setMessage(null)}>{message.texte}</Encadre></div>}
      </div>

      <ContextePepday.Provider value={contexte}>
        {ecran}
      </ContextePepday.Provider>
    </div>
  );
}

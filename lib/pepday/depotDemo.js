// ---------------------------------------------------------------------------
// PEPDAY — DÉPÔT DE DÉMONSTRATION (en mémoire, sans Supabase)
//
// Même interface que depotSupabase.js : l'app ne sait pas lequel des deux
// elle utilise. Les données vivent en mémoire; une copie est gardée dans le
// navigateur (localStorage) pour qu'un rafraîchissement de page au chantier
// ne fasse pas tout perdre. « Réinitialiser la démo » repart des données
// fictives d'origine.
//
// Les règles de validation sont celles de workflow.js — les mêmes que
// l'interface — pour que la démo refuse ce que Supabase refuserait.
// ---------------------------------------------------------------------------

import { creerDonneesDemo } from './donneesDemo';
import { verifierTransition, estChargeDuProjet, rapportsAAbandonner } from './workflow';
import { ETAPE_VERROUILLE, JOURS_AVANT_ABANDON } from './constantes';

const CLE_STOCKAGE = 'pepday-demo-rv02';

function nouvelId(prefixe) {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return `${prefixe}-${crypto.randomUUID()}`;
  return `${prefixe}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function lireStockage() {
  try {
    const brut = typeof window !== 'undefined' && window.localStorage.getItem(CLE_STOCKAGE);
    return brut ? JSON.parse(brut) : null;
  } catch (e) {
    return null;
  }
}

function ecrireStockage(db) {
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(CLE_STOCKAGE, JSON.stringify(db));
  } catch (e) {
    // Quota dépassé (photos en base64) : on garde quand même tout en mémoire.
    // On réessaie sans les photos pour au moins conserver les rapports.
    try {
      window.localStorage.setItem(CLE_STOCKAGE, JSON.stringify({ ...db, photos: [], documents: [] }));
    } catch (e2) { /* tant pis : la démo reste en mémoire seulement */ }
  }
}

const copie = (x) => JSON.parse(JSON.stringify(x));

export function creerDepotDemo() {
  let db = lireStockage();
  const sauver = () => ecrireStockage(db);
  if (!db) {
    db = creerDonneesDemo();
    sauver();
  }

  // RV02 : fermeture automatique des rapports jamais remplis (le même
  // travail que pepday.fermer_rapports_abandonnes() en SQL, lancé à chaque
  // ouverture de la démo).
  function fermerAbandonnes() {
    const jours = Number((db.parametres || []).find((x) => x.id === 'jours_avant_abandon')?.valeur) || JOURS_AVANT_ABANDON;
    const p2 = (n) => String(n).padStart(2, '0');
    const d = new Date();
    const auj = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
    const vieux = rapportsAAbandonner(db.rapports, db.lignes, auj, jours);
    const maintenant = new Date().toISOString();
    vieux.forEach((r) => {
      r.abandonne = true;
      r.abandonne_le = maintenant;
      r.abandonne_raison = `Fermeture automatique : jamais rempli après ${jours} jours`;
      (db.historique = db.historique || []).push({
        id: nouvelId('hi'), rapport_id: r.id, de_etape: r.etape, a_etape: r.etape, action: 'abandonner',
        commentaire: r.abandonne_raison, par_id: null, par_nom: 'Fermeture automatique', le: maintenant,
      });
    });
    if (vieux.length) sauver();
  }
  fermerAbandonnes();
  const table = (nom) => {
    if (!db[nom]) db[nom] = [];
    return db[nom];
  };

  function verrouille(rapportId) {
    const r = table('rapports').find((x) => x.id === rapportId);
    return r && r.etape >= ETAPE_VERROUILLE;
  }

  // Un rapport verrouillé ne change plus — ni lui, ni ses lignes, photos ou
  // commentaires. C'est la même garde que le déclencheur SQL.
  // La régularisation d'une ressource hors catalogue (lien vers sa fiche)
  // reste permise après le verrou : elle ne change aucun cost.
  function gardeVerrou(nomTable, row, operation = 'ecrire') {
    if (nomTable === 'rapports' && row?.etape >= ETAPE_VERROUILLE) throw new Error('Ce rapport est verrouillé.');
    if (nomTable === 'ressources_provisoires' && operation === 'modifier') return;
    if (['lignes', 'photos', 'commentaires', 'activites', 'ressources_provisoires'].includes(nomTable) && row?.rapport_id && verrouille(row.rapport_id)) {
      throw new Error('Ce rapport est verrouillé.');
    }
  }

  return {
    mode: 'demo',

    async chargerTout() {
      return copie(db);
    },

    async inserer(nomTable, row) {
      gardeVerrou(nomTable, row);
      const maintenant = new Date().toISOString();
      const nouveau = { id: nouvelId(nomTable.slice(0, 2)), created_at: maintenant, ...row };
      if (nomTable === 'rapports') {
        nouveau.numero = Math.max(1000, ...table('rapports').map((r) => r.numero || 0)) + 1;
        nouveau.updated_at = maintenant;
      }
      table(nomTable).push(nouveau);
      // La création est la première ligne de l'historique (en SQL : le
      // déclencheur pepday.historique_creation).
      if (nomTable === 'rapports') {
        const auteur = table('membres').find((m) => m.id === nouveau.created_by);
        table('historique').push({
          id: nouvelId('hi'), rapport_id: nouveau.id, de_etape: null, a_etape: nouveau.etape || 1, action: 'creer',
          commentaire: '', par_id: nouveau.created_by || null, par_nom: auteur?.nom || '', le: maintenant,
        });
      }
      sauver();
      return copie(nouveau);
    },

    async insererPlusieurs(nomTable, rows) {
      const res = [];
      for (const r of rows) res.push(await this.inserer(nomTable, r));
      return res;
    },

    async modifier(nomTable, id, patch) {
      const t = table(nomTable);
      const i = t.findIndex((x) => x.id === id);
      if (i < 0) throw new Error('Élément introuvable.');
      gardeVerrou(nomTable, t[i], 'modifier');
      if (nomTable === 'rapports' && 'etape' in patch) throw new Error('L’étape change seulement par une transition.');
      t[i] = { ...t[i], ...patch, ...(nomTable === 'rapports' ? { updated_at: new Date().toISOString() } : {}) };
      sauver();
      return copie(t[i]);
    },

    async supprimer(nomTable, id) {
      const t = table(nomTable);
      const i = t.findIndex((x) => x.id === id);
      if (i < 0) return;
      gardeVerrou(nomTable, t[i]);
      t.splice(i, 1);
      // Les primes suivent la ligne de l'employé.
      if (nomTable === 'lignes') db.lignes = table('lignes').filter((x) => x.parent_ligne_id !== id);
      if (nomTable === 'rapports') {
        ['lignes', 'photos', 'commentaires', 'historique', 'activites', 'ressources_provisoires'].forEach((n) => { db[n] = table(n).filter((x) => x.rapport_id !== id); });
      }
      if (nomTable === 'projets') {
        db.budgets = table('budgets').filter((x) => x.projet_id !== id);
        db.documents = table('documents').filter((x) => x.projet_id !== id);
      }
      sauver();
    },

    // Avancer ou renvoyer un rapport, avec l'historique horodaté.
    async transition({ rapportId, action, commentaire, moi }) {
      const r = table('rapports').find((x) => x.id === rapportId);
      const projet = table('projets').find((p) => p.id === r?.projet_id);
      const comms = table('commentaires').filter((c) => c.rapport_id === rapportId);
      const erreur = verifierTransition({ moi, rapport: r, projet, action, commentaire, commentaires: comms });
      if (erreur) throw new Error(erreur);

      const de = r.etape;
      const maintenant = new Date().toISOString();
      let a = de;
      if (action === 'abandonner') {
        r.abandonne = true; r.abandonne_le = maintenant; r.abandonne_raison = commentaire.trim();
      } else if (action === 'reactiver') {
        r.abandonne = false; r.abandonne_le = null; r.abandonne_raison = null;
      } else {
        a = action === 'renvoyer' ? de - 1 : de + 1;
        r.etape = a;
      }
      r.updated_at = maintenant;
      if (a === ETAPE_VERROUILLE) {
        r.confirme_par_id = moi.membreId;
        r.confirme_par_nom = moi.nom;
        r.confirme_le = maintenant;
      }
      const h = {
        id: nouvelId('hi'), rapport_id: rapportId, de_etape: de, a_etape: a, action,
        commentaire: (commentaire || '').trim(), par_id: moi.membreId, par_nom: moi.nom, le: maintenant,
      };
      table('historique').push(h);
      sauver();
      return { rapport: copie(r), historique: copie(h) };
    },

    async accuserLecture({ commentaireId, moi }) {
      const c = table('commentaires').find((x) => x.id === commentaireId);
      if (!c) throw new Error('Commentaire introuvable.');
      const r = table('rapports').find((x) => x.id === c.rapport_id);
      const projet = table('projets').find((p) => p.id === r?.projet_id);
      if (!estChargeDuProjet(moi, projet)) throw new Error('Seul le chargé de projet peut accuser la lecture.');
      if (c.lu_le) return copie(c);
      c.lu_par_id = moi.membreId;
      c.lu_par_nom = moi.nom;
      c.lu_le = new Date().toISOString();
      sauver();
      return copie(c);
    },

    // Les fichiers de la démo sont gardés en base64 dans la rangée même.
    async televerser(bucket, chemin, fichier) {
      const dataUrl = await new Promise((resoudre, rejeter) => {
        const lecteur = new FileReader();
        lecteur.onload = () => resoudre(lecteur.result);
        lecteur.onerror = rejeter;
        lecteur.readAsDataURL(fichier);
      });
      return { chemin: dataUrl };
    },

    async urlFichier(bucket, chemin) {
      return chemin;
    },

    async supprimerFichier() { /* rien à faire : le fichier vit dans la rangée */ },

    async reinitialiser() {
      db = creerDonneesDemo();
      sauver();
      return copie(db);
    },
  };
}

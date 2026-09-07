import { useState, useEffect, useMemo, useCallback, Fragment } from 'react';
import Head from 'next/head';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const supabaseFact = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { db: { schema: 'facturation' } });

const NAVY = '#14213D';
const RED = '#C41230';
const BG = '#EDEFF1';
const GREEN = '#2fa360';
const APP_SLUG = 'facturation-fournisseurs';
const LOGO_PEP = '/_static/planification-hebdomadaire/logo-pep.png';
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_FACTURATION_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

const ETAPES = [
  { cle: 'adjointe', label: 'Adjointe administrative', feature: 'approbation_adjointe' },
  { cle: 'charge_projet', label: 'Chargé de projet', feature: 'approbation_charge_projet' },
  { cle: 'directeur', label: 'Directeur construction', feature: 'approbation_directeur' },
  { cle: 'payables', label: 'Comptes payables', feature: 'approbation_payables' },
];

function Center({ children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '80vh', gap: 12, fontFamily: 'Calibri, sans-serif' }}>
      {children}
    </div>
  );
}
function Spinner() {
  return (
    <>
      <div style={{ border: '3px solid #ddd', borderTopColor: NAVY, borderRadius: '50%', width: 28, height: 28, animation: 'spin 0.8s linear infinite' }} />
      <style jsx>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}

const btn = { fontFamily: 'inherit', background: NAVY, color: '#fff', border: 'none', borderRadius: 5, padding: '8px 16px', cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap' };
const btnGhost = { ...btn, background: '#fff', color: NAVY, border: `1px solid ${NAVY}` };
const btnDanger = { ...btn, background: RED };
const btnGreen = { ...btn, background: GREEN };
const input = { padding: '7px 9px', borderRadius: 5, border: '1px solid #ccc', fontFamily: 'inherit', fontSize: 13, width: '100%', boxSizing: 'border-box' };
const card = { background: '#fff', borderRadius: 8, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: 16 };
const th = { textAlign: 'left', padding: '7px 10px', color: '#fff', fontWeight: 600, fontSize: 11.5, background: NAVY, textTransform: 'uppercase', letterSpacing: '0.03em', whiteSpace: 'nowrap' };
const td = { padding: '6px 10px', verticalAlign: 'middle', fontSize: 13, borderBottom: '1px solid #EDEFF1' };
const tabBtn = (actif) => ({
  ...btn, background: actif ? NAVY : '#fff', color: actif ? '#fff' : NAVY,
  border: `1px solid ${NAVY}`, borderRadius: 20, padding: '7px 16px', fontSize: 12.5, fontWeight: 600,
});
const badgeFlag = { background: '#fde7e7', color: RED, borderRadius: 4, padding: '2px 7px', fontSize: 11, fontWeight: 700 };
const badgeOk = { background: '#e6f4ea', color: GREEN, borderRadius: 4, padding: '2px 7px', fontSize: 11, fontWeight: 700 };

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result.split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function fmtMontant(v) {
  if (v == null) return '—';
  return Number(v).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' });
}

export default function FacturationFournisseursPage() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [estAdmin, setEstAdmin] = useState(false);
  const [featuresUtilisateur, setFeaturesUtilisateur] = useState([]);

  const [tab, setTab] = useState('tableau-de-bord');
  const [erreur, setErreur] = useState('');
  const [messageOk, setMessageOk] = useState('');

  const [fournisseurs, setFournisseurs] = useState([]);
  const [items, setItems] = useState([]);
  const [factures, setFactures] = useState([]);
  const [bonsCommande, setBonsCommande] = useState([]);
  const [flags, setFlags] = useState([]);
  const [statsItems, setStatsItems] = useState([]);

  const [notifState, setNotifState] = useState('verification');
  const [erreurNotifTech, setErreurNotifTech] = useState('');

  const peutModifier = estAdmin || featuresUtilisateur.includes('modifier');
  const peutApprouver = (etape) => estAdmin || featuresUtilisateur.includes(
    ETAPES.find((e) => e.cle === etape)?.feature
  );

  const chargerTout = useCallback(async () => {
    const [f, i, fac, po, fl, stats] = await Promise.all([
      supabaseFact.from('fournisseurs').select('*').order('nom'),
      supabaseFact.from('items').select('*').order('nom'),
      supabaseFact.from('factures').select('*').order('created_at', { ascending: false }).limit(200),
      supabaseFact.from('bons_commande').select('*').order('created_at', { ascending: false }),
      supabaseFact.from('flags').select('*').eq('resolu', false).order('created_at', { ascending: false }),
      supabaseFact.from('v_stats_item').select('*'),
    ]);
    setFournisseurs(f.data || []);
    setItems(i.data || []);
    setFactures(fac.data || []);
    setBonsCommande(po.data || []);
    setFlags(fl.data || []);
    setStatsItems(stats.data || []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { session: s } } = await supabase.auth.getSession();
      if (!s) { setLoading(false); return; }
      setSession(s);

      const { data: appAccess } = await supabase
        .from('pep_user_apps').select('app_slug').eq('user_id', s.user.id).eq('app_slug', APP_SLUG).maybeSingle();
      const { data: roleRow } = await supabase
        .from('pep_user_roles').select('role').eq('user_id', s.user.id).maybeSingle();
      const admin = roleRow?.role === 'admin';
      setEstAdmin(admin);

      if (!appAccess && !admin) { setDenied(true); setLoading(false); return; }

      const { data: featRows } = await supabase
        .from('pep_user_features').select('feature_key').eq('user_id', s.user.id).eq('app_slug', APP_SLUG);
      setFeaturesUtilisateur((featRows || []).map((r) => r.feature_key));

      await chargerTout();
      setLoading(false);

      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        setNotifState('non-supporte');
      } else {
        navigator.serviceWorker.getRegistration('/sw-facturation-fournisseurs.js').then(async (reg) => {
          if (reg) {
            const sub = await reg.pushManager.getSubscription();
            setNotifState(sub ? 'actif' : 'inactif');
          } else {
            setNotifState('inactif');
          }
        });
      }
    })();
  }, [chargerTout]);

  async function activerNotifications() {
    setErreurNotifTech('');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { setNotifState('refuse'); return; }

      let registration;
      try {
        registration = await navigator.serviceWorker.register('/sw-facturation-fournisseurs.js');
        await navigator.serviceWorker.ready;
      } catch (err) {
        setErreurNotifTech(`Impossible d'enregistrer le service worker : ${err.message}`);
        setNotifState('erreur-technique');
        return;
      }

      let subscription;
      try {
        if (!VAPID_PUBLIC_KEY) throw new Error('Clé VAPID publique manquante (NEXT_PUBLIC_FACTURATION_VAPID_PUBLIC_KEY).');
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      } catch (err) {
        setErreurNotifTech(`Impossible de s'abonner aux notifications : ${err.message}`);
        setNotifState('erreur-technique');
        return;
      }

      await appelApi('/api/facturation/push-subscribe', { subscription });
      setNotifState('actif');
    } catch (err) {
      setErreurNotifTech(err.message || 'Erreur inconnue.');
      setNotifState('erreur-technique');
    }
  }

  async function desactiverNotifications() {
    try {
      const registration = await navigator.serviceWorker.getRegistration('/sw-facturation-fournisseurs.js');
      if (registration) {
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          try { await appelApi('/api/facturation/push-subscribe', { endpoint: subscription.endpoint }, 'DELETE'); } catch (e) { /* ignore */ }
          await subscription.unsubscribe();
        }
      }
      setNotifState('inactif');
    } catch (err) {
      // silencieux
    }
  }

  async function appelApi(chemin, corps, methode = 'POST') {
    const { data: { session: s } } = await supabase.auth.getSession();
    const resp = await fetch(chemin, {
      method: methode,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s?.access_token}` },
      ...(methode === 'GET' ? {} : { body: JSON.stringify(corps) }),
    });
    const json = await resp.json();
    if (!resp.ok) throw new Error(json.error || 'Erreur inconnue');
    return json;
  }

  if (loading) return <Center><Spinner /><div>Chargement…</div></Center>;
  if (!session) return <Center><div>Tu dois être connecté pour accéder à cette page.</div></Center>;
  if (denied) return <Center><div>Accès refusé à Validation factures de fournisseurs.</div></Center>;

  return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: 'Calibri, sans-serif', color: '#222' }}>
      <Head><title>Validation factures de fournisseurs — Toolbox PEP</title></Head>

      <div style={{ background: NAVY, padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <img src={LOGO_PEP} alt="PEP" style={{ height: 40 }} />
        <h1 style={{ color: '#fff', fontSize: 19, margin: 0, flex: 1 }}>Validation factures de fournisseurs</h1>
        {notifState === 'actif' && (
          <button style={{ ...btnGhost, background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.5)' }} onClick={desactiverNotifications}>
            🔕 Désactiver les notifications
          </button>
        )}
        {(notifState === 'inactif' || notifState === 'refuse' || notifState === 'erreur-technique') && (
          <button style={{ ...btnGhost, background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.5)' }} onClick={activerNotifications}>
            🔔 Activer les notifications
          </button>
        )}
        <a href="/" style={{ color: '#fff', textDecoration: 'none', fontSize: 13, border: '1px solid rgba(255,255,255,0.5)', borderRadius: 5, padding: '6px 12px' }}>
          ← Retour au Toolbox PEP
        </a>
      </div>
      {erreurNotifTech && (
        <div style={{ background: '#fde7e7', color: RED, padding: '8px 24px', fontSize: 12 }}>
          {erreurNotifTech} <button style={btnGhost} onClick={() => setErreurNotifTech('')}>OK</button>
        </div>
      )}

      <div style={{ padding: 20, maxWidth: 1400, margin: '0 auto' }}>
        {erreur && <div style={{ ...card, background: '#fde7e7', color: RED }}>{erreur} <button style={btnGhost} onClick={() => setErreur('')}>OK</button></div>}
        {messageOk && <div style={{ ...card, background: '#e6f4ea', color: GREEN }}>{messageOk} <button style={btnGhost} onClick={() => setMessageOk('')}>OK</button></div>}

        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <button style={tabBtn(tab === 'tableau-de-bord')} onClick={() => setTab('tableau-de-bord')}>📊 Tableau de bord</button>
          <button style={tabBtn(tab === 'factures')} onClick={() => setTab('factures')}>🧾 Factures</button>
          <button style={tabBtn(tab === 'fournisseurs')} onClick={() => setTab('fournisseurs')}>🏢 Fournisseurs &amp; gabarits</button>
          <button style={tabBtn(tab === 'catalogue')} onClick={() => setTab('catalogue')}>📦 Catalogue &amp; prix</button>
          <button style={tabBtn(tab === 'bons-commande')} onClick={() => setTab('bons-commande')}>📋 Bons de commande</button>
          <button style={tabBtn(tab === 'approbations')} onClick={() => setTab('approbations')}>✅ Approbations</button>
        </div>

        {tab === 'tableau-de-bord' && (
          <TableauDeBord
            factures={factures} flags={flags} bonsCommande={bonsCommande} fournisseurs={fournisseurs}
            estAdmin={estAdmin} appelApi={appelApi} recharger={chargerTout} setErreur={setErreur} setMessageOk={setMessageOk}
          />
        )}

        {tab === 'factures' && (
          <OngletFactures
            peutModifier={peutModifier}
            fournisseurs={fournisseurs}
            bonsCommande={bonsCommande}
            factures={factures}
            flags={flags}
            appelApi={appelApi}
            recharger={chargerTout}
            setErreur={setErreur}
            setMessageOk={setMessageOk}
          />
        )}

        {tab === 'fournisseurs' && (
          <OngletFournisseurs
            peutModifier={peutModifier}
            fournisseurs={fournisseurs}
            appelApi={appelApi}
            recharger={chargerTout}
            setErreur={setErreur}
            setMessageOk={setMessageOk}
          />
        )}

        {tab === 'catalogue' && (
          <OngletCatalogue
            items={items} statsItems={statsItems} peutModifier={peutModifier}
            recharger={chargerTout} setErreur={setErreur} setMessageOk={setMessageOk}
          />
        )}

        {tab === 'bons-commande' && (
          <OngletBonsCommande
            peutModifier={peutModifier}
            fournisseurs={fournisseurs}
            items={items}
            bonsCommande={bonsCommande}
            recharger={chargerTout}
            setErreur={setErreur}
            setMessageOk={setMessageOk}
          />
        )}

        {tab === 'approbations' && (
          <OngletApprobations
            factures={factures}
            peutApprouver={peutApprouver}
            appelApi={appelApi}
            recharger={chargerTout}
            setErreur={setErreur}
            setMessageOk={setMessageOk}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// TABLEAU DE BORD
// ---------------------------------------------------------------------
function TableauDeBord({ factures, flags, bonsCommande, fournisseurs, estAdmin, appelApi, recharger, setErreur, setMessageOk }) {
  const enAttente = factures.filter((f) => f.statut_workflow !== 'approuve_final' && f.statut_workflow !== 'rejete');
  const avecFlags = factures.filter((f) => f.a_des_flags);
  const nomFournisseur = (id) => fournisseurs.find((f) => f.id === id)?.nom || '—';

  const [seuil, setSeuil] = useState(null);
  const [seuilEdite, setSeuilEdite] = useState('');

  useEffect(() => {
    if (!estAdmin) return;
    (async () => {
      try {
        const res = await appelApi('/api/facturation/parametres', undefined, 'GET');
        const p = res.parametres?.find((x) => x.cle === 'seuil_ecart_prix_pourcent');
        setSeuil(p?.valeur ?? 15);
        setSeuilEdite(String(p?.valeur ?? 15));
      } catch (e) { /* silencieux si la table n'existe pas encore */ }
    })();
  }, [estAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  async function sauvegarderSeuil() {
    const v = Number(seuilEdite);
    if (!Number.isFinite(v) || v <= 0) { setErreur('Le seuil doit être un nombre positif.'); return; }
    try {
      await appelApi('/api/facturation/parametres', { cle: 'seuil_ecart_prix_pourcent', valeur: v });
      setSeuil(v);
      setMessageOk('Seuil de flag mis à jour à ' + v + '%.');
    } catch (e) { setErreur(e.message); }
  }

  return (
    <>
      {estAdmin && seuil !== null && (
        <div style={{ ...card, background: '#f7f8fa' }}>
          <b>⚙️ Seuil de flag sur les prix : </b>
          un prix facturé est signalé quand il dépasse la moyenne historique de plus de&nbsp;
          <input style={{ ...input, width: 70, display: 'inline-block' }} value={seuilEdite} onChange={(e) => setSeuilEdite(e.target.value)} />%
          <button style={{ ...btnGhost, marginLeft: 8 }} onClick={sauvegarderSeuil}>Enregistrer</button>
        </div>
      )}
      <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ ...card, flex: 1, minWidth: 180, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: NAVY }}>{factures.length}</div>
          <div style={{ fontSize: 12, color: '#666' }}>Factures importées</div>
        </div>
        <div style={{ ...card, flex: 1, minWidth: 180, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: NAVY }}>{enAttente.length}</div>
          <div style={{ fontSize: 12, color: '#666' }}>En attente d'approbation</div>
        </div>
        <div style={{ ...card, flex: 1, minWidth: 180, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: RED }}>{flags.length}</div>
          <div style={{ fontSize: 12, color: '#666' }}>Flags non résolus</div>
        </div>
        <div style={{ ...card, flex: 1, minWidth: 180, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: NAVY }}>{bonsCommande.filter((p) => p.statut === 'ouvert').length}</div>
          <div style={{ fontSize: 12, color: '#666' }}>Bons de commande ouverts</div>
        </div>
      </div>

      <div style={card}>
        <h3 style={{ marginTop: 0 }}>🚩 Flags actifs</h3>
        {flags.length === 0 && <div style={{ color: '#666' }}>Aucun flag actif — tout est beau.</div>}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={th}>Type</th><th style={th}>Détails</th><th style={th}>Facture</th><th style={th}></th>
          </tr></thead>
          <tbody>
            {flags.map((f) => {
              const facture = factures.find((x) => x.id === f.facture_id);
              return (
                <tr key={f.id}>
                  <td style={td}><span style={badgeFlag}>{f.type_flag}</span></td>
                  <td style={td}>{resumeFlag(f)}</td>
                  <td style={td}>{facture ? `${nomFournisseur(facture.fournisseur_id)} — ${facture.numero_facture || '(sans numéro)'}` : '—'}</td>
                  <td style={td}>
                    <button style={btnGhost} onClick={async () => {
                      try {
                        await appelApi('/api/facturation/resoudre-flag', { flagId: f.id });
                        setMessageOk('Flag marqué résolu.');
                        await recharger();
                      } catch (e) { setErreur(e.message); }
                    }}>✓ Résoudre</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function resumeFlag(f) {
  const d = f.details || {};
  if (f.type_flag === 'prix_eleve') {
    return `Prix facturé ${fmtMontant(d.prix_facture)} vs moyenne historique ${fmtMontant(d.prix_moyen_historique)} (+${d.ecart_pourcent}%)`;
  }
  if (f.type_flag === 'po_manquant') {
    return `"${d.description}" ne correspond à aucune ligne du PO`;
  }
  if (f.type_flag === 'po_prix_different') {
    return `"${d.description}" : ${fmtMontant(d.prix_facture)} facturé vs ${fmtMontant(d.prix_po)} au PO (${d.ecart_pourcent}%)`;
  }
  if (f.type_flag === 'po_depasse') {
    return `"${d.description}" dépasse le PO de ${d.depassement}`;
  }
  if (f.type_flag === 'parsing_incertain') {
    return d.raison || 'La lecture automatique de cette facture est peu fiable.';
  }
  return JSON.stringify(d);
}

// ---------------------------------------------------------------------
// FACTURES (liste + import)
// ---------------------------------------------------------------------
const STATUT_LISIBLE = {
  en_attente_adjointe: "En attente — adjointe",
  en_attente_charge_projet: "En attente — chargé de projet",
  en_attente_directeur: "En attente — directeur",
  en_attente_payables: "En attente — payables",
  approuve_final: "Approuvée",
  rejete: "Rejetée",
};

function OngletFactures({ peutModifier, fournisseurs, bonsCommande, factures, flags, appelApi, recharger, setErreur, setMessageOk }) {
  const [fichier, setFichier] = useState(null);
  const [fournisseurId, setFournisseurId] = useState('');
  const [poId, setPoId] = useState('');
  const [projetNo, setProjetNo] = useState('');
  const [enTraitement, setEnTraitement] = useState(false);
  const [factureOuverte, setFactureOuverte] = useState(null);
  const [lignesFactureOuverte, setLignesFactureOuverte] = useState([]);
  const [ligneEnEdition, setLigneEnEdition] = useState(null);
  const [historiqueFacture, setHistoriqueFacture] = useState([]);

  const [filtreFournisseur, setFiltreFournisseur] = useState('');
  const [filtreStatut, setFiltreStatut] = useState('');
  const [filtreTexte, setFiltreTexte] = useState('');
  const [filtreFlagsSeulement, setFiltreFlagsSeulement] = useState(false);

  const posDuFournisseur = bonsCommande.filter((p) => p.fournisseur_id === fournisseurId && p.statut === 'ouvert');

  const facturesFiltrees = useMemo(() => {
    const q = filtreTexte.trim().toLowerCase();
    return factures.filter((f) => {
      if (filtreFournisseur && f.fournisseur_id !== filtreFournisseur) return false;
      if (filtreStatut && f.statut_workflow !== filtreStatut) return false;
      if (filtreFlagsSeulement && !f.a_des_flags) return false;
      if (q) {
        const fournisseurNom = (fournisseurs.find((x) => x.id === f.fournisseur_id)?.nom || '').toLowerCase();
        const hay = `${f.numero_facture || ''} ${fournisseurNom} ${f.projet_no || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [factures, filtreFournisseur, filtreStatut, filtreTexte, filtreFlagsSeulement, fournisseurs]);

  async function exporterExcel() {
    try {
      const ExcelJS = (await import('exceljs')).default;
      const colonnes = [
        { header: 'Fournisseur', key: 'fournisseur', width: 26 },
        { header: 'N° facture', key: 'numero', width: 18 },
        { header: 'Date', key: 'date', width: 14 },
        { header: 'N° projet', key: 'projet', width: 14 },
        { header: 'Sous-total', key: 'sousTotal', width: 14 },
        { header: 'Taxes', key: 'taxes', width: 12 },
        { header: 'Total', key: 'total', width: 14 },
        { header: 'Statut', key: 'statut', width: 24 },
        { header: 'Flags', key: 'flags', width: 10 },
        { header: 'Confiance lecture', key: 'confiance', width: 16 },
      ];
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Factures', { views: [{ state: 'frozen', ySplit: 1 }] });
      colonnes.forEach((c, i) => { ws.getColumn(i + 1).width = c.width; });
      colonnes.forEach((c, i) => {
        const cell = ws.getCell(1, i + 1);
        cell.value = c.header;
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Calibri' };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF14213D' } };
      });
      facturesFiltrees.forEach((f, idx) => {
        const fournisseur = fournisseurs.find((x) => x.id === f.fournisseur_id);
        const nbFlags = flags.filter((fl) => fl.facture_id === f.id).length;
        const rangee = idx + 2;
        const valeurs = {
          fournisseur: fournisseur?.nom || '',
          numero: f.numero_facture || '',
          date: f.date_facture || '',
          projet: f.projet_no || '',
          sousTotal: f.sous_total ?? '',
          taxes: f.taxes ?? '',
          total: f.total ?? '',
          statut: STATUT_LISIBLE[f.statut_workflow] || f.statut_workflow,
          flags: nbFlags,
          confiance: f.parsing_confiance || '',
        };
        colonnes.forEach((c, i) => {
          const cell = ws.getCell(rangee, i + 1);
          cell.value = valeurs[c.key];
          cell.font = { name: 'Calibri', size: 11 };
          if (idx % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F8FA' } };
        });
      });
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colonnes.length } };
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `factures-fournisseurs-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      setErreur('Erreur export Excel : ' + e.message);
    }
  }

  async function importer() {
    if (!fichier || !fournisseurId) { setErreur('Choisis un fournisseur et un fichier PDF.'); return; }
    setEnTraitement(true);
    try {
      const b64 = await fileToBase64(fichier);
      const res = await appelApi('/api/facturation/import-facture', {
        fournisseurId, poId: poId || null, projetNo: projetNo || null,
        fichierBase64: b64, nomFichier: fichier.name,
      });
      setMessageOk(`Facture importée (confiance de lecture : ${res.confiance}, ${res.nbLignes} lignes, ${res.nbFlags} flag(s)).`);
      setFichier(null);
      await recharger();
    } catch (e) {
      setErreur(e.message);
    } finally {
      setEnTraitement(false);
    }
  }

  async function chargerLogoBase64() {
    try {
      const resp = await fetch(LOGO_PEP);
      const blob = await resp.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      return null;
    }
  }

  async function exporterFacturePdf(facture) {
    try {
      const fournisseur = fournisseurs.find((x) => x.id === facture.fournisseur_id);
      const [{ data: lignes }, { data: hist }, { data: flagsFacture }] = await Promise.all([
        supabaseFact.from('facture_lignes').select('*').eq('facture_id', facture.id).order('created_at'),
        supabaseFact.from('historique').select('*').eq('facture_id', facture.id).order('created_at', { ascending: false }),
        // Requête directe (le prop "flags" du parent n'a QUE les flags non
        // résolus) pour que le PDF montre aussi les flags déjà résolus.
        supabaseFact.from('flags').select('*').eq('facture_id', facture.id).order('created_at'),
      ]);
      const { pdf, Document, Page, View, Text, StyleSheet, Image } = await import('@react-pdf/renderer');
      const logoDataUrl = await chargerLogoBase64();

      const styles = StyleSheet.create({
        page: { paddingTop: 10, paddingBottom: 24, paddingHorizontal: 24, fontSize: 9 },
        headerBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#14213D', padding: 10, marginBottom: 10 },
        logo: { width: 30, height: 30, marginRight: 10 },
        titre: { color: '#ffffff', fontSize: 13, fontWeight: 700 },
        sousTitre: { color: '#B9C2CC', fontSize: 8, marginLeft: 'auto' },
        section: { marginBottom: 10 },
        label: { fontWeight: 700, color: '#14213D' },
        row: { flexDirection: 'row' },
        th: { backgroundColor: '#14213D', color: '#ffffff', padding: 4, fontSize: 8, fontWeight: 700 },
        td: { padding: 4, fontSize: 8, borderBottomWidth: 0.5, borderBottomColor: '#EDEFF1' },
        flagBox: { backgroundColor: '#fde7e7', padding: 6, marginBottom: 4, borderRadius: 3 },
        pied: { position: 'absolute', bottom: 10, left: 24, right: 24, fontSize: 7, color: '#8a93a0', textAlign: 'center' },
      });

      const colonnes = [
        { label: 'Description', key: 'description_brute', width: '46%' },
        { label: 'Qté', key: 'quantite', width: '12%' },
        { label: 'Prix unit.', key: 'prix_unitaire', width: '17%' },
        { label: 'Montant', key: 'montant', width: '17%' },
        { label: '', key: 'flag', width: '8%' },
      ];

      const Doc = (
        <Document>
          <Page size="A4" style={styles.page} wrap>
            <View style={styles.headerBar} fixed>
              {logoDataUrl && <Image style={styles.logo} src={logoDataUrl} />}
              <Text style={styles.titre}>Validation factures de fournisseurs — Fiche de facture</Text>
              <Text style={styles.sousTitre}>{new Date().toLocaleDateString('fr-CA')}</Text>
            </View>

            <View style={styles.section}>
              <Text><Text style={styles.label}>Fournisseur : </Text>{fournisseur?.nom || '—'}</Text>
              <Text><Text style={styles.label}>N° facture : </Text>{facture.numero_facture || '(non lu)'}</Text>
              <Text><Text style={styles.label}>Date : </Text>{facture.date_facture || '—'}</Text>
              <Text><Text style={styles.label}>N° projet : </Text>{facture.projet_no || '—'}</Text>
              <Text><Text style={styles.label}>Sous-total : </Text>{fmtMontant(facture.sous_total)}   <Text style={styles.label}>Taxes : </Text>{fmtMontant(facture.taxes)}   <Text style={styles.label}>Total : </Text>{fmtMontant(facture.total)}</Text>
              <Text><Text style={styles.label}>Statut : </Text>{STATUT_LISIBLE[facture.statut_workflow] || facture.statut_workflow}</Text>
            </View>

            <View style={styles.row} fixed>
              {colonnes.map((c) => <Text key={c.key} style={[styles.th, { width: c.width }]}>{c.label}</Text>)}
            </View>
            {(lignes || []).map((l, i) => (
              <View key={l.id} style={[styles.row, { backgroundColor: i % 2 === 0 ? '#ffffff' : '#FAFBFC' }]} wrap={false}>
                <Text style={[styles.td, { width: '46%' }]}>{l.description_brute}</Text>
                <Text style={[styles.td, { width: '12%' }]}>{l.quantite} {l.unite || ''}</Text>
                <Text style={[styles.td, { width: '17%' }]}>{fmtMontant(l.prix_unitaire)}</Text>
                <Text style={[styles.td, { width: '17%' }]}>{fmtMontant(l.montant)}</Text>
                <Text style={[styles.td, { width: '8%', color: '#C41230' }]}>{l.prix_flagge ? '⚠' : ''}</Text>
              </View>
            ))}

            {(flagsFacture || []).length > 0 && (
              <View style={{ marginTop: 14 }}>
                <Text style={[styles.label, { marginBottom: 4 }]}>Flags :</Text>
                {(flagsFacture || []).map((f) => (
                  <View key={f.id} style={styles.flagBox}>
                    <Text style={{ fontSize: 8 }}>{f.type_flag} — {f.resolu ? 'résolu' : 'actif'}</Text>
                  </View>
                ))}
              </View>
            )}

            {(hist || []).length > 0 && (
              <View style={{ marginTop: 14 }}>
                <Text style={[styles.label, { marginBottom: 4 }]}>Historique :</Text>
                {(hist || []).map((h) => (
                  <Text key={h.id} style={{ fontSize: 7.5, color: '#555', marginBottom: 2 }}>
                    {new Date(h.created_at).toLocaleString('fr-CA')} — {libelleHistorique(h)}
                  </Text>
                ))}
              </View>
            )}

            <Text style={styles.pied} render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} fixed />
          </Page>
        </Document>
      );

      const blob = await pdf(Doc).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `facture-${(facture.numero_facture || facture.id).toString().replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      setErreur('Erreur export PDF : ' + e.message);
    }
  }

  async function chargerDetailFacture(facture) {
    const [{ data: lignes }, { data: hist }] = await Promise.all([
      supabaseFact.from('facture_lignes').select('*').eq('facture_id', facture.id).order('created_at'),
      supabaseFact.from('historique').select('*').eq('facture_id', facture.id).order('created_at', { ascending: false }),
    ]);
    setLignesFactureOuverte(lignes || []);
    setHistoriqueFacture(hist || []);
  }

  async function ouvrirFacture(facture) {
    if (factureOuverte?.id === facture.id) { setFactureOuverte(null); return; }
    setFactureOuverte(facture);
    setLigneEnEdition(null);
    await chargerDetailFacture(facture);
  }

  async function sauvegarderLigne(ligne) {
    try {
      await appelApi('/api/facturation/modifier-ligne', {
        ligneId: ligne.id,
        description_brute: ligne.description_brute,
        quantite: ligne.quantite,
        prix_unitaire: ligne.prix_unitaire,
        unite: ligne.unite,
      });
      setMessageOk('Ligne corrigée.');
      setLigneEnEdition(null);
      await chargerDetailFacture(factureOuverte);
      await recharger();
    } catch (e) {
      setErreur(e.message);
    }
  }

  return (
    <>
      {peutModifier && (
        <div style={card}>
          <h3 style={{ marginTop: 0 }}>Importer une nouvelle facture</h3>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ minWidth: 220 }}>
              <label style={{ fontSize: 12, color: '#666' }}>Fournisseur</label>
              <select style={input} value={fournisseurId} onChange={(e) => { setFournisseurId(e.target.value); setPoId(''); }}>
                <option value="">— choisir —</option>
                {fournisseurs.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
              </select>
            </div>
            <div style={{ minWidth: 220 }}>
              <label style={{ fontSize: 12, color: '#666' }}>Bon de commande (optionnel)</label>
              <select style={input} value={poId} onChange={(e) => setPoId(e.target.value)}>
                <option value="">— aucun —</option>
                {posDuFournisseur.map((p) => <option key={p.id} value={p.id}>{p.numero_po}</option>)}
              </select>
            </div>
            <div style={{ minWidth: 160 }}>
              <label style={{ fontSize: 12, color: '#666' }}>N° de projet (optionnel)</label>
              <input style={input} value={projetNo} onChange={(e) => setProjetNo(e.target.value)} placeholder="ex: 24-118" />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#666' }}>Fichier PDF</label>
              <input type="file" accept="application/pdf" onChange={(e) => setFichier(e.target.files[0])} />
            </div>
            <button style={btn} disabled={enTraitement} onClick={importer}>
              {enTraitement ? 'Lecture en cours…' : '📥 Importer et analyser'}
            </button>
          </div>
          <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
            La facture est lue automatiquement selon le gabarit du fournisseur (voir l'onglet Fournisseurs). Les prix anormalement élevés et les écarts avec le bon de commande sont signalés automatiquement.
          </div>
        </div>
      )}

      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <h3 style={{ margin: 0 }}>Factures ({facturesFiltrees.length} / {factures.length})</h3>
          <button style={btnGhost} onClick={exporterExcel}>📊 Exporter Excel</button>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0' }}>
          <input style={{ ...input, maxWidth: 220 }} placeholder="Rechercher (n° facture, fournisseur, projet)…" value={filtreTexte} onChange={(e) => setFiltreTexte(e.target.value)} />
          <select style={{ ...input, maxWidth: 200 }} value={filtreFournisseur} onChange={(e) => setFiltreFournisseur(e.target.value)}>
            <option value="">Tous les fournisseurs</option>
            {fournisseurs.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
          </select>
          <select style={{ ...input, maxWidth: 220 }} value={filtreStatut} onChange={(e) => setFiltreStatut(e.target.value)}>
            <option value="">Tous les statuts</option>
            {Object.entries(STATUT_LISIBLE).map(([cle, label]) => <option key={cle} value={cle}>{label}</option>)}
          </select>
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={filtreFlagsSeulement} onChange={(e) => setFiltreFlagsSeulement(e.target.checked)} />
            Flags seulement
          </label>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={th}>Fournisseur</th><th style={th}>N° facture</th><th style={th}>Date</th>
            <th style={th}>Total</th><th style={th}>Statut</th><th style={th}>Flags</th><th style={th}>Fichier</th>
          </tr></thead>
          <tbody>
            {facturesFiltrees.map((f) => {
              const fournisseur = fournisseurs.find((x) => x.id === f.fournisseur_id);
              const nbFlags = flags.filter((fl) => fl.facture_id === f.id).length;
              const ouverte = factureOuverte?.id === f.id;
              return (
                <Fragment key={f.id}>
                  <tr style={{ cursor: 'pointer', background: ouverte ? '#f0f4ff' : undefined }} onClick={() => ouvrirFacture(f)}>
                    <td style={td}>{fournisseur?.nom || '—'}</td>
                    <td style={td}>{f.numero_facture || '(non lu)'}</td>
                    <td style={td}>{f.date_facture || '—'}</td>
                    <td style={td}>{fmtMontant(f.total)}</td>
                    <td style={td}>{STATUT_LISIBLE[f.statut_workflow] || f.statut_workflow}</td>
                    <td style={td}>{nbFlags > 0 ? <span style={badgeFlag}>{nbFlags}</span> : <span style={badgeOk}>OK</span>}</td>
                    <td style={td}><a href={f.fichier_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>📄 voir</a></td>
                  </tr>
                  {ouverte && (
                    <tr>
                      <td style={{ ...td, background: '#fafbfc' }} colSpan={7}>
                        <div style={{ padding: '8px 4px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h4 style={{ margin: '4px 0' }}>Lignes de la facture {peutModifier && '(clique une ligne pour corriger)'}</h4>
                            <button style={btnGhost} onClick={() => exporterFacturePdf(f)}>📄 Export PDF</button>
                          </div>
                          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
                            <thead><tr><th style={th}>Description</th><th style={th}>Qté</th><th style={th}>Prix unit.</th><th style={th}>Montant</th><th style={th}></th></tr></thead>
                            <tbody>
                              {lignesFactureOuverte.map((l) => (
                                <LigneFactureEditable
                                  key={l.id}
                                  ligne={l}
                                  peutModifier={peutModifier}
                                  enEdition={ligneEnEdition === l.id}
                                  ouvrirEdition={() => setLigneEnEdition(l.id)}
                                  fermerEdition={() => setLigneEnEdition(null)}
                                  sauvegarder={sauvegarderLigne}
                                />
                              ))}
                            </tbody>
                          </table>
                          {f.statut_workflow === 'rejete' && peutModifier && (
                            <div style={{ fontSize: 12, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={badgeFlag}>Facture rejetée</span>
                              <button style={btnGhost} onClick={async () => {
                                if (!window.confirm('Rouvrir cette facture ? Elle repartira du début du circuit d\'approbation (adjointe).')) return;
                                try {
                                  await appelApi('/api/facturation/rouvrir-facture', { factureId: f.id });
                                  setMessageOk('Facture rouverte — elle repart de l\'étape "Adjointe administrative".');
                                  await recharger();
                                  await chargerDetailFacture(f);
                                } catch (e) { setErreur(e.message); }
                              }}>↺ Rouvrir pour correction</button>
                            </div>
                          )}
                          {f.statut_workflow === 'approuve_final' && (
                            <div style={{ fontSize: 12, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                              <b>Fichier Cost :</b>
                              {f.pousse_vers_cost
                                ? <span style={badgeOk}>envoyée ✓</span>
                                : (
                                  <>
                                    <span style={badgeFlag}>pas encore envoyée</span>
                                    {peutModifier && (
                                      <button style={btnGhost} onClick={async () => {
                                        try {
                                          const res = await appelApi('/api/facturation/pousser-vers-cost', { factureId: f.id });
                                          setMessageOk(res.pousse ? 'Facture envoyée à Fichier Cost.' : (res.raison || 'Non envoyée.'));
                                          await recharger();
                                          await chargerDetailFacture(f);
                                        } catch (e) { setErreur(e.message); }
                                      }}>Envoyer vers Fichier Cost</button>
                                    )}
                                  </>
                                )}
                            </div>
                          )}
                          {historiqueFacture.length > 0 && (
                            <>
                              <h4 style={{ margin: '4px 0' }}>Historique</h4>
                              <ul style={{ fontSize: 12, color: '#666', margin: 0, paddingLeft: 18 }}>
                                {historiqueFacture.map((h) => (
                                  <li key={h.id}>{new Date(h.created_at).toLocaleString('fr-CA')} — {libelleHistorique(h)}</li>
                                ))}
                              </ul>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function libelleHistorique(h) {
  const d = h.details || {};
  if (h.action === 'import') return `Import (${d.nb_lignes} lignes, ${d.nb_flags} flag(s), confiance ${d.confiance})`;
  if (h.action === 'modification_ligne') return `Ligne corrigée : "${d.avant?.description}" → qté ${d.apres?.quantite}, prix ${d.apres?.prix_unitaire}`;
  if (h.action === 'approbation') return `Étape "${d.etape}" approuvée${d.commentaire ? ' — ' + d.commentaire : ''}`;
  if (h.action === 'rejet') return `Facture rejetée à l'étape "${d.etape}"${d.commentaire ? ' — ' + d.commentaire : ''}`;
  if (h.action === 'flag_resolu') return `Flag "${d.type_flag}" marqué résolu${d.commentaire ? ' — ' + d.commentaire : ''}`;
  if (h.action === 'pousse_fichier_cost') {
    if (d.pousse) return `Poussée vers Fichier Cost${d.manuel ? ' (manuellement)' : ''}`;
    return `Non poussée vers Fichier Cost — ${d.raison || 'raison inconnue'}`;
  }
  if (h.action === 'reouverture') return `Facture rouverte pour correction${d.raison ? ' — ' + d.raison : ''}`;
  return h.action;
}

function LigneFactureEditable({ ligne, peutModifier, enEdition, ouvrirEdition, fermerEdition, sauvegarder }) {
  const [brouillon, setBrouillon] = useState(ligne);
  useEffect(() => { setBrouillon(ligne); }, [ligne, enEdition]);

  if (!enEdition) {
    return (
      <tr style={{ cursor: peutModifier ? 'pointer' : 'default' }} onClick={() => peutModifier && ouvrirEdition()}>
        <td style={td}>{ligne.description_brute}{ligne.prix_flagge && <span style={{ ...badgeFlag, marginLeft: 6 }}>prix élevé</span>}</td>
        <td style={td}>{ligne.quantite} {ligne.unite || ''}</td>
        <td style={td}>{fmtMontant(ligne.prix_unitaire)}</td>
        <td style={td}>{fmtMontant(ligne.montant)}</td>
        <td style={td}>{peutModifier && '✏️'}</td>
      </tr>
    );
  }

  return (
    <tr style={{ background: '#fff7e6' }}>
      <td style={td}><input style={input} value={brouillon.description_brute || ''} onChange={(e) => setBrouillon({ ...brouillon, description_brute: e.target.value })} /></td>
      <td style={td}><input style={{ ...input, width: 80 }} value={brouillon.quantite ?? ''} onChange={(e) => setBrouillon({ ...brouillon, quantite: e.target.value })} /></td>
      <td style={td}><input style={{ ...input, width: 90 }} value={brouillon.prix_unitaire ?? ''} onChange={(e) => setBrouillon({ ...brouillon, prix_unitaire: e.target.value })} /></td>
      <td style={td}>{fmtMontant((Number(brouillon.quantite) || 0) * (Number(brouillon.prix_unitaire) || 0))}</td>
      <td style={td}>
        <button style={btnGreen} onClick={() => sauvegarder(brouillon)}>✓</button>
        <button style={btnGhost} onClick={fermerEdition}>✗</button>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------
// FOURNISSEURS & GABARITS
// ---------------------------------------------------------------------
function OngletFournisseurs({ peutModifier, fournisseurs, appelApi, recharger, setErreur, setMessageOk }) {
  const [nouveauNom, setNouveauNom] = useState('');
  const [fournisseurSelectionne, setFournisseurSelectionne] = useState(null);
  const [configGabarit, setConfigGabarit] = useState('{}');
  const [fichierTest, setFichierTest] = useState(null);
  const [resultatTest, setResultatTest] = useState(null);
  const [enTest, setEnTest] = useState(false);

  async function ajouterFournisseur() {
    if (!nouveauNom.trim()) return;
    const { error } = await supabaseFact.from('fournisseurs').insert({ nom: nouveauNom.trim() });
    if (error) { setErreur(error.message); return; }
    setNouveauNom('');
    await recharger();
  }

  async function ouvrirGabarit(fournisseur) {
    setFournisseurSelectionne(fournisseur);
    setResultatTest(null);
    const { data } = await supabaseFact
      .from('fournisseur_templates').select('*').eq('fournisseur_id', fournisseur.id)
      .eq('actif', true).order('created_at', { ascending: false }).limit(1).maybeSingle();
    setConfigGabarit(JSON.stringify(data?.config || {}, null, 2));
  }

  async function sauvegarderGabarit() {
    let parsed;
    try { parsed = JSON.parse(configGabarit); } catch (e) { setErreur('Le gabarit doit être un JSON valide : ' + e.message); return; }
    // Désactive les anciens gabarits actifs de ce fournisseur avant d'en
    // insérer un nouveau — sinon la table accumule des lignes "actif=true"
    // en double à chaque sauvegarde (fonctionnellement sans danger, la
    // plus récente est toujours prise, mais malpropre).
    await supabaseFact.from('fournisseur_templates')
      .update({ actif: false })
      .eq('fournisseur_id', fournisseurSelectionne.id)
      .eq('actif', true);
    const { error } = await supabaseFact.from('fournisseur_templates').insert({
      fournisseur_id: fournisseurSelectionne.id,
      config: parsed,
    });
    if (error) { setErreur(error.message); return; }
    setMessageOk('Gabarit enregistré pour ' + fournisseurSelectionne.nom + '.');
  }

  async function testerGabarit() {
    if (!fichierTest) { setErreur('Choisis un PDF d\'exemple à tester.'); return; }
    let parsed;
    try { parsed = JSON.parse(configGabarit); } catch (e) { setErreur('JSON invalide : ' + e.message); return; }
    setEnTest(true);
    try {
      const b64 = await fileToBase64(fichierTest);
      const res = await appelApi('/api/facturation/tester-gabarit', { fichierBase64: b64, templateConfig: parsed });
      setResultatTest(res.interpretation);
    } catch (e) {
      setErreur(e.message);
    } finally {
      setEnTest(false);
    }
  }

  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
      <div style={{ ...card, flex: '1 1 320px' }}>
        <h3 style={{ marginTop: 0 }}>Fournisseurs</h3>
        {peutModifier && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input style={input} value={nouveauNom} onChange={(e) => setNouveauNom(e.target.value)} placeholder="Nom du fournisseur" />
            <button style={btn} onClick={ajouterFournisseur}>+ Ajouter</button>
          </div>
        )}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>Nom</th><th style={th}></th></tr></thead>
          <tbody>
            {fournisseurs.map((f) => (
              <tr key={f.id}>
                <td style={td}>{f.nom}</td>
                <td style={td}><button style={btnGhost} onClick={() => ouvrirGabarit(f)}>⚙️ Gabarit de lecture</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {fournisseurSelectionne && (
        <div style={{ ...card, flex: '2 1 480px' }}>
          <h3 style={{ marginTop: 0 }}>Gabarit — {fournisseurSelectionne.nom}</h3>
          <p style={{ fontSize: 12, color: '#666' }}>
            Décris comment lire les factures de ce fournisseur (expressions régulières). Laisse <code>{'{}'}</code> pour te fier à la lecture générique automatique.
          </p>
          <textarea
            style={{ ...input, height: 220, fontFamily: 'monospace', fontSize: 12 }}
            value={configGabarit}
            onChange={(e) => setConfigGabarit(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button style={btn} onClick={sauvegarderGabarit}>💾 Enregistrer le gabarit</button>
            <input type="file" accept="application/pdf" onChange={(e) => setFichierTest(e.target.files[0])} />
            <button style={btnGhost} disabled={enTest} onClick={testerGabarit}>
              {enTest ? 'Test en cours…' : '🧪 Tester sur un PDF (sans rien enregistrer)'}
            </button>
          </div>
          {resultatTest && (
            <div style={{ marginTop: 12, background: '#f7f8fa', borderRadius: 6, padding: 12, fontSize: 12 }}>
              <div><b>Confiance :</b> {resultatTest.confiance}</div>
              <div><b>N° facture :</b> {resultatTest.numero_facture || '—'}</div>
              <div><b>Date :</b> {resultatTest.date_facture || '—'}</div>
              <div><b>Total :</b> {fmtMontant(resultatTest.total)}</div>
              <div><b>Lignes trouvées :</b> {resultatTest.lignes.length}</div>
              <table style={{ width: '100%', marginTop: 8, borderCollapse: 'collapse' }}>
                <thead><tr><th style={th}>Description</th><th style={th}>Qté</th><th style={th}>Prix unit.</th><th style={th}>Montant</th></tr></thead>
                <tbody>
                  {resultatTest.lignes.map((l, i) => (
                    <tr key={i}>
                      <td style={td}>{l.description_brute}</td>
                      <td style={td}>{l.quantite} {l.unite || ''}</td>
                      <td style={td}>{fmtMontant(l.prix_unitaire)}</td>
                      <td style={td}>{fmtMontant(l.montant)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// CATALOGUE D'ITEMS & PRIX
// ---------------------------------------------------------------------
function OngletCatalogue({ items, statsItems, peutModifier, recharger, setErreur, setMessageOk }) {
  const [recherche, setRecherche] = useState('');
  const [itemOuvert, setItemOuvert] = useState(null);
  const [comparatifFournisseurs, setComparatifFournisseurs] = useState([]);
  const [modeFusion, setModeFusion] = useState(false);
  const [itemsAFusionner, setItemsAFusionner] = useState([]);
  const [fusionEnCours, setFusionEnCours] = useState(false);

  const statsParItem = useMemo(() => {
    const m = {};
    statsItems.forEach((s) => { m[s.item_id] = s; });
    return m;
  }, [statsItems]);

  const itemsAffiches = items.filter((i) => !recherche || i.nom.toLowerCase().includes(recherche.toLowerCase()));

  async function renommerItem(item) {
    const nouveauNom = window.prompt('Nouveau nom pour cet item :', item.nom);
    if (!nouveauNom || nouveauNom === item.nom) return;
    const { error } = await supabaseFact.from('items').update({ nom: nouveauNom }).eq('id', item.id);
    if (error) { setErreur(error.message); return; }
    await recharger();
  }

  async function ouvrirComparatif(item) {
    setItemOuvert(item);
    const { data } = await supabaseFact
      .from('v_stats_item_fournisseur').select('*').eq('item_id', item.id).order('prix_moyen', { ascending: true });
    setComparatifFournisseurs(data || []);
  }

  function basculerSelectionFusion(itemId) {
    setItemsAFusionner((prev) => prev.includes(itemId) ? prev.filter((x) => x !== itemId) : [...prev, itemId]);
  }

  async function fusionnerItemsSelectionnes() {
    if (itemsAFusionner.length < 2) { setErreur('Sélectionne au moins 2 items à fusionner.'); return; }
    const itemsChoisis = items.filter((i) => itemsAFusionner.includes(i.id));
    const nomsListe = itemsChoisis.map((i) => `- ${i.nom}`).join('\n');
    const itemCible = window.prompt(
      `Fusionner ces items en un seul :\n${nomsListe}\n\nÉcris exactement le nom de l'item À CONSERVER (les autres seront supprimés et leur historique transféré vers celui-ci) :`,
      itemsChoisis[0]?.nom || ''
    );
    if (!itemCible) return;
    const itemCibleObj = itemsChoisis.find((i) => i.nom.trim().toLowerCase() === itemCible.trim().toLowerCase());
    if (!itemCibleObj) {
      setErreur(`"${itemCible}" ne correspond à aucun des items sélectionnés — fusion annulée pour éviter de garder le mauvais item par erreur. Recommence en copiant-collant exactement un des noms affichés.`);
      return;
    }
    const itemsASupprimer = itemsChoisis.filter((i) => i.id !== itemCibleObj.id);

    setFusionEnCours(true);
    try {
      for (const source of itemsASupprimer) {
        // Repointe tout ce qui référence l'ancien item vers l'item cible
        await supabaseFact.from('facture_lignes').update({ item_id: itemCibleObj.id }).eq('item_id', source.id);
        await supabaseFact.from('bons_commande_lignes').update({ item_id: itemCibleObj.id }).eq('item_id', source.id);
        await supabaseFact.from('item_alias').update({ item_id: itemCibleObj.id }).eq('item_id', source.id);
        await supabaseFact.from('items').delete().eq('id', source.id);
      }
      setMessageOk(`Fusion terminée : ${itemsASupprimer.length} item(s) fusionné(s) dans "${itemCibleObj.nom}".`);
      setItemsAFusionner([]);
      setModeFusion(false);
      await recharger();
    } catch (e) {
      setErreur(e.message);
    } finally {
      setFusionEnCours(false);
    }
  }

  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
      <div style={{ ...card, flex: '2 1 480px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <h3 style={{ margin: 0 }}>Catalogue d'items &amp; historique de prix</h3>
          {peutModifier && (
            modeFusion ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={btnGreen} disabled={fusionEnCours} onClick={fusionnerItemsSelectionnes}>
                  {fusionEnCours ? 'Fusion…' : `✓ Fusionner (${itemsAFusionner.length})`}
                </button>
                <button style={btnGhost} onClick={() => { setModeFusion(false); setItemsAFusionner([]); }}>Annuler</button>
              </div>
            ) : (
              <button style={btnGhost} onClick={() => setModeFusion(true)}>🔗 Fusionner des items en double</button>
            )
          )}
        </div>
        <input style={{ ...input, maxWidth: 320, margin: '12px 0' }} placeholder="Rechercher un item…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            {modeFusion && <th style={th}></th>}
            <th style={th}>Item</th><th style={th}>Unité</th><th style={th}>Nb achats</th>
            <th style={th}>Prix moyen</th><th style={th}>Prix min</th><th style={th}>Prix max</th><th style={th}></th>
          </tr></thead>
          <tbody>
            {itemsAffiches.map((item) => {
              const s = statsParItem[item.id];
              return (
                <tr key={item.id} style={itemOuvert?.id === item.id ? { background: '#f0f4ff' } : undefined}>
                  {modeFusion && (
                    <td style={td}>
                      <input type="checkbox" checked={itemsAFusionner.includes(item.id)} onChange={() => basculerSelectionFusion(item.id)} />
                    </td>
                  )}
                  <td style={td}>
                    <button style={{ background: 'none', border: 'none', color: NAVY, textDecoration: 'underline', cursor: 'pointer', padding: 0, fontSize: 13, fontFamily: 'inherit' }} onClick={() => ouvrirComparatif(item)}>
                      {item.nom}
                    </button>
                  </td>
                  <td style={td}>{item.unite}</td>
                  <td style={td}>{s?.nb_achats ?? 0}</td>
                  <td style={td}>{s ? fmtMontant(s.prix_moyen) : '—'}</td>
                  <td style={td}>{s ? fmtMontant(s.prix_min) : '—'}</td>
                  <td style={td}>{s ? fmtMontant(s.prix_max) : '—'}</td>
                  <td style={td}>{peutModifier && !modeFusion && <button style={btnGhost} onClick={() => renommerItem(item)}>✏️</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {itemOuvert && (
        <div style={{ ...card, flex: '1 1 320px' }}>
          <h3 style={{ marginTop: 0 }}>Comparatif fournisseurs — {itemOuvert.nom}</h3>
          {comparatifFournisseurs.length === 0 && <div style={{ color: '#666', fontSize: 13 }}>Aucun achat enregistré pour cet item.</div>}
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>Fournisseur</th><th style={th}>Nb achats</th><th style={th}>Prix moyen</th></tr></thead>
            <tbody>
              {comparatifFournisseurs.map((c, i) => (
                <tr key={c.fournisseur_id} style={i === 0 ? { background: '#e6f4ea' } : undefined}>
                  <td style={td}>{c.fournisseur_nom} {i === 0 && '🏆'}</td>
                  <td style={td}>{c.nb_achats}</td>
                  <td style={td}>{fmtMontant(c.prix_moyen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {comparatifFournisseurs.length > 1 && (
            <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
              Meilleur prix : <b>{comparatifFournisseurs[0].fournisseur_nom}</b>, en moyenne{' '}
              {fmtMontant(comparatifFournisseurs[comparatifFournisseurs.length - 1].prix_moyen - comparatifFournisseurs[0].prix_moyen)}{' '}
              de moins que le plus cher.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// BONS DE COMMANDE
// ---------------------------------------------------------------------
function OngletBonsCommande({ peutModifier, fournisseurs, items, bonsCommande, recharger, setErreur, setMessageOk }) {
  const [nouveauPo, setNouveauPo] = useState({ numero_po: '', fournisseur_id: '', projet_no: '', montant_total: '' });
  const [poOuvert, setPoOuvert] = useState(null);
  const [lignesPo, setLignesPo] = useState([]);
  const [nouvelleLigne, setNouvelleLigne] = useState({ description_brute: '', quantite_commandee: '', prix_unitaire_prevu: '' });

  async function creerPo() {
    if (!nouveauPo.numero_po || !nouveauPo.fournisseur_id) { setErreur('N° de PO et fournisseur requis.'); return; }
    const { error } = await supabaseFact.from('bons_commande').insert({
      numero_po: nouveauPo.numero_po,
      fournisseur_id: nouveauPo.fournisseur_id,
      projet_no: nouveauPo.projet_no || null,
      montant_total: nouveauPo.montant_total ? Number(nouveauPo.montant_total) : null,
    });
    if (error) { setErreur(error.message); return; }
    setNouveauPo({ numero_po: '', fournisseur_id: '', projet_no: '', montant_total: '' });
    setMessageOk('Bon de commande créé.');
    await recharger();
  }

  async function ouvrirPo(po) {
    setPoOuvert(po);
    const { data } = await supabaseFact.from('bons_commande_lignes').select('*').eq('po_id', po.id).order('created_at');
    setLignesPo(data || []);
  }

  async function ajouterLigne() {
    if (!nouvelleLigne.description_brute || !nouvelleLigne.quantite_commandee) return;
    const { error } = await supabaseFact.from('bons_commande_lignes').insert({
      po_id: poOuvert.id,
      description_brute: nouvelleLigne.description_brute,
      quantite_commandee: Number(nouvelleLigne.quantite_commandee),
      prix_unitaire_prevu: nouvelleLigne.prix_unitaire_prevu ? Number(nouvelleLigne.prix_unitaire_prevu) : null,
    });
    if (error) { setErreur(error.message); return; }
    setNouvelleLigne({ description_brute: '', quantite_commandee: '', prix_unitaire_prevu: '' });
    await ouvrirPo(poOuvert);
  }

  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
      <div style={{ ...card, flex: '1 1 380px' }}>
        <h3 style={{ marginTop: 0 }}>Bons de commande</h3>
        {peutModifier && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12, background: '#f7f8fa', padding: 10, borderRadius: 6 }}>
            <input style={input} placeholder="N° de PO" value={nouveauPo.numero_po} onChange={(e) => setNouveauPo({ ...nouveauPo, numero_po: e.target.value })} />
            <select style={input} value={nouveauPo.fournisseur_id} onChange={(e) => setNouveauPo({ ...nouveauPo, fournisseur_id: e.target.value })}>
              <option value="">— fournisseur —</option>
              {fournisseurs.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
            </select>
            <input style={input} placeholder="N° de projet (optionnel)" value={nouveauPo.projet_no} onChange={(e) => setNouveauPo({ ...nouveauPo, projet_no: e.target.value })} />
            <input style={input} placeholder="Montant total (optionnel)" value={nouveauPo.montant_total} onChange={(e) => setNouveauPo({ ...nouveauPo, montant_total: e.target.value })} />
            <button style={btn} onClick={creerPo}>+ Créer le PO</button>
          </div>
        )}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>N° PO</th><th style={th}>Fournisseur</th><th style={th}>Statut</th><th style={th}></th></tr></thead>
          <tbody>
            {bonsCommande.map((po) => (
              <tr key={po.id}>
                <td style={td}>{po.numero_po}</td>
                <td style={td}>{fournisseurs.find((f) => f.id === po.fournisseur_id)?.nom || '—'}</td>
                <td style={td}>{po.statut}</td>
                <td style={td}><button style={btnGhost} onClick={() => ouvrirPo(po)}>📋 Lignes</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {poOuvert && (
        <div style={{ ...card, flex: '2 1 480px' }}>
          <h3 style={{ marginTop: 0 }}>Lignes du PO {poOuvert.numero_po}</h3>
          {peutModifier && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
              <input style={{ ...input, flex: 2 }} placeholder="Description (doit correspondre au texte de la facture)" value={nouvelleLigne.description_brute} onChange={(e) => setNouvelleLigne({ ...nouvelleLigne, description_brute: e.target.value })} />
              <input style={{ ...input, flex: 1 }} placeholder="Quantité commandée" value={nouvelleLigne.quantite_commandee} onChange={(e) => setNouvelleLigne({ ...nouvelleLigne, quantite_commandee: e.target.value })} />
              <input style={{ ...input, flex: 1 }} placeholder="Prix unitaire prévu" value={nouvelleLigne.prix_unitaire_prevu} onChange={(e) => setNouvelleLigne({ ...nouvelleLigne, prix_unitaire_prevu: e.target.value })} />
              <button style={btn} onClick={ajouterLigne}>+</button>
            </div>
          )}
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>Description</th><th style={th}>Qté commandée</th><th style={th}>Prix prévu</th></tr></thead>
            <tbody>
              {lignesPo.map((l) => (
                <tr key={l.id}>
                  <td style={td}>{l.description_brute}</td>
                  <td style={td}>{l.quantite_commandee}</td>
                  <td style={td}>{fmtMontant(l.prix_unitaire_prevu)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
            Astuce : la description ici doit correspondre le plus possible au texte tel qu'il apparaît sur les factures, pour que la contre-validation automatique fonctionne bien.
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// APPROBATIONS
// ---------------------------------------------------------------------
function OngletApprobations({ factures, peutApprouver, appelApi, recharger, setErreur, setMessageOk }) {
  const [detailsParFacture, setDetailsParFacture] = useState({});

  async function chargerDetails(factureId) {
    const [{ data: lignes }, { data: approbations }] = await Promise.all([
      supabaseFact.from('facture_lignes').select('*').eq('facture_id', factureId),
      supabaseFact.from('facture_approbations').select('*').eq('facture_id', factureId),
    ]);
    setDetailsParFacture((prev) => ({ ...prev, [factureId]: { lignes: lignes || [], approbations: approbations || [] } }));
  }

  async function decider(factureId, etape, decision) {
    const commentaire = decision === 'rejete' ? window.prompt('Raison du rejet (optionnel) :') || '' : '';
    try {
      await appelApi('/api/facturation/approuver-etape', { factureId, etape, decision, commentaire });
      setMessageOk(decision === 'approuve' ? 'Étape approuvée.' : 'Facture rejetée.');
      await recharger();
      await chargerDetails(factureId);
    } catch (e) {
      setErreur(e.message);
    }
  }

  const etapeCourante = (facture) => {
    const map = {
      en_attente_adjointe: 'adjointe',
      en_attente_charge_projet: 'charge_projet',
      en_attente_directeur: 'directeur',
      en_attente_payables: 'payables',
    };
    return map[facture.statut_workflow] || null;
  };

  const facturesActives = factures.filter((f) => f.statut_workflow !== 'approuve_final' && f.statut_workflow !== 'rejete');

  return (
    <div style={card}>
      <h3 style={{ marginTop: 0 }}>File d'approbation ({facturesActives.length})</h3>
      <p style={{ fontSize: 12, color: '#666' }}>
        Ordre du processus : Adjointe administrative (vérifie les quantités vs bon de livraison) → Chargé de projet (confirme quantités et prix) → Directeur construction (approbation finale) → Comptes payables (émission du chèque).
      </p>
      {facturesActives.map((f) => {
        const etape = etapeCourante(f);
        const details = detailsParFacture[f.id];
        return (
          <div key={f.id} style={{ border: '1px solid #eee', borderRadius: 6, padding: 12, marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <b>{f.numero_facture || '(sans numéro)'}</b> — {fmtMontant(f.total)}
                {f.a_des_flags && <span style={{ ...badgeFlag, marginLeft: 8 }}>flags actifs</span>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={btnGhost} onClick={() => chargerDetails(f.id)}>🔎 Détails</button>
                {etape && peutApprouver(etape) && (
                  <>
                    <button style={btnGreen} onClick={() => decider(f.id, etape, 'approuve')}>✓ Approuver ({ETAPES.find((e) => e.cle === etape)?.label})</button>
                    <button style={btnDanger} onClick={() => decider(f.id, etape, 'rejete')}>✗ Rejeter</button>
                  </>
                )}
              </div>
            </div>
            {details && (
              <div style={{ marginTop: 10, fontSize: 12 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
                  <thead><tr><th style={th}>Description</th><th style={th}>Qté</th><th style={th}>Prix unit.</th><th style={th}>Montant</th></tr></thead>
                  <tbody>
                    {details.lignes.map((l) => (
                      <tr key={l.id}>
                        <td style={td}>{l.description_brute}{l.prix_flagge && <span style={{ ...badgeFlag, marginLeft: 6 }}>prix élevé</span>}</td>
                        <td style={td}>{l.quantite} {l.unite || ''}</td>
                        <td style={td}>{fmtMontant(l.prix_unitaire)}</td>
                        <td style={td}>{fmtMontant(l.montant)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  {ETAPES.map((e) => {
                    const a = details.approbations.find((x) => x.etape === e.cle);
                    return (
                      <div key={e.cle} style={{ fontSize: 11, color: '#666' }}>
                        {e.label} : {a?.statut === 'approuve' ? <span style={badgeOk}>approuvé</span> : a?.statut === 'rejete' ? <span style={badgeFlag}>rejeté</span> : 'en attente'}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

import { useState, useEffect, useMemo, useRef } from 'react';
import Head from 'next/head';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const supabaseLP = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { db: { schema: 'liste_projets' } });

const NAVY = '#14213D';
const RED = '#C41230';
const BG = '#EDEFF1';
// Logo déjà déployé et utilisé ailleurs dans le Toolbox (Planification
// hebdomadaire) — on réutilise le même fichier réel plutôt que d'en
// fabriquer un nouveau.
const LOGO_PEP = '/_static/planification-hebdomadaire/logo-pep.png';

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

const btn = { fontFamily: 'inherit', background: NAVY, color: '#fff', border: 'none', borderRadius: 5, padding: '7px 14px', cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap' };
const btnGhost = { ...btn, background: '#fff', color: NAVY, border: `1px solid ${NAVY}` };
const btnDanger = { ...btn, background: RED };
const btnSmall = { padding: '4px 10px', fontSize: 12 };
const input = { padding: '7px 9px', borderRadius: 5, border: '1px solid #ccc', fontFamily: 'inherit', fontSize: 13, width: '100%', boxSizing: 'border-box' };
const th = {
  textAlign: 'left', padding: '7px 10px', color: '#fff', fontWeight: 600, fontSize: 11.5,
  cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', background: NAVY,
  textTransform: 'uppercase', letterSpacing: '0.03em',
};
const td = { padding: '6px 10px', verticalAlign: 'middle', fontSize: 13, borderBottom: '1px solid #EDEFF1', whiteSpace: 'nowrap' };

const TYPE_ICONES = { pep_excavation: '⛏️', estimation: '📐', amenagement: '🌳', pep_pavage: '🛣️', adp: '🧱' };

function csvEchappe(v) {
  const s = (v ?? '').toString();
  if (/[",\n;]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export default function ListeProjetsPage() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [peutModifier, setPeutModifier] = useState(false);

  const [tab, setTab] = useState('projets');
  const [projets, setProjets] = useState([]);
  const [types, setTypes] = useState([]);
  const [personnel, setPersonnel] = useState([]);

  const [recherche, setRecherche] = useState('');
  const [filtreType, setFiltreType] = useState('');
  const [inclureEstimation, setInclureEstimation] = useState(false);
  const [triChamp, setTriChamp] = useState('no');
  const [triDir, setTriDir] = useState('desc');

  const [editProjet, setEditProjet] = useState(null);
  const [editPersonnel, setEditPersonnel] = useState(null);
  const [editType, setEditType] = useState(null);
  const [confirmSuppr, setConfirmSuppr] = useState(null);
  const [saving, setSaving] = useState(false);
  const [erreur, setErreur] = useState('');

  // --- Frozen (sticky) header + barre de contrôle -----------------------
  const headerRef = useRef(null);
  const barreRef = useRef(null);
  const [headerH, setHeaderH] = useState(0);
  const [barreH, setBarreH] = useState(0);

  useEffect(() => {
    function mesurer() {
      if (headerRef.current) setHeaderH(headerRef.current.offsetHeight);
      if (barreRef.current) setBarreH(barreRef.current.offsetHeight);
    }
    mesurer();
    window.addEventListener('resize', mesurer);
    return () => window.removeEventListener('resize', mesurer);
  }, [tab, erreur, peutModifier, loading]);

  async function chargerTout() {
    const [resProjets, resTypes, resPersonnel] = await Promise.all([
      supabaseLP.from('projets').select('*'),
      supabaseLP.from('types_projets').select('*'),
      supabaseLP.from('personnel').select('*').order('nom'),
    ]);
    const erreurs = [resProjets.error, resTypes.error, resPersonnel.error].filter(Boolean);
    if (erreurs.length > 0) {
      setErreur(
        'Erreur de chargement des données : ' +
        erreurs.map((e) => e.message).join(' | ') +
        ' — vérifie que le schéma "liste_projets" est bien exposé et que les GRANT sont faits dans Supabase.'
      );
    }
    setProjets(resProjets.data || []);
    setTypes(resTypes.data || []);
    setPersonnel(resPersonnel.data || []);
  }

  useEffect(() => {
    (async () => {
      const { data: { session: s } } = await supabase.auth.getSession();
      if (!s) { setLoading(false); return; }
      setSession(s);

      const { data: appAccess } = await supabase
        .from('pep_user_apps').select('app_slug').eq('user_id', s.user.id).eq('app_slug', 'liste-projets').maybeSingle();

      const { data: roleRow } = await supabase
        .from('pep_user_roles').select('role').eq('user_id', s.user.id).maybeSingle();
      const estAdmin = roleRow?.role === 'admin';

      if (!appAccess && !estAdmin) {
        setDenied(true);
        setLoading(false);
        return;
      }

      const { data: featureRow } = await supabase
        .from('pep_user_features').select('feature_key')
        .eq('user_id', s.user.id).eq('app_slug', 'liste-projets').eq('feature_key', 'modifier').maybeSingle();
      setPeutModifier(!!featureRow || estAdmin);

      await chargerTout();
      setLoading(false);
    })();
  }, []);

  function emailDe(nomPersonnel) {
    return personnel.find((p) => p.nom === nomPersonnel)?.courriel || null;
  }

  const projetsAffiches = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    let list = projets.filter((p) => {
      if (p.type_projet === 'estimation' && !inclureEstimation && !q && !filtreType) return false;
      if (filtreType && p.type_projet !== filtreType) return false;
      if (!q) return true;
      return [p.no, p.nom, p.client, p.charge, p.surintendant, p.contact_client_nom]
        .some((v) => (v || '').toString().toLowerCase().includes(q));
    });
    list = [...list].sort((a, b) => {
      const av = (a[triChamp] || '').toString();
      const bv = (b[triChamp] || '').toString();
      const cmp = av.localeCompare(bv, 'fr', { numeric: true });
      return triDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [projets, recherche, filtreType, inclureEstimation, triChamp, triDir]);

  function trierPar(champ) {
    if (triChamp === champ) setTriDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setTriChamp(champ); setTriDir('asc'); }
  }

  function exporterCSV() {
    const entetes = ['No', 'Projet', 'Client', 'Contact client', 'Courriel contact client', 'Type', 'Chargé de projet', 'Surintendant', 'Contact inspection', 'Adresse'];
    const lignes = projetsAffiches.map((p) => [
      p.no, p.nom, p.client, p.contact_client_nom, p.contact_client_courriel,
      types.find((t) => t.code === p.type_projet)?.label || '',
      p.charge, p.surintendant, p.contact_inspection, p.adresse,
    ].map(csvEchappe).join(','));
    const csv = '\uFEFF' + [
      'Les Entreprises PEP2000 inc. - Liste des projets',
      `Genere le ${new Date().toLocaleDateString('fr-CA')}`,
      '',
      entetes.join(','),
      ...lignes,
    ].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `liste-projets-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function exporterPDF() {
    window.print();
  }

  async function sauvegarderProjet(form) {
    setSaving(true); setErreur('');
    try {
      const payload = {
        no: form.no.trim(),
        nom: form.nom.trim(),
        client: form.client || null,
        charge: form.charge || null,
        courriel_cp: emailDe(form.charge),
        surintendant: form.surintendant || null,
        type_projet: form.type_projet || null,
        contact_client_nom: form.contact_client_nom || null,
        contact_client_courriel: form.contact_client_courriel || null,
        contact_inspection: form.contact_inspection || null,
        adresse: form.adresse || null,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabaseLP.from('projets').upsert(payload);
      if (error) throw error;
      setEditProjet(null);
      await chargerTout();
    } catch (e) {
      setErreur(e.message);
    }
    setSaving(false);
  }

  async function supprimerProjet(no) {
    setSaving(true);
    try {
      await supabaseLP.from('projets').delete().eq('no', no);
      setConfirmSuppr(null);
      await chargerTout();
    } catch (e) {
      setErreur(e.message);
    }
    setSaving(false);
  }

  async function sauvegarderPersonnel(form) {
    setSaving(true); setErreur('');
    try {
      const payload = { nom: form.nom.trim(), courriel: form.courriel || null, actif: !!form.actif };
      if (form._ancienNom && form._ancienNom !== payload.nom) {
        await supabaseLP.from('personnel').update({ nom: payload.nom }).eq('nom', form._ancienNom);
        await supabaseLP.from('projets').update({ charge: payload.nom }).eq('charge', form._ancienNom);
        await supabaseLP.from('projets').update({ surintendant: payload.nom }).eq('surintendant', form._ancienNom);
        await supabaseLP.from('types_projets').update({ charge: payload.nom }).eq('charge', form._ancienNom);
        await supabaseLP.from('personnel').update({ courriel: payload.courriel, actif: payload.actif }).eq('nom', payload.nom);
      } else {
        const { error } = await supabaseLP.from('personnel').upsert(payload, { onConflict: 'nom' });
        if (error) throw error;
      }
      setEditPersonnel(null);
      await chargerTout();
    } catch (e) {
      setErreur(e.message);
    }
    setSaving(false);
  }

  async function supprimerPersonnel(nom) {
    setSaving(true);
    try {
      const { error } = await supabaseLP.from('personnel').delete().eq('nom', nom);
      if (error) throw error;
      setConfirmSuppr(null);
      await chargerTout();
    } catch (e) {
      setErreur(`Impossible de supprimer: ${e.message} (cette personne est peut-être encore assignée à un projet — retire-la d'abord des projets concernés, ou décoche "Actif" plutôt que de la supprimer)`);
    }
    setSaving(false);
  }

  async function sauvegarderType(form) {
    setSaving(true); setErreur('');
    try {
      const payload = { code: form.code.trim(), label: form.label.trim(), client: form.client || null, charge: form.charge || null, courriel_cp: emailDe(form.charge) };
      const { error } = await supabaseLP.from('types_projets').upsert(payload);
      if (error) throw error;
      setEditType(null);
      await chargerTout();
    } catch (e) {
      setErreur(e.message);
    }
    setSaving(false);
  }

  async function supprimerType(code) {
    setSaving(true);
    try {
      await supabaseLP.from('types_projets').delete().eq('code', code);
      setConfirmSuppr(null);
      await chargerTout();
    } catch (e) {
      setErreur(e.message);
    }
    setSaving(false);
  }

  if (loading) return <Center><Spinner /><p>Chargement...</p></Center>;

  if (!session) {
    return (
      <Center>
        <h2>Connexion requise</h2>
        <p>Connecte-toi depuis le Toolbox, puis reviens sur cette page.</p>
        <a href="/">Aller au Toolbox PEP</a>
      </Center>
    );
  }

  if (denied) {
    return (
      <Center>
        <h2>Accès refusé</h2>
        <p>Demande l&apos;accès à un administrateur du Toolbox.</p>
        <a href="/">&#8592; Retour au Toolbox PEP</a>
      </Center>
    );
  }

  return (
    <div style={{ fontFamily: 'Calibri, Segoe UI, sans-serif', background: BG, minHeight: '100vh' }}>
      <Head><title>Liste des projets - Toolbox PEP</title></Head>

      {/* En-tête PEP — figé en haut */}
      <div ref={headerRef} className="no-print" style={{ position: 'sticky', top: 0, zIndex: 60 }}>
        <div style={{ height: 4, background: RED }} />
        <header style={{ background: NAVY, color: '#fff', padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <img src={LOGO_PEP} alt="Les Entreprises PEP2000" style={{ height: 46, width: 'auto' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            <h1 style={{ margin: 0, fontSize: 19, fontFamily: "'Oswald',sans-serif", fontWeight: 700 }}>
              Les Entreprises PEP2000 inc. — Liste des projets
            </h1>
          </div>
          <a href="/" style={{ color: '#fff', background: 'rgba(255,255,255,0.15)', padding: '8px 14px', borderRadius: 6, textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>&#8592; Retour au Toolbox PEP</a>
        </header>
      </div>

      <main style={{ maxWidth: 1300, margin: '0 auto', padding: '0 16px 60px' }}>
        {/* Barre de contrôle (onglets + erreur + recherche/filtre) — figée juste sous l'en-tête */}
        <div
          ref={barreRef}
          className="no-print"
          style={{ position: 'sticky', top: headerH, zIndex: 55, background: BG, paddingTop: 16, paddingBottom: tab === 'projets' ? 0 : 12 }}
        >
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            {[['projets', `Projets (${projets.length})`], ['types', `Types de projet (${types.length})`], ['personnel', `Personnel (${personnel.length})`]].map(([key, label]) => (
              <button key={key} onClick={() => setTab(key)} style={tab === key ? btn : btnGhost}>{label}</button>
            ))}
            {!peutModifier && (
              <span style={{ marginLeft: 'auto', fontSize: 12, color: '#8a93a0' }}>Lecture seule</span>
            )}
          </div>

          {erreur && (
            <div style={{ background: '#FEECEC', border: '1px solid #f3b8b8', color: '#a31111', padding: '10px 14px', borderRadius: 6, marginBottom: 12, fontSize: 13.5 }}>
              {erreur} <button onClick={() => setErreur('')} style={{ ...btnGhost, ...btnSmall, marginLeft: 10 }}>Fermer</button>
            </div>
          )}

          {tab === 'projets' && (
            <div style={{ background: '#fff', borderRadius: '8px 8px 0 0', display: 'flex', gap: 10, padding: '14px 16px', alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid #eee' }}>
              <input
                type="text" placeholder="Rechercher (numéro, nom, client, chargé, surintendant)..."
                value={recherche} onChange={(e) => setRecherche(e.target.value)}
                style={{ ...input, maxWidth: 320 }}
              />
              <select value={filtreType} onChange={(e) => setFiltreType(e.target.value)} style={{ ...input, width: 'auto', maxWidth: 200 }}>
                <option value="">Tous les types</option>
                {types.map((t) => <option key={t.code} value={t.code}>{TYPE_ICONES[t.code] || ''} {t.label}</option>)}
              </select>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: '#444', whiteSpace: 'nowrap' }}>
                <input type="checkbox" checked={inclureEstimation} onChange={(e) => setInclureEstimation(e.target.checked)} />
                Inclure les projets en estimation
              </label>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <button style={btnGhost} onClick={exporterCSV}>Exporter CSV</button>
                <button style={btnGhost} onClick={exporterPDF}>Exporter PDF</button>
                {peutModifier && (
                  <button
                    style={btn}
                    onClick={() => setEditProjet({ no: '', nom: '', client: '', charge: '', surintendant: '', type_projet: '', contact_client_nom: '', contact_client_courriel: '', contact_inspection: '', adresse: '' })}
                  >+ Nouveau projet</button>
                )}
              </div>
            </div>
          )}
        </div>

        {tab === 'projets' && (
          <>
            <div className="print-only" style={{ display: 'none' }}>
              <div style={{ height: 4, background: RED }} />
              <div style={{ background: NAVY, color: '#fff', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <img src={LOGO_PEP} alt="" style={{ height: 32, width: 'auto' }} />
                <strong style={{ fontSize: 14, fontFamily: "'Oswald',sans-serif" }}>Les Entreprises PEP2000 inc. — Liste des projets</strong>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: '#B9C2CC' }}>Généré le {new Date().toLocaleDateString('fr-CA')}</span>
              </div>
            </div>
            <div id="zone-imprimable" style={{ background: '#fff', borderRadius: '0 0 8px 8px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.08)' }}>
            <div style={{ overflow: 'auto', maxHeight: `calc(100vh - ${headerH + barreH + 20}px)` }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...th, position: 'sticky', top: 0, zIndex: 40 }} onClick={() => trierPar('no')}>No {triChamp === 'no' ? (triDir === 'asc' ? '▲' : '▼') : ''}</th>
                    <th style={{ ...th, position: 'sticky', top: 0, zIndex: 40 }} onClick={() => trierPar('nom')}>Projet {triChamp === 'nom' ? (triDir === 'asc' ? '▲' : '▼') : ''}</th>
                    <th style={{ ...th, position: 'sticky', top: 0, zIndex: 40 }} onClick={() => trierPar('client')}>Client</th>
                    <th style={{ ...th, position: 'sticky', top: 0, zIndex: 40 }}>Contact client</th>
                    <th style={{ ...th, position: 'sticky', top: 0, zIndex: 40 }}>Type</th>
                    <th style={{ ...th, position: 'sticky', top: 0, zIndex: 40 }} onClick={() => trierPar('charge')}>Chargé</th>
                    <th style={{ ...th, position: 'sticky', top: 0, zIndex: 40 }} onClick={() => trierPar('surintendant')}>Surintendant</th>
                    <th style={{ ...th, position: 'sticky', top: 0, zIndex: 40 }}>Contact inspection</th>
                    {peutModifier && <th style={{ ...th, position: 'sticky', top: 0, zIndex: 40, cursor: 'default' }} className="no-print" />}
                  </tr>
                </thead>
                <tbody>
                  {projetsAffiches.length === 0 && (
                    <tr><td style={{ ...td, whiteSpace: 'normal' }} colSpan={peutModifier ? 9 : 8}>Aucun projet trouvé.</td></tr>
                  )}
                  {projetsAffiches.map((p, i) => (
                    <tr key={p.no} style={{ background: i % 2 === 0 ? '#fff' : '#FAFBFC' }}>
                      <td style={{ ...td, fontWeight: 700, color: NAVY }}>{p.no}</td>
                      <td style={{ ...td, whiteSpace: 'normal', minWidth: 160 }}>{p.nom}</td>
                      <td style={{ ...td, whiteSpace: 'normal' }}>{p.client || '—'}</td>
                      <td style={{ ...td, whiteSpace: 'normal' }}>
                        {p.contact_client_nom || '—'}
                        {p.contact_client_courriel && <span style={{ color: '#8a93a0' }}> · {p.contact_client_courriel}</span>}
                      </td>
                      <td style={td}>{p.type_projet ? (TYPE_ICONES[p.type_projet] || '') : '—'}</td>
                      <td style={td}>{p.charge || '—'}</td>
                      <td style={td}>{p.surintendant || '—'}</td>
                      <td style={{ ...td, whiteSpace: 'normal' }}>{p.contact_inspection || '—'}</td>
                      {peutModifier && (
                        <td style={td} className="no-print">
                          <button style={{ ...btnGhost, ...btnSmall, marginRight: 6 }} onClick={() => setEditProjet({ ...p, type_projet: p.type_projet || '' })}>Modifier</button>
                          <button style={{ ...btnDanger, ...btnSmall }} onClick={() => setConfirmSuppr({ type: 'projet', id: p.no, label: `${p.no} — ${p.nom}` })}>Suppr.</button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          </>
        )}

        {tab === 'types' && (
          <div style={{ background: '#fff', borderRadius: 8, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,.08)' }}>
            <p style={{ fontSize: 13, color: '#666', marginTop: 0 }}>
              Catégories utilisées soit comme travail interne sans numéro de projet, soit comme classification (« type ») attachable à n&apos;importe quel projet numéroté.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
              {peutModifier && (
                <button style={btn} onClick={() => setEditType({ code: '', label: '', client: '', charge: '' })}>+ Nouveau type</button>
              )}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Nom</th><th style={th}>Client</th><th style={th}>Chargé de projet</th>
                  {peutModifier && <th style={th} />}
                </tr>
              </thead>
              <tbody>
                {types.map((t, i) => (
                  <tr key={t.code} style={{ background: i % 2 === 0 ? '#fff' : '#FAFBFC' }}>
                    <td style={{ ...td, whiteSpace: 'normal' }}>{TYPE_ICONES[t.code] || ''} {t.label}</td>
                    <td style={{ ...td, whiteSpace: 'normal' }}>{t.client || '—'}</td>
                    <td style={td}>{t.charge || '—'}</td>
                    {peutModifier && (
                      <td style={td}>
                        <button style={{ ...btnGhost, ...btnSmall, marginRight: 6 }} onClick={() => setEditType({ ...t })}>Modifier</button>
                        <button style={{ ...btnDanger, ...btnSmall }} onClick={() => setConfirmSuppr({ type: 'type', id: t.code, label: t.label })}>Suppr.</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'personnel' && (
          <div style={{ background: '#fff', borderRadius: 8, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,.08)' }}>
            <p style={{ fontSize: 13, color: '#666', marginTop: 0 }}>
              Liste unique utilisée à la fois pour « Chargé de projet » et « Surintendant » — c&apos;est aussi ici que sont gérés les courriels internes (jamais affichés dans la liste des projets).
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
              {peutModifier && (
                <button style={btn} onClick={() => setEditPersonnel({ nom: '', courriel: '', actif: true, _ancienNom: '' })}>+ Nouvelle personne</button>
              )}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Nom</th><th style={th}>Courriel</th><th style={th}>Statut</th>
                  {peutModifier && <th style={th} />}
                </tr>
              </thead>
              <tbody>
                {personnel.map((p, i) => (
                  <tr key={p.nom} style={{ background: i % 2 === 0 ? '#fff' : '#FAFBFC' }}>
                    <td style={td}>{p.nom}</td>
                    <td style={td}>{p.courriel || '—'}</td>
                    <td style={td}><span style={{ color: p.actif ? '#2E9F58' : '#8a93a0', fontWeight: 600 }}>&#9679; {p.actif ? 'Actif' : 'Inactif'}</span></td>
                    {peutModifier && (
                      <td style={td}>
                        <button style={{ ...btnGhost, ...btnSmall, marginRight: 6 }} onClick={() => setEditPersonnel({ ...p, _ancienNom: p.nom })}>Modifier</button>
                        <button style={{ ...btnDanger, ...btnSmall }} onClick={() => setConfirmSuppr({ type: 'personnel', id: p.nom, label: p.nom })}>Suppr.</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {editProjet && (
        <ModalProjet
          projet={editProjet} personnel={personnel} types={types} emailDe={emailDe}
          onSave={sauvegarderProjet} onCancel={() => setEditProjet(null)} saving={saving}
        />
      )}
      {editPersonnel && (
        <ModalPersonnel personne={editPersonnel} onSave={sauvegarderPersonnel} onCancel={() => setEditPersonnel(null)} saving={saving} />
      )}
      {editType && (
        <ModalType type={editType} personnel={personnel} onSave={sauvegarderType} onCancel={() => setEditType(null)} saving={saving} />
      )}
      {confirmSuppr && (
        <ModalConfirm
          message={`Supprimer définitivement "${confirmSuppr.label}" ?`}
          saving={saving}
          onCancel={() => setConfirmSuppr(null)}
          onConfirm={() => {
            if (confirmSuppr.type === 'projet') supprimerProjet(confirmSuppr.id);
            else if (confirmSuppr.type === 'personnel') supprimerPersonnel(confirmSuppr.id);
            else supprimerType(confirmSuppr.id);
          }}
        />
      )}

      <style jsx global>{`
        .print-only { display: none; }
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body, #zone-imprimable { background: #fff !important; }
          table { font-size: 10px !important; }
          th { background: #14213D !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </div>
  );
}

function Overlay({ children, width = 460 }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,33,56,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
      <div style={{ width: '100%', maxWidth: width, background: '#fff', borderRadius: 8, padding: 24, fontFamily: 'Calibri, sans-serif', maxHeight: '90vh', overflowY: 'auto' }}>
        {children}
      </div>
    </div>
  );
}
function Champ({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#444', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

function ModalProjet({ projet, personnel, types, emailDe, onSave, onCancel, saving }) {
  const [form, setForm] = useState(projet);
  const estNouveau = !projet.no;
  const courrielApercu = form.charge ? emailDe(form.charge) : null;

  return (
    <Overlay width={520}>
      <h3 style={{ marginTop: 0, color: NAVY }}>{estNouveau ? 'Nouveau projet' : `Modifier ${projet.no}`}</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>
        <Champ label="Numéro de projet *">
          <input style={input} value={form.no} disabled={!estNouveau} onChange={(e) => setForm({ ...form, no: e.target.value })} placeholder="ex: 26-201" />
        </Champ>
        <Champ label="Type de projet">
          <select style={input} value={form.type_projet || ''} onChange={(e) => setForm({ ...form, type_projet: e.target.value })}>
            <option value="">—</option>
            {types.map((t) => <option key={t.code} value={t.code}>{TYPE_ICONES[t.code] || ''} {t.label}</option>)}
          </select>
        </Champ>
      </div>
      <Champ label="Nom du projet *">
        <input style={input} value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} />
      </Champ>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>
        <Champ label="Client (compagnie)">
          <input style={input} value={form.client || ''} onChange={(e) => setForm({ ...form, client: e.target.value })} />
        </Champ>
        <Champ label="Nom du contact client">
          <input style={input} value={form.contact_client_nom || ''} onChange={(e) => setForm({ ...form, contact_client_nom: e.target.value })} />
        </Champ>
      </div>
      <Champ label="Courriel du contact client">
        <input style={input} value={form.contact_client_courriel || ''} onChange={(e) => setForm({ ...form, contact_client_courriel: e.target.value })} />
      </Champ>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>
        <Champ label="Chargé de projet">
          <select style={input} value={form.charge || ''} onChange={(e) => setForm({ ...form, charge: e.target.value })}>
            <option value="">—</option>
            {personnel.map((p) => <option key={p.nom} value={p.nom}>{p.nom}{!p.actif ? ' (inactif)' : ''}</option>)}
          </select>
          {courrielApercu && <div style={{ fontSize: 11, color: '#8a93a0', marginTop: 3 }}>Courriel lié : {courrielApercu}</div>}
        </Champ>
        <Champ label="Surintendant">
          <select style={input} value={form.surintendant || ''} onChange={(e) => setForm({ ...form, surintendant: e.target.value })}>
            <option value="">—</option>
            {personnel.map((p) => <option key={p.nom} value={p.nom}>{p.nom}{!p.actif ? ' (inactif)' : ''}</option>)}
          </select>
        </Champ>
      </div>
      <Champ label="Contact inspection (sécurité — inspections de machinerie)">
        <input style={input} value={form.contact_inspection || ''} onChange={(e) => setForm({ ...form, contact_inspection: e.target.value })} />
      </Champ>
      <Champ label="Adresse du projet">
        <input style={input} value={form.adresse || ''} onChange={(e) => setForm({ ...form, adresse: e.target.value })} />
      </Champ>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
        <button style={btnGhost} onClick={onCancel} disabled={saving}>Annuler</button>
        <button style={btn} disabled={saving || !form.no.trim() || !form.nom.trim()} onClick={() => onSave(form)}>{saving ? 'Enregistrement...' : 'Enregistrer'}</button>
      </div>
    </Overlay>
  );
}

function ModalPersonnel({ personne, onSave, onCancel, saving }) {
  const [form, setForm] = useState(personne);
  return (
    <Overlay width={380}>
      <h3 style={{ marginTop: 0, color: NAVY }}>{form._ancienNom ? `Modifier ${form._ancienNom}` : 'Nouvelle personne'}</h3>
      <Champ label="Nom complet *">
        <input style={input} value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} />
      </Champ>
      <Champ label="Courriel">
        <input style={input} value={form.courriel || ''} onChange={(e) => setForm({ ...form, courriel: e.target.value })} />
      </Champ>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 8 }}>
        <input type="checkbox" checked={!!form.actif} onChange={(e) => setForm({ ...form, actif: e.target.checked })} />
        Actif (apparaît dans les listes déroulantes)
      </label>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
        <button style={btnGhost} onClick={onCancel} disabled={saving}>Annuler</button>
        <button style={btn} disabled={saving || !form.nom.trim()} onClick={() => onSave(form)}>{saving ? 'Enregistrement...' : 'Enregistrer'}</button>
      </div>
    </Overlay>
  );
}

function ModalType({ type, personnel, onSave, onCancel, saving }) {
  const [form, setForm] = useState(type);
  const estNouveau = !type.code;
  return (
    <Overlay width={380}>
      <h3 style={{ marginTop: 0, color: NAVY }}>{estNouveau ? 'Nouveau type de projet' : `Modifier ${type.label}`}</h3>
      {estNouveau && (
        <Champ label="Code (identifiant unique, sans espace) *">
          <input style={input} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })} placeholder="ex: transport" />
        </Champ>
      )}
      <Champ label="Nom affiché *">
        <input style={input} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
      </Champ>
      <Champ label="Client (si utilisé comme travail interne sans numéro)">
        <input style={input} value={form.client || ''} onChange={(e) => setForm({ ...form, client: e.target.value })} />
      </Champ>
      <Champ label="Chargé de projet (si utilisé comme travail interne sans numéro)">
        <select style={input} value={form.charge || ''} onChange={(e) => setForm({ ...form, charge: e.target.value })}>
          <option value="">—</option>
          {personnel.map((p) => <option key={p.nom} value={p.nom}>{p.nom}</option>)}
        </select>
      </Champ>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
        <button style={btnGhost} onClick={onCancel} disabled={saving}>Annuler</button>
        <button style={btn} disabled={saving || !form.code.trim() || !form.label.trim()} onClick={() => onSave(form)}>{saving ? 'Enregistrement...' : 'Enregistrer'}</button>
      </div>
    </Overlay>
  );
}

function ModalConfirm({ message, onConfirm, onCancel, saving }) {
  return (
    <Overlay width={380}>
      <p style={{ fontSize: 14.5 }}>{message}</p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button style={btnGhost} onClick={onCancel} disabled={saving}>Annuler</button>
        <button style={btnDanger} onClick={onConfirm} disabled={saving}>{saving ? 'Suppression...' : 'Supprimer'}</button>
      </div>
    </Overlay>
  );
}

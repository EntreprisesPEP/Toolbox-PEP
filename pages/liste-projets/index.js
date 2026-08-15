import { useState, useEffect, useMemo } from 'react';
import Head from 'next/head';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Deux clients: un sur le schema public (session, droits) et un sur
// liste_projets (donnees de l'app) -- meme convention que le reste du
// Toolbox (voir components/ordre-du-jour/lib/supabaseClient.js).
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const supabaseLP = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { db: { schema: 'liste_projets' } });

const NAVY = '#14213D';
const RED = '#C41230';

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

const btn = { fontFamily: 'inherit', background: NAVY, color: '#fff', border: 'none', borderRadius: 6, padding: '7px 14px', cursor: 'pointer', fontSize: 13 };
const btnGhost = { ...btn, background: '#fff', color: NAVY, border: `1px solid ${NAVY}` };
const btnDanger = { ...btn, background: RED };
const input = { padding: '7px 9px', borderRadius: 5, border: '1px solid #ccc', fontFamily: 'inherit', fontSize: 13, width: '100%', boxSizing: 'border-box' };
const th = { textAlign: 'left', padding: '8px 10px', color: '#666', fontWeight: 600, borderBottom: '1px solid #eee', fontSize: 12.5, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' };
const td = { padding: '7px 10px', verticalAlign: 'middle', fontSize: 13.5, borderBottom: '1px solid #f2f2f2' };

export default function ListeProjetsPage() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [peutModifier, setPeutModifier] = useState(false);

  const [tab, setTab] = useState('projets'); // 'projets' | 'types' | 'personnel'
  const [projets, setProjets] = useState([]);
  const [types, setTypes] = useState([]);
  const [personnel, setPersonnel] = useState([]);

  const [recherche, setRecherche] = useState('');
  const [triChamp, setTriChamp] = useState('no');
  const [triDir, setTriDir] = useState('desc');

  const [editProjet, setEditProjet] = useState(null); // objet en cours d'edition, ou {} pour nouveau
  const [editPersonnel, setEditPersonnel] = useState(null);
  const [editType, setEditType] = useState(null);
  const [confirmSuppr, setConfirmSuppr] = useState(null); // { type: 'projet'|'personnel'|'type', id, label }
  const [saving, setSaving] = useState(false);
  const [erreur, setErreur] = useState('');

  async function chargerTout() {
    const [{ data: p }, { data: t }, { data: pers }] = await Promise.all([
      supabaseLP.from('projets').select('*'),
      supabaseLP.from('types_projets').select('*'),
      supabaseLP.from('personnel').select('*').order('nom'),
    ]);
    setProjets(p || []);
    setTypes(t || []);
    setPersonnel(pers || []);
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

  const projetsAffiches = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    let list = projets.filter((p) => !q || [p.no, p.nom, p.client, p.charge, p.surintendant].some((v) => (v || '').toLowerCase().includes(q)));
    list = [...list].sort((a, b) => {
      const av = (a[triChamp] || '').toString();
      const bv = (b[triChamp] || '').toString();
      const cmp = av.localeCompare(bv, 'fr', { numeric: true });
      return triDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [projets, recherche, triChamp, triDir]);

  function trierPar(champ) {
    if (triChamp === champ) setTriDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setTriChamp(champ); setTriDir('asc'); }
  }

  async function sauvegarderProjet(form) {
    setSaving(true); setErreur('');
    try {
      const payload = {
        no: form.no.trim(),
        nom: form.nom.trim(),
        client: form.client || null,
        charge: form.charge || null,
        courriel_cp: form.courriel_cp || null,
        surintendant: form.surintendant || null,
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
        // renommer une personne existante -> les references (projets.charge,
        // types_projets.charge) suivent automatiquement car elles pointent
        // sur le nom via la contrainte de cle etrangere + update en cascade
        // n'existe pas par defaut: on met a jour manuellement les references.
        await supabaseLP.from('personnel').update({ nom: payload.nom }).eq('nom', form._ancienNom);
        await supabaseLP.from('projets').update({ charge: payload.nom }).eq('charge', form._ancienNom);
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
      const payload = { code: form.code.trim(), label: form.label.trim(), client: form.client || null, charge: form.charge || null, courriel_cp: form.courriel_cp || null };
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
    <div style={{ fontFamily: 'Calibri, Segoe UI, sans-serif', background: '#f2f2f2', minHeight: '100vh' }}>
      <Head><title>Liste des projets - Toolbox PEP</title></Head>

      <header style={{ background: NAVY, color: '#fff', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>Liste des projets</h1>
        <a href="/" style={{ color: '#fff', background: 'rgba(255,255,255,0.15)', padding: '8px 14px', borderRadius: 6, textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>&#8592; Retour au Toolbox PEP</a>
      </header>

      <main style={{ maxWidth: 1200, margin: '24px auto', padding: '0 16px 60px' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          {[['projets', `Projets (${projets.length})`], ['types', `Types de projet (${types.length})`], ['personnel', `Personnel (${personnel.length})`]].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)} style={tab === key ? btn : btnGhost}>{label}</button>
          ))}
          {!peutModifier && (
            <span style={{ marginLeft: 'auto', fontSize: 12.5, color: '#8a93a0', alignSelf: 'center' }}>Lecture seule — demande le droit de modifier à un administrateur si besoin.</span>
          )}
        </div>

        {erreur && (
          <div style={{ background: '#FEECEC', border: '1px solid #f3b8b8', color: '#a31111', padding: '10px 14px', borderRadius: 6, marginBottom: 16, fontSize: 13.5 }}>
            {erreur} <button onClick={() => setErreur('')} style={{ ...btnGhost, marginLeft: 10, padding: '2px 8px', fontSize: 11 }}>Fermer</button>
          </div>
        )}

        {tab === 'projets' && (
          <div style={{ background: '#fff', borderRadius: 10, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,.08)' }}>
            <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center' }}>
              <input
                type="text" placeholder="Rechercher (numéro, nom, client, chargé, surintendant)..."
                value={recherche} onChange={(e) => setRecherche(e.target.value)}
                style={{ ...input, maxWidth: 380 }}
              />
              {peutModifier && (
                <button
                  style={{ ...btn, marginLeft: 'auto' }}
                  onClick={() => setEditProjet({ no: '', nom: '', client: '', charge: '', courriel_cp: '', surintendant: '', contact_inspection: '', adresse: '' })}
                >+ Nouveau projet</button>
              )}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th} onClick={() => trierPar('no')}>No {triChamp === 'no' ? (triDir === 'asc' ? '▲' : '▼') : ''}</th>
                    <th style={th} onClick={() => trierPar('nom')}>Projet {triChamp === 'nom' ? (triDir === 'asc' ? '▲' : '▼') : ''}</th>
                    <th style={th} onClick={() => trierPar('client')}>Client</th>
                    <th style={th} onClick={() => trierPar('charge')}>Chargé de projet</th>
                    <th style={th}>Courriel CP</th>
                    <th style={th} onClick={() => trierPar('surintendant')}>Surintendant</th>
                    <th style={th}>Contact inspection</th>
                    <th style={th}>Adresse</th>
                    {peutModifier && <th style={th} />}
                  </tr>
                </thead>
                <tbody>
                  {projetsAffiches.length === 0 && (
                    <tr><td style={td} colSpan={peutModifier ? 9 : 8}>Aucun projet trouvé.</td></tr>
                  )}
                  {projetsAffiches.map((p) => (
                    <tr key={p.no}>
                      <td style={{ ...td, fontWeight: 700 }}>{p.no}</td>
                      <td style={td}>{p.nom}</td>
                      <td style={td}>{p.client || '—'}</td>
                      <td style={td}>{p.charge || '—'}</td>
                      <td style={td}>{p.courriel_cp || '—'}</td>
                      <td style={td}>{p.surintendant || '—'}</td>
                      <td style={td}>{p.contact_inspection || '—'}</td>
                      <td style={td}>{p.adresse || '—'}</td>
                      {peutModifier && (
                        <td style={td}>
                          <button style={{ ...btnGhost, fontSize: 12, padding: '4px 9px', marginRight: 6 }} onClick={() => setEditProjet({ ...p })}>Modifier</button>
                          <button style={{ ...btnDanger, fontSize: 12, padding: '4px 9px' }} onClick={() => setConfirmSuppr({ type: 'projet', id: p.no, label: `${p.no} — ${p.nom}` })}>Suppr.</button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'types' && (
          <div style={{ background: '#fff', borderRadius: 10, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,.08)' }}>
            <p style={{ fontSize: 13, color: '#666', marginTop: 0 }}>
              Catégories de travail interne sans numéro de projet (utilisées quand une demande ne correspond à aucun projet numéroté précis).
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
              {peutModifier && (
                <button style={btn} onClick={() => setEditType({ code: '', label: '', client: '', charge: '', courriel_cp: '' })}>+ Nouveau type</button>
              )}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Nom</th><th style={th}>Client</th><th style={th}>Chargé de projet</th><th style={th}>Courriel CP</th>
                  {peutModifier && <th style={th} />}
                </tr>
              </thead>
              <tbody>
                {types.map((t) => (
                  <tr key={t.code}>
                    <td style={td}>{t.label}</td>
                    <td style={td}>{t.client || '—'}</td>
                    <td style={td}>{t.charge || '—'}</td>
                    <td style={td}>{t.courriel_cp || '—'}</td>
                    {peutModifier && (
                      <td style={td}>
                        <button style={{ ...btnGhost, fontSize: 12, padding: '4px 9px', marginRight: 6 }} onClick={() => setEditType({ ...t })}>Modifier</button>
                        <button style={{ ...btnDanger, fontSize: 12, padding: '4px 9px' }} onClick={() => setConfirmSuppr({ type: 'type', id: t.code, label: t.label })}>Suppr.</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'personnel' && (
          <div style={{ background: '#fff', borderRadius: 10, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,.08)' }}>
            <p style={{ fontSize: 13, color: '#666', marginTop: 0 }}>
              Liste unique utilisée à la fois pour "Chargé de projet" et "Surintendant" — certaines personnes portent les deux chapeaux selon le projet.
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
                {personnel.map((p) => (
                  <tr key={p.nom}>
                    <td style={td}>{p.nom}</td>
                    <td style={td}>{p.courriel || '—'}</td>
                    <td style={td}><span style={{ color: p.actif ? '#2E9F58' : '#8a93a0', fontWeight: 600 }}>&#9679; {p.actif ? 'Actif' : 'Inactif'}</span></td>
                    {peutModifier && (
                      <td style={td}>
                        <button style={{ ...btnGhost, fontSize: 12, padding: '4px 9px', marginRight: 6 }} onClick={() => setEditPersonnel({ ...p, _ancienNom: p.nom })}>Modifier</button>
                        <button style={{ ...btnDanger, fontSize: 12, padding: '4px 9px' }} onClick={() => setConfirmSuppr({ type: 'personnel', id: p.nom, label: p.nom })}>Suppr.</button>
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
          projet={editProjet} personnel={personnel} onSave={sauvegarderProjet}
          onCancel={() => setEditProjet(null)} saving={saving}
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

function ModalProjet({ projet, personnel, onSave, onCancel, saving }) {
  const [form, setForm] = useState(projet);
  const estNouveau = !projet.no;
  return (
    <Overlay>
      <h3 style={{ marginTop: 0 }}>{estNouveau ? 'Nouveau projet' : `Modifier ${projet.no}`}</h3>
      <Champ label="Numéro de projet *">
        <input style={input} value={form.no} disabled={!estNouveau} onChange={(e) => setForm({ ...form, no: e.target.value })} placeholder="ex: 26-201" />
      </Champ>
      <Champ label="Nom du projet *">
        <input style={input} value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} />
      </Champ>
      <Champ label="Client">
        <input style={input} value={form.client || ''} onChange={(e) => setForm({ ...form, client: e.target.value })} />
      </Champ>
      <Champ label="Chargé de projet">
        <select style={input} value={form.charge || ''} onChange={(e) => setForm({ ...form, charge: e.target.value })}>
          <option value="">—</option>
          {personnel.map((p) => <option key={p.nom} value={p.nom}>{p.nom}{!p.actif ? ' (inactif)' : ''}</option>)}
        </select>
      </Champ>
      <Champ label="Courriel CP">
        <input style={input} value={form.courriel_cp || ''} onChange={(e) => setForm({ ...form, courriel_cp: e.target.value })} />
      </Champ>
      <Champ label="Surintendant">
        <select style={input} value={form.surintendant || ''} onChange={(e) => setForm({ ...form, surintendant: e.target.value })}>
          <option value="">—</option>
          {personnel.map((p) => <option key={p.nom} value={p.nom}>{p.nom}{!p.actif ? ' (inactif)' : ''}</option>)}
        </select>
      </Champ>
      <Champ label="Contact inspection (courriel — sécurité client, machines)">
        <input style={input} value={form.contact_inspection || ''} onChange={(e) => setForm({ ...form, contact_inspection: e.target.value })} />
      </Champ>
      <Champ label="Adresse du projet">
        <input style={input} value={form.adresse || ''} onChange={(e) => setForm({ ...form, adresse: e.target.value })} />
      </Champ>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
        <button style={btnGhost} onClick={onCancel} disabled={saving}>Annuler</button>
        <button
          style={btn} disabled={saving || !form.no.trim() || !form.nom.trim()}
          onClick={() => onSave(form)}
        >{saving ? 'Enregistrement...' : 'Enregistrer'}</button>
      </div>
    </Overlay>
  );
}

function ModalPersonnel({ personne, onSave, onCancel, saving }) {
  const [form, setForm] = useState(personne);
  return (
    <Overlay width={380}>
      <h3 style={{ marginTop: 0 }}>{form._ancienNom ? `Modifier ${form._ancienNom}` : 'Nouvelle personne'}</h3>
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
      <h3 style={{ marginTop: 0 }}>{estNouveau ? 'Nouveau type de projet' : `Modifier ${type.label}`}</h3>
      {estNouveau && (
        <Champ label="Code (identifiant unique, sans espace) *">
          <input style={input} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })} placeholder="ex: transport" />
        </Champ>
      )}
      <Champ label="Nom affiché *">
        <input style={input} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
      </Champ>
      <Champ label="Client">
        <input style={input} value={form.client || ''} onChange={(e) => setForm({ ...form, client: e.target.value })} />
      </Champ>
      <Champ label="Chargé de projet">
        <select style={input} value={form.charge || ''} onChange={(e) => setForm({ ...form, charge: e.target.value })}>
          <option value="">—</option>
          {personnel.map((p) => <option key={p.nom} value={p.nom}>{p.nom}</option>)}
        </select>
      </Champ>
      <Champ label="Courriel CP">
        <input style={input} value={form.courriel_cp || ''} onChange={(e) => setForm({ ...form, courriel_cp: e.target.value })} />
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

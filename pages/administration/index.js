import { useState, useEffect } from 'react';
import Head from 'next/head';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function relativeTime(iso) {
  if (!iso) return 'Jamais connecte';
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "A l'instant";
  if (mins < 60) return `Il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `Il y a ${days} j`;
  const months = Math.floor(days / 30);
  if (months < 12) return `Il y a ${months} mois`;
  return `Il y a ${Math.floor(months / 12)} an(s)`;
}

function isActiveRecently(iso) {
  if (!iso) return false;
  const diffMs = Date.now() - new Date(iso).getTime();
  return diffMs < 1000 * 60 * 60 * 24 * 14; // actif si connecte dans les 14 derniers jours
}

export default function AdministrationPage() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [users, setUsers] = useState([]);
  const [apps, setApps] = useState([]);
  const [features, setFeatures] = useState([]);
  const [expandedUser, setExpandedUser] = useState(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteMsg, setInviteMsg] = useState('');
  const [saving, setSaving] = useState(false);

  async function callApi(payload) {
    const { data: { session: s } } = await supabase.auth.getSession();
    const res = await fetch('/api/administration/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${s.access_token}`,
      },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Erreur serveur');
    return json;
  }

  async function loadAll() {
    const data = await callApi({ action: 'list' });
    setUsers(data.users.sort((a, b) => (a.email || '').localeCompare(b.email || '')));
    setApps(data.apps);
    setFeatures(data.features);
  }

  useEffect(() => {
    (async () => {
      const { data: { session: s } } = await supabase.auth.getSession();
      if (!s) {
        setLoading(false);
        return;
      }
      setSession(s);

      const { data: roleRow } = await supabase
        .from('pep_user_roles')
        .select('role')
        .eq('user_id', s.user.id)
        .single();

      if (!roleRow || roleRow.role !== 'admin') {
        setDenied(true);
        setLoading(false);
        return;
      }

      try {
        await loadAll();
      } catch (e) {
        console.error(e); // eslint-disable-line no-console
      }
      setLoading(false);
    })();
  }, []);

  async function onInvite() {
    if (!inviteEmail.trim()) {
      setInviteMsg('Entre un courriel.');
      return;
    }
    setInviteMsg('Envoi en cours...');
    try {
      await callApi({ action: 'invite', email: inviteEmail.trim() });
      setInviteMsg(`Invitation envoyee a ${inviteEmail.trim()}`);
      setInviteEmail('');
      await loadAll();
    } catch (e) {
      setInviteMsg(`Erreur: ${e.message}`);
    }
  }

  async function onRoleChange(user, newRole) {
    setSaving(true);
    try {
      await callApi({ action: 'update_role', user_id: user.id, role: newRole });
      await loadAll();
    } catch (e) {
      alert(`Erreur: ${e.message}`); // eslint-disable-line no-alert
    }
    setSaving(false);
  }

  async function onDeleteUser(user) {
    if (!confirm(`Supprimer definitivement le compte de ${user.email} ? Cette action est irreversible.`)) return; // eslint-disable-line no-alert
    setSaving(true);
    try {
      await callApi({ action: 'delete_user', user_id: user.id });
      await loadAll();
    } catch (e) {
      alert(`Erreur: ${e.message}`); // eslint-disable-line no-alert
    }
    setSaving(false);
  }

  async function onSavePermissions(user, appSlug, hasAppAccess, featureKeys) {
    setSaving(true);
    try {
      await callApi({
        action: 'update_permissions',
        user_id: user.id,
        app_slug: appSlug,
        has_app_access: hasAppAccess,
        feature_keys: featureKeys,
      });
      await loadAll();
    } catch (e) {
      alert(`Erreur: ${e.message}`); // eslint-disable-line no-alert
    }
    setSaving(false);
  }

  if (loading) {
    return <Center><Spinner /><p>Chargement...</p></Center>;
  }

  if (!session) {
    return (
      <Center>
        <h2>Connexion requise</h2>
        <p>Connecte-toi depuis le Toolbox, puis reviens sur cette page.</p>
        <a href="/">Aller au Toolbox</a>
      </Center>
    );
  }

  if (denied) {
    return (
      <Center>
        <h2>Acces refuse</h2>
        <p>Ce panneau est reserve aux administrateurs.</p>
        <a href="/">Retour au Toolbox</a>
      </Center>
    );
  }

  return (
    <div style={{ fontFamily: 'Calibri, Segoe UI, sans-serif', background: '#f2f2f2', minHeight: '100vh' }}>
      <Head><title>Administration - Toolbox PEP</title></Head>

      <header style={{ background: '#14213D', color: '#fff', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>Administration - Toolbox PEP</h1>
        <a href="/" style={{ color: '#fff', textDecoration: 'underline', fontSize: 14 }}>&#8592; Retour au Toolbox</a>
      </header>

      <main style={{ maxWidth: 1100, margin: '24px auto', padding: '0 16px 60px' }}>
        <Card>
          <h2 style={{ color: '#C41230', fontSize: 16, marginTop: 0 }}>Inviter un nouvel utilisateur</h2>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="email"
              placeholder="courriel@pep2000.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #ccc', width: 260, fontFamily: 'inherit' }}
            />
            <button onClick={onInvite} style={btnStyle}>Envoyer l&apos;invitation</button>
          </div>
          {inviteMsg && <div style={{ marginTop: 10, fontSize: 14 }}>{inviteMsg}</div>}
        </Card>

        <Card>
          <h2 style={{ color: '#C41230', fontSize: 16, marginTop: 0 }}>Membres ({users.length})</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr>
                <Th>Courriel</Th>
                <Th>Statut</Th>
                <Th>Derniere connexion</Th>
                <Th>Role</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <UserRow
                  key={u.id}
                  user={u}
                  apps={apps}
                  features={features}
                  expanded={expandedUser === u.id}
                  onToggleExpand={() => setExpandedUser(expandedUser === u.id ? null : u.id)}
                  onRoleChange={(role) => onRoleChange(u, role)}
                  onDelete={() => onDeleteUser(u)}
                  onSavePermissions={(appSlug, hasAppAccess, featureKeys) => onSavePermissions(u, appSlug, hasAppAccess, featureKeys)}
                  saving={saving}
                />
              ))}
            </tbody>
          </table>
        </Card>
      </main>
    </div>
  );
}

function UserRow({ user, apps, features, expanded, onToggleExpand, onRoleChange, onDelete, onSavePermissions, saving }) {
  const statusLabel = user.invited_not_active
    ? 'Invite - pas encore actif'
    : isActiveRecently(user.last_sign_in_at)
      ? 'Actif'
      : 'Inactif';
  const statusColor = user.invited_not_active ? '#D69614' : isActiveRecently(user.last_sign_in_at) ? '#2E9F58' : '#8a93a0';

  return (
    <>
      <tr style={{ borderBottom: '1px solid #eee' }}>
        <Td>{user.email}</Td>
        <Td><span style={{ color: statusColor, fontWeight: 600 }}>&#9679; {statusLabel}</span></Td>
        <Td>{relativeTime(user.last_sign_in_at)}</Td>
        <Td>
          <select value={user.role} onChange={(e) => onRoleChange(e.target.value)} disabled={saving} style={{ fontFamily: 'inherit' }}>
            <option value="admin">Admin</option>
            <option value="membre">Membre</option>
            <option value="suspendu">Suspendu</option>
          </select>
        </Td>
        <Td>
          <button onClick={onToggleExpand} style={{ ...btnStyle, marginRight: 6 }}>
            {expanded ? 'Fermer' : 'Droits par app'}
          </button>
          <button onClick={onDelete} style={{ ...btnStyle, background: '#C41230' }} disabled={saving}>Supprimer</button>
        </Td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={5} style={{ background: '#f7f8fa', padding: 16 }}>
            <PermissionsGrid user={user} apps={apps} features={features} onSave={onSavePermissions} saving={saving} />
          </td>
        </tr>
      )}
    </>
  );
}

function PermissionsGrid({ user, apps, features, onSave, saving }) {
  const [localApps, setLocalApps] = useState(new Set(user.apps));
  const [localFeatures, setLocalFeatures] = useState(new Set(user.features));

  function toggleApp(slug) {
    const next = new Set(localApps);
    if (next.has(slug)) next.delete(slug); else next.add(slug);
    setLocalApps(next);
  }

  function toggleFeature(slug, key) {
    const id = `${slug}:${key}`;
    const next = new Set(localFeatures);
    if (next.has(id)) next.delete(id); else next.add(id);
    setLocalFeatures(next);
  }

  function saveApp(slug) {
    const hasAccess = localApps.has(slug);
    const featureKeys = features
      .filter((f) => f.app_slug === slug && localFeatures.has(`${slug}:${f.feature_key}`))
      .map((f) => f.feature_key);
    onSave(slug, hasAccess, featureKeys);
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
      {apps.map((app) => {
        const appFeatures = features.filter((f) => f.app_slug === app.slug);
        return (
          <div key={app.slug} style={{ background: '#fff', border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, marginBottom: 8 }}>
              <input type="checkbox" checked={localApps.has(app.slug)} onChange={() => toggleApp(app.slug)} />
              {app.label}
            </label>
            {localApps.has(app.slug) && appFeatures.map((f) => (
              <label key={f.feature_key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 4, marginLeft: 8, color: '#444' }}>
                <input
                  type="checkbox"
                  checked={localFeatures.has(`${app.slug}:${f.feature_key}`)}
                  onChange={() => toggleFeature(app.slug, f.feature_key)}
                />
                {f.label}
              </label>
            ))}
            <button onClick={() => saveApp(app.slug)} disabled={saving} style={{ ...btnStyle, marginTop: 8, fontSize: 12 }}>
              Sauvegarder {app.label}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function Card({ children }) {
  return <div style={{ background: '#fff', borderRadius: 10, padding: 20, marginBottom: 20, boxShadow: '0 1px 4px rgba(0,0,0,.08)' }}>{children}</div>;
}
function Th({ children }) {
  return <th style={{ textAlign: 'left', padding: '8px 10px', color: '#666', fontWeight: 600, borderBottom: '1px solid #eee' }}>{children}</th>;
}
function Td({ children }) {
  return <td style={{ padding: '8px 10px', verticalAlign: 'middle' }}>{children}</td>;
}
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
      <div style={{ border: '3px solid #ddd', borderTopColor: '#14213D', borderRadius: '50%', width: 28, height: 28, animation: 'spin 0.8s linear infinite' }} />
      <style jsx>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}

const btnStyle = {
  fontFamily: 'inherit',
  background: '#14213D',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  padding: '6px 12px',
  cursor: 'pointer',
  fontSize: 13,
};

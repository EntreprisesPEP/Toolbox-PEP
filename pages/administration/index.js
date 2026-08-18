import { useState, useEffect } from 'react';
import Head from 'next/head';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const ORDRE_DU_JOUR_SLUG = 'ordre-du-jour';

// Libellés lisibles pour les rôles métier d'Ordre du jour — DOIVENT rester
// synchronisés avec ORDRE_DU_JOUR_ROLES dans pages/api/administration/users.js
const ROLE_LABELS = {
  president: 'Président',
  directeur: 'Directeur',
  charge_projet: 'Chargé de projet',
  coordonnateur: 'Coordonnateur',
  estimateur: 'Estimateur',
  surintendant: 'Surintendant',
  dispatch_camions: 'Dispatch camions',
  dispatch_machines: 'Dispatch machines',
  contremaitre: 'Contremaître',
  arpenteur: 'Arpenteur',
};
const ACCES_LABELS = {
  tout: 'Tout',
  camions: 'Camions seulement',
  machinerie: 'Machinerie seulement',
};

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
  const [ordreDuJourRoles, setOrdreDuJourRoles] = useState([]);
  const [ordreDuJourAcces, setOrdreDuJourAcces] = useState([]);
  const [profilsAttente, setProfilsAttente] = useState([]);
  const [planifProfilsAttente, setPlanifProfilsAttente] = useState([]);
  const [accesAttente, setAccesAttente] = useState([]);
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
    setOrdreDuJourRoles(data.ordre_du_jour_roles || []);
    setOrdreDuJourAcces(data.ordre_du_jour_acces || []);
    setProfilsAttente(data.ordre_du_jour_profils_attente || []);
    setPlanifProfilsAttente(data.planif_hebdo_profils_attente || []);
    setAccesAttente(data.acces_attente || []);
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
      const result = await callApi({ action: 'invite', email: inviteEmail.trim() });
      setInviteMsg(
        result.ordre_du_jour_linked
          ? `Invitation envoyee a ${inviteEmail.trim()} — profil Ordre du jour pre-configure applique automatiquement.`
          : `Invitation envoyee a ${inviteEmail.trim()}`
      );
      setInviteEmail('');
      await loadAll();
    } catch (e) {
      setInviteMsg(`Erreur: ${e.message}`);
    }
  }

  async function onSaveProfilAttente(email, nom, role, accesSpecial) {
    setSaving(true);
    try {
      await callApi({ action: 'upsert_profil_attente', email, nom, role, acces_special: accesSpecial });
      await loadAll();
    } catch (e) {
      alert(`Erreur: ${e.message}`); // eslint-disable-line no-alert
    }
    setSaving(false);
  }

  async function onDeleteProfilAttente(email) {
    if (!confirm(`Retirer la regle en attente pour ${email} ?`)) return; // eslint-disable-line no-alert
    setSaving(true);
    try {
      await callApi({ action: 'delete_profil_attente', email });
      await loadAll();
    } catch (e) {
      alert(`Erreur: ${e.message}`); // eslint-disable-line no-alert
    }
    setSaving(false);
  }

  async function onTogglePendingApp(email, appSlug, hasAccess) {
    setSaving(true);
    try {
      await callApi({ action: 'upsert_pending_access', email, app_slug: appSlug, has_app_access: hasAccess });
      await loadAll();
    } catch (e) {
      alert(`Erreur: ${e.message}`); // eslint-disable-line no-alert
    }
    setSaving(false);
  }

  async function onSavePlanifProfilAttente(email, nom) {
    setSaving(true);
    try {
      await callApi({ action: 'upsert_planif_profil_attente', email, nom });
      await loadAll();
    } catch (e) {
      alert(`Erreur: ${e.message}`); // eslint-disable-line no-alert
    }
    setSaving(false);
  }

  async function onDeletePlanifProfilAttente(email) {
    if (!confirm(`Retirer la regle en attente pour ${email} ?`)) return; // eslint-disable-line no-alert
    setSaving(true);
    try {
      await callApi({ action: 'delete_planif_profil_attente', email });
      await loadAll();
    } catch (e) {
      alert(`Erreur: ${e.message}`); // eslint-disable-line no-alert
    }
    setSaving(false);
  }

  async function onSaveAccesAttente(email, appSlug, hasAppAccess, featureKeys) {
    setSaving(true);
    try {
      await callApi({ action: 'upsert_pending_access', email, app_slug: appSlug, has_app_access: hasAppAccess, feature_keys: featureKeys });
      await loadAll();
    } catch (e) {
      alert(`Erreur: ${e.message}`); // eslint-disable-line no-alert
    }
    setSaving(false);
  }

  async function onDeleteAccesAttente(email, appSlug) {
    if (!confirm(`Retirer l'acces en attente pour ${email} (${appSlug}) ?`)) return; // eslint-disable-line no-alert
    setSaving(true);
    try {
      await callApi({ action: 'delete_pending_access', email, app_slug: appSlug });
      await loadAll();
    } catch (e) {
      alert(`Erreur: ${e.message}`); // eslint-disable-line no-alert
    }
    setSaving(false);
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

  async function onSaveOrdreDuJourProfil(user, nom, role, accesSpecial, peutPrevisualiser) {
    setSaving(true);
    try {
      await callApi({
        action: 'update_ordre_du_jour_profil',
        user_id: user.id,
        nom,
        role,
        acces_special: accesSpecial,
        peut_previsualiser: peutPrevisualiser,
      });
      await loadAll();
    } catch (e) {
      alert(`Erreur: ${e.message}`); // eslint-disable-line no-alert
    }
    setSaving(false);
  }

  async function onSavePlanifHebdoProfil(user, nom) {
    setSaving(true);
    try {
      await callApi({ action: 'update_planif_hebdo_profil', user_id: user.id, nom });
      await loadAll();
    } catch (e) {
      alert(`Erreur: ${e.message}`); // eslint-disable-line no-alert
    }
    setSaving(false);
  }

  async function onSaveNomComplet(user, nomComplet) {
    setSaving(true);
    try {
      await callApi({ action: 'update_nom_complet', user_id: user.id, nom_complet: nomComplet });
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
        <a href="/">Aller au Toolbox PEP</a>
      </Center>
    );
  }

  if (denied) {
    return (
      <Center>
        <h2>Acces refuse</h2>
        <p>Ce panneau est reserve aux administrateurs.</p>
        <a href="/">&#8592; Retour au Toolbox PEP</a>
      </Center>
    );
  }

  return (
    <div style={{ fontFamily: 'Calibri, Segoe UI, sans-serif', background: '#f2f2f2', minHeight: '100vh' }}>
      <Head><title>Administration - Toolbox PEP</title></Head>

      <header style={{ background: '#14213D', color: '#fff', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>Administration - Toolbox PEP</h1>
        <a href="/" style={{ color: '#fff', background: 'rgba(255,255,255,0.15)', padding: '8px 14px', borderRadius: 6, textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>&#8592; Retour au Toolbox PEP</a>
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
          <h2 style={{ color: '#C41230', fontSize: 16, marginTop: 0 }}>Profils Ordre du jour en attente ({profilsAttente.length})</h2>
          <p style={{ fontSize: 13, color: '#666', marginTop: -6 }}>
            Pre-configure le nom, le role et l&apos;acces pour une personne qui n&apos;a pas encore de compte.
            Des que tu envoies son invitation ci-dessus avec le meme courriel, la regle s&apos;applique automatiquement
            et disparait de cette liste.
          </p>
          <ProfilAttenteForm
            ordreDuJourRoles={ordreDuJourRoles}
            ordreDuJourAcces={ordreDuJourAcces}
            onSave={onSaveProfilAttente}
            saving={saving}
          />
          {profilsAttente.length > 0 && (
            <div style={{ marginTop: 12 }}>
              {profilsAttente.map((p) => (
                <PendingProfileCard
                  key={p.email}
                  profil={p}
                  apps={apps}
                  accesAttente={accesAttente}
                  ordreDuJourRoles={ordreDuJourRoles}
                  ordreDuJourAcces={ordreDuJourAcces}
                  onSaveProfil={onSaveProfilAttente}
                  onDelete={onDeleteProfilAttente}
                  onToggleApp={onTogglePendingApp}
                  saving={saving}
                />
              ))}
            </div>
          )}
        </Card>

        <Card>
          <h2 style={{ color: '#C41230', fontSize: 16, marginTop: 0 }}>Profils Planification hebdomadaire en attente ({planifProfilsAttente.length})</h2>
          <p style={{ fontSize: 13, color: '#666', marginTop: -6 }}>
            Pre-configure juste le nom affiché pour une personne qui n&apos;a pas encore de compte.
            Dès que tu envoies son invitation ci-dessus avec le même courriel, la règle s&apos;applique automatiquement
            (accès à l&apos;app inclus) et disparaît de cette liste.
          </p>
          <PlanifProfilAttenteForm onSave={onSavePlanifProfilAttente} saving={saving} />
          {planifProfilsAttente.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, marginTop: 12 }}>
              <thead>
                <tr>
                  <Th>Courriel</Th>
                  <Th>Nom</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {planifProfilsAttente.map((p) => (
                  <tr key={p.email} style={{ borderBottom: '1px solid #eee' }}>
                    <Td>{p.email}</Td>
                    <Td>{p.nom}</Td>
                    <Td>
                      <button onClick={() => onDeletePlanifProfilAttente(p.email)} style={{ ...btnStyle, background: '#C41230' }} disabled={saving}>
                        Retirer
                      </button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card>
          <h2 style={{ color: '#C41230', fontSize: 16, marginTop: 0 }}>Accès en attente — toutes les apps ({accesAttente.length})</h2>
          <p style={{ fontSize: 13, color: '#666', marginTop: -6 }}>
            Pré-configure l&apos;accès à n&apos;importe quelle app (et ses fonctionnalités) pour un courriel qui
            n&apos;a pas encore de compte. Dès que tu envoies son invitation ci-dessus avec le même courriel,
            les droits s&apos;appliquent automatiquement.
          </p>
          <AccesAttenteForm apps={apps} features={features} onSave={onSaveAccesAttente} saving={saving} />
          {accesAttente.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, marginTop: 12 }}>
              <thead>
                <tr>
                  <Th>Courriel</Th>
                  <Th>App</Th>
                  <Th>Accès app</Th>
                  <Th>Fonctionnalités</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {accesAttente.map((a) => {
                  const app = apps.find((x) => x.slug === a.app_slug);
                  const featureLabels = (a.feature_keys || [])
                    .map((k) => features.find((f) => f.app_slug === a.app_slug && f.feature_key === k)?.label || k)
                    .join(', ');
                  return (
                    <tr key={`${a.email}:${a.app_slug}`} style={{ borderBottom: '1px solid #eee' }}>
                      <Td>{a.email}</Td>
                      <Td>{app?.label || a.app_slug}</Td>
                      <Td>{a.has_app_access ? 'Oui' : 'Non'}</Td>
                      <Td>{featureLabels || '—'}</Td>
                      <Td>
                        <button onClick={() => onDeleteAccesAttente(a.email, a.app_slug)} style={{ ...btnStyle, background: '#C41230' }} disabled={saving}>
                          Retirer
                        </button>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>

        <Card>
          <h2 style={{ color: '#C41230', fontSize: 16, marginTop: 0 }}>Membres ({users.length})</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr>
                <Th>Courriel</Th>
                <Th>Nom complet</Th>
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
                  ordreDuJourRoles={ordreDuJourRoles}
                  ordreDuJourAcces={ordreDuJourAcces}
                  expanded={expandedUser === u.id}
                  onToggleExpand={() => setExpandedUser(expandedUser === u.id ? null : u.id)}
                  onRoleChange={(role) => onRoleChange(u, role)}
                  onDelete={() => onDeleteUser(u)}
                  onSavePermissions={(appSlug, hasAppAccess, featureKeys) => onSavePermissions(u, appSlug, hasAppAccess, featureKeys)}
                  onSaveOrdreDuJourProfil={(nom, role, accesSpecial, peutPrevisualiser) => onSaveOrdreDuJourProfil(u, nom, role, accesSpecial, peutPrevisualiser)}
                  onSavePlanifHebdoProfil={(nom) => onSavePlanifHebdoProfil(u, nom)}
                  onSaveNomComplet={(nomComplet) => onSaveNomComplet(u, nomComplet)}

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

function NomCompletCell({ user, onSave, saving }) {
  const [valeur, setValeur] = useState(user.nom_complet || user.ordre_du_jour_profil?.nom || '');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    setValeur(user.nom_complet || user.ordre_du_jour_profil?.nom || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, user.nom_complet, user.ordre_du_jour_profil?.nom]);

  async function save() {
    if (!valeur.trim()) return;
    await onSave(valeur.trim());
    setMsg('✓');
    setTimeout(() => setMsg(''), 1500);
  }

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <input
        type="text"
        value={valeur}
        onChange={(e) => setValeur(e.target.value)}
        placeholder="Nom complet"
        style={{ padding: '4px 6px', borderRadius: 4, border: '1px solid #ccc', fontFamily: 'inherit', fontSize: 13, width: 150 }}
      />
      <button onClick={save} disabled={saving} style={{ ...btnStyle, fontSize: 11, padding: '4px 8px' }}>OK</button>
      {msg && <span style={{ color: '#2E9F58', fontSize: 12 }}>{msg}</span>}
    </div>
  );
}

function PendingProfileCard({ profil, apps, accesAttente, ordreDuJourRoles, ordreDuJourAcces, onSaveProfil, onDelete, onToggleApp, saving }) {
  const [nom, setNom] = useState(profil.nom);
  const [role, setRole] = useState(profil.role);
  const [accesSpecial, setAccesSpecial] = useState(profil.acces_special);
  const [msg, setMsg] = useState('');
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setNom(profil.nom);
    setRole(profil.role);
    setAccesSpecial(profil.acces_special);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profil.email, profil.nom, profil.role, profil.acces_special]);

  const accesParApp = new Set(
    accesAttente.filter((a) => a.email === profil.email && a.has_app_access).map((a) => a.app_slug)
  );

  async function saveProfil() {
    if (!nom.trim()) { setMsg('Le nom est requis.'); return; }
    setMsg('Enregistrement...');
    await onSaveProfil(profil.email, nom, role, accesSpecial);
    setMsg('Enregistre ✓');
    setTimeout(() => setMsg(''), 2000);
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #ddd', borderRadius: 8, padding: 14, marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <strong>{profil.email}</strong>
        <div>
          <button onClick={() => setExpanded(!expanded)} style={{ ...btnStyle, marginRight: 6 }}>
            {expanded ? 'Fermer' : 'Droits par app'}
          </button>
          <button onClick={() => onDelete(profil.email)} style={{ ...btnStyle, background: '#C41230' }} disabled={saving}>Retirer</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, alignItems: 'end' }}>
        <div>
          <label style={{ display: 'block', fontSize: 11, color: '#666' }}>Nom</label>
          <input type="text" value={nom} onChange={(e) => setNom(e.target.value)} style={{ width: '100%', padding: '5px 8px', borderRadius: 4, border: '1px solid #ccc', fontFamily: 'inherit', fontSize: 13, boxSizing: 'border-box' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, color: '#666' }}>Role Ordre du jour</label>
          <select value={role} onChange={(e) => setRole(e.target.value)} style={{ width: '100%', padding: '5px 8px', borderRadius: 4, border: '1px solid #ccc', fontFamily: 'inherit', fontSize: 13 }}>
            {ordreDuJourRoles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, color: '#666' }}>Acces special</label>
          <select value={accesSpecial} onChange={(e) => setAccesSpecial(e.target.value)} style={{ width: '100%', padding: '5px 8px', borderRadius: 4, border: '1px solid #ccc', fontFamily: 'inherit', fontSize: 13 }}>
            {ordreDuJourAcces.map((a) => <option key={a} value={a}>{ACCES_LABELS[a] || a}</option>)}
          </select>
        </div>
        <div>
          <button onClick={saveProfil} disabled={saving} style={{ ...btnStyle, fontSize: 12 }}>Enregistrer</button>
          {msg && <span style={{ marginLeft: 8, fontSize: 12, color: '#2E9F58' }}>{msg}</span>}
        </div>
      </div>

      {expanded && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, marginTop: 12, paddingTop: 12, borderTop: '1px solid #eee' }}>
          {apps.map((app) => (
            <label key={app.slug} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, background: '#f7f8fa', border: '1px solid #e2e4e8', borderRadius: 6, padding: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={accesParApp.has(app.slug)}
                onChange={(e) => onToggleApp(profil.email, app.slug, e.target.checked)}
                disabled={saving}
              />
              {app.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function UserRow({
  user, apps, features, ordreDuJourRoles, ordreDuJourAcces,
  expanded, onToggleExpand, onRoleChange, onDelete, onSavePermissions, onSaveOrdreDuJourProfil, onSavePlanifHebdoProfil, onSaveNomComplet, saving,
}) {
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
        <Td><NomCompletCell user={user} onSave={onSaveNomComplet} saving={saving} /></Td>
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
          <td colSpan={6} style={{ background: '#f7f8fa', padding: 16 }}>
            <PermissionsGrid
              user={user}
              apps={apps}
              features={features}
              ordreDuJourRoles={ordreDuJourRoles}
              ordreDuJourAcces={ordreDuJourAcces}
              onSave={onSavePermissions}
              onSaveOrdreDuJourProfil={onSaveOrdreDuJourProfil}
              onSavePlanifHebdoProfil={onSavePlanifHebdoProfil}
              saving={saving}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function PermissionsGrid({ user, apps, features, ordreDuJourRoles, ordreDuJourAcces, onSave, onSaveOrdreDuJourProfil, onSavePlanifHebdoProfil, saving }) {
  const [localApps, setLocalApps] = useState(new Set(user.apps));
  const [localFeatures, setLocalFeatures] = useState(new Set(user.features));

  // NOUVEAU — champs du profil metier Ordre du jour
  const [odjNom, setOdjNom] = useState(user.ordre_du_jour_profil?.nom || user.email?.split('@')[0] || '');
  const [odjRole, setOdjRole] = useState(user.ordre_du_jour_profil?.role || 'contremaitre');
  const [odjAcces, setOdjAcces] = useState(user.ordre_du_jour_profil?.acces_special || 'tout');
  const [odjPreview, setOdjPreview] = useState(!!user.ordre_du_jour_profil?.peut_previsualiser);
  const [odjMsg, setOdjMsg] = useState('');

  // Filet de sécurité : si le profil réel arrive/change après le premier
  // rendu (ex: React réutilise ce composant sans le remonter), on
  // resynchronise les champs plutôt que de laisser une valeur par défaut
  // (comme le préfixe du courriel) risquer d'écraser le vrai nom au
  // prochain "Enregistrer". Ne s'exécute que quand un profil existe déjà.
  useEffect(() => {
    if (user.ordre_du_jour_profil) {
      setOdjNom(user.ordre_du_jour_profil.nom);
      setOdjRole(user.ordre_du_jour_profil.role);
      setOdjAcces(user.ordre_du_jour_profil.acces_special);
      setOdjPreview(!!user.ordre_du_jour_profil.peut_previsualiser);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, user.ordre_du_jour_profil?.nom, user.ordre_du_jour_profil?.role, user.ordre_du_jour_profil?.acces_special, user.ordre_du_jour_profil?.peut_previsualiser]);

  // NOUVEAU — champ du profil Planification hebdomadaire (juste le nom)
  const [planifNom, setPlanifNom] = useState(user.planif_hebdo_profil?.nom || user.email?.split('@')[0] || '');
  const [planifMsg, setPlanifMsg] = useState('');

  useEffect(() => {
    if (user.planif_hebdo_profil) {
      setPlanifNom(user.planif_hebdo_profil.nom);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, user.planif_hebdo_profil?.nom]);

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

  async function saveOdjProfil() {
    if (!odjNom.trim()) {
      setOdjMsg('Le nom est requis.');
      return;
    }
    setOdjMsg('Enregistrement...');
    await onSaveOrdreDuJourProfil(odjNom, odjRole, odjAcces, odjPreview);
    setOdjMsg('Enregistre ✓');
    setTimeout(() => setOdjMsg(''), 2000);
  }

  async function savePlanifProfil() {
    if (!planifNom.trim()) {
      setPlanifMsg('Le nom est requis.');
      return;
    }
    setPlanifMsg('Enregistrement...');
    await onSavePlanifHebdoProfil(planifNom);
    setPlanifMsg('Enregistre ✓');
    setTimeout(() => setPlanifMsg(''), 2000);
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
      {apps.map((app) => {
        const appFeatures = features.filter((f) => f.app_slug === app.slug);
        const isOrdreDuJour = app.slug === 'ordre-du-jour';
        const isPlanifHebdo = app.slug === 'planification-hebdomadaire';
        return (
          <div key={app.slug} style={{ background: '#fff', border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, marginBottom: 8 }}>
              <input type="checkbox" checked={localApps.has(app.slug)} onChange={() => toggleApp(app.slug)} />
              {app.label}
            </label>

            {/* Bloc specifique Ordre du jour: nom affiche + role metier + acces special.
                Visible uniquement quand la case de l'app est cochee — le profil
                metier n'a de sens que si la personne a acces a l'app. */}
            {isOrdreDuJour && localApps.has(app.slug) && (
              <div style={{ background: '#f7f8fa', border: '1px solid #e2e4e8', borderRadius: 6, padding: 10, marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em', color: '#495260', marginBottom: 8 }}>
                  Profil Ordre du jour
                </div>
                <label style={{ display: 'block', fontSize: 12, color: '#444', marginBottom: 3 }}>Nom affiche</label>
                <input
                  type="text"
                  value={odjNom}
                  onChange={(e) => setOdjNom(e.target.value)}
                  placeholder="Ex: William Dubreuil"
                  style={{ width: '100%', padding: '5px 8px', borderRadius: 4, border: '1px solid #ccc', fontFamily: 'inherit', fontSize: 13, marginBottom: 8 }}
                />
                <label style={{ display: 'block', fontSize: 12, color: '#444', marginBottom: 3 }}>Role metier</label>
                <select
                  value={odjRole}
                  onChange={(e) => setOdjRole(e.target.value)}
                  style={{ width: '100%', padding: '5px 8px', borderRadius: 4, border: '1px solid #ccc', fontFamily: 'inherit', fontSize: 13, marginBottom: 8 }}
                >
                  {ordreDuJourRoles.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>
                  ))}
                </select>
                <label style={{ display: 'block', fontSize: 12, color: '#444', marginBottom: 3 }}>Acces special</label>
                <select
                  value={odjAcces}
                  onChange={(e) => setOdjAcces(e.target.value)}
                  style={{ width: '100%', padding: '5px 8px', borderRadius: 4, border: '1px solid #ccc', fontFamily: 'inherit', fontSize: 13, marginBottom: 8 }}
                >
                  {ordreDuJourAcces.map((a) => (
                    <option key={a} value={a}>{ACCES_LABELS[a] || a}</option>
                  ))}
                </select>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#444', marginBottom: 8 }}>
                  <input type="checkbox" checked={odjPreview} onChange={(e) => setOdjPreview(e.target.checked)} />
                  Peut prévisualiser tous les rôles (mode test — usage interne seulement)
                </label>
                <button onClick={saveOdjProfil} disabled={saving} style={{ ...btnStyle, fontSize: 12 }}>
                  Enregistrer le profil
                </button>
                {odjMsg && <span style={{ marginLeft: 8, fontSize: 12, color: '#2E9F58' }}>{odjMsg}</span>}
                {user.ordre_du_jour_profil && (
                  <div style={{ fontSize: 11, color: '#8a93a0', marginTop: 6 }}>
                    Actuellement : {user.ordre_du_jour_profil.nom} &middot; {ROLE_LABELS[user.ordre_du_jour_profil.role]} &middot; {ACCES_LABELS[user.ordre_du_jour_profil.acces_special]}
                  </div>
                )}
                {!user.ordre_du_jour_profil && (
                  <div style={{ fontSize: 11, color: '#D69614', marginTop: 6 }}>
                    Aucun profil enregistre encore — cette personne ne pourra pas se connecter a Ordre du jour tant que ce n&apos;est pas sauvegarde.
                  </div>
                )}
              </div>
            )}

            {/* Bloc specifique Planification hebdomadaire: juste le nom affiche —
                pas de role/acces special (tout le monde a les memes droits une
                fois connecte; le mode edition reste gere par le mot de passe
                "animateur" separe, inchange). */}
            {isPlanifHebdo && localApps.has(app.slug) && (
              <div style={{ background: '#f7f8fa', border: '1px solid #e2e4e8', borderRadius: 6, padding: 10, marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em', color: '#495260', marginBottom: 8 }}>
                  Profil Planification hebdomadaire
                </div>
                <label style={{ display: 'block', fontSize: 12, color: '#444', marginBottom: 3 }}>Nom affiche</label>
                <input
                  type="text"
                  value={planifNom}
                  onChange={(e) => setPlanifNom(e.target.value)}
                  placeholder="Ex: William Dubreuil"
                  style={{ width: '100%', padding: '5px 8px', borderRadius: 4, border: '1px solid #ccc', fontFamily: 'inherit', fontSize: 13, marginBottom: 8 }}
                />
                <button onClick={savePlanifProfil} disabled={saving} style={{ ...btnStyle, fontSize: 12 }}>
                  Enregistrer le profil
                </button>
                {planifMsg && <span style={{ marginLeft: 8, fontSize: 12, color: '#2E9F58' }}>{planifMsg}</span>}
                {user.planif_hebdo_profil && (
                  <div style={{ fontSize: 11, color: '#8a93a0', marginTop: 6 }}>
                    Actuellement : {user.planif_hebdo_profil.nom}
                  </div>
                )}
                {!user.planif_hebdo_profil && (
                  <div style={{ fontSize: 11, color: '#D69614', marginTop: 6 }}>
                    Aucun profil enregistre encore — cette personne ne pourra pas se connecter a Planification hebdomadaire tant que ce n&apos;est pas sauvegarde.
                  </div>
                )}
              </div>
            )}

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

function ProfilAttenteForm({ ordreDuJourRoles, ordreDuJourAcces, onSave, saving }) {
  const [email, setEmail] = useState('');
  const [nom, setNom] = useState('');
  const [role, setRole] = useState('contremaitre');
  const [acces, setAcces] = useState('tout');
  const [msg, setMsg] = useState('');

  async function submit() {
    if (!email.trim() || !nom.trim()) {
      setMsg('Courriel et nom requis.');
      return;
    }
    await onSave(email.trim(), nom.trim(), role, acces);
    setEmail(''); setNom('');
    setMsg('Ajoute ✓');
    setTimeout(() => setMsg(''), 2000);
  }

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', background: '#f7f8fa', border: '1px solid #e2e4e8', borderRadius: 6, padding: 10 }}>
      <input
        type="email"
        placeholder="courriel@pep2000.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ padding: '6px 8px', borderRadius: 4, border: '1px solid #ccc', fontFamily: 'inherit', fontSize: 13, width: 200 }}
      />
      <input
        type="text"
        placeholder="Nom affiche"
        value={nom}
        onChange={(e) => setNom(e.target.value)}
        style={{ padding: '6px 8px', borderRadius: 4, border: '1px solid #ccc', fontFamily: 'inherit', fontSize: 13, width: 170 }}
      />
      <select value={role} onChange={(e) => setRole(e.target.value)} style={{ padding: '6px 8px', borderRadius: 4, border: '1px solid #ccc', fontFamily: 'inherit', fontSize: 13 }}>
        {ordreDuJourRoles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>)}
      </select>
      <select value={acces} onChange={(e) => setAcces(e.target.value)} style={{ padding: '6px 8px', borderRadius: 4, border: '1px solid #ccc', fontFamily: 'inherit', fontSize: 13 }}>
        {ordreDuJourAcces.map((a) => <option key={a} value={a}>{ACCES_LABELS[a] || a}</option>)}
      </select>
      <button onClick={submit} disabled={saving} style={{ ...btnStyle, fontSize: 12 }}>+ Ajouter</button>
      {msg && <span style={{ fontSize: 12, color: '#2E9F58' }}>{msg}</span>}
    </div>
  );
}

function PlanifProfilAttenteForm({ onSave, saving }) {
  const [email, setEmail] = useState('');
  const [nom, setNom] = useState('');
  const [msg, setMsg] = useState('');

  async function submit() {
    if (!email.trim() || !nom.trim()) {
      setMsg('Courriel et nom requis.');
      return;
    }
    await onSave(email.trim(), nom.trim());
    setEmail(''); setNom('');
    setMsg('Ajoute ✓');
    setTimeout(() => setMsg(''), 2000);
  }

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', background: '#f7f8fa', border: '1px solid #e2e4e8', borderRadius: 6, padding: 10 }}>
      <input
        type="email"
        placeholder="courriel@pep2000.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ padding: '6px 8px', borderRadius: 4, border: '1px solid #ccc', fontFamily: 'inherit', fontSize: 13, width: 200 }}
      />
      <input
        type="text"
        placeholder="Nom affiche"
        value={nom}
        onChange={(e) => setNom(e.target.value)}
        style={{ padding: '6px 8px', borderRadius: 4, border: '1px solid #ccc', fontFamily: 'inherit', fontSize: 13, width: 170 }}
      />
      <button onClick={submit} disabled={saving} style={{ ...btnStyle, fontSize: 12 }}>+ Ajouter</button>
      {msg && <span style={{ fontSize: 12, color: '#2E9F58' }}>{msg}</span>}
    </div>
  );
}

function AccesAttenteForm({ apps, features, onSave, saving }) {
  const [email, setEmail] = useState('');
  const [appSlug, setAppSlug] = useState('');
  const [hasAppAccess, setHasAppAccess] = useState(true);
  const [featureKeys, setFeatureKeys] = useState(new Set());
  const [msg, setMsg] = useState('');

  const appFeatures = features.filter((f) => f.app_slug === appSlug);

  function toggleFeature(key) {
    const next = new Set(featureKeys);
    if (next.has(key)) next.delete(key); else next.add(key);
    setFeatureKeys(next);
  }

  async function submit() {
    if (!email.trim() || !appSlug) {
      setMsg('Courriel et app requis.');
      return;
    }
    await onSave(email.trim(), appSlug, hasAppAccess, [...featureKeys]);
    setEmail(''); setFeatureKeys(new Set());
    setMsg('Ajouté ✓');
    setTimeout(() => setMsg(''), 2000);
  }

  return (
    <div style={{ background: '#f7f8fa', border: '1px solid #e2e4e8', borderRadius: 6, padding: 10 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: appSlug ? 8 : 0 }}>
        <input
          type="email"
          placeholder="courriel@pep2000.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ padding: '6px 8px', borderRadius: 4, border: '1px solid #ccc', fontFamily: 'inherit', fontSize: 13, width: 200 }}
        />
        <select
          value={appSlug}
          onChange={(e) => { setAppSlug(e.target.value); setFeatureKeys(new Set()); }}
          style={{ padding: '6px 8px', borderRadius: 4, border: '1px solid #ccc', fontFamily: 'inherit', fontSize: 13 }}
        >
          <option value="">— Choisir une app —</option>
          {apps.map((a) => <option key={a.slug} value={a.slug}>{a.label}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5 }}>
          <input type="checkbox" checked={hasAppAccess} onChange={(e) => setHasAppAccess(e.target.checked)} />
          Accès à l&apos;app
        </label>
        <button onClick={submit} disabled={saving} style={{ ...btnStyle, fontSize: 12 }}>+ Ajouter</button>
        {msg && <span style={{ fontSize: 12, color: '#2E9F58' }}>{msg}</span>}
      </div>
      {appSlug && appFeatures.length > 0 && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {appFeatures.map((f) => (
            <label key={f.feature_key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: '#444' }}>
              <input type="checkbox" checked={featureKeys.has(f.feature_key)} onChange={() => toggleFeature(f.feature_key)} />
              {f.label}
            </label>
          ))}
        </div>
      )}
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

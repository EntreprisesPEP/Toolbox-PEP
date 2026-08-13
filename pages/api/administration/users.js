import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Methode non supportee' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Non autorise' });
  }

  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Configuration Supabase manquante sur le serveur.' });
  }

  const supabaseAuth = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await supabaseAuth.auth.getUser();
  if (userErr || !userData?.user) {
    return res.status(401).json({ error: 'Non autorise' });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: roleRow } = await admin
    .from('pep_user_roles')
    .select('role')
    .eq('user_id', userData.user.id)
    .single();

  if (!roleRow || roleRow.role !== 'admin') {
    return res.status(403).json({ error: 'Reserve aux administrateurs' });
  }

  const { action } = req.body || {};

  try {
    if (action === 'list') {
      const { data: authData, error: authErr } = await admin.auth.admin.listUsers();
      if (authErr) throw authErr;

      const { data: roles } = await admin.from('pep_user_roles').select('*');
      const { data: userApps } = await admin.from('pep_user_apps').select('*');
      const { data: userFeatures } = await admin.from('pep_user_features').select('*');

      const roleMap = Object.fromEntries((roles || []).map((r) => [r.user_id, r.role]));

      const appsMap = {};
      for (const row of userApps || []) {
        if (!appsMap[row.user_id]) appsMap[row.user_id] = [];
        appsMap[row.user_id].push(row.app_slug);
      }

      const featuresMap = {};
      for (const row of userFeatures || []) {
        if (!featuresMap[row.user_id]) featuresMap[row.user_id] = [];
        featuresMap[row.user_id].push(`${row.app_slug}:${row.feature_key}`);
      }

      const users = authData.users.map((u) => ({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        invited_not_active: !u.last_sign_in_at,
        role: roleMap[u.id] || 'membre',
        apps: appsMap[u.id] || [],
        features: featuresMap[u.id] || [],
      }));

      const { data: apps } = await admin.from('pep_apps').select('*').order('sort_order');
      const { data: features } = await admin.from('pep_features').select('*').order('sort_order');

      return res.status(200).json({ users, apps, features });
    }

    if (action === 'invite') {
      const { email } = req.body;
      if (!email) throw new Error('Courriel requis');

      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo: 'https://www.toolbox-pep.com/',
      });
      if (error) throw error;

      return res.status(200).json({ success: true, user_id: data.user.id });
    }

    if (action === 'update_role') {
      const { user_id, role } = req.body;
      if (!user_id || !role) throw new Error('user_id et role requis');

      const { data: targetUser } = await admin.auth.admin.getUserById(user_id);

      const { error } = await admin.from('pep_user_roles').upsert({
        user_id,
        email: targetUser?.user?.email || '',
        role,
        updated_by: userData.user.id,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;

      return res.status(200).json({ success: true });
    }

    if (action === 'update_permissions') {
      // body: { user_id, app_slug, has_app_access: bool, feature_keys: string[] }
      const { user_id, app_slug, has_app_access, feature_keys } = req.body;
      if (!user_id || !app_slug) throw new Error('user_id et app_slug requis');

      if (has_app_access) {
        await admin.from('pep_user_apps').upsert({
          user_id, app_slug, granted_by: userData.user.id,
        });
      } else {
        await admin.from('pep_user_apps').delete().eq('user_id', user_id).eq('app_slug', app_slug);
      }

      // Remplace toutes les fonctionnalites accordees pour cette app par la nouvelle liste
      await admin.from('pep_user_features').delete().eq('user_id', user_id).eq('app_slug', app_slug);
      if (Array.isArray(feature_keys) && feature_keys.length > 0) {
        const rows = feature_keys.map((feature_key) => ({
          user_id, app_slug, feature_key, granted_by: userData.user.id,
        }));
        const { error } = await admin.from('pep_user_features').insert(rows);
        if (error) throw error;
      }

      return res.status(200).json({ success: true });
    }

    if (action === 'delete_user') {
      const { user_id } = req.body;
      if (!user_id) throw new Error('user_id requis');

      const { error } = await admin.auth.admin.deleteUser(user_id);
      if (error) throw error;

      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'Action inconnue' });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}

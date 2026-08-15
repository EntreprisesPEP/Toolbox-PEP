import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Rôles métier valides pour Ordre du jour — DOIVENT rester synchronisés avec
// la contrainte CHECK sur ordre_du_jour.profils.role (voir phase3-migration.sql)
// et avec la logique de components/ordre-du-jour/App.jsx.
const ORDRE_DU_JOUR_ROLES = [
  'president', 'directeur', 'charge_projet', 'coordonnateur', 'estimateur',
  'surintendant', 'dispatch_camions', 'dispatch_machines', 'contremaitre',
];
const ORDRE_DU_JOUR_ACCES = ['tout', 'camions', 'machinerie'];
const ORDRE_DU_JOUR_SLUG = 'ordre-du-jour';
const PLANIF_HEBDO_SLUG = 'planification-hebdomadaire';

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

      // NOUVEAU — profils métier Ordre du jour (nom, role, acces_special)
      const { data: ordreDuJourProfils, error: odjErr } = await admin
        .schema('ordre_du_jour')
        .from('profils')
        .select('*');
      if (odjErr) throw odjErr;

      // NOUVEAU — profils Planification hebdomadaire (juste le nom, pas de role)
      const { data: planifProfils, error: planifErr } = await admin
        .schema('planif_hebdo')
        .from('profils')
        .select('*');
      if (planifErr) throw planifErr;

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

      const ordreDuJourMap = Object.fromEntries(
        (ordreDuJourProfils || []).map((p) => [p.user_id, {
          nom: p.nom, role: p.role, acces_special: p.acces_special,
          peut_previsualiser: !!p.peut_previsualiser,
        }])
      );

      const planifMap = Object.fromEntries(
        (planifProfils || []).map((p) => [p.user_id, { nom: p.nom }])
      );

      // NOUVEAU — profils en attente (pas encore de compte, references par courriel)
      const { data: profilsAttente, error: attenteErr } = await admin
        .schema('ordre_du_jour')
        .from('profils_attente')
        .select('*')
        .order('created_at');
      if (attenteErr) throw attenteErr;

      // NOUVEAU — profils Planification hebdomadaire en attente
      const { data: planifProfilsAttente, error: planifAttenteErr } = await admin
        .schema('planif_hebdo')
        .from('profils_attente')
        .select('*')
        .order('created_at');
      if (planifAttenteErr) throw planifAttenteErr;

      // NOUVEAU — acces en attente GENERIQUES (toutes apps), references par courriel
      const { data: accesAttente, error: accesAttenteErr } = await admin
        .from('pep_pending_access')
        .select('*')
        .order('created_at');
      if (accesAttenteErr) throw accesAttenteErr;

      const users = authData.users.map((u) => ({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        invited_not_active: !u.last_sign_in_at,
        role: roleMap[u.id] || 'membre',
        apps: appsMap[u.id] || [],
        features: featuresMap[u.id] || [],
        ordre_du_jour_profil: ordreDuJourMap[u.id] || null,
        planif_hebdo_profil: planifMap[u.id] || null,
      }));

      const { data: apps } = await admin.from('pep_apps').select('*').order('sort_order');
      const { data: features } = await admin.from('pep_features').select('*').order('sort_order');

      return res.status(200).json({
        users,
        apps,
        features,
        ordre_du_jour_roles: ORDRE_DU_JOUR_ROLES,
        ordre_du_jour_acces: ORDRE_DU_JOUR_ACCES,
        ordre_du_jour_profils_attente: profilsAttente || [],
        planif_hebdo_profils_attente: planifProfilsAttente || [],
        acces_attente: accesAttente || [],
      });
    }

    if (action === 'invite') {
      const { email } = req.body;
      if (!email) throw new Error('Courriel requis');
      const emailNorm = email.trim().toLowerCase();

      const { data, error } = await admin.auth.admin.inviteUserByEmail(emailNorm, {
        redirectTo: 'https://www.toolbox-pep.com/',
      });
      if (error) throw error;

      const newUserId = data.user.id;
      let ordreDuJourLinked = false;

      // Si un profil Ordre du jour etait pre-configure pour ce courriel,
      // on le "consomme" tout de suite: copie dans profils (avec le vrai
      // user_id qui vient d'etre cree), acces a l'app accorde, ligne
      // en attente supprimee.
      const { data: attenteRow } = await admin
        .schema('ordre_du_jour')
        .from('profils_attente')
        .select('*')
        .eq('email', emailNorm)
        .maybeSingle();

      if (attenteRow) {
        await admin.schema('ordre_du_jour').from('profils').upsert({
          user_id: newUserId,
          nom: attenteRow.nom,
          role: attenteRow.role,
          acces_special: attenteRow.acces_special,
          email: emailNorm,
          updated_at: new Date().toISOString(),
        });
        await admin.from('pep_user_apps').upsert({
          user_id: newUserId, app_slug: ORDRE_DU_JOUR_SLUG, granted_by: userData.user.id,
        });
        await admin.schema('ordre_du_jour').from('profils_attente').delete().eq('email', emailNorm);
        ordreDuJourLinked = true;
      }

      // NOUVEAU — meme principe pour Planification hebdomadaire (juste le nom,
      // pas de role/acces special).
      let planifLinked = false;
      const { data: planifAttenteRow } = await admin
        .schema('planif_hebdo')
        .from('profils_attente')
        .select('*')
        .eq('email', emailNorm)
        .maybeSingle();

      if (planifAttenteRow) {
        await admin.schema('planif_hebdo').from('profils').upsert({
          user_id: newUserId,
          nom: planifAttenteRow.nom,
          updated_at: new Date().toISOString(),
        });
        await admin.from('pep_user_apps').upsert({
          user_id: newUserId, app_slug: PLANIF_HEBDO_SLUG, granted_by: userData.user.id,
        });
        await admin.schema('planif_hebdo').from('profils_attente').delete().eq('email', emailNorm);
        planifLinked = true;
      }

      // NOUVEAU — consomme aussi tout acces en attente GENERIQUE (n'importe
      // quelle app) configure pour ce courriel avant que le compte existe.
      const { data: accesAttenteRows } = await admin
        .from('pep_pending_access')
        .select('*')
        .eq('email', emailNorm);

      let accesGeneriquesLies = 0;
      for (const row of accesAttenteRows || []) {
        if (row.has_app_access) {
          await admin.from('pep_user_apps').upsert({
            user_id: newUserId, app_slug: row.app_slug, granted_by: userData.user.id,
          });
        }
        if (Array.isArray(row.feature_keys) && row.feature_keys.length > 0) {
          const rows = row.feature_keys.map((feature_key) => ({
            user_id: newUserId, app_slug: row.app_slug, feature_key, granted_by: userData.user.id,
          }));
          await admin.from('pep_user_features').insert(rows);
        }
        accesGeneriquesLies++;
      }
      if (accesGeneriquesLies > 0) {
        await admin.from('pep_pending_access').delete().eq('email', emailNorm);
      }

      return res.status(200).json({
        success: true,
        user_id: newUserId,
        ordre_du_jour_linked: ordreDuJourLinked,
        planif_hebdo_linked: planifLinked,
        acces_generiques_lies: accesGeneriquesLies,
      });
    }

    // NOUVEAU — creer/mettre a jour une regle en attente (courriel -> nom/role/acces)
    // pour une personne qui n'a pas encore de compte.
    if (action === 'upsert_profil_attente') {
      const { email, nom, role, acces_special } = req.body;
      if (!email || !nom || !role) throw new Error('email, nom et role requis');
      if (!ORDRE_DU_JOUR_ROLES.includes(role)) throw new Error('Role Ordre du jour invalide');
      const accesFinal = ORDRE_DU_JOUR_ACCES.includes(acces_special) ? acces_special : 'tout';

      const { error } = await admin.schema('ordre_du_jour').from('profils_attente').upsert({
        email: email.trim().toLowerCase(),
        nom: nom.trim(),
        role,
        acces_special: accesFinal,
      });
      if (error) throw error;

      return res.status(200).json({ success: true });
    }

    if (action === 'delete_profil_attente') {
      const { email } = req.body;
      if (!email) throw new Error('email requis');

      const { error } = await admin.schema('ordre_du_jour').from('profils_attente').delete().eq('email', email.trim().toLowerCase());
      if (error) throw error;

      return res.status(200).json({ success: true });
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

        // Si on retire l'acces a Ordre du jour, on retire aussi son profil metier
        // (nom/role/acces_special) — evite des profils orphelins qui trainent.
        if (app_slug === ORDRE_DU_JOUR_SLUG) {
          await admin.schema('ordre_du_jour').from('profils').delete().eq('user_id', user_id);
        }
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

    // NOUVEAU — creer/mettre a jour le profil metier Ordre du jour
    // (nom affiche, role metier, acces special). Appele depuis le bloc
    // dedie qui apparait dans PermissionsGrid quand "Ordre du jour" est coche.
    if (action === 'update_ordre_du_jour_profil') {
      const { user_id, nom, role, acces_special, peut_previsualiser } = req.body;
      if (!user_id || !nom || !role) throw new Error('user_id, nom et role requis');
      if (!ORDRE_DU_JOUR_ROLES.includes(role)) throw new Error('Role Ordre du jour invalide');
      const accesFinal = ORDRE_DU_JOUR_ACCES.includes(acces_special) ? acces_special : 'tout';

      // S'assure que l'utilisateur a bien acces a l'app (garde-fou —
      // le profil metier n'a de sens que si l'app est cochee).
      await admin.from('pep_user_apps').upsert({
        user_id, app_slug: ORDRE_DU_JOUR_SLUG, granted_by: userData.user.id,
      });

      // Recupere le courriel du compte cible — necessaire pour que
      // send-notification.js puisse envoyer des courriels sans avoir
      // besoin de la cle service_role (voir ordre_du_jour.profils.email).
      const { data: targetUserOdj } = await admin.auth.admin.getUserById(user_id);

      const { error } = await admin.schema('ordre_du_jour').from('profils').upsert({
        user_id,
        nom: nom.trim(),
        role,
        acces_special: accesFinal,
        peut_previsualiser: !!peut_previsualiser,
        email: targetUserOdj?.user?.email || null,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;

      return res.status(200).json({ success: true });
    }

    // NOUVEAU — profil Planification hebdomadaire (juste le nom, pas de role).
    if (action === 'update_planif_hebdo_profil') {
      const { user_id, nom } = req.body;
      if (!user_id || !nom) throw new Error('user_id et nom requis');

      await admin.from('pep_user_apps').upsert({
        user_id, app_slug: PLANIF_HEBDO_SLUG, granted_by: userData.user.id,
      });

      const { error: erreurPlanif } = await admin.schema('planif_hebdo').from('profils').upsert({
        user_id,
        nom: nom.trim(),
        updated_at: new Date().toISOString(),
      });
      if (erreurPlanif) throw erreurPlanif;

      return res.status(200).json({ success: true });
    }

    // NOUVEAU — creer/mettre a jour une regle en attente (courriel -> nom)
    // pour Planification hebdomadaire, pour une personne sans compte encore.
    if (action === 'upsert_planif_profil_attente') {
      const { email, nom } = req.body;
      if (!email || !nom) throw new Error('email et nom requis');

      const { error: erreurPlanifAttente } = await admin.schema('planif_hebdo').from('profils_attente').upsert({
        email: email.trim().toLowerCase(),
        nom: nom.trim(),
      });
      if (erreurPlanifAttente) throw erreurPlanifAttente;

      return res.status(200).json({ success: true });
    }

    if (action === 'delete_planif_profil_attente') {
      const { email } = req.body;
      if (!email) throw new Error('email requis');

      const { error: erreurSupprPlanif } = await admin.schema('planif_hebdo').from('profils_attente').delete().eq('email', email.trim().toLowerCase());
      if (erreurSupprPlanif) throw erreurSupprPlanif;

      return res.status(200).json({ success: true });
    }

    // NOUVEAU — creer/mettre a jour un acces en attente GENERIQUE (n'importe
    // quelle app + fonctionnalites) pour un courriel qui n'a pas encore de compte.
    if (action === 'upsert_pending_access') {
      const { email, app_slug, has_app_access, feature_keys } = req.body;
      if (!email || !app_slug) throw new Error('email et app_slug requis');

      const { error } = await admin.from('pep_pending_access').upsert({
        email: email.trim().toLowerCase(),
        app_slug,
        has_app_access: !!has_app_access,
        feature_keys: Array.isArray(feature_keys) ? feature_keys : [],
        granted_by: userData.user.id,
      });
      if (error) throw error;

      return res.status(200).json({ success: true });
    }

    if (action === 'delete_pending_access') {
      const { email, app_slug } = req.body;
      if (!email || !app_slug) throw new Error('email et app_slug requis');

      const { error } = await admin.from('pep_pending_access').delete().eq('email', email.trim().toLowerCase()).eq('app_slug', app_slug);
      if (error) throw error;

      return res.status(200).json({ success: true });
    }

    if (action === 'delete_user') {
      const { user_id } = req.body;
      if (!user_id) throw new Error('user_id requis');

      const { error } = await admin.auth.admin.deleteUser(user_id);
      if (error) throw error;
      // ordre_du_jour.profils.user_id references auth.users(id) on delete cascade
      // -> le profil metier est nettoye automatiquement.

      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'Action inconnue' });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}

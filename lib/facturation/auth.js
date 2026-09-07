import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const APP_SLUG = 'facturation-fournisseurs';

// Vérifie le jeton Bearer, confirme l'accès à l'app (pep_user_apps ou
// admin), et retourne { user, estAdmin, roleApprobation, adminPublic }.
// adminPublic = client service_role SANS schéma forcé (public), pratique
// pour lire pep_user_* directement depuis les routes appelantes.
export async function verifierAcces(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return { erreur: { status: 401, message: 'Non autorisé' } };
  }
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
    return { erreur: { status: 500, message: 'Configuration Supabase manquante sur le serveur.' } };
  }

  const supabaseAuth = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await supabaseAuth.auth.getUser();
  if (userErr || !userData?.user) {
    return { erreur: { status: 401, message: 'Non autorisé' } };
  }

  const adminPublic = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const userId = userData.user.id;

  const { data: roleRow } = await adminPublic
    .from('pep_user_roles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();
  const estAdmin = roleRow?.role === 'admin';

  if (!estAdmin) {
    const { data: appAccess } = await adminPublic
      .from('pep_user_apps')
      .select('app_slug')
      .eq('user_id', userId)
      .eq('app_slug', APP_SLUG)
      .maybeSingle();
    if (!appAccess) {
      return { erreur: { status: 403, message: "Accès refusé à l'application Validation factures de fournisseurs" } };
    }
  }

  return { user: userData.user, userId, estAdmin, adminPublic };
}

// Vérifie qu'un feature_key précis (ex: 'modifier', 'approbation_directeur')
// est accordé à l'utilisateur, ou qu'il est admin.
export async function possedeFeature(adminPublic, userId, estAdmin, featureKey) {
  if (estAdmin) return true;
  const { data } = await adminPublic
    .from('pep_user_features')
    .select('feature_key')
    .eq('user_id', userId)
    .eq('app_slug', APP_SLUG)
    .eq('feature_key', featureKey)
    .maybeSingle();
  return !!data;
}

export { APP_SLUG };

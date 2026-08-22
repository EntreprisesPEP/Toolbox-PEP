import { createClient } from '@supabase/supabase-js';

// Client "service role" — accès complet, utilisé SEULEMENT dans les routes
// API serveur (pages/api/facturation/...). Ne jamais importer ce fichier
// dans un composant React ou une page.
export function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { db: { schema: 'facturation' } }
  );
}

// Même projet Supabase, mais sans changer de schéma — utile pour lire
// public.pep_user_roles / pep_user_apps / pep_user_features lors des
// vérifications de permissions côté serveur.
export function getSupabaseAdminPublic() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

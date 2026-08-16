import { createClient } from '@supabase/supabase-js';

// Client "service role" — accès complet, utilisé SEULEMENT dans les routes
// API serveur (pages/api/...). Ne jamais importer ce fichier dans un
// composant React ou une page.
export function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { db: { schema: 'strava_challenge' } }
  );
}

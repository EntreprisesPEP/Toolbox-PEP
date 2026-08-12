import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Ne bloque pas le build, mais avertit clairement en console cote client.
  // eslint-disable-next-line no-console
  console.warn(
    'NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY manquants. ' +
    'Copie .env.example vers .env.local et remplis les valeurs (voir README).'
  );
}

export const supabase = createClient(url, anonKey, {
  db: { schema: 'planif_hebdo' },
});

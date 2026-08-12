import { createClient } from "@supabase/supabase-js";

// Ordre du jour vit maintenant dans le meme projet Supabase partage
// (Toolbox) que les autres apps, sous son propre schema "ordre_du_jour" -
// exactement comme Planification hebdomadaire utilise "planif_hebdo".
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "Variables d'environnement Supabase manquantes. Verifie NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY dans Vercel."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: { schema: "ordre_du_jour" },
});

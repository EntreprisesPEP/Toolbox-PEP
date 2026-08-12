import { createClient } from "@supabase/supabase-js";

// Noms dedies a Ordre du jour (different du reste du projet Toolbox 2.0)
// car cette app utilise un projet Supabase SEPARE de celui partage par
// les autres apps (Toolbox, Planification hebdomadaire, etc.)
const supabaseUrl = process.env.NEXT_PUBLIC_ORDREDUJOUR_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_ORDREDUJOUR_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "Variables d'environnement Supabase manquantes. Verifie NEXT_PUBLIC_ORDREDUJOUR_SUPABASE_URL / NEXT_PUBLIC_ORDREDUJOUR_SUPABASE_ANON_KEY dans Vercel."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

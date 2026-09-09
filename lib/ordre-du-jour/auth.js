import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// QUI PEUT DECLENCHER UNE NOTIFICATION D'ORDRE DU JOUR
//
// Revision 42. Avant ce correctif, /api/ordre-du-jour/send-push et
// /api/ordre-du-jour/send-notification ne verifiaient rien du tout :
//   - send-push envoyait une notification a TOUS les appareils abonnes
//   - send-notification envoyait un courriel a toute la direction
//     (tous les profils dont le role n'est pas « contremaitre »)
// Il suffisait de connaitre l'adresse et d'envoyer un POST. C'est le meme
// trou que celui bouche a la revision 38 sur rappel-quotidien; ces deux
// routes-la avaient ete oubliees.
//
// Le bon niveau d'exigence n'est pas « administrateur » : ce sont les
// contremaitres eux-memes qui declenchent ces notifications en soumettant
// leur requete ou en repondant a un commentaire. On demande donc exactement
// ce que GardeConnexion demande pour ouvrir l'app :
//   une session Toolbox valide, ET l'acces a « ordre-du-jour » (ou le role
//   administrateur, qui ouvre tout).
//
// La cle anon ne sert qu'a valider le jeton de l'appelant; la lecture des
// droits passe par la cle service, hors de portee de RLS.
// ---------------------------------------------------------------------------
const APP_SLUG = "ordre-du-jour";

export async function peutNotifier(req) {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const authHeader = req.headers.authorization;

  // Porte de service : une tache planifiee Vercel, si un jour on en branche
  // une sur ces routes. Meme convention que les crons du Defi Strava.
  if (process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`) {
    return true;
  }

  if (!authHeader || !SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) return false;

  try {
    const supabaseAuth = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error } = await supabaseAuth.auth.getUser();
    if (error || !userData?.user) return false;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const [{ data: acces }, { data: roleRow }] = await Promise.all([
      admin
        .from("pep_user_apps")
        .select("app_slug")
        .eq("user_id", userData.user.id)
        .eq("app_slug", APP_SLUG)
        .maybeSingle(),
      admin
        .from("pep_user_roles")
        .select("role")
        .eq("user_id", userData.user.id)
        .maybeSingle(),
    ]);

    return !!acces || roleRow?.role === "admin";
  } catch (e) {
    return false;
  }
}

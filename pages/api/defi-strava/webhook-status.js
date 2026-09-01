import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Autorise soit la cle secrete (?secret=CRON_SECRET, pour un usage
// automatise/manuel via URL), soit une session Toolbox valide avec le
// role admin (pour verifier directement depuis le navigateur, deja
// connecte -- plus besoin d'aller chercher CRON_SECRET dans Vercel).
async function estAutorise(req) {
  if (req.query.secret && req.query.secret === process.env.CRON_SECRET) return true;

  const authHeader = req.headers.authorization;
  if (!authHeader || !SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) return false;

  const supabaseAuth = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error } = await supabaseAuth.auth.getUser();
  if (error || !userData?.user) return false;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: roleRow } = await admin
    .from('pep_user_roles').select('role').eq('user_id', userData.user.id).maybeSingle();
  return roleRow?.role === 'admin';
}

export default async function handler(req, res) {
  if (!(await estAutorise(req))) {
    res.status(401).json({ error: 'Non autorisé' });
    return;
  }

  const params = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID,
    client_secret: process.env.STRAVA_CLIENT_SECRET,
  });

  const stravaRes = await fetch(
    `https://www.strava.com/api/v3/push_subscriptions?${params.toString()}`
  );
  const data = await stravaRes.json();

  res.status(200).json({
    abonnements_actifs: data,
    astuce:
      Array.isArray(data) && data.length > 0
        ? 'Un webhook est déjà enregistré — pas besoin de /register-webhook'
        : 'Aucun webhook enregistré — tu peux visiter /register-webhook',
  });
}

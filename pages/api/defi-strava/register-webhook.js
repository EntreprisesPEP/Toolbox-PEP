import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Meme principe que webhook-status.js : cle secrete OU session admin
// Toolbox valide.
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

  const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/defi-strava/webhook/`;

  const form = new FormData();
  form.append('client_id', process.env.STRAVA_CLIENT_ID);
  form.append('client_secret', process.env.STRAVA_CLIENT_SECRET);
  form.append('callback_url', callbackUrl);
  form.append('verify_token', process.env.STRAVA_WEBHOOK_VERIFY_TOKEN);

  const stravaRes = await fetch('https://www.strava.com/api/v3/push_subscriptions', {
    method: 'POST',
    body: form,
  });
  const data = await stravaRes.json();

  if (!stravaRes.ok) {
    res.status(stravaRes.status).json({
      succes: false,
      erreur: data,
      astuce: 'Si l\'erreur mentionne "already exists", vérifie /api/defi-strava/webhook-status',
    });
    return;
  }

  res.status(200).json({ succes: true, message: 'Webhook enregistré avec succès !', details: data });
}

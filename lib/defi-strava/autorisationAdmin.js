import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// « EST-CE QUE CET APPEL A LE DROIT DE FAIRE DES CHOSES D'ADMINISTRATION? »
//
// Revision 54. Ce test existait en trois copies identiques dans autant de
// routes (webhook-status, register-webhook, resync-participant). Trois copies,
// c'est trois occasions de corriger une faille a deux endroits sur trois.
// Une seule definition, maintenant.
//
// Deux facons d'etre autorise, volontairement :
//
//   1. La cle secrete (CRON_SECRET) — pour un appel automatise ou lance a la
//      main depuis une URL, sans navigateur ni session.
//   2. Une session Toolbox valide dont le compte porte le role « admin ».
//
// Le role n'est JAMAIS lu depuis le navigateur : le jeton sert seulement a
// savoir QUI appelle, puis c'est le serveur qui va lire le role dans la base
// avec la cle de service. Autrement, n'importe qui pourrait s'auto-declarer
// administrateur en modifiant sa page.
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function estAdminOuSecret(req) {
  const secretFourni = req.query?.secret || req.body?.secret;
  const secretAttendu = process.env.CRON_SECRET;
  // Les deux doivent exister : sinon « undefined === undefined » ouvrirait
  // la porte a tout le monde le jour ou la variable disparait de Vercel.
  if (secretFourni && secretAttendu && secretFourni === secretAttendu) return true;

  const authHeader = req.headers?.authorization;
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

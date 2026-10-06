import { createClient } from '@supabase/supabase-js';
import { hacherMotDePasse, LONGUEUR_MINIMALE } from '../../../lib/commun/motDePasseApp';

// ---------------------------------------------------------------------------
// LIRE L'ETAT / CHANGER UN MOT DE PASSE D'APP — revision 73
//
// Reserve aux administrateurs Toolbox, comme le reste de /api/administration.
//
// GET  ?appSlug=...  -> { defini, majPar, majLe }. Jamais l'empreinte, jamais
//                       le mot de passe. Une route d'administration n'a pas
//                       besoin de renvoyer le secret pour afficher son etat,
//                       et ce qu'on ne renvoie pas ne fuit pas.
// POST { appSlug, password } -> enregistre l'empreinte.
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Liste blanche : une route d'administration ne doit pas pouvoir ecrire un
// secret pour un slug invente dans la requete.
const APPS_AVEC_MOT_DE_PASSE = ['planification-hebdomadaire'];

export default async function handler(req, res) {
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Configuration Supabase manquante sur le serveur.' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Non autorisé' });

  let userId;
  let email;
  try {
    const auth = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data, error } = await auth.auth.getUser();
    if (error || !data?.user) return res.status(401).json({ error: 'Non autorisé' });
    userId = data.user.id;
    email = data.user.email || '';
  } catch (e) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: roleRow } = await admin
    .from('pep_user_roles').select('role').eq('user_id', userId).maybeSingle();
  if (!roleRow || roleRow.role !== 'admin') {
    return res.status(403).json({ error: 'Reserve aux administrateurs' });
  }

  const appSlug = req.method === 'GET' ? req.query.appSlug : (req.body || {}).appSlug;
  if (!APPS_AVEC_MOT_DE_PASSE.includes(appSlug)) {
    return res.status(400).json({ error: 'Application inconnue' });
  }

  if (req.method === 'GET') {
    const { data, error } = await admin
      .from('pep_app_secrets').select('maj_par, maj_le').eq('app_slug', appSlug).maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({
      defini: Boolean(data),
      majPar: data?.maj_par || null,
      majLe: data?.maj_le || null,
    });
  }

  if (req.method === 'POST') {
    const { password } = req.body || {};
    if (typeof password !== 'string' || password.trim().length < LONGUEUR_MINIMALE) {
      return res.status(400).json({
        error: `Le mot de passe doit faire au moins ${LONGUEUR_MINIMALE} caractères.`,
      });
    }
    const hash = await hacherMotDePasse(password.trim());
    const { error } = await admin.from('pep_app_secrets').upsert(
      { app_slug: appSlug, hash, maj_par: email, maj_le: new Date().toISOString() },
      { onConflict: 'app_slug' }
    );
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true, majPar: email, majLe: new Date().toISOString() });
  }

  return res.status(405).json({ error: 'Methode non supportee' });
}

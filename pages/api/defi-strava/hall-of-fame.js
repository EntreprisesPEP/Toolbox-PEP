import { createClient } from '@supabase/supabase-js';
import { calculerHallOfFame } from '../../../lib/defi-strava/hallOfFame';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function estAutorise(authHeader) {
  if (!authHeader) return false;
  const supabaseAuth = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await supabaseAuth.auth.getUser();
  return !error && !!data?.user;
}

export default async function handler(req, res) {
  if (!(await estAutorise(req.headers.authorization))) {
    res.status(401).json({ error: 'Non autorisé' });
    return;
  }

  try {
    const resultat = await calculerHallOfFame();
    res.status(200).json(resultat);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

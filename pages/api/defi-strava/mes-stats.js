import { createClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '../../../lib/defi-strava/supabaseAdmin';
import { calculerMesStats } from '../../../lib/defi-strava/mesStats';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function resoudreParticipantDepuisToken(authHeader) {
  if (!authHeader) return null;
  const supabaseAuth = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error } = await supabaseAuth.auth.getUser();
  if (error || !userData?.user) return null;

  const admin = getSupabaseAdmin();
  const { data: participant } = await admin
    .from('participants').select('id, nom').eq('email', userData.user.email).maybeSingle();
  return participant || null;
}

export default async function handler(req, res) {
  const participant = await resoudreParticipantDepuisToken(req.headers.authorization);
  if (!participant) {
    res.status(401).json({ error: 'Non autorisé' });
    return;
  }

  try {
    const stats = await calculerMesStats(participant.id);
    res.status(200).json(stats);
  } catch (err) {
    console.error('Erreur calcul mes-stats:', err); // eslint-disable-line no-console
    res.status(500).json({ error: err.message || 'Erreur inconnue' });
  }
}

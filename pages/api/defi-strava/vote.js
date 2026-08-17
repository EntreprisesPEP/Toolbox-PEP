import { createClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '../../../lib/defi-strava/supabaseAdmin';
import { semaineFinieLaPlusRecente, toDateISO } from '../../../lib/defi-strava/weekUtils';
import { getRankingPourPeriode } from '../../../lib/defi-strava/getRanking';

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

  const { semaine } = semaineFinieLaPlusRecente();
  const semaineDebutISO = toDateISO(semaine.debut);
  const semaineFinISO = toDateISO(semaine.fin);

  const admin = getSupabaseAdmin();

  if (req.method === 'GET') {
    try {
      const [{ data: participants }, { data: votes }, classement] = await Promise.all([
        admin.from('participants').select('id, nom').eq('actif', true),
        admin.from('votes').select('votant_participant_id, vote_pour_participant_id').eq('semaine_debut', semaineDebutISO),
        getRankingPourPeriode(semaine.debut, semaine.fin),
      ]);

      const monVote = (votes || []).find((v) => v.votant_participant_id === participant.id);
      const heuresParNom = {};
      classement.forEach((c) => { heuresParNom[c.nom] = c.totalFormate; });

      const candidats = (participants || [])
        .filter((p) => p.id !== participant.id)
        .map((p) => ({ participantId: p.id, nom: p.nom, totalFormate: heuresParNom[p.nom] || '0 min' }));

      res.status(200).json({
        semaineDebut: semaineDebutISO,
        semaineFin: semaineFinISO,
        dejaVotePour: monVote ? monVote.vote_pour_participant_id : null,
        candidats,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  if (req.method === 'POST') {
    const { votePourParticipantId } = req.body || {};
    if (!votePourParticipantId) {
      res.status(400).json({ error: 'votePourParticipantId manquant' });
      return;
    }
    if (votePourParticipantId === participant.id) {
      res.status(400).json({ error: 'Impossible de voter pour toi-même.' });
      return;
    }

    const { error } = await admin.from('votes').upsert(
      {
        votant_participant_id: participant.id,
        vote_pour_participant_id: votePourParticipantId,
        semaine_debut: semaineDebutISO,
      },
      { onConflict: 'votant_participant_id,semaine_debut' }
    );

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).end();
}

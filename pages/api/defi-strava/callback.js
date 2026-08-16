import { getSupabaseAdmin } from '../../../lib/defi-strava/supabaseAdmin';
import { exchangeCodeForTokens } from '../../../lib/defi-strava/stravaClient';

export default async function handler(req, res) {
  const { code, state: participantId, error } = req.query;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (error) {
    res.redirect(`${appUrl}/defi-strava?connexion=refusee`);
    return;
  }

  if (!code || !participantId) {
    res.redirect(`${appUrl}/defi-strava?connexion=erreur`);
    return;
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const supabase = getSupabaseAdmin();

    await supabase
      .from('participants')
      .update({ strava_athlete_id: tokens.athlete.id })
      .eq('id', participantId);

    await supabase.from('strava_tokens').upsert({
      participant_id: participantId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: new Date(tokens.expires_at * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    });

    res.redirect(`${appUrl}/defi-strava?connexion=reussie`);
  } catch (err) {
    console.error('Erreur callback Strava:', err); // eslint-disable-line no-console
    res.redirect(`${appUrl}/defi-strava?connexion=erreur`);
  }
}

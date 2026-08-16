import { getStravaAuthUrl } from '../../../lib/defi-strava/stravaClient';

export default function handler(req, res) {
  const { participant_id } = req.query;

  if (!participant_id) {
    res.status(400).json({ error: 'participant_id manquant dans le lien' });
    return;
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/defi-strava/callback`;
  const authUrl = getStravaAuthUrl(redirectUri, participant_id);

  res.redirect(authUrl);
}

import { getSupabaseAdmin } from './supabaseAdmin';

const STRAVA_CLIENT_ID = process.env.STRAVA_CLIENT_ID;
const STRAVA_CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;

export function getStravaAuthUrl(redirectUri, state) {
  const params = new URLSearchParams({
    client_id: STRAVA_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    approval_prompt: 'auto',
    scope: 'read,activity:read_all',
    state,
  });
  return `https://www.strava.com/oauth/authorize?${params.toString()}`;
}

export async function exchangeCodeForTokens(code) {
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) throw new Error(`Échange de code Strava échoué : ${await res.text()}`);
  return res.json();
}

export async function refreshAccessToken(refreshToken) {
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`Refresh de token Strava échoué : ${await res.text()}`);
  return res.json();
}

export async function getValidAccessToken(participantId) {
  const supabase = getSupabaseAdmin();
  const { data: tokenRow, error } = await supabase
    .from('strava_tokens')
    .select('*')
    .eq('participant_id', participantId)
    .single();

  if (error || !tokenRow) {
    throw new Error(`Aucun token Strava trouvé pour le participant ${participantId}`);
  }

  const expiresAt = new Date(tokenRow.expires_at).getTime();
  if (expiresAt - Date.now() > 5 * 60 * 1000) {
    return tokenRow.access_token;
  }

  const refreshed = await refreshAccessToken(tokenRow.refresh_token);
  await supabase
    .from('strava_tokens')
    .update({
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      expires_at: new Date(refreshed.expires_at * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('participant_id', participantId);

  return refreshed.access_token;
}

export async function fetchActivity(accessToken, activityId) {
  const res = await fetch(`https://www.strava.com/api/v3/activities/${activityId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Impossible de récupérer l'activité ${activityId} : ${res.status}`);
  return res.json();
}

export async function fetchRecentActivities(accessToken, afterUnix) {
  const res = await fetch(
    `https://www.strava.com/api/v3/athlete/activities?after=${afterUnix}&per_page=100`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`Impossible de lister les activités : ${res.status}`);
  return res.json();
}

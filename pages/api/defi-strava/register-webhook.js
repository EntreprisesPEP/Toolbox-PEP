export default async function handler(req, res) {
  const { secret } = req.query;
  if (secret !== process.env.CRON_SECRET) {
    res.status(401).json({ error: 'Non autorisé' });
    return;
  }

  const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/defi-strava/webhook`;

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

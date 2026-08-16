export default async function handler(req, res) {
  const { secret } = req.query;
  if (secret !== process.env.CRON_SECRET) {
    res.status(401).json({ error: 'Non autorisé' });
    return;
  }

  const params = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID,
    client_secret: process.env.STRAVA_CLIENT_SECRET,
  });

  const stravaRes = await fetch(
    `https://www.strava.com/api/v3/push_subscriptions?${params.toString()}`
  );
  const data = await stravaRes.json();

  res.status(200).json({
    abonnements_actifs: data,
    astuce:
      Array.isArray(data) && data.length > 0
        ? 'Un webhook est déjà enregistré — pas besoin de /register-webhook'
        : 'Aucun webhook enregistré — tu peux visiter /register-webhook',
  });
}

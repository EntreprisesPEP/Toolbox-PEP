export default function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Methode non supportee' });
    return;
  }
  const expected = process.env.ANIMATEUR_PASSWORD;
  if (!expected) {
    // Aucun mot de passe configure -> on laisse passer (comportement du prototype d'origine),
    // mais on avertit clairement dans les logs serveur pour que ca ne passe pas inapercu.
    // eslint-disable-next-line no-console
    console.warn('ANIMATEUR_PASSWORD non configure : le mode animateur est ouvert a tous.');
    res.status(200).json({ ok: true, unprotected: true });
    return;
  }
  const { password } = req.body || {};
  res.status(200).json({ ok: password === expected });
}

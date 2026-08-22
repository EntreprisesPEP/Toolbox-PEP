import { verifierAcces } from '../../../lib/facturation/auth';
import { getSupabaseAdmin } from '../../../lib/facturation/supabaseAdmin';

// Lecture/écriture des paramètres configurables (ex: seuil de flag sur
// les prix). Réservé aux admins pour éviter qu'un seuil soit changé par
// erreur par quelqu'un qui ne devrait pas.
export default async function handler(req, res) {
  const acces = await verifierAcces(req);
  if (acces.erreur) return res.status(acces.erreur.status).json({ error: acces.erreur.message });
  const { estAdmin } = acces;

  const supabase = getSupabaseAdmin();

  if (req.method === 'GET') {
    const { data, error } = await supabase.from('parametres').select('*');
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true, parametres: data });
  }

  if (req.method === 'POST') {
    if (!estAdmin) {
      return res.status(403).json({ error: "Seuls les administrateurs peuvent modifier les paramètres." });
    }
    const { cle, valeur } = req.body || {};
    if (!cle) return res.status(400).json({ error: 'cle est requise.' });
    const { error } = await supabase.from('parametres').upsert({ cle, valeur, updated_at: new Date().toISOString() });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Méthode non supportée' });
}

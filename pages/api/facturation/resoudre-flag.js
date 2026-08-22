import { verifierAcces, possedeFeature } from '../../../lib/facturation/auth';
import { getSupabaseAdmin } from '../../../lib/facturation/supabaseAdmin';

// Marque un flag comme résolu (ex: après vérification manuelle qu'un
// prix élevé était en fait justifié). Ne supprime rien — garde la trace
// dans l'historique pour l'audit.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non supportée' });
  }

  const acces = await verifierAcces(req);
  if (acces.erreur) return res.status(acces.erreur.status).json({ error: acces.erreur.message });
  const { userId, estAdmin, adminPublic } = acces;

  const peutModifier = await possedeFeature(adminPublic, userId, estAdmin, 'modifier');
  if (!peutModifier) {
    return res.status(403).json({ error: "Tu n'as pas le droit de résoudre un flag." });
  }

  const { flagId, commentaire } = req.body || {};
  if (!flagId) return res.status(400).json({ error: 'flagId est requis.' });

  const supabase = getSupabaseAdmin();

  try {
    const { data: flag, error: erreurLecture } = await supabase
      .from('flags').select('*').eq('id', flagId).single();
    if (erreurLecture) throw erreurLecture;

    const { error } = await supabase
      .from('flags')
      .update({ resolu: true, resolu_par: userId, resolu_le: new Date().toISOString() })
      .eq('id', flagId);
    if (error) throw error;

    // Si c'était le dernier flag actif de cette facture, on peut retirer
    // le badge "a_des_flags".
    const { data: flagsRestants } = await supabase
      .from('flags').select('id').eq('facture_id', flag.facture_id).eq('resolu', false);
    if (!flagsRestants || flagsRestants.length === 0) {
      await supabase.from('factures').update({ a_des_flags: false }).eq('id', flag.facture_id);
    }

    await supabase.from('historique').insert({
      facture_id: flag.facture_id,
      action: 'flag_resolu',
      details: { flag_id: flagId, type_flag: flag.type_flag, commentaire: commentaire || null },
      user_id: userId,
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Erreur resoudre-flag:', err); // eslint-disable-line no-console
    return res.status(500).json({ error: err.message || 'Erreur inconnue.' });
  }
}

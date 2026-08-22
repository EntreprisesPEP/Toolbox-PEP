import { verifierAcces, possedeFeature } from '../../../lib/facturation/auth';
import { getSupabaseAdmin } from '../../../lib/facturation/supabaseAdmin';

const ORDRE_ETAPES = ['adjointe', 'charge_projet', 'directeur', 'payables'];

// Rouvre une facture rejetée : la remet à l'étape 1 (adjointe) et
// réinitialise les 4 lignes d'approbation à "en_attente". Utilisé quand
// un rejet était dû à une erreur (mauvaise quantité, mauvais prix...)
// que quelqu'un a corrigée via "Corriger une ligne" et qui veut
// resoumettre la facture au circuit sans devoir la réimporter au complet.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non supportée' });
  }

  const acces = await verifierAcces(req);
  if (acces.erreur) return res.status(acces.erreur.status).json({ error: acces.erreur.message });
  const { userId, estAdmin, adminPublic } = acces;

  const peutModifier = await possedeFeature(adminPublic, userId, estAdmin, 'modifier');
  if (!peutModifier) {
    return res.status(403).json({ error: "Tu n'as pas le droit de rouvrir une facture." });
  }

  const { factureId } = req.body || {};
  if (!factureId) return res.status(400).json({ error: 'factureId est requis.' });

  const supabase = getSupabaseAdmin();

  try {
    const { data: facture, error: erreurLecture } = await supabase
      .from('factures').select('statut_workflow').eq('id', factureId).maybeSingle();
    if (erreurLecture) throw erreurLecture;
    if (!facture) return res.status(404).json({ error: 'Facture introuvable.' });
    if (facture.statut_workflow !== 'rejete') {
      return res.status(409).json({ error: "Seule une facture rejetée peut être rouverte." });
    }

    // Réinitialise les 4 étapes à "en_attente" (efface les décisions
    // précédentes, mais l'historique complet reste consultable dans
    // facturation.historique — rien n'est perdu, juste remis en jeu).
    const { error: erreurApprobations } = await supabase
      .from('facture_approbations')
      .update({ statut: 'en_attente', approuve_par: null, commentaire: null, date_action: null })
      .eq('facture_id', factureId)
      .in('etape', ORDRE_ETAPES);
    if (erreurApprobations) throw erreurApprobations;

    const { error: erreurFacture } = await supabase
      .from('factures')
      .update({ statut_workflow: 'en_attente_adjointe', updated_at: new Date().toISOString() })
      .eq('id', factureId);
    if (erreurFacture) throw erreurFacture;

    await supabase.from('historique').insert({
      facture_id: factureId,
      action: 'reouverture',
      details: { raison: "Facture rejetée rouverte manuellement pour correction et resoumission." },
      user_id: userId,
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Erreur rouvrir-facture:', err); // eslint-disable-line no-console
    return res.status(500).json({ error: err.message || 'Erreur inconnue.' });
  }
}

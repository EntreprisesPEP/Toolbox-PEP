import { verifierAcces, possedeFeature } from '../../../lib/facturation/auth';
import { getSupabaseAdmin, getSupabaseAdminPublic } from '../../../lib/facturation/supabaseAdmin';
import { pousserFactureVersCost } from '../../../lib/facturation/costLink';

// Permet de pousser (ou réessayer de pousser) manuellement une facture
// déjà approuvée vers Fichier Cost — utile si le numéro de projet a été
// ajouté après coup, ou si le premier essai automatique avait échoué
// (ex: projet pas encore créé dans Fichier Cost au moment de
// l'approbation finale).
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non supportée' });
  }

  const acces = await verifierAcces(req);
  if (acces.erreur) return res.status(acces.erreur.status).json({ error: acces.erreur.message });
  const { userId, estAdmin, adminPublic } = acces;

  const peutModifier = await possedeFeature(adminPublic, userId, estAdmin, 'modifier');
  if (!peutModifier) {
    return res.status(403).json({ error: "Tu n'as pas le droit de faire ceci." });
  }

  const { factureId } = req.body || {};
  if (!factureId) return res.status(400).json({ error: 'factureId est requis.' });

  const supabase = getSupabaseAdmin();

  try {
    const { data: facture, error: erreurLecture } = await supabase.from('factures').select('*').eq('id', factureId).single();
    if (erreurLecture) throw erreurLecture;
    if (facture.statut_workflow !== 'approuve_final') {
      return res.status(409).json({ error: "Seule une facture approuvée à toutes les étapes peut être poussée vers Fichier Cost." });
    }

    const { data: fournisseur } = await supabase.from('fournisseurs').select('nom').eq('id', facture.fournisseur_id).maybeSingle();
    const supabasePublic = getSupabaseAdminPublic();
    const resultat = await pousserFactureVersCost(supabasePublic, { ...facture, pousse_vers_cost: false }, fournisseur?.nom);

    if (resultat.pousse) {
      await supabase.from('factures').update({
        pousse_vers_cost: true,
        cost_invoice_id: resultat.costInvoiceId,
      }).eq('id', factureId);
    }

    await supabase.from('historique').insert({
      facture_id: factureId,
      action: 'pousse_fichier_cost',
      details: { ...resultat, manuel: true },
      user_id: userId,
    });

    return res.status(200).json({ ok: true, ...resultat });
  } catch (err) {
    console.error('Erreur pousser-vers-cost:', err); // eslint-disable-line no-console
    return res.status(500).json({ error: err.message || 'Erreur inconnue.' });
  }
}

import { verifierAcces, possedeFeature } from '../../../lib/facturation/auth';
import { getSupabaseAdmin } from '../../../lib/facturation/supabaseAdmin';
import { statsPourItem, evaluerPrixLigne, lireSeuilEcartPrix } from '../../../lib/facturation/analytics';

// Permet de corriger manuellement une ligne mal lue automatiquement
// (quantité, prix unitaire, description). Recalcule le flag de prix et
// le montant si nécessaire, et journalise la correction.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non supportée' });
  }

  const acces = await verifierAcces(req);
  if (acces.erreur) return res.status(acces.erreur.status).json({ error: acces.erreur.message });
  const { userId, estAdmin, adminPublic } = acces;

  const peutModifier = await possedeFeature(adminPublic, userId, estAdmin, 'modifier');
  if (!peutModifier) {
    return res.status(403).json({ error: "Tu n'as pas le droit de corriger une ligne de facture." });
  }

  const { ligneId, description_brute, quantite, prix_unitaire, unite } = req.body || {};
  if (!ligneId) return res.status(400).json({ error: 'ligneId est requis.' });

  // Un champ vide ("") dans le formulaire ne doit pas se traduire par un
  // 0 silencieux — on le traite comme "non fourni" (valeur inchangée).
  const estFourni = (v) => v !== undefined && v !== null && String(v).trim() !== '';

  const supabase = getSupabaseAdmin();

  try {
    const { data: ligneActuelle, error: erreurLecture } = await supabase
      .from('facture_lignes').select('*').eq('id', ligneId).single();
    if (erreurLecture) throw erreurLecture;

    const nouvelleQuantite = estFourni(quantite) ? Number(quantite) : ligneActuelle.quantite;
    const nouveauPrix = estFourni(prix_unitaire) ? Number(prix_unitaire) : ligneActuelle.prix_unitaire;
    if (estFourni(quantite) && !Number.isFinite(nouvelleQuantite)) {
      return res.status(400).json({ error: 'Quantité invalide.' });
    }
    if (estFourni(prix_unitaire) && !Number.isFinite(nouveauPrix)) {
      return res.status(400).json({ error: 'Prix unitaire invalide.' });
    }
    const nouveauMontant = (nouvelleQuantite != null && nouveauPrix != null)
      ? Number((nouvelleQuantite * nouveauPrix).toFixed(2))
      : ligneActuelle.montant;

    let prixFlagge = ligneActuelle.prix_flagge;
    let flagRaison = ligneActuelle.flag_raison;
    if (ligneActuelle.item_id) {
      const stats = await statsPourItem(supabase, ligneActuelle.item_id);
      const seuil = await lireSeuilEcartPrix(supabase);
      const evaluation = evaluerPrixLigne(nouveauPrix, stats, seuil);
      prixFlagge = !!evaluation;
      flagRaison = evaluation ? 'prix_eleve' : null;
    }

    const { error: erreurMaj } = await supabase
      .from('facture_lignes')
      .update({
        description_brute: estFourni(description_brute) ? description_brute : ligneActuelle.description_brute,
        unite: unite !== undefined ? (unite || null) : ligneActuelle.unite,
        quantite: nouvelleQuantite,
        prix_unitaire: nouveauPrix,
        montant: nouveauMontant,
        prix_flagge: prixFlagge,
        flag_raison: flagRaison,
      })
      .eq('id', ligneId);
    if (erreurMaj) throw erreurMaj;

    await supabase.from('historique').insert({
      facture_id: ligneActuelle.facture_id,
      action: 'modification_ligne',
      details: {
        ligne_id: ligneId,
        avant: {
          description: ligneActuelle.description_brute,
          quantite: ligneActuelle.quantite,
          prix_unitaire: ligneActuelle.prix_unitaire,
        },
        apres: {
          description: estFourni(description_brute) ? description_brute : ligneActuelle.description_brute,
          quantite: nouvelleQuantite,
          prix_unitaire: nouveauPrix,
        },
      },
      user_id: userId,
    });

    return res.status(200).json({ ok: true, prixFlagge });
  } catch (err) {
    console.error('Erreur modifier-ligne:', err); // eslint-disable-line no-console
    return res.status(500).json({ error: err.message || 'Erreur inconnue.' });
  }
}

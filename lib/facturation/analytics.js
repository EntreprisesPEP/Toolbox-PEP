// lib/facturation/analytics.js
//
// Calcule les statistiques de prix historiques d'un item et détermine si
// un nouveau prix observé doit être flaggé comme anormalement élevé.

// Seuils par défaut — ajustables plus tard via un écran de configuration.
const SEUIL_ECART_POURCENT = 0.15; // +15% au-dessus de la moyenne => flag
const MIN_ACHATS_POUR_STATS = 2;   // sous ce nombre d'achats, pas assez de données

async function statsPourItem(supabase, itemId) {
  const { data, error } = await supabase
    .from('v_stats_item')
    .select('*')
    .eq('item_id', itemId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

// Lit le seuil configurable (facturation.parametres). Retombe sur la
// valeur par défaut si la table n'existe pas encore ou est vide (ex:
// avant que la migration Révision 1 soit passée).
async function lireSeuilEcartPrix(supabase) {
  try {
    const { data } = await supabase
      .from('parametres').select('valeur').eq('cle', 'seuil_ecart_prix_pourcent').maybeSingle();
    const v = Number(data?.valeur);
    return Number.isFinite(v) && v > 0 ? v / 100 : SEUIL_ECART_POURCENT;
  } catch (err) {
    return SEUIL_ECART_POURCENT;
  }
}

async function meilleurFournisseurPourItem(supabase, itemId) {
  const { data, error } = await supabase
    .from('v_stats_item_fournisseur')
    .select('*')
    .eq('item_id', itemId)
    .order('prix_moyen', { ascending: true });
  if (error) throw error;
  return data || [];
}

// Détermine si le prix unitaire observé sur une ligne de facture doit
// être flaggé, en le comparant à la moyenne historique de l'item.
// Retourne null si aucun flag, sinon un objet décrivant l'écart.
function evaluerPrixLigne(prixUnitaire, stats, seuil = SEUIL_ECART_POURCENT) {
  if (!stats || stats.nb_achats < MIN_ACHATS_POUR_STATS) return null;
  const prixMoyen = Number(stats.prix_moyen);
  if (prixUnitaire == null || !Number.isFinite(prixMoyen) || prixMoyen === 0) return null;

  const ecart = (prixUnitaire - prixMoyen) / prixMoyen;
  if (ecart > seuil) {
    return {
      type_flag: 'prix_eleve',
      details: {
        prix_facture: prixUnitaire,
        prix_moyen_historique: Number(prixMoyen.toFixed(4)),
        ecart_pourcent: Number((ecart * 100).toFixed(1)),
        prix_min_historique: stats.prix_min,
        prix_max_historique: stats.prix_max,
        nb_achats_historique: stats.nb_achats,
      },
    };
  }
  return null;
}

module.exports = {
  SEUIL_ECART_POURCENT,
  MIN_ACHATS_POUR_STATS,
  statsPourItem,
  meilleurFournisseurPourItem,
  evaluerPrixLigne,
  lireSeuilEcartPrix,
};

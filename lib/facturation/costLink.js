// lib/facturation/costLink.js
//
// Pousse une facture entièrement approuvée dans Fichier Cost / Coûts de
// projets (public.cost_invoices), pour éviter la double saisie de
// William. On réutilise exactement le même schéma que l'import Excel
// global de Fichier Cost (mêmes colonnes, même règle de dédoublonnage),
// pour que les deux façons d'alimenter Fichier Cost restent cohérentes.
//
// IMPORTANT : ce module utilise le client PUBLIC (schéma "public", pas
// "facturation") — voir getSupabaseAdminPublic() dans supabaseAdmin.js.

function cleDedoublonnage(projectId, noFacture, fournisseur, montant) {
  return `${projectId}|${String(noFacture || '').trim().toLowerCase()}|${String(fournisseur || '').trim().toLowerCase()}|${Number(montant)}`;
}

// Trouve le projet Fichier Cost correspondant à un numéro de projet
// (même règle que resolveProjectByNumero côté Fichier Cost : comparaison
// insensible à la casse). Requête ciblée (pas un scan de toute la table)
// pour rester correcte même quand cost_projects grossit.
async function trouverProjetCost(supabasePublic, projetNo) {
  if (!projetNo) return null;
  const n = String(projetNo).trim();
  if (!n) return null;
  // ilike sans "%" fait une égalité exacte insensible à la casse — donc
  // on ne fait PAS un scan complet, Postgres peut utiliser un index si
  // besoin. .limit(2) plutôt que maybeSingle() pour ne jamais planter
  // si (improbable) deux projets partagent le même numéro.
  const { data, error } = await supabasePublic
    .from('cost_projects')
    .select('id, numero')
    .ilike('numero', n)
    .limit(2);
  if (error) throw error;
  return (data && data[0]) || null;
}

// Pousse une facture approuvée vers public.cost_invoices. Retourne
// { pousse: bool, raison?: string, costInvoiceId?: string }.
// Ne lève jamais d'exception à l'appelant — les erreurs sont retournées
// dans le résultat pour rester "best-effort" (ne doit jamais bloquer le
// circuit d'approbation).
async function pousserFactureVersCost(supabasePublic, facture, fournisseurNom) {
  try {
    if (facture.pousse_vers_cost) {
      return { pousse: false, raison: 'Déjà poussée vers Fichier Cost précédemment.' };
    }
    if (!facture.projet_no) {
      return { pousse: false, raison: "Aucun numéro de projet associé à cette facture — impossible de savoir dans quel projet Fichier Cost l'inscrire." };
    }

    const projet = await trouverProjetCost(supabasePublic, facture.projet_no);
    if (!projet) {
      return { pousse: false, raison: `Aucun projet Fichier Cost trouvé avec le numéro "${facture.projet_no}".` };
    }

    // Dédoublonnage — même clé que l'import Excel global de Fichier Cost
    const { data: existantes } = await supabasePublic
      .from('cost_invoices')
      .select('id, project_id, no_facture, fournisseur, montant')
      .eq('project_id', projet.id);
    const cleNouvelle = cleDedoublonnage(projet.id, facture.numero_facture, fournisseurNom, facture.total);
    const doublon = (existantes || []).find(
      (e) => cleDedoublonnage(e.project_id, e.no_facture, e.fournisseur, e.montant) === cleNouvelle
    );
    if (doublon) {
      return { pousse: false, raison: 'Une facture identique existe déjà dans Fichier Cost (même projet, n°, fournisseur, montant).', costInvoiceId: doublon.id };
    }

    // Auto-création du fournisseur dans Fichier Cost s'il n'existe pas
    // déjà (même comportement que l'import Excel global côté Fichier Cost)
    const { data: fournisseurExistant } = await supabasePublic
      .from('cost_suppliers').select('id, nom').ilike('nom', fournisseurNom || '').maybeSingle();
    if (!fournisseurExistant && fournisseurNom) {
      await supabasePublic.from('cost_suppliers').upsert(
        { nom: fournisseurNom, civalgo: false, type: 'Autre', auto_created: true },
        { onConflict: 'nom', ignoreDuplicates: true }
      );
    }

    const { data: inseree, error } = await supabasePublic
      .from('cost_invoices')
      .insert({
        project_id: projet.id,
        no_facture: facture.numero_facture || '',
        fournisseur: fournisseurNom || '',
        date_str: facture.date_facture || null,
        montant: facture.total || 0,
      })
      .select('id')
      .single();
    if (error) throw error;

    return { pousse: true, costInvoiceId: inseree.id };
  } catch (err) {
    return { pousse: false, raison: 'Erreur technique : ' + (err.message || 'inconnue') };
  }
}

module.exports = { pousserFactureVersCost, trouverProjetCost };

import { verifierAcces, possedeFeature } from '../../../lib/facturation/auth';
import { getSupabaseAdmin, getSupabaseAdminPublic } from '../../../lib/facturation/supabaseAdmin';
import { pousserFactureVersCost } from '../../../lib/facturation/costLink';

// Ordre officiel du processus. Une étape ne peut être franchie que si
// toutes les étapes précédentes sont "approuve".
const ORDRE_ETAPES = ['adjointe', 'charge_projet', 'directeur', 'payables'];

const FEATURE_PAR_ETAPE = {
  adjointe: 'approbation_adjointe',
  charge_projet: 'approbation_charge_projet',
  directeur: 'approbation_directeur',
  payables: 'approbation_payables',
};

const STATUT_APRES_ETAPE = {
  adjointe: 'en_attente_charge_projet',
  charge_projet: 'en_attente_directeur',
  directeur: 'en_attente_payables',
  payables: 'approuve_final',
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non supportée' });
  }

  const acces = await verifierAcces(req);
  if (acces.erreur) return res.status(acces.erreur.status).json({ error: acces.erreur.message });
  const { userId, estAdmin, adminPublic } = acces;

  const { factureId, etape, decision, commentaire } = req.body || {};
  if (!factureId || !etape || !ORDRE_ETAPES.includes(etape)) {
    return res.status(400).json({ error: 'factureId et une étape valide sont requis.' });
  }
  if (!['approuve', 'rejete'].includes(decision)) {
    return res.status(400).json({ error: "decision doit être 'approuve' ou 'rejete'." });
  }

  const featureRequise = FEATURE_PAR_ETAPE[etape];
  const autorise = await possedeFeature(adminPublic, userId, estAdmin, featureRequise);
  if (!autorise) {
    return res.status(403).json({ error: "Tu n'as pas le rôle requis pour cette étape d'approbation." });
  }

  const supabase = getSupabaseAdmin();

  try {
    // Bloque toute décision si la facture est déjà dans un état terminal
    // (rejetée, ou déjà approuvée au complet) — même si, par accident,
    // une étape individuelle serait restée à "en_attente".
    const { data: factureActuelle, error: erreurFacture } = await supabase
      .from('factures').select('statut_workflow').eq('id', factureId).maybeSingle();
    if (erreurFacture) throw erreurFacture;
    if (!factureActuelle) {
      return res.status(404).json({ error: 'Facture introuvable.' });
    }
    if (factureActuelle.statut_workflow === 'rejete' || factureActuelle.statut_workflow === 'approuve_final') {
      return res.status(409).json({ error: `Cette facture est déjà dans un état final (${factureActuelle.statut_workflow}) — aucune action possible.` });
    }

    // Vérifie que CETTE étape précise est bien encore "en_attente" —
    // empêche de re-décider une étape déjà traitée (ce qui écraserait le
    // statut de la facture en arrière si, par exemple, "adjointe" est
    // ré-approuvée après que la facture soit rendue à "payables").
    const { data: etapeActuelle, error: erreurEtape } = await supabase
      .from('facture_approbations')
      .select('statut')
      .eq('facture_id', factureId)
      .eq('etape', etape)
      .maybeSingle();
    if (erreurEtape) throw erreurEtape;
    if (!etapeActuelle) {
      return res.status(404).json({ error: "Cette étape d'approbation est introuvable pour cette facture." });
    }
    if (etapeActuelle.statut !== 'en_attente') {
      return res.status(409).json({ error: `Cette étape a déjà été traitée (statut actuel : ${etapeActuelle.statut}).` });
    }

    // Vérifie que les étapes précédentes sont bien approuvées (sauf si
    // on rejette, ce qui peut se faire à n'importe quelle étape en cours).
    const indexEtape = ORDRE_ETAPES.indexOf(etape);
    if (decision === 'approuve' && indexEtape > 0) {
      const etapesPrecedentes = ORDRE_ETAPES.slice(0, indexEtape);
      const { data: precedentes } = await supabase
        .from('facture_approbations')
        .select('etape, statut')
        .eq('facture_id', factureId)
        .in('etape', etapesPrecedentes);
      const toutesApprouvees = etapesPrecedentes.every(
        (e) => precedentes?.find((p) => p.etape === e)?.statut === 'approuve'
      );
      if (!toutesApprouvees) {
        return res.status(409).json({ error: "Les étapes précédentes ne sont pas toutes approuvées." });
      }
    }

    const { error: erreurMaj } = await supabase
      .from('facture_approbations')
      .update({
        statut: decision,
        approuve_par: userId,
        commentaire: commentaire || null,
        date_action: new Date().toISOString(),
      })
      .eq('facture_id', factureId)
      .eq('etape', etape);
    if (erreurMaj) throw erreurMaj;

    const nouveauStatutFacture = decision === 'rejete' ? 'rejete' : STATUT_APRES_ETAPE[etape];
    await supabase
      .from('factures')
      .update({ statut_workflow: nouveauStatutFacture, updated_at: new Date().toISOString() })
      .eq('id', factureId);

    await supabase.from('historique').insert({
      facture_id: factureId,
      action: decision === 'rejete' ? 'rejet' : 'approbation',
      details: { etape, commentaire: commentaire || null },
      user_id: userId,
    });

    // Approbation finale (payables) : pousse automatiquement la facture
    // vers Fichier Cost / Coûts de projets, en best-effort — un échec ne
    // doit jamais bloquer ni annuler l'approbation elle-même.
    let resultatCost = null;
    if (nouveauStatutFacture === 'approuve_final') {
      try {
        const { data: facture } = await supabase.from('factures').select('*').eq('id', factureId).single();
        const { data: fournisseur } = await supabase.from('fournisseurs').select('nom').eq('id', facture.fournisseur_id).maybeSingle();
        const supabasePublic = getSupabaseAdminPublic();
        resultatCost = await pousserFactureVersCost(supabasePublic, facture, fournisseur?.nom);
        if (resultatCost.pousse) {
          await supabase.from('factures').update({
            pousse_vers_cost: true,
            cost_invoice_id: resultatCost.costInvoiceId,
          }).eq('id', factureId);
        }
        await supabase.from('historique').insert({
          facture_id: factureId,
          action: 'pousse_fichier_cost',
          details: resultatCost,
          user_id: userId,
        });
      } catch (errCost) {
        console.error('Erreur lien Fichier Cost (non bloquant):', errCost); // eslint-disable-line no-console
      }
    }

    return res.status(200).json({ ok: true, nouveauStatut: nouveauStatutFacture, cost: resultatCost });
  } catch (err) {
    console.error('Erreur approuver-etape:', err); // eslint-disable-line no-console
    return res.status(500).json({ error: err.message || 'Erreur inconnue.' });
  }
}

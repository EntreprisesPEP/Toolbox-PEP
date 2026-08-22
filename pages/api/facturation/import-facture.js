import { verifierAcces, possedeFeature } from '../../../lib/facturation/auth';
import { getSupabaseAdmin } from '../../../lib/facturation/supabaseAdmin';
import { extraireTexteBrut, interpreterFacture } from '../../../lib/facturation/pdfParser';
import { trouverOuCreerItem } from '../../../lib/facturation/itemMatching';
import { statsPourItem, evaluerPrixLigne, lireSeuilEcartPrix } from '../../../lib/facturation/analytics';
import { envoyerNotificationFlags, trouverDestinatairesDirecteur, trouverUtilisateursDirecteur } from '../../../lib/facturation/notifications';
import { envoyerPushAUtilisateurs } from '../../../lib/facturation/push';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '15mb', // une facture PDF scannée peut être volumineuse
    },
  },
};

// Étapes du processus d'approbation, dans l'ordre. Une ligne
// facturation.facture_approbations est créée pour chacune, statut
// "en_attente", au moment de l'import.
const ETAPES_APPROBATION = ['adjointe', 'charge_projet', 'directeur', 'payables'];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non supportée' });
  }

  const acces = await verifierAcces(req);
  if (acces.erreur) return res.status(acces.erreur.status).json({ error: acces.erreur.message });
  const { userId, estAdmin, adminPublic } = acces;
  const peutImporter = await possedeFeature(adminPublic, userId, estAdmin, 'modifier');
  if (!peutImporter) {
    return res.status(403).json({ error: "Tu n'as pas le droit d'importer de facture." });
  }

  const {
    fournisseurId,
    poId,
    projetNo,
    fichierBase64,
    nomFichier,
  } = req.body || {};

  if (!fournisseurId || !fichierBase64) {
    return res.status(400).json({ error: 'fournisseurId et fichierBase64 sont requis.' });
  }

  const supabase = getSupabaseAdmin();

  try {
    // 1. Extraction du texte brut du PDF
    const bufferPdf = Buffer.from(fichierBase64, 'base64');
    const texte = await extraireTexteBrut(bufferPdf);

    // 2. Récupère le gabarit actif du fournisseur, s'il existe
    const { data: gabarit } = await supabase
      .from('fournisseur_templates')
      .select('config')
      .eq('fournisseur_id', fournisseurId)
      .eq('actif', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const interpretation = interpreterFacture(texte, gabarit?.config || null);

    // 3. Hébergement du PDF original (Supabase Storage, bucket "factures")
    const cheminFichier = `${fournisseurId}/${Date.now()}-${(nomFichier || 'facture.pdf').replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { error: erreurUpload } = await supabase.storage
      .from('factures')
      .upload(cheminFichier, bufferPdf, { contentType: 'application/pdf' });
    if (erreurUpload) throw erreurUpload;
    const { data: urlPublique } = supabase.storage.from('factures').getPublicUrl(cheminFichier);

    // 4. Création de la facture (statut initial : en attente d'adjointe)
    const { data: facture, error: erreurFacture } = await supabase
      .from('factures')
      .insert({
        fournisseur_id: fournisseurId,
        po_id: poId || null,
        projet_no: projetNo || null,
        numero_facture: interpretation.numero_facture,
        date_facture: interpretation.date_facture,
        sous_total: interpretation.sous_total,
        taxes: interpretation.taxes,
        total: interpretation.total,
        fichier_url: urlPublique.publicUrl,
        parsing_confiance: interpretation.confiance,
        parsing_brut: { texte_extrait: texte.slice(0, 20000) },
        created_by: userId,
      })
      .select('id')
      .single();
    if (erreurFacture) throw erreurFacture;

    // 5. Traitement de chaque ligne : correspondance d'item + flag de prix
    const lignesInserees = [];
    const flagsACreer = [];
    let auMoinsUnFlag = interpretation.confiance === 'basse';
    const seuilEcartPrix = await lireSeuilEcartPrix(supabase);

    for (const ligne of interpretation.lignes) {
      const { item_id } = await trouverOuCreerItem(
        supabase,
        fournisseurId,
        ligne.description_brute,
        ligne.unite
      );

      const stats = item_id ? await statsPourItem(supabase, item_id) : null;
      const evaluation = evaluerPrixLigne(ligne.prix_unitaire, stats, seuilEcartPrix);

      const { data: ligneInseree, error: erreurLigne } = await supabase
        .from('facture_lignes')
        .insert({
          facture_id: facture.id,
          item_id,
          description_brute: ligne.description_brute,
          quantite: ligne.quantite,
          unite: ligne.unite,
          prix_unitaire: ligne.prix_unitaire,
          montant: ligne.montant,
          prix_flagge: !!evaluation,
          flag_raison: evaluation ? 'prix_eleve' : null,
        })
        .select('id')
        .single();
      if (erreurLigne) throw erreurLigne;
      lignesInserees.push(ligneInseree);

      if (evaluation) {
        auMoinsUnFlag = true;
        flagsACreer.push({
          facture_id: facture.id,
          ligne_id: ligneInseree.id,
          type_flag: evaluation.type_flag,
          details: evaluation.details,
        });
      }
    }

    // 6. Contre-validation avec le PO, si un PO a été indiqué
    if (poId) {
      const { data: lignesPo } = await supabase
        .from('bons_commande_lignes')
        .select('id, item_id, description_brute, quantite_commandee, prix_unitaire_prevu')
        .eq('po_id', poId);

      for (const ligneFacture of interpretation.lignes) {
        // Comparaison par description normalisée (les lignes de PO n'ont
        // pas toujours d'item_id résolu — voir OngletBonsCommande) ;
        // suffisant pour détecter les écarts flagrants.
        const correspondance = (lignesPo || []).find(
          (p) => p.description_brute?.toLowerCase().trim() ===
                 ligneFacture.description_brute?.toLowerCase().trim()
        );
        if (!correspondance) {
          flagsACreer.push({
            facture_id: facture.id,
            type_flag: 'po_manquant',
            details: {
              description: ligneFacture.description_brute,
              raison: "Cet item facturé ne correspond à aucune ligne du bon de commande sélectionné.",
            },
          });
          auMoinsUnFlag = true;
          continue;
        }
        if (correspondance.prix_unitaire_prevu != null && ligneFacture.prix_unitaire != null) {
          const ecart = Math.abs(ligneFacture.prix_unitaire - correspondance.prix_unitaire_prevu);
          const ecartPourcent = correspondance.prix_unitaire_prevu > 0
            ? ecart / correspondance.prix_unitaire_prevu
            : 0;
          if (ecartPourcent > 0.02) {
            flagsACreer.push({
              facture_id: facture.id,
              type_flag: 'po_prix_different',
              details: {
                description: ligneFacture.description_brute,
                prix_facture: ligneFacture.prix_unitaire,
                prix_po: correspondance.prix_unitaire_prevu,
                ecart_pourcent: Number((ecartPourcent * 100).toFixed(1)),
              },
            });
            auMoinsUnFlag = true;
          }
        }
      }

      // Vérifie aussi le cumul (cette facture + les précédentes) contre
      // la quantité totale du PO, pour détecter un dépassement.
      const { data: cumul } = await supabase
        .from('v_po_cumul')
        .select('*')
        .eq('po_id', poId);
      for (const c of cumul || []) {
        if (c.quantite_restante != null && c.quantite_restante < 0) {
          flagsACreer.push({
            facture_id: facture.id,
            type_flag: 'po_depasse',
            details: {
              description: c.description_brute,
              quantite_commandee: c.quantite_commandee,
              quantite_facturee_cumul: c.quantite_facturee_cumul,
              depassement: Math.abs(c.quantite_restante),
            },
          });
          auMoinsUnFlag = true;
        }
      }
    }

    if (flagsACreer.length > 0) {
      await supabase.from('flags').insert(flagsACreer);
    }

    // Si la lecture automatique a une confiance faible, on crée un flag
    // explicite pour ça — sinon "a_des_flags" serait vrai sans qu'aucun
    // flag ne soit visible à l'écran (incohérent pour William).
    if (interpretation.confiance === 'basse') {
      const { data: flagConfiance } = await supabase.from('flags').insert({
        facture_id: facture.id,
        type_flag: 'parsing_incertain',
        details: {
          raison: "La lecture automatique de cette facture est peu fiable (aucun gabarit ne correspond, ou le gabarit n'a rien trouvé) — vérifie les lignes manuellement.",
          nb_lignes_lues: lignesInserees.length,
        },
      }).select('id').single();
      if (flagConfiance) flagsACreer.push({ id: flagConfiance.id, type_flag: 'parsing_incertain' });
    }

    if (auMoinsUnFlag) {
      await supabase.from('factures').update({ a_des_flags: true }).eq('id', facture.id);
    }

    // 7. Création des 4 étapes d'approbation, statut "en_attente"
    await supabase.from('facture_approbations').insert(
      ETAPES_APPROBATION.map((etape) => ({ facture_id: facture.id, etape }))
    );

    // 8. Historique (audit trail)
    await supabase.from('historique').insert({
      facture_id: facture.id,
      action: 'import',
      details: {
        nb_lignes: lignesInserees.length,
        nb_flags: flagsACreer.length,
        confiance: interpretation.confiance,
        nom_fichier: nomFichier || null,
      },
      user_id: userId,
    });

    // 9. Notification par courriel ET par push si des flags ont été créés
    //    — envoyée aux personnes ayant le rôle "directeur" pour cette app.
    //    Best-effort : un échec d'envoi ne fait jamais échouer l'import.
    if (flagsACreer.length > 0) {
      try {
        const { data: fournisseurRow } = await supabase
          .from('fournisseurs').select('nom').eq('id', fournisseurId).maybeSingle();
        const destinataires = await trouverDestinatairesDirecteur(adminPublic);
        if (destinataires.length > 0) {
          await envoyerNotificationFlags(destinataires, {
            fournisseurNom: fournisseurRow?.nom,
            numeroFacture: interpretation.numero_facture,
            total: interpretation.total,
            flags: flagsACreer,
            factureId: facture.id,
          });
        }
        const utilisateursIds = await trouverUtilisateursDirecteur(adminPublic);
        if (utilisateursIds.length > 0) {
          await envoyerPushAUtilisateurs(utilisateursIds, {
            title: `⚠️ Facture à vérifier — ${fournisseurRow?.nom || 'fournisseur'}`,
            body: `${flagsACreer.length} élément(s) à vérifier avant approbation.`,
            url: '/facturation-fournisseurs/',
          });
        }
      } catch (errCourriel) {
        console.error('Erreur notification flags (non bloquant):', errCourriel); // eslint-disable-line no-console
      }
    }

    return res.status(200).json({
      ok: true,
      factureId: facture.id,
      confiance: interpretation.confiance,
      nbLignes: lignesInserees.length,
      nbFlags: flagsACreer.length,
    });
  } catch (err) {
    console.error('Erreur import-facture:', err); // eslint-disable-line no-console
    return res.status(500).json({ error: err.message || 'Erreur inconnue lors du traitement de la facture.' });
  }
}

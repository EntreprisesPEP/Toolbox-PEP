// lib/facturation/notifications.js
//
// Envoie un courriel automatique quand une facture importée génère des
// flags (prix trop élevé, écart avec le bon de commande, etc.). Suit le
// même pattern que lib/defi-strava/emailTemplate.js (Resend, expéditeur
// @toolbox-pep.com).

import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const LIBELLE_FLAG = {
  prix_eleve: 'Prix anormalement élevé',
  po_manquant: "Item absent du bon de commande",
  po_prix_different: 'Prix différent du bon de commande',
  po_depasse: 'Quantité du bon de commande dépassée',
  parsing_incertain: 'Lecture automatique peu fiable',
};

function ligneFlag(flag) {
  const d = flag.details || {};
  const libelle = LIBELLE_FLAG[flag.type_flag] || flag.type_flag;
  let detail = '';
  if (flag.type_flag === 'prix_eleve') {
    detail = `${d.prix_facture ?? '?'} $ facturé vs ${d.prix_moyen_historique ?? '?'} $ en moyenne (+${d.ecart_pourcent ?? '?'}%)`;
  } else if (flag.type_flag === 'po_manquant') {
    detail = d.description || '';
  } else if (flag.type_flag === 'po_prix_different') {
    detail = `${d.description || ''} : ${d.prix_facture ?? '?'} $ vs ${d.prix_po ?? '?'} $ prévu (${d.ecart_pourcent ?? '?'}%)`;
  } else if (flag.type_flag === 'po_depasse') {
    detail = `${d.description || ''} : dépassement de ${d.depassement ?? '?'}`;
  } else if (flag.type_flag === 'parsing_incertain') {
    detail = d.raison || 'Vérifie les lignes manuellement.';
  }
  return `<tr>
    <td style="padding:6px 10px;border-bottom:1px solid #EDEFF1;font-weight:600;color:#C41230;">${libelle}</td>
    <td style="padding:6px 10px;border-bottom:1px solid #EDEFF1;">${detail}</td>
  </tr>`;
}

// destinataires: tableau de courriels. flags: lignes de facturation.flags.
export async function envoyerNotificationFlags(destinataires, { fournisseurNom, numeroFacture, total, flags, factureId }) {
  if (!destinataires || destinataires.length === 0) return { envoye: false, raison: 'Aucun destinataire' };
  if (!flags || flags.length === 0) return { envoye: false, raison: 'Aucun flag' };

  const lienFacture = `${process.env.NEXT_PUBLIC_APP_URL || ''}/facturation-fournisseurs/`;

  const html = `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;font-family:Calibri, Arial, sans-serif;">
    <tr><td style="background:#14213D;padding:18px 24px;">
      <span style="color:#fff;font-size:16px;font-weight:700;">⚠️ Validation factures de fournisseurs — vérification requise</span>
    </td></tr>
    <tr><td style="padding:20px 24px;">
      <p style="font-size:13px;color:#222;">
        Une facture vient d'être importée et présente ${flags.length} élément(s) à vérifier avant approbation.
      </p>
      <p style="font-size:13px;color:#222;">
        <b>Fournisseur :</b> ${fournisseurNom || '—'}<br/>
        <b>N° facture :</b> ${numeroFacture || '(non lu automatiquement)'}<br/>
        <b>Total :</b> ${total != null ? total + ' $' : '—'}
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:14px 0;font-size:12.5px;">
        <tr><td style="background:#14213D;color:#fff;padding:6px 10px;font-weight:600;">Type</td>
            <td style="background:#14213D;color:#fff;padding:6px 10px;font-weight:600;">Détail</td></tr>
        ${flags.map(ligneFlag).join('')}
      </table>
      <a href="${lienFacture}" style="display:inline-block;background:#14213D;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:13px;font-weight:600;">
        Ouvrir Validation factures de fournisseurs
      </a>
    </td></tr>
    <tr><td style="padding:12px 24px;background:#F7F8FA;border-top:1px solid #EDEFF1;">
      <span style="font-size:11px;color:#9aa5c0;">Les Entreprises PEP2000 inc. — courriel envoyé automatiquement par le Toolbox PEP.</span>
    </td></tr>
  </table>`;

  const resultat = await resend.emails.send({
    from: 'Validation factures de fournisseurs PEP <notifications@toolbox-pep.com>',
    to: destinataires,
    subject: `⚠️ Facture à vérifier — ${fournisseurNom || 'fournisseur'} (${flags.length} flag${flags.length > 1 ? 's' : ''})`,
    html,
  });

  if (resultat?.error) {
    throw new Error(`Resend a refusé l'envoi : ${resultat.error.message || JSON.stringify(resultat.error)}`);
  }
  return { envoye: true, id: resultat?.data?.id || null };
}

// Trouve les courriels des personnes ayant le rôle "directeur" (feature
// approbation_directeur) pour cette app — ce sont elles qu'on notifie
// par défaut sur un flag. adminPublic = client service_role SANS schéma
// forcé (accès à public.pep_user_features + auth.admin).
// Retourne la liste des user_id (pas les courriels) ayant le rôle
// "directeur" pour cette app — utilisé pour l'envoi push (qui n'a pas
// besoin de courriel, juste de l'identifiant Supabase Auth).
export async function trouverUtilisateursDirecteur(adminPublic) {
  const { data: featRows } = await adminPublic
    .from('pep_user_features')
    .select('user_id')
    .eq('app_slug', 'facturation-fournisseurs')
    .eq('feature_key', 'approbation_directeur');
  return (featRows || []).map((r) => r.user_id);
}

export async function trouverDestinatairesDirecteur(adminPublic) {
  const { data: featRows } = await adminPublic
    .from('pep_user_features')
    .select('user_id')
    .eq('app_slug', 'facturation-fournisseurs')
    .eq('feature_key', 'approbation_directeur');
  if (!featRows || featRows.length === 0) return [];

  const courriels = [];
  for (const row of featRows) {
    try {
      const { data } = await adminPublic.auth.admin.getUserById(row.user_id);
      if (data?.user?.email) courriels.push(data.user.email);
    } catch (err) {
      // ignore silencieusement un utilisateur introuvable
    }
  }
  return courriels;
}

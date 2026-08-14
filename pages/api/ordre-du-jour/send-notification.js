// Fonction serveur Vercel — jamais exécutée dans le navigateur, donc la clé
// Resend (RESEND_API_KEY) reste toujours privée.
//
// Envoie une notification par courriel à chaque fois qu'une fiche est
// soumise (nouvelle ou modifiée). Phase 3 : la liste des destinataires
// n'est plus codée en dur — ce sont tous les membres de ordre_du_jour.profils
// dont le rôle n'est pas "contremaitre" (mêmes destinataires que les
// notifications internes de l'app, voir notifierNouvelleRequete dans
// components/ordre-du-jour/App.jsx), qui ont un courriel enregistré, et qui
// n'ont pas désactivé les courriels (préférence stockée par user_id).

import { createClient } from "@supabase/supabase-js";

const LOGO_URL = "https://toolbox-pep.com/_static/ordre-du-jour/logo-pep.png";

async function destinatairesActifs() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return [];
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      db: { schema: "ordre_du_jour" },
    });
    const { data: membres, error } = await supabase
      .from("profils")
      .select("user_id, email")
      .neq("role", "contremaitre")
      .not("email", "is", null);
    if (error) throw error;

    const emails = [];
    for (const m of membres || []) {
      const { data } = await supabase.from("kv_store").select("value").eq("key", `pref-courriel:${m.user_id}`).maybeSingle();
      if (data?.value !== "inactif") emails.push(m.email); // actif par défaut si aucune préférence
    }
    return emails;
  } catch (e) {
    return []; // en cas d'erreur, on n'envoie à personne plutôt que de deviner
  }
}

function formaterDateFr(iso) {
  try {
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric" });
  } catch (e) {
    return iso;
  }
}

function badge(texte, bg) {
  return `<span style="display:inline-block; background-color:${bg}; color:#ffffff; font-weight:bold; font-size:11px; letter-spacing:0.5px; text-transform:uppercase; padding:4px 10px; border-radius:2px; font-family:Arial,sans-serif;">${texte}</span>`;
}

// Affiche une liste d'items un par ligne (label à gauche, valeur en gras à droite).
function lignesItems(items) {
  if (!items || !items.length) return `<span style="color:#8a93a0;">Aucun</span>`;
  return items.map((it, i) => `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; ${i > 0 ? "margin-top:8px;" : ""}">
      <tr>
        <td style="font-size:14px; color:#15181B;">${it.label}${it.commentaire ? ` <span style="color:#8a93a0; font-size:12.5px;">(${it.commentaire})</span>` : ""}</td>
        <td align="right" style="font-size:14px; color:#15181B; font-weight:bold;">${it.qte}</td>
      </tr>
    </table>
  `).join("");
}

function section(titre, contenuHtml, accentColor) {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px; border-collapse:collapse;">
    <tr>
      <td width="4" bgcolor="${accentColor}" style="font-size:0; line-height:0;">&nbsp;</td>
      <td bgcolor="#ffffff" style="border:1px solid #D7DBE0; border-left:none; padding:14px 18px; font-family:Arial,sans-serif;">
        <div style="font-size:11px; font-weight:bold; text-transform:uppercase; letter-spacing:0.5px; color:#495260; margin-bottom:8px;">${titre}</div>
        <div style="font-size:14px; color:#15181B; line-height:1.6;">${contenuHtml}</div>
      </td>
    </tr>
  </table>
  `;
}

function construireHtml({ nom, dateTexte, chantier, personnel, machinerie, camions, diesel }) {
  const personnelHtml = lignesItems(personnel);

  const machinerieHtml = [
    machinerie?.ajout?.length
      ? badge("Ajout", "#3C8C5D") + " " + machinerie.ajout.map((m) => `${m.label} : <b>${m.qte}</b>${m.commentaire ? ` <span style="color:#8a93a0; font-size:12.5px;">(${m.commentaire})</span>` : ""}`).join(", ")
      : "",
    machinerie?.retrait?.length
      ? `<br/><br/>` + badge("Retrait", "#C23B3B") + " " + machinerie.retrait.map((m) => `${m.label} : <b>${m.qte}</b>${m.commentaire ? ` <span style="color:#8a93a0; font-size:12.5px;">(${m.commentaire})</span>` : ""}`).join(", ")
      : "",
  ].filter(Boolean).join("") || `<span style="color:#8a93a0;">Aucun changement</span>`;

  const camionsHtml = lignesItems([
    { label: "12 roues", qte: camions?.douze || 0 },
    { label: "2 essieux", qte: camions?.deux || 0 },
    { label: "3 essieux", qte: camions?.trois || 0 },
  ]);

  const dieselHtml = diesel?.requis === "oui"
    ? `${badge("Oui", "#F0A202")}` +
      `<div style="margin-top:10px;">` +
      lignesItems([
        { label: "Grosses machines", qte: diesel.grosses || 0 },
        { label: "Petites machines", qte: diesel.petites || 0 },
      ]) +
      `</div>` +
      (diesel.commentaire ? `<div style="margin-top:10px; color:#495260; font-size:13px;">${diesel.commentaire}</div>` : "")
    : `<span style="color:#8a93a0;">Non</span>`;

  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#EDEFF1; border-collapse:collapse;">
  <tr><td style="background-color:#E4022E; font-size:0; line-height:0; height:4px;">&nbsp;</td></tr>
  <tr>
    <td style="background-color:#0F2138; padding:20px 22px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td width="44" valign="middle">
            <img src="${LOGO_URL}" width="40" height="40" alt="PEP2000" style="display:block; border:0;" />
          </td>
          <td valign="middle" style="padding-left:12px; font-family:Arial,sans-serif;">
            <div style="font-weight:bold; font-size:18px; color:#ffffff;">PEP2000 &mdash; ORDRE DU JOUR</div>
            <div style="font-size:12.5px; color:#B9C2CC; margin-top:2px;">Nouvelle requête soumise par ${nom}</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:18px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border:1px solid #D7DBE0; margin-bottom:14px; border-collapse:collapse;">
        <tr>
          <td style="padding:12px 18px; font-family:Arial,sans-serif; font-size:13px; color:#495260;">Pour le</td>
          <td align="right" style="padding:12px 18px; font-family:Arial,sans-serif; font-size:13px; font-weight:bold; color:#15181B;">${dateTexte}</td>
        </tr>
        <tr>
          <td style="padding:0 18px 12px; font-family:Arial,sans-serif; font-size:13px; color:#495260;">Chantier</td>
          <td align="right" style="padding:0 18px 12px; font-family:Arial,sans-serif; font-size:13px; font-weight:bold; color:#15181B;">${chantier || "—"}</td>
        </tr>
      </table>

      ${section("Main d'&oelig;uvre", personnelHtml, "#0F2138")}
      ${section("Machinerie", machinerieHtml, "#3C8C5D")}
      ${section("Camions", camionsHtml, "#0F2138")}
      ${section("Diesel (Fuel)", dieselHtml, "#F0A202")}

      <div style="padding:12px 4px 4px; font-family:Arial,sans-serif; font-size:11.5px; color:#8a93a0; text-align:center;">
        PEP2000 &mdash; Ordre du jour
      </div>
    </td>
  </tr>
</table>
  `;
}

function construireHtmlCommentaire({ nom, dateTexte, chantier, commentateur, commentaire }) {
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#EDEFF1; border-collapse:collapse;">
  <tr><td style="background-color:#E4022E; font-size:0; line-height:0; height:4px;">&nbsp;</td></tr>
  <tr>
    <td style="background-color:#0F2138; padding:20px 22px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td width="44" valign="middle">
            <img src="${LOGO_URL}" width="40" height="40" alt="PEP2000" style="display:block; border:0;" />
          </td>
          <td valign="middle" style="padding-left:12px; font-family:Arial,sans-serif;">
            <div style="font-weight:bold; font-size:18px; color:#ffffff;">PEP2000 &mdash; ORDRE DU JOUR</div>
            <div style="font-size:12.5px; color:#B9C2CC; margin-top:2px;">Commentaire de ${commentateur} sur la requête de ${nom}</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:18px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border:1px solid #D7DBE0; margin-bottom:14px; border-collapse:collapse;">
        <tr>
          <td style="padding:12px 18px; font-family:Arial,sans-serif; font-size:13px; color:#495260;">Pour le</td>
          <td align="right" style="padding:12px 18px; font-family:Arial,sans-serif; font-size:13px; font-weight:bold; color:#15181B;">${dateTexte}</td>
        </tr>
        <tr>
          <td style="padding:0 18px 12px; font-family:Arial,sans-serif; font-size:13px; color:#495260;">Chantier</td>
          <td align="right" style="padding:0 18px 12px; font-family:Arial,sans-serif; font-size:13px; font-weight:bold; color:#15181B;">${chantier || "—"}</td>
        </tr>
      </table>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; margin-bottom:10px;">
        <tr>
          <td width="4" bgcolor="#F0A202" style="font-size:0; line-height:0;">&nbsp;</td>
          <td bgcolor="#ffffff" style="border:1px solid #D7DBE0; border-left:none; padding:14px 18px; font-family:Arial,sans-serif;">
            <div style="font-size:11px; font-weight:bold; text-transform:uppercase; letter-spacing:0.5px; color:#8a5a00; margin-bottom:8px;">Commentaire de ${commentateur}</div>
            <div style="font-size:14.5px; color:#15181B; line-height:1.6;">${commentaire}</div>
          </td>
        </tr>
      </table>

      <div style="padding:12px 4px 4px; font-family:Arial,sans-serif; font-size:11.5px; color:#8a93a0; text-align:center;">
        PEP2000 &mdash; Ordre du jour
      </div>
    </td>
  </tr>
</table>
  `;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const { nom, date, chantier, personnel, machinerie, camions, diesel, commentateur, commentaire } = req.body || {};
  if (!nom || !date) {
    return res.status(400).json({ error: "Champs manquants (nom, date requis)" });
  }
  if (!process.env.RESEND_API_KEY) {
    return res.status(500).json({ error: "RESEND_API_KEY n'est pas configurée sur le serveur." });
  }

  const emails = await destinatairesActifs();
  if (emails.length === 0) {
    return res.status(200).json({ success: true, skipped: true, message: "Personne n'a activé les notifications par courriel." });
  }

  const dateTexte = formaterDateFr(date);
  const titreOriginal = `Ordre du jour - ${dateTexte} - ${nom}`;
  const estCommentaire = !!(commentateur && commentaire);
  const sujet = estCommentaire ? `IMPORTANT - ${commentateur} - ${titreOriginal}` : titreOriginal;
  const html = estCommentaire
    ? construireHtmlCommentaire({ nom, dateTexte, chantier, commentateur, commentaire })
    : construireHtml({ nom, dateTexte, chantier, personnel, machinerie, camions, diesel });

  try {
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Dispatch PEP - Application <dispatch@toolbox-pep.com>",
        to: emails,
        subject: sujet,
        html,
      }),
    });

    const data = await resendRes.json();

    if (!resendRes.ok) {
      return res.status(resendRes.status).json({ error: data?.message || "Échec de l'envoi", details: data });
    }

    return res.status(200).json({ success: true, id: data.id });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

// Fonction déclenchée automatiquement par Vercel Cron (voir vercel.json) à
// 12h00 et 16h00, heure de l'Est (été). Envoie une notification push à tous
// les contremaîtres qui n'ont pas encore soumis (ou marqué "Aucun travaux")
// leur requête pour le lendemain.
//
// ⚠️ Rappel par courriel PAS encore inclus ici — on n'a pas encore les
// adresses courriel individuelles de chaque contremaître (voir point 21 du
// backlog). Seul le push est envoyé pour l'instant.

import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

// Liste des contremaîtres — à garder synchronisée avec USERS dans src/App.jsx.
const CONTREMAITRES = [
  "Biagio Pirro", "Brian Labelle", "Claude Cyr", "Daniel Boudreault",
  "Françis Jobin", "François Gosselin", "Jérémy Juneau", "Jocelyn Denicolai",
  "Jonathan Baulne", "Marco Chiovetti", "Michel Coulombe", "Martin Guillemette",
  "Patrick Courteau", "Patrick Desmeules", "Dominic Hamel",
];

function slugify(s) {
  return (s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

// Date de demain au format YYYY-MM-DD, en heure de l'Est.
function demainMontreal(joursFeries = []) {
  const maintenant = new Date();
  const montreal = new Date(maintenant.toLocaleString("en-US", { timeZone: "America/Montreal" }));
  montreal.setDate(montreal.getDate() + 1);
  const versISO = (dt) => {
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const d = String(dt.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };
  // saute les fins de semaine ET les jours fériés enregistrés
  while (montreal.getDay() === 0 || montreal.getDay() === 6 || joursFeries.includes(versISO(montreal))) {
    montreal.setDate(montreal.getDate() + 1);
  }
  return versISO(montreal);
}

export default async function handler(req, res) {
  const { VAPID_PUBLIC_KEY: pub, ORDREDUJOUR_VAPID_PUBLIC_KEY, ORDREDUJOUR_VAPID_PRIVATE_KEY } = process.env;
  const VAPID_PUBLIC_KEY = ORDREDUJOUR_VAPID_PUBLIC_KEY || pub;
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!VAPID_PUBLIC_KEY || !ORDREDUJOUR_VAPID_PRIVATE_KEY) {
    return res.status(500).json({ error: "Clés VAPID non configurées sur le serveur." });
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(500).json({ error: "Configuration Supabase manquante sur le serveur." });
  }

  webpush.setVapidDetails("mailto:wdubreuil@pep2000.com", VAPID_PUBLIC_KEY, ORDREDUJOUR_VAPID_PRIVATE_KEY);
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    db: { schema: "ordre_du_jour" },
  });

  const estTest = req.method === "POST" && req.body?.test === true;

  if (estTest) {
    const payloadTest = JSON.stringify({
      title: "PEP2000 — Ordre du jour (TEST)",
      body: "Ceci est un aperçu du rappel — N'oublie pas de soumettre ta requête pour demain (ou signale « Aucun travaux »).",
    });
    let envoyesTest = 0;
    const erreursPush = [];
    try {
      const { data: pushData } = await supabase.from("kv_store").select("key, value").like("key", "push:william-dubreuil:%");
      await Promise.all(
        (pushData || []).map(async (row) => {
          try {
            await webpush.sendNotification(JSON.parse(row.value), payloadTest, { TTL: 60, urgency: "high" });
            envoyesTest++;
          } catch (e) {
            erreursPush.push({ statusCode: e.statusCode, message: e.body || e.message });
          }
        })
      );

      if (process.env.RESEND_API_KEY) {
        const LOGO_URL = "https://toolbox-pep.com/_static/ordre-du-jour/logo-pep.png";
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "Dispatch PEP - Application <dispatch@pep2000.app>",
            to: ["wdubreuil@pep2000.com"],
            subject: "TEST — Aperçu du rappel automatique",
            html: `
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
            <div style="font-size:12.5px; color:#B9C2CC; margin-top:2px;">Rappel automatique (aper&ccedil;u de test)</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:18px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; margin-bottom:10px;">
        <tr>
          <td width="4" bgcolor="#F0A202" style="font-size:0; line-height:0;">&nbsp;</td>
          <td bgcolor="#ffffff" style="border:1px solid #D7DBE0; border-left:none; padding:14px 18px; font-family:Arial,sans-serif;">
            <div style="font-size:11px; font-weight:bold; text-transform:uppercase; letter-spacing:0.5px; color:#8a5a00; margin-bottom:8px;">Ceci est un aper&ccedil;u de test</div>
            <div style="font-size:14.5px; color:#15181B; line-height:1.6;">
              Voici ce que les contrema&icirc;tres verront quand ils n'ont pas encore soumis leur requ&ecirc;te du lendemain :<br/><br/>
              <i>&laquo; N'oublie pas de soumettre ta requ&ecirc;te pour demain (ou signale &laquo; Aucun travaux &raquo;). &raquo;</i>
            </div>
          </td>
        </tr>
      </table>
      <div style="padding:12px 4px 4px; font-family:Arial,sans-serif; font-size:11.5px; color:#8a93a0; text-align:center;">
        PEP2000 &mdash; Ordre du jour
      </div>
    </td>
  </tr>
</table>
            `,
          }),
        });
      }
      return res.status(200).json({
        success: true,
        test: true,
        abonnementsTrouves: (await supabase.from("kv_store").select("key").like("key", "push:william-dubreuil:%")).data?.length || 0,
        pushEnvoyes: envoyesTest,
        erreursPush,
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  try {
    let joursFeries = [];
    try {
      const { data: feriesData } = await supabase.from("kv_store").select("value").eq("key", "jours-feries").maybeSingle();
      if (feriesData?.value) joursFeries = JSON.parse(feriesData.value);
    } catch (e) { /* aucun jour férié enregistré encore */ }

    const demain = demainMontreal(joursFeries);

    // Fiches déjà soumises pour demain (incluant "Aucun travaux")
    const { data: fichesData, error: erreurFiches } = await supabase
      .from("kv_store")
      .select("key")
      .like("key", `fiche:${demain}:%`);
    if (erreurFiches) throw erreurFiches;

    const slugsRepondu = new Set(
      (fichesData || []).map((row) => {
        const parts = row.key.split(":"); // fiche:DATE:slug ou fiche:DATE:slug::n
        return (parts[2] || "").split("::")[0];
      })
    );

    const enAttente = CONTREMAITRES.filter((nom) => !slugsRepondu.has(slugify(nom)));

    if (enAttente.length === 0) {
      return res.status(200).json({ success: true, message: "Tout le monde a déjà répondu.", envoyes: 0 });
    }

    // Abonnements push de ceux qui n'ont pas répondu
    const { data: pushData, error: erreurPush } = await supabase
      .from("kv_store")
      .select("key, value")
      .like("key", "push:%");
    if (erreurPush) throw erreurPush;

    const payload = JSON.stringify({
      title: "PEP2000 — Ordre du jour",
      body: "N'oublie pas de soumettre ta requête pour demain (ou signale « Aucun travaux »).",
    });

    let envoyes = 0;
    const expirees = [];

    await Promise.all(
      (pushData || []).map(async (row) => {
        const parts = row.key.split(":"); // push:slug:hash
        const slugAbonne = parts[1];
        if (!enAttente.some((nom) => slugify(nom) === slugAbonne)) return;
        try {
          const sub = JSON.parse(row.value);
          await webpush.sendNotification(sub, payload, { TTL: 60, urgency: "high" });
          envoyes++;
        } catch (e) {
          if (e.statusCode === 410 || e.statusCode === 404) expirees.push(row.key);
        }
      })
    );

    if (expirees.length) {
      await supabase.from("kv_store").delete().in("key", expirees);
    }

    return res.status(200).json({ success: true, demain, enAttente, envoyes });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

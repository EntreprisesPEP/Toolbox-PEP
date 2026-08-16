import { createClient } from '@supabase/supabase-js';
import { DESTINATAIRES_FIXES_RAW } from '../../../lib/arpentage-destinataires';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

// ⚠️ Doit être une adresse du domaine toolbox-pep.com déjà vérifié dans
// Resend (le même domaine qui sert déjà les courriels de mot de passe).
const EXPEDITEUR = 'Toolbox PEP <notifications@toolbox-pep.com>';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Methode non supportee' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Non autorise' });
  }

  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Configuration Supabase manquante sur le serveur.' });
  }
  if (!RESEND_API_KEY) {
    return res.status(500).json({ error: "Configuration Resend manquante sur le serveur (variable RESEND_API_KEY absente)." });
  }

  // Vérifie que l'appelant est bien connecté (même patron que
  // pages/api/administration/users.js) avant de faire quoi que ce soit.
  const supabaseAuth = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await supabaseAuth.auth.getUser();
  if (userErr || !userData?.user) {
    return res.status(401).json({ error: 'Non autorise' });
  }

  const { numero } = req.body || {};
  if (!numero) {
    return res.status(400).json({ error: 'numero manquant' });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    const { data: demande, error: eDemande } = await admin
      .schema('arpentage')
      .from('demandes')
      .select('*')
      .eq('numero', numero)
      .single();
    if (eDemande || !demande) throw new Error('Demande introuvable');

    const { data: projet } = await admin
      .schema('liste_projets')
      .from('projets')
      .select('no, nom, client, charge, courriel_cp, adresse')
      .eq('no', demande.projet_no)
      .maybeSingle();

    let emailsAdditionnels = [];
    if (demande.personnes_additionnelles && demande.personnes_additionnelles.length > 0) {
      const { data: personnel } = await admin
        .schema('liste_projets')
        .from('personnel')
        .select('nom, courriel')
        .in('nom', demande.personnes_additionnelles);
      emailsAdditionnels = (personnel || []).map((p) => p.courriel).filter(Boolean);
    }

    const emailsBruts = [
      ...DESTINATAIRES_FIXES_RAW.map((p) => p.email),
      demande.demandeur_email,
      projet?.courriel_cp,
      ...emailsAdditionnels,
    ].filter(Boolean);

    // Dédoublonnage (insensible à la casse) — évite qu'une même personne
    // reçoive 2 fois le même courriel.
    const vus = new Set();
    const destinataires = [];
    for (const courriel of emailsBruts) {
      const cle = courriel.trim().toLowerCase();
      if (!vus.has(cle)) { vus.add(cle); destinataires.push(courriel); }
    }

    const sujet = `Demande d'arpentage #${demande.numero} — ${projet?.no || ''} ${projet?.nom || ''}`.trim();
    const html = `
      <div style="font-family: Calibri, Arial, sans-serif; font-size: 14px; color: #14213D; line-height: 1.5;">
        <h2 style="color:#C41230; margin-bottom: 4px;">Demande d'arpentage #${demande.numero}</h2>
        <p style="color:#6b7480; margin-top:0;">${demande.type_demande}</p>
        <table style="border-collapse: collapse;">
          <tr><td style="padding:3px 12px 3px 0; color:#6b7480;">Projet</td><td>${projet?.no || ''} — ${projet?.nom || ''}</td></tr>
          <tr><td style="padding:3px 12px 3px 0; color:#6b7480;">Demandeur</td><td>${demande.nom}</td></tr>
          <tr><td style="padding:3px 12px 3px 0; color:#6b7480;">Endroit des travaux</td><td>${demande.endroit}</td></tr>
          <tr><td style="padding:3px 12px 3px 0; color:#6b7480;">Date requise</td><td>${demande.date_requise}</td></tr>
          <tr><td style="padding:3px 12px 3px 0; color:#6b7480;">Date autorisée</td><td>${demande.date_autorisee}</td></tr>
          ${demande.plan_mention ? `<tr><td style="padding:3px 12px 3px 0; color:#6b7480;">Plan</td><td>${demande.plan_mention}</td></tr>` : ''}
          ${demande.infos_complementaires ? `<tr><td style="padding:3px 12px 3px 0; color:#6b7480;">Infos complémentaires</td><td>${demande.infos_complementaires}</td></tr>` : ''}
        </table>
        <p style="margin-top:20px;">
          <a href="https://www.toolbox-pep.com/demandes-arpentage/" style="color:#C41230;">Voir dans le Toolbox PEP →</a>
        </p>
      </div>
    `;

    const reponseResend = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: EXPEDITEUR,
        to: destinataires,
        subject: sujet,
        html,
      }),
    });

    if (!reponseResend.ok) {
      const detail = await reponseResend.text();
      throw new Error(`Resend a refusé l'envoi : ${detail}`);
    }

    return res.status(200).json({ ok: true, destinataires });
  } catch (err) {
    console.error('Erreur notification demande arpentage:', err);
    return res.status(500).json({ error: err.message || 'Erreur inconnue' });
  }
}

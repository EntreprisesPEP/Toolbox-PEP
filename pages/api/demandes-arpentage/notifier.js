import { createClient } from '@supabase/supabase-js';
import { DESTINATAIRES_FIXES_RAW } from '../../../lib/arpentage-destinataires';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

// Doit être une adresse du domaine toolbox-pep.com déjà vérifié dans
// Resend. Seul le nom d'affichage change ("Arpentage PEP") — les autres
// courriels du Toolbox (mot de passe, etc.) ne sont pas touchés, ils
// passent par un mécanisme complètement séparé.
const EXPEDITEUR = 'Arpentage PEP <notifications@toolbox-pep.com>';

const LOGO_PEP_URL = 'https://www.toolbox-pep.com/_static/planification-hebdomadaire/logo-pep.png';

const MOIS_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

function formatDateFr(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${parseInt(d, 10)} ${MOIS_FR[parseInt(m, 10) - 1]} ${y}`;
}

function joursEntre(dateA, dateB) {
  const a = new Date(dateA + 'T00:00:00');
  const b = new Date(dateB + 'T00:00:00');
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

function texteDelai(dateJour, dateRequise) {
  if (!dateJour || !dateRequise) return '—';
  const delai = joursEntre(dateJour, dateRequise);
  if (delai < 0) return `Dépassé de ${Math.abs(delai)} jour${Math.abs(delai) > 1 ? 's' : ''}`;
  if (delai === 0) return "Aujourd'hui même";
  return `${delai} jour${delai > 1 ? 's' : ''}`;
}

function texteFichiers(fichiers) {
  const n = (fichiers || []).length;
  if (n === 0) return 'Aucun attachement';
  if (n === 1) return "Voir ci-joint l'attachement (1)";
  return `Voir ci-joint les (${n}) attachements`;
}

function ouTiret(valeur) {
  return (valeur === null || valeur === undefined || valeur === '') ? '—' : valeur;
}

function construireHtml(demande, projet) {
  const projetTexte = projet ? `${projet.no} — ${projet.nom}` : ouTiret(demande.projet_no);

  const lignes = [
    ['Demandeur', demande.nom, true],
    ['Projet', projetTexte],
    ['Chargé de projet', ouTiret(projet?.charge)],
    ['Surintendant', ouTiret(projet?.surintendant)],
    ['Endroit des travaux', ouTiret(demande.endroit)],
    ['Date requise', formatDateFr(demande.date_requise), true],
    ['Date autorisée', formatDateFr(demande.date_autorisee)],
    ['Délai de traitement', texteDelai(demande.date_jour, demande.date_requise)],
    ['Type de demande', ouTiret(demande.type_demande)],
    ['Plan', ouTiret(demande.plan_mention)],
    ['Infos complémentaires', ouTiret(demande.infos_complementaires)],
    ['Fichiers ou photos', texteFichiers(demande.fichiers)],
  ];

  const lignesHtml = lignes.map(([label, valeur, gras], i) => `
    <tr>
      <td style="padding:10px 0; ${i < lignes.length - 1 ? 'border-bottom:1px solid #EDEFF1;' : ''} color:#6b7480; font-size:13px; width:40%; vertical-align:top;">${label}</td>
      <td style="padding:10px 0; ${i < lignes.length - 1 ? 'border-bottom:1px solid #EDEFF1;' : ''} color:#14213D; font-size:13.5px; ${gras ? 'font-weight:600;' : ''}">${valeur}</td>
    </tr>
  `).join('');

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0; padding:24px; background:#EDEFF1; font-family: Calibri, Arial, sans-serif;">
  <div style="max-width:600px; margin:0 auto; background:#ffffff; border-radius:8px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.08);">

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0F2138; border-top:4px solid #C41230;">
      <tr>
        <td style="padding:18px 28px;">
          <table role="presentation" cellpadding="0" cellspacing="0">
            <tr>
              <td valign="middle" width="76" style="padding-right:16px;">
                <img src="${LOGO_PEP_URL}" alt="Les Entreprises PEP" height="76" style="display:block; height:76px; width:auto;">
              </td>
              <td valign="middle">
                <div style="color:#AEC0F5; font-size:12px; letter-spacing:0.14em; font-weight:600;">LES ENTREPRISES</div>
                <div style="color:#ffffff; font-size:24px; font-weight:700; letter-spacing:0.02em; margin-top:2px;">PEP2000 INC.</div>
                <div style="color:#9AA5C0; font-size:13px; margin-top:4px;">Demande d'arpentage</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding:28px;">
          <h1 style="margin:0 0 20px; font-size:20px; color:#14213D; font-weight:700; text-transform:uppercase; letter-spacing:0.02em;">
            Demande d'arpentage - #${demande.numero}
          </h1>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            ${lignesHtml}
          </table>
        </td>
      </tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F8FA; border-top:1px solid #EDEFF1;">
      <tr>
        <td style="padding:16px 28px; text-align:center; color:#9aa5c0; font-size:11px;">
          Ce courriel est envoyé automatiquement à plusieurs destinataires par le Toolbox PEP. Pour que ta réponse rejoigne tout le monde, ne réponds pas seulement à cette adresse, faites répondre à tous.
        </td>
      </tr>
    </table>

  </div>
</body>
</html>
  `;
}

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

  const supabaseAuth = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await supabaseAuth.auth.getUser();
  if (userErr || !userData?.user) {
    return res.status(401).json({ error: 'Non autorise' });
  }

  const { numero } = req.body || {};
  if (!numero) {
    return res.status(400).json({ error: `numero manquant ou invalide dans la requête (reçu: ${JSON.stringify(req.body)})` });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    const { data: demande, error: eDemande } = await admin
      .schema('arpentage')
      .from('demandes')
      .select('*')
      .eq('numero', numero)
      .maybeSingle();

    if (eDemande) {
      console.error('Erreur lecture demande (numero=' + numero + '):', eDemande);
      throw new Error(`Erreur lecture demande #${numero} : ${eDemande.message} (code ${eDemande.code || '?'})`);
    }
    if (!demande) {
      throw new Error(`Demande #${numero} introuvable dans arpentage.demandes.`);
    }

    const { data: projet } = await admin
      .schema('liste_projets')
      .from('projets')
      .select('no, nom, client, charge, courriel_cp, adresse, surintendant')
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

    const vus = new Set();
    const destinataires = [];
    for (const courriel of emailsBruts) {
      const cle = courriel.trim().toLowerCase();
      if (!vus.has(cle)) { vus.add(cle); destinataires.push(courriel); }
    }

    const sujet = `Arpentage - Demande ${demande.numero} - ${projet?.no || demande.projet_no}`;
    const html = construireHtml(demande, projet);

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

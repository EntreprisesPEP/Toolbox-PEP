import { createClient } from '@supabase/supabase-js';
import { DESTINATAIRES_FIXES_RAW } from '../../../lib/garage-destinataires';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

// Doit être une adresse du domaine toolbox-pep.com déjà vérifié dans
// Resend. Seul le nom d'affichage change ("Demande garage PEP") — les autres
// courriels du Toolbox (mot de passe, etc.) ne sont pas touchés, ils
// passent par un mécanisme complètement séparé.
const EXPEDITEUR = 'Demande garage PEP <notifications@toolbox-pep.com>';

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

function texteFichiers(fichiers) {
  const n = (fichiers || []).length;
  if (n === 0) return 'Aucun attachement';
  if (n === 1) return "Voir ci-joint l'attachement (1)";
  return `Voir ci-joint les (${n}) attachements`;
}

const BUCKET_FICHIERS = 'garage-fichiers';
const TAILLE_MAX_PIECE_JOINTE = 8 * 1024 * 1024; // 8 Mo par fichier, pour rester sous la limite de taille des courriels

async function construireAttachments(admin, chemins) {
  const attachments = [];
  const rapport = [];
  for (const chemin of chemins || []) {
    try {
      const { data: blob, error } = await admin.storage.from(BUCKET_FICHIERS).download(chemin);
      if (error || !blob) {
        console.error('Piece jointe introuvable dans le stockage:', chemin, error);
        rapport.push({ chemin, statut: 'introuvable', detail: error?.message || 'inconnu' });
        continue;
      }
      const arrayBuffer = await blob.arrayBuffer();
      if (arrayBuffer.byteLength > TAILLE_MAX_PIECE_JOINTE) {
        console.error('Piece jointe trop volumineuse, ignoree:', chemin, arrayBuffer.byteLength);
        rapport.push({ chemin, statut: 'trop_volumineux', tailleOctets: arrayBuffer.byteLength });
        continue;
      }
      const contenuBase64 = Buffer.from(arrayBuffer).toString('base64');
      attachments.push({ filename: chemin.split('/').pop(), content: contenuBase64 });
      rapport.push({ chemin, statut: 'inclus', tailleOctets: arrayBuffer.byteLength });
    } catch (e) {
      console.error('Erreur telechargement piece jointe:', chemin, e);
      rapport.push({ chemin, statut: 'erreur', detail: e.message });
    }
  }
  return { attachments, rapport };
}

function ouTiret(valeur) {
  return (valeur === null || valeur === undefined || valeur === '') ? '—' : valeur;
}

const COULEURS_PRIORITE = {
  'URGENT': '#c41230',
  'SEMI-URGENT': '#f0a202',
  'NON-URGENT': '#6b7488',
};

// Le contenu vient d'un formulaire : on echappe avant de l'inserer dans le HTML
// du courriel, sinon un caractere comme < casserait la mise en page.
function echapper(valeur) {
  return String(valeur === null || valeur === undefined ? '' : valeur)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function badgePriorite(priorite) {
  const couleur = COULEURS_PRIORITE[priorite] || '#6b7480';
  return `<span style="display:inline-block; background:${couleur}; color:#ffffff; border-radius:12px; padding:3px 12px; font-size:12px; font-weight:700; letter-spacing:0.04em;">${echapper(priorite || '—')}</span>`;
}

function construireHtml(demande, projet) {
  const projetTexte = projet ? `${projet.no} — ${projet.nom}` : ouTiret(demande.projet_no);

  const details = (demande.details || []).filter(Boolean);
  const detailsHtml = details.length === 0
    ? '—'
    : details.map((d) => `&bull; ${echapper(d)}`).join('<br>');

  const lignes = [
    ['Demandeur', echapper(demande.nom), true],
    ['Date de la demande', formatDateFr(demande.date_jour)],
    ['Niveau de priorité', badgePriorite(demande.priorite), true],
    ['Objet (numéro du véhicule ou autre)', echapper(ouTiret(demande.objet)), true],
    ['Projet', echapper(projetTexte)],
    ['Chargé de projet', echapper(ouTiret(projet?.charge))],
    ['Surintendant', echapper(ouTiret(projet?.surintendant))],
    ['Détails', detailsHtml],
    ['Infos complémentaires', echapper(ouTiret(demande.infos_complementaires))],
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
                <div style="color:#9AA5C0; font-size:13px; margin-top:4px;">Demande garage</div>
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
            Demande garage - #${demande.numero}
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
      .schema('garage')
      .from('demandes')
      .select('*')
      .eq('numero', numero)
      .maybeSingle();

    if (eDemande) {
      console.error('Erreur lecture demande (numero=' + numero + '):', eDemande);
      throw new Error(`Erreur lecture demande #${numero} : ${eDemande.message} (code ${eDemande.code || '?'})`);
    }
    if (!demande) {
      throw new Error(`Demande #${numero} introuvable dans garage.demandes.`);
    }

    let projet = null;
    if (demande.projet_no) {
      const { data } = await admin
        .schema('liste_projets')
        .from('projets')
        .select('no, nom, client, charge, courriel_cp, adresse, surintendant')
        .eq('no', demande.projet_no)
        .maybeSingle();
      projet = data || null;
    }

    const emailsTo = DESTINATAIRES_FIXES_RAW.filter((p) => p.role === 'to').map((p) => p.email);
    const emailsCcBruts = [
      ...DESTINATAIRES_FIXES_RAW.filter((p) => p.role !== 'to').map((p) => p.email),
      demande.demandeur_email,
      projet?.courriel_cp,
    ].filter(Boolean);

    function dedupeCourriels(liste, exclureAussi = []) {
      const exclus = new Set(exclureAussi.map((e) => e.trim().toLowerCase()));
      const vus = new Set();
      const resultat = [];
      for (const courriel of liste) {
        const cle = courriel.trim().toLowerCase();
        if (vus.has(cle) || exclus.has(cle)) continue;
        vus.add(cle);
        resultat.push(courriel);
      }
      return resultat;
    }

    const destinatairesTo = dedupeCourriels(emailsTo);
    const destinatairesCc = dedupeCourriels(emailsCcBruts, destinatairesTo);

    const sujet = `Garage - Demande ${demande.numero} - ${demande.priorite} - ${ouTiret(demande.objet)}`;
    const html = construireHtml(demande, projet);
    const { attachments, rapport } = await construireAttachments(admin, demande.fichiers);

    const reponseResend = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: EXPEDITEUR,
        to: destinatairesTo,
        cc: destinatairesCc,
        subject: sujet,
        html,
        ...(attachments.length > 0 ? { attachments } : {}),
      }),
    });

    if (!reponseResend.ok) {
      const detail = await reponseResend.text();
      throw new Error(`Resend a refusé l'envoi : ${detail}`);
    }

    return res.status(200).json({
      ok: true,
      destinataires: [...destinatairesTo, ...destinatairesCc],
      piecesJointes: rapport,
    });
  } catch (err) {
    console.error('Erreur notification demande garage:', err);
    return res.status(500).json({ error: err.message || 'Erreur inconnue' });
  }
}

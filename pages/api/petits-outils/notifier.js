import { createClient } from '@supabase/supabase-js';
import { DESTINATAIRES_FIXES_RAW } from '../../../lib/petits-outils-destinataires';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

const EXPEDITEUR = 'Petits outils PEP <notifications@toolbox-pep.com>';
const LOGO_PEP_URL = 'https://www.toolbox-pep.com/_static/planification-hebdomadaire/logo-pep.png';
const BUCKET_FICHIERS = 'petits-outils-fichiers';
const TAILLE_MAX_PIECE_JOINTE = 8 * 1024 * 1024; // 8 Mo par fichier

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

function ouTiret(valeur) {
  return (valeur === null || valeur === undefined || valeur === '') ? '—' : valeur;
}

async function construireAttachments(admin, chemins) {
  const attachments = [];
  const rapport = [];
  for (const chemin of chemins || []) {
    try {
      const { data: blob, error } = await admin.storage.from(BUCKET_FICHIERS).download(chemin);
      if (error || !blob) {
        console.error('Piece jointe introuvable dans le stockage:', chemin, error); // eslint-disable-line no-console
        rapport.push({ chemin, statut: 'introuvable', detail: error?.message || 'inconnu' });
        continue;
      }
      const arrayBuffer = await blob.arrayBuffer();
      if (arrayBuffer.byteLength > TAILLE_MAX_PIECE_JOINTE) {
        rapport.push({ chemin, statut: 'trop_volumineux', tailleOctets: arrayBuffer.byteLength });
        continue;
      }
      const contenuBase64 = Buffer.from(arrayBuffer).toString('base64');
      attachments.push({ filename: chemin.split('/').pop(), content: contenuBase64 });
      rapport.push({ chemin, statut: 'inclus', tailleOctets: arrayBuffer.byteLength });
    } catch (e) {
      console.error('Erreur telechargement piece jointe:', chemin, e); // eslint-disable-line no-console
      rapport.push({ chemin, statut: 'erreur', detail: e.message });
    }
  }
  return { attachments, rapport };
}

function construireHtml(demande, items, personnesAdditionnelles) {
  const listeItemsHtml = (items || []).map((it) => `
    <tr>
      <td style="padding:6px 0; border-bottom:1px solid #F0F1F3; font-size:13px; color:#14213D;">${it.outil}</td>
      <td style="padding:6px 0; border-bottom:1px solid #F0F1F3; font-size:13px; color:#6b7480;">${ouTiret(it.details)}</td>
    </tr>`).join('');

  const lignes = [
    ['Demandeur', demande.demandeur_nom, true],
    ['Projet', demande.projet_no ? `${demande.projet_no} — ${ouTiret(demande.projet_nom)}` : '—'],
    ['Chargé de projet', ouTiret(demande.nom_charge)],
    ['Aviser', (personnesAdditionnelles && personnesAdditionnelles.length > 0) ? personnesAdditionnelles.map((p) => p.nom).join(', ') : '—'],
    ['Mode de réception', demande.mode_reception === 'livraison' ? 'Livraison au chantier' : 'Cueillette'],
    ['Date requise', formatDateFr(demande.date_requise) + (demande.toute_journee ? ' (toute journée)' : ` (${demande.heure_requise || ''})`), true],
    ['Date autorisée', formatDateFr(demande.date_autorisee)],
    ['Délai de traitement', texteDelai(new Date().toISOString().slice(0, 10), demande.date_requise)],
    ['Endroit des travaux', ouTiret(demande.endroit_travaux)],
    ['Infos complémentaires', ouTiret(demande.infos_complementaires)],
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
                <div style="color:#9AA5C0; font-size:13px; margin-top:4px;">Demande petits outils</div>
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
            Demande petits outils - #${demande.numero}
          </h1>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; margin-bottom:20px;">
            ${lignesHtml}
          </table>

          <div style="font-size:11px; text-transform:uppercase; letter-spacing:0.07em; font-weight:800; color:#6b7480; margin-bottom:6px;">
            🔧 Outils demandés
          </div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <tr>
              <td style="padding:4px 0; font-size:11px; text-transform:uppercase; color:#8a93a0; border-bottom:1px solid #D7DBE0;">Outil</td>
              <td style="padding:4px 0; font-size:11px; text-transform:uppercase; color:#8a93a0; border-bottom:1px solid #D7DBE0;">Détails</td>
            </tr>
            ${listeItemsHtml}
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
      .schema('petits_outils')
      .from('demandes')
      .select('*')
      .eq('numero', numero)
      .maybeSingle();

    if (eDemande) {
      throw new Error(`Erreur lecture demande #${numero} : ${eDemande.message} (code ${eDemande.code || '?'})`);
    }
    if (!demande) {
      throw new Error(`Demande #${numero} introuvable dans petits_outils.demandes.`);
    }

    const { data: items } = await admin
      .schema('petits_outils')
      .from('demande_items')
      .select('outil, details')
      .eq('demande_id', demande.id)
      .order('sort_order', { ascending: true });

    const { data: personnesAdditionnelles } = await admin
      .schema('petits_outils')
      .from('demande_personnes')
      .select('nom, courriel')
      .eq('demande_id', demande.id);

    // Liste des chemins de fichiers pour cette demande (numéro = dossier
    // dans le bucket) — on liste plutôt que de dépendre d'une colonne,
    // pour être sûr d'inclure tout ce qui a réellement été téléversé.
    const { data: fichiersListe } = await admin.storage.from(BUCKET_FICHIERS).list(String(demande.numero));
    const cheminsFichiers = (fichiersListe || []).map((f) => `${demande.numero}/${f.name}`);

    const emailsTo = [
      demande.demandeur_email,
      demande.courriel_cp,
      ...(personnesAdditionnelles || []).map((p) => p.courriel),
    ].filter(Boolean);

    const emailsCcBruts = DESTINATAIRES_FIXES_RAW.map((p) => p.email);

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

    const sujet = `Demande petits outils - ${demande.demandeur_nom} - ${ouTiret(demande.projet_nom)}`;
    const html = construireHtml(demande, items, personnesAdditionnelles);
    const { attachments, rapport } = await construireAttachments(admin, cheminsFichiers);

    const reponseResend = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: EXPEDITEUR,
        to: destinatairesTo.length > 0 ? destinatairesTo : destinatairesCc,
        ...(destinatairesTo.length > 0 ? { cc: destinatairesCc } : {}),
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
    console.error('Erreur notification demande petits outils:', err); // eslint-disable-line no-console
    return res.status(500).json({ error: err.message || 'Erreur inconnue' });
  }
}

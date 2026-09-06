import { createClient } from '@supabase/supabase-js';
import { DESTINATAIRES_FIXES } from '../../../lib/visite-surintendant/surintendants';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

const EXPEDITEUR = 'Visite surintendant PEP <notifications@toolbox-pep.com>';
const LOGO_PEP_URL = 'https://www.toolbox-pep.com/_static/planification-hebdomadaire/logo-pep.png';
const BUCKET_FICHIERS = 'visite-surintendant-fichiers';
const TAILLE_MAX_PIECE_JOINTE = 10 * 1024 * 1024; // 10 Mo par fichier
// Outlook refuse les courriels reçus au-delà d'environ 20 Mo, et c'est le
// TOTAL qui compte, pas chaque fichier. Attention : les pièces jointes sont
// encodées en base64, ce qui les gonfle d'environ 33 %. 12 Mo de photos font
// donc à peu près 16 Mo une fois encodées — d'où ce plafond, qui laisse une
// marge réelle sous les 20 Mo plutôt que de les frôler.
const TAILLE_MAX_TOTAL_PIECES = 12 * 1024 * 1024; // 12 Mo avant encodage

const MOIS_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

function formatDateFr(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${parseInt(d, 10)} ${MOIS_FR[parseInt(m, 10) - 1]} ${y}`;
}

function ouTiret(valeur) {
  return (valeur === null || valeur === undefined || valeur === '') ? '—' : valeur;
}

async function construireAttachments(admin, chemins) {
  // Les téléchargements se font EN PARALLÈLE. Une boucle séquentielle sur dix
  // photos, c'est dix allers-retours l'un après l'autre — le patron exact qui
  // a causé les dépassements de délai Vercel dans le cron de fin de mois du
  // Défi Strava. L'accumulation du total, elle, reste séquentielle ensuite,
  // pour que le résultat soit déterministe : à photos identiques, ce sont
  // toujours les mêmes qui passent.
  const telechargements = await Promise.all((chemins || []).map(async (chemin) => {
    try {
      const { data: blob, error } = await admin.storage.from(BUCKET_FICHIERS).download(chemin);
      if (error || !blob) return { chemin, statut: 'introuvable', detail: error?.message || 'inconnu' };
      const arrayBuffer = await blob.arrayBuffer();
      return { chemin, arrayBuffer, tailleOctets: arrayBuffer.byteLength };
    } catch (e) {
      return { chemin, statut: 'erreur', detail: e.message };
    }
  }));

  const attachments = [];
  const rapport = [];
  let totalOctets = 0;
  for (const item of telechargements) {
    if (item.statut) {
      rapport.push({ chemin: item.chemin, statut: item.statut, detail: item.detail });
      continue;
    }
    if (item.tailleOctets > TAILLE_MAX_PIECE_JOINTE) {
      rapport.push({ chemin: item.chemin, statut: 'trop_volumineux', tailleOctets: item.tailleOctets });
      continue;
    }
    if (totalOctets + item.tailleOctets > TAILLE_MAX_TOTAL_PIECES) {
      rapport.push({ chemin: item.chemin, statut: 'total_depasse', tailleOctets: item.tailleOctets });
      continue;
    }
    attachments.push({
      filename: item.chemin.split('/').pop(),
      content: Buffer.from(item.arrayBuffer).toString('base64'),
    });
    totalOctets += item.tailleOctets;
    rapport.push({ chemin: item.chemin, statut: 'inclus', tailleOctets: item.tailleOctets });
  }
  return { attachments, rapport, totalOctets };
}

function construireHtml(visite, mentions, nbNonJointes = 0) {
  const travauxTexte = [
    ...(visite.travaux_en_cours || []),
    ...(visite.travaux_autre ? [visite.travaux_autre] : []),
  ].join(', ') || '—';

  const lignes = [
    ['Surintendant', visite.surintendant_nom, true],
    ['Date et heure', `${formatDateFr(visite.date_visite)} à ${visite.heure_visite}`],
    ['Projet', visite.projet_no ? `${visite.projet_no} — ${ouTiret(visite.projet_nom)}` : ouTiret(visite.projet_nom), true],
    ['Chargé de projet', ouTiret(visite.charge_projet_nom)],
    ['Travaux en cours', travauxTexte],
    ['Détails activités en cours', ouTiret(visite.details_activites_en_cours)],
    ['Activités à venir', ouTiret(visite.activites_a_venir)],
    ['Infos spéciales pour chargé de projet', ouTiret(visite.infos_speciales_charge_projet)],
  ];

  const lignesHtml = lignes.map(([label, valeur, gras], i) => `
    <tr>
      <td style="padding:10px 0; ${i < lignes.length - 1 ? 'border-bottom:1px solid #EDEFF1;' : ''} color:#6b7480; font-size:13px; width:40%; vertical-align:top;">${label}</td>
      <td style="padding:10px 0; ${i < lignes.length - 1 ? 'border-bottom:1px solid #EDEFF1;' : ''} color:#14213D; font-size:13.5px; ${gras ? 'font-weight:600;' : ''}">${valeur}</td>
    </tr>
  `).join('');

  // Bandeaux d'avis, en haut du courriel. Deux natures, deux couleurs :
  // orange quand une réponse est attendue, bleu pâle quand il s'agit
  // simplement d'une information à lire. Mêmes couleurs que dans le
  // formulaire, pour que le surintendant reconnaisse ce qu'il a envoyé.
  const STYLES_BANDEAU = {
    reponse: { fond: '#FFF8EE', bordure: '#F0C97A', texte: '#8A5A00', icone: '&#9888;&#65039;' },
    info: { fond: '#EEF5FD', bordure: '#A9C7E8', texte: '#1F4C7A', icone: '&#8505;&#65039;' },
  };

  function bandeau(nature, contenuHtml) {
    const s = STYLES_BANDEAU[nature] || STYLES_BANDEAU.reponse;
    return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:7px;">
      <tr>
        <td style="background:${s.fond}; border:1px solid ${s.bordure}; padding:7px 14px; font-family: Calibri, Arial, sans-serif; font-size:13.5px; line-height:1.3; color:${s.texte};">
          ${s.icone} ${contenuHtml}
        </td>
      </tr>
    </table>
  `;
  }

  // Les bandeaux viennent UNIQUEMENT des mentions. Remplir "Informations
  // spéciales pour chargé de projet" ne déclenche plus rien de son côté :
  // pour qu'un bandeau apparaisse, il faut ajouter une mention.
  const tousLesBandeaux = (mentions || [])
    .map((m) => bandeau(
      m.type,
      m.type === 'info'
        ? `Information importante à lire — <strong>${m.nom}</strong>`
        : `Réponse requise — <strong>${m.nom}</strong>`
    ))
    .join('');

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
                <div style="font-family: Calibri, Arial, sans-serif; color:#AEC0F5; font-size:12px; letter-spacing:0.14em; font-weight:600;">LES ENTREPRISES</div>
                <div style="font-family: Calibri, Arial, sans-serif; color:#ffffff; font-size:24px; font-weight:700; letter-spacing:0.02em; margin-top:2px;">PEP2000 INC.</div>
                <div style="font-family: Calibri, Arial, sans-serif; color:#9AA5C0; font-size:13px; margin-top:4px;">Visite surintendant</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding:28px;">
          <h1 style="font-family: Calibri, Arial, sans-serif; margin:0 0 20px; font-size:20px; color:#14213D; font-weight:700; text-transform:uppercase; letter-spacing:0.02em;">
            Visite surintendant - #${visite.numero}
          </h1>
          ${tousLesBandeaux}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            ${lignesHtml}
          </table>
          ${nbNonJointes > 0 ? `<p style="margin:16px 0 0; font-size:12.5px; color:#6b7480; font-family: Calibri, Arial, sans-serif;">${nbNonJointes} photo${nbNonJointes > 1 ? 's n\'ont' : " n'a"} pas pu être jointe${nbNonJointes > 1 ? 's' : ''} au courriel, faute d'espace. Elles restent conservées avec la visite.</p>` : ''}
        </td>
      </tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F8FA; border-top:1px solid #EDEFF1;">
      <tr>
        <td style="padding:16px 28px; text-align:center; color:#9aa5c0; font-size:11px; font-family: Calibri, Arial, sans-serif;">
          Ce courriel est envoyé automatiquement à plusieurs destinataires par le Toolbox PEP. Pour que ta réponse rejoigne tout le monde, fais « Répondre à tous ».
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
    const { data: visite, error: eVisite } = await admin
      .schema('visite_surintendant')
      .from('visites')
      .select('*')
      .eq('numero', numero)
      .maybeSingle();

    if (eVisite) {
      throw new Error(`Erreur lecture visite #${numero} : ${eVisite.message} (code ${eVisite.code || '?'})`);
    }
    if (!visite) {
      throw new Error(`Visite #${numero} introuvable dans visite_surintendant.visites.`);
    }

    const { data: personnesAdditionnelles } = await admin
      .schema('visite_surintendant')
      .from('visite_personnes')
      .select('nom, courriel')
      .eq('visite_id', visite.id);

    const { data: mentions } = await admin
      .schema('visite_surintendant')
      .from('visite_mentions')
      .select('nom, courriel, type')
      .eq('visite_id', visite.id);

    // Seules les copies allégées sont jointes au courriel. Les originaux
    // pleine résolution restent archivés dans <numero>/originaux/.
    const { data: fichiersListe } = await admin.storage.from(BUCKET_FICHIERS).list(`${visite.numero}/courriel`);
    const cheminsFichiers = (fichiersListe || [])
      .filter((f) => f.id)
      .map((f) => `${visite.numero}/courriel/${f.name}`);

    // Les rôles viennent de lib/visite-surintendant/surintendants.js — un
    // 'to' ajouté là-bas devient automatiquement destinataire principal ici.
    const emailsFixesTo = DESTINATAIRES_FIXES.filter((p) => p.role === 'to').map((p) => p.email);
    const emailsCcBruts = DESTINATAIRES_FIXES.filter((p) => p.role !== 'to').map((p) => p.email);

    const emailsTo = [
      visite.surintendant_courriel,
      visite.charge_projet_courriel,
      ...(personnesAdditionnelles || []).map((p) => p.courriel),
      ...(mentions || []).map((m) => m.courriel),
      ...emailsFixesTo,
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

    const sujet = `Visite surintendant - ${visite.surintendant_nom} - ${ouTiret(visite.projet_nom)}`;
    const { attachments, rapport } = await construireAttachments(admin, cheminsFichiers);
    const nbNonJointes = rapport.filter((r) => r.statut !== 'inclus').length;
    const html = construireHtml(visite, mentions, nbNonJointes);

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
    console.error('Erreur notification visite surintendant:', err); // eslint-disable-line no-console
    return res.status(500).json({ error: err.message || 'Erreur inconnue' });
  }
}

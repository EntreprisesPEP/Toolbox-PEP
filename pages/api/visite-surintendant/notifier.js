import { createClient } from '@supabase/supabase-js';
import { DESTINATAIRES_FIXES } from '../../../lib/visite-surintendant/surintendants';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

const EXPEDITEUR = 'Visite surintendant PEP <notifications@toolbox-pep.com>';
const LOGO_PEP_URL = 'https://www.toolbox-pep.com/_static/planification-hebdomadaire/logo-pep.png';
const BUCKET_FICHIERS = 'visite-surintendant-fichiers';
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
      rapport.push({ chemin, statut: 'erreur', detail: e.message });
    }
  }
  return { attachments, rapport };
}

function construireHtml(visite, personnesAdditionnelles, mentions) {
  const travauxTexte = [
    ...(visite.travaux_en_cours || []),
    ...(visite.travaux_autre ? [visite.travaux_autre] : []),
  ].join(', ') || '—';

  const lignes = [
    ['Surintendant', visite.surintendant_nom, true],
    ['Date et heure', `${formatDateFr(visite.date_visite)} à ${visite.heure_visite}`, true],
    ['Projet', visite.projet_no ? `${visite.projet_no} — ${ouTiret(visite.projet_nom)}` : ouTiret(visite.projet_nom)],
    ['Chargé de projet', ouTiret(visite.charge_projet_nom)],
    ['Aviser', (personnesAdditionnelles && personnesAdditionnelles.length > 0) ? personnesAdditionnelles.map((p) => p.nom).join(', ') : '—'],
    ['Mentions importantes', (mentions && mentions.length > 0) ? mentions.map((m) => `${m.nom} (${m.type === 'info' ? 'à lire' : 'réponse requise'})`).join(', ') : '—'],
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

  // Bandeau "réponse requise" — purement visuel, ne change pas qui reçoit
  // le courriel (le chargé de projet est déjà dans les destinataires "À").
  function bandeauOrange(contenuHtml) {
    return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
      <tr>
        <td style="background:#FFF8EE; border:1px solid #F0C97A; padding:12px 16px; font-family: Calibri, Arial, sans-serif; font-size:14px; color:#8A5A00;">
          ${contenuHtml}
        </td>
      </tr>
    </table>
  `;
  }

  const nomCp = (visite.charge_projet_nom || '').trim().toLowerCase();

  const bandeauReponseRequise = visite.reponse_charge_projet_requise
    ? bandeauOrange(`&#9888;&#65039; Réponse requise de <strong>${ouTiret(visite.charge_projet_nom)}</strong>`)
    : '';

  // Bandeau automatique : dès qu'il y a quoi que ce soit d'écrit dans
  // "Informations spéciales pour chargé de projet", le chargé de projet est
  // averti en haut du courriel, sans qu'on ait à cocher quoi que ce soit.
  const aDesInfosSpeciales = !!(visite.infos_speciales_charge_projet || '').trim();
  const bandeauInfosSpeciales = aDesInfosSpeciales
    ? bandeauOrange(`&#9888;&#65039; Information spéciale à lire pour <strong>${ouTiret(visite.charge_projet_nom)}</strong>`)
    : '';

  // Un bandeau par personne mentionnée, avec le message qui correspond à la
  // nature de la mention. Le chargé de projet est écarté s'il a déjà le même
  // bandeau juste au-dessus, pour éviter le doublon.
  const bandeauxMentions = (mentions || [])
    .filter((m) => {
      const estCp = (m.nom || '').trim().toLowerCase() === nomCp;
      if (estCp && m.type === 'reponse' && visite.reponse_charge_projet_requise) return false;
      if (estCp && m.type === 'info' && aDesInfosSpeciales) return false;
      return true;
    })
    .map((m) => bandeauOrange(
      m.type === 'info'
        ? `&#9888;&#65039; Information importante à lire — <strong>${m.nom}</strong>`
        : `&#9888;&#65039; Réponse requise — <strong>${m.nom}</strong>`
    ))
    .join('');

  const tousLesBandeaux = bandeauReponseRequise + bandeauInfosSpeciales + bandeauxMentions;

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

    const { data: fichiersListe } = await admin.storage.from(BUCKET_FICHIERS).list(String(visite.numero));
    const cheminsFichiers = (fichiersListe || []).map((f) => `${visite.numero}/${f.name}`);

    const emailsTo = [
      visite.surintendant_courriel,
      visite.charge_projet_courriel,
      ...(personnesAdditionnelles || []).map((p) => p.courriel),
      ...(mentions || []).map((m) => m.courriel),
    ].filter(Boolean);

    const emailsCcBruts = DESTINATAIRES_FIXES.map((p) => p.email);

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
    const html = construireHtml(visite, personnesAdditionnelles, mentions);
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
    console.error('Erreur notification visite surintendant:', err); // eslint-disable-line no-console
    return res.status(500).json({ error: err.message || 'Erreur inconnue' });
  }
}

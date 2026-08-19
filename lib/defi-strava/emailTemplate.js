import { Resend } from 'resend';
import { formatDuree } from './format';

const resend = new Resend(process.env.RESEND_API_KEY);

const LOGO_DEFI_URL = `${process.env.NEXT_PUBLIC_APP_URL}/logo-pep-x-strava.png`;
const ORANGE_STRAVA = '#fc4c02';
const OR = '#d4af37';
const ARGENT = '#b7bcc2';
const BRONZE = '#cd7f32';

function medaille(rang) {
  return rang === 1 ? '🥇' : rang === 2 ? '🥈' : rang === 3 ? '🥉' : null;
}
function couleurRang(rang) {
  return rang === 1 ? OR : rang === 2 ? ARGENT : rang === 3 ? BRONZE : '#6b7480';
}

function ligneClassement(row, dernier) {
  const m = medaille(row.rang);
  return `
    <tr>
      <td style="padding:9px 0; ${dernier ? '' : 'border-bottom:1px solid #EDEFF1;'} font-family: Calibri, Arial, sans-serif; font-weight:800; color:${couleurRang(row.rang)}; width:44px;">
        ${m || `#${row.rang}`}
      </td>
      <td style="font-family: Calibri, Arial, sans-serif; padding:9px 0; ${dernier ? '' : 'border-bottom:1px solid #EDEFF1;'} font-weight:600; color:#14213D;">
        ${row.nom}
      </td>
      <td style="padding:9px 0; ${dernier ? '' : 'border-bottom:1px solid #EDEFF1;'} text-align:right; font-family: Calibri, Arial, sans-serif; font-weight:700; color:#14213D;">
        ${row.totalFormate}
      </td>
      <td style="padding:9px 0; ${dernier ? '' : 'border-bottom:1px solid #EDEFF1;'} text-align:right; font-family: Calibri, Arial, sans-serif; font-size:11.5px; color:#9aa5c0; width:70px;">
        ${row.diffLeaderFormate ? `−${row.diffLeaderFormate}` : '—'}
      </td>
    </tr>`;
}

function tableauClassement(lignes, texteVide) {
  if (!lignes || lignes.length === 0) {
    return `<p style="font-family: Calibri, Arial, sans-serif; color:#9aa5c0; font-size:13px; margin:6px 0 0;">${texteVide}</p>`;
  }
  const corps = lignes.map((r, i) => ligneClassement(r, i === lignes.length - 1)).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family: Calibri, Arial, sans-serif; border-collapse:collapse; margin-top:4px;">${corps}</table>`;
}

// Encadrure commune à tous les courriels du Défi Strava — en-tête (logo +
// bordure orange), pied de page, et la largeur RÉELLEMENT plafonnée à
// 600px via un vrai tableau HTML (max-width en CSS seul ne fonctionne pas
// dans Outlook de bureau, qui l'ignore complètement).
function emailShell(contenuHtml, piedDePage, eyebrowTexte = 'Défi du mois') {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0; padding:24px; background:#EEF1F7; font-family: Calibri, Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family: Calibri, Arial, sans-serif;">
    <tr>
      <td align="center">
        <!--[if mso]>
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" align="center"><tr><td>
        <![endif]-->
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px; max-width:600px; background:#ffffff; border-radius:8px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.08); font-family: Calibri, Arial, sans-serif;">

    <tr><td>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0F2138; border-top:4px solid ${ORANGE_STRAVA}; font-family: Calibri, Arial, sans-serif;">
      <tr>
        <td style="font-family: Calibri, Arial, sans-serif; padding:16px 28px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td valign="middle" width="60" style="font-family: Calibri, Arial, sans-serif; padding-right:14px;">
                <img src="${LOGO_DEFI_URL}" alt="Les Entreprises PEP x Strava" width="60" style="font-family: Calibri, Arial, sans-serif; display:block;">
              </td>
              <td valign="middle">
                <div style="font-family: Calibri, Arial, sans-serif; color:${ORANGE_STRAVA}; font-size:11px; letter-spacing:0.14em; font-weight:700; text-transform:uppercase;">${eyebrowTexte}</div>
                <div style="font-family: Calibri, Arial, sans-serif; color:#ffffff; font-size:21px; font-weight:800; letter-spacing:-0.01em; margin-top:2px;">Défi Strava - PEPTalk</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    </td></tr>

    <tr><td>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family: Calibri, Arial, sans-serif;">
      <tr>
        <td style="font-family: Calibri, Arial, sans-serif; padding:28px;">
          ${contenuHtml}
        </td>
      </tr>
    </table>
    </td></tr>

    <tr><td>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F8FA; border-top:1px solid #EDEFF1; font-family: Calibri, Arial, sans-serif;">
      <tr>
        <td style="padding:16px 28px; text-align:center; color:#9aa5c0; font-size:11px; font-family: Calibri, Arial, sans-serif;">
          ${piedDePage}
        </td>
      </tr>
    </table>
    </td></tr>

        </table>
        <!--[if mso]>
        </td></tr></table>
        <![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

function boutonVoirClassement(url, texte) {
  return `
    <div style="font-family: Calibri, Arial, sans-serif; text-align:center; margin-top:28px;">
      <a href="${url}"
         style="font-family: Calibri, Arial, sans-serif; display:inline-block; background:${ORANGE_STRAVA}; color:#ffffff; text-decoration:none; padding:12px 26px; border-radius:8px; font-weight:700; font-size:13.5px;">
        ${texte} →
      </a>
    </div>`;
}

// ============================================================================
// 1) RÉSUMÉ HEBDOMADAIRE — chaque lundi 8h
// ============================================================================
function buildEmailHtml({ semaine, semaineNumero, top3Semaine, moisLisible, classementMois, streakSemaine }) {
  const meneur = classementMois[0];
  const gagnantSemaine = top3Semaine[0];

  const contenu = `
    <h1 style="font-family: Calibri, Arial, sans-serif; margin:0 0 6px; font-size:20px; color:#14213D; font-weight:800;">Résumé de la Semaine ${semaineNumero}</h1>
    <p style="font-family: Calibri, Arial, sans-serif; margin:0 0 22px; font-size:13.5px; color:#6b7480; line-height:1.5;">
      <strong>Ne lâchez pas !</strong> Peu importe le sport, c'est <strong>la somme du temps</strong> d'activité qui
      compte. Objectif : finir <strong>${moisLisible}</strong> avec le plus d'heures possible.
    </p>

    ${gagnantSemaine ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family: Calibri, Arial, sans-serif; background:#FFF8EE; border:1px solid rgba(252,76,2,0.25); border-radius:8px; margin-bottom:32px;">
      <tr>
        <td style="font-family: Calibri, Arial, sans-serif; padding:14px 18px; font-size:14px; color:#14213D; line-height:1.5;">
          🎉 <strong>Bravo ${gagnantSemaine.nom}</strong> qui remporte la première place de la semaine${streakSemaine >= 2 ? `, une <strong>${streakSemaine}e fois de suite</strong>` : ''} !!
        </td>
      </tr>
    </table>` : ''}

    <div style="font-family: Calibri, Arial, sans-serif; font-size:11px; text-transform:uppercase; letter-spacing:0.07em; font-weight:800; color:#6b7480; margin-bottom:2px;">
      🏅 La semaine passée — ${semaine}
    </div>
    ${tableauClassement(top3Semaine, "Personne n'a bougé cette semaine.")}

    <div style="font-family: Calibri, Arial, sans-serif; height:1px; background:#EDEFF1; margin:40px 0 34px;"></div>

    ${meneur ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family: Calibri, Arial, sans-serif; background:#F7F8FA; border:1px solid #EDEFF1; border-radius:8px; margin-bottom:16px;">
      <tr>
        <td style="font-family: Calibri, Arial, sans-serif; padding:14px 18px; font-size:13.5px; color:#14213D;">
          🥇 <strong>${meneur.nom}</strong> mène actuellement ${moisLisible} avec <strong>${meneur.totalFormate}</strong>.
        </td>
      </tr>
    </table>` : ''}

    <div style="font-family: Calibri, Arial, sans-serif; font-size:11px; text-transform:uppercase; letter-spacing:0.07em; font-weight:800; color:#6b7480; margin-bottom:2px;">
      📅 Classement complet — ${moisLisible}
    </div>
    ${tableauClassement(classementMois, "Personne n'a encore bougé ce mois-ci.")}

    ${boutonVoirClassement(`${process.env.NEXT_PUBLIC_APP_URL}/defi-strava/`, 'Voir le classement en direct')}
  `;

  const pied = "Tu reçois aussi une notification instantanée chaque fois que quelqu'un prend la première place du mois. Ce courriel est envoyé automatiquement par le Toolbox PEP.";

  return emailShell(contenu, pied, `Défi du mois - ${semaineNumero}e semaine`);
}

export async function sendResumeHebdomadaire(destinataires, { semaine, semaineNumero, top3Semaine, moisLisible, classementMois, streakSemaine }) {
  if (!destinataires || destinataires.length === 0) return { envoye: false, raison: 'Aucun destinataire' };

  const resultat = await resend.emails.send({
    from: 'Défi Strava PEP <defi@toolbox-pep.com>',
    to: destinataires,
    subject: `Défi Strava — résumé du ${semaine} et classement de ${moisLisible}`,
    html: buildEmailHtml({ semaine, semaineNumero, top3Semaine, moisLisible, classementMois, streakSemaine }),
  });

  if (resultat?.error) {
    throw new Error(`Resend a refusé l'envoi : ${resultat.error.message || JSON.stringify(resultat.error)}`);
  }
  return { envoye: true, id: resultat?.data?.id || null };
}

// ============================================================================
// 2) NOUVEAU MENEUR — temps réel, dès qu'un changement de tête se produit
// ============================================================================
function buildNouveauMeneurHtml({ classement, ancienMeneurNom }) {
  const nouveauMeneur = classement[0];
  const ancien = classement.find((r) => r.nom === ancienMeneurNom);

  const contenu = `
    <h1 style="font-family: Calibri, Arial, sans-serif; margin:0 0 16px; font-size:20px; color:#14213D; font-weight:800;">🥇 Nouveau meneur du Défi Strava !</h1>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family: Calibri, Arial, sans-serif; background:#FFF8EE; border:1px solid rgba(252,76,2,0.25); border-radius:8px; margin-bottom:24px;">
      <tr>
        <td style="font-family: Calibri, Arial, sans-serif; padding:16px 18px; font-size:14px; color:#14213D; line-height:1.5;">
          ${ancien
            ? `<strong>${nouveauMeneur.nom}</strong> (${nouveauMeneur.totalFormate}) vient de dépasser <strong>${ancien.nom}</strong> (${ancien.totalFormate}) pour prendre la tête du mois !`
            : `<strong>${nouveauMeneur.nom}</strong> (${nouveauMeneur.totalFormate}) prend la tête du Défi Strava !`}
        </td>
      </tr>
    </table>

    ${boutonVoirClassement(`${process.env.NEXT_PUBLIC_APP_URL}/defi-strava/`, 'Voir le classement en direct')}
  `;

  const pied = 'Ce courriel est envoyé automatiquement chaque fois que la tête du classement mensuel change, par le Toolbox PEP.';

  return emailShell(contenu, pied);
}

export async function sendNouveauMeneur(destinataires, { classement, ancienMeneurNom }) {
  if (!destinataires || destinataires.length === 0) return { envoye: false, raison: 'Aucun destinataire' };
  const nouveauMeneur = classement[0];
  if (!nouveauMeneur) return { envoye: false, raison: 'Classement vide' };

  const resultat = await resend.emails.send({
    from: 'Défi Strava PEP <defi@toolbox-pep.com>',
    to: destinataires,
    subject: `🥇 ${nouveauMeneur.nom} prend la tête du Défi Strava !`,
    html: buildNouveauMeneurHtml({ classement, ancienMeneurNom }),
  });

  if (resultat?.error) {
    throw new Error(`Resend a refusé l'envoi : ${resultat.error.message || JSON.stringify(resultat.error)}`);
  }
  return { envoye: true, id: resultat?.data?.id || null };
}

// ============================================================================
// 3) FIN DE MOIS — 1er du mois, 8h, résultats finaux du mois précédent
// ============================================================================
function podiumVisuel(classement) {
  const [premier, deuxieme, troisieme] = classement;
  if (!premier) return '';

  // Couleurs de fond SOLIDES (pas de transparence alpha en hex 8 chiffres,
  // qu'Outlook ne comprend pas et affiche comme blanc/transparent).
  const FOND_OR = '#FBEFC7';
  const FOND_ARGENT = '#E7E9EC';
  const FOND_BRONZE = '#F0DCC7';

  const carte = (r, medaille, coulBordure, coulFond, hauteurBloc) => r ? `
    <td width="33%" valign="bottom" style="font-family: Calibri, Arial, sans-serif; padding:0 4px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-family: Calibri, Arial, sans-serif; text-align:center; padding:14px 6px 12px;">
            <div style="font-family: Calibri, Arial, sans-serif; font-size:28px; line-height:1;">${medaille}</div>
            <div style="font-family: Calibri, Arial, sans-serif; font-weight:800; font-size:12.5px; color:#14213D; margin-top:6px;">${r.nom}</div>
            <div style="font-family: Calibri, Arial, sans-serif; font-weight:700; font-size:12.5px; color:#14213D; margin-top:2px;">${r.totalFormate}</div>
          </td>
        </tr>
        <tr>
          <td height="${hauteurBloc}" bgcolor="${coulFond}" style="height:${hauteurBloc}px; line-height:${hauteurBloc}px; font-size:1px; mso-line-height-rule:exactly; background-color:${coulFond}; border:1px solid ${coulBordure}; border-radius:8px 8px 0 0;">&nbsp;</td>
        </tr>
      </table>
    </td>` : `<td width="33%"></td>`;

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family: Calibri, Arial, sans-serif; margin:8px 0 22px;">
      <tr>
        ${carte(deuxieme, '🥈', ARGENT, FOND_ARGENT, 46)}
        ${carte(premier, '🥇', OR, FOND_OR, 66)}
        ${carte(troisieme, '🥉', BRONZE, FOND_BRONZE, 32)}
      </tr>
    </table>`;
}

function capitaliser(texte) {
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

function sectionRecordsChanges(categoriesChangees) {
  if (!categoriesChangees || categoriesChangees.length === 0) {
    return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family: Calibri, Arial, sans-serif; background:#F7F8FA; border:1px solid #EDEFF1; border-radius:8px; margin:22px 0;">
      <tr>
        <td style="font-family: Calibri, Arial, sans-serif; padding:14px 18px; font-size:12.5px; color:#495260;">
          🏆 Aucun record du Hall of Fame n'a changé ce mois-ci — la barre reste haute !
        </td>
      </tr>
    </table>`;
  }

  const lignes = categoriesChangees.map((cat) => `
    <tr>
      <td style="font-family: Calibri, Arial, sans-serif; padding:9px 0; border-bottom:1px solid #EDEFF1; font-size:15px; width:30px;">${cat.icone}</td>
      <td style="font-family: Calibri, Arial, sans-serif; padding:9px 0; border-bottom:1px solid #EDEFF1;">
        <div style="font-family: Calibri, Arial, sans-serif; font-weight:700; font-size:12.5px; color:#14213D;">${cat.titre}</div>
        <div style="font-family: Calibri, Arial, sans-serif; font-size:11.5px; color:#6b7480;">${cat.detenteur} — <span style="font-family: Calibri, Arial, sans-serif; font-weight:700; color:#14213D;">${cat.valeur}</span></div>
        ${cat.ancienDetenteur ? `<div style="font-family: Calibri, Arial, sans-serif; font-size:10.5px; color:#9aa5c0; margin-top:1px;">auparavant : ${cat.ancienDetenteur} (${cat.ancienneValeur})</div>` : ''}
      </td>
    </tr>`).join('');

  return `
    <div style="font-family: Calibri, Arial, sans-serif; font-size:11px; text-transform:uppercase; letter-spacing:0.07em; font-weight:800; color:#6b7480; margin:22px 0 6px;">
      🏆 Records du Hall of Fame mis à jour ce mois-ci
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family: Calibri, Arial, sans-serif; border-collapse:collapse;">${lignes}</table>`;
}

function buildFinDeMoisHtml({ moisLisible, moisIso, classementFinal, categoriesChangees, streakMois }) {
  const participantsActifs = classementFinal.filter((r) => r.total > 0).length;
  const totalEquipeSecondes = classementFinal.reduce((s, r) => s + (r.total || 0), 0);
  const reste = classementFinal.slice(3);
  const premier = classementFinal[0];

  const contenu = `
    <h1 style="font-family: Calibri, Arial, sans-serif; margin:0 0 6px; font-size:20px; color:#14213D; font-weight:800;">🏆 ${capitaliser(moisLisible)} est terminé !</h1>
    <p style="font-family: Calibri, Arial, sans-serif; margin:0 0 18px; font-size:13.5px; color:#6b7480; line-height:1.5;">
      Félicitations à tout le monde d'avoir participé ! Voici le podium final.
    </p>

    ${premier ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family: Calibri, Arial, sans-serif; background:#FFF8EE; border:1px solid rgba(252,76,2,0.25); border-radius:8px; margin-bottom:20px;">
      <tr>
        <td style="font-family: Calibri, Arial, sans-serif; padding:14px 18px; font-size:14px; color:#14213D; line-height:1.5;">
          🎉 <strong>Bravo ${premier.nom}</strong> qui remporte la première place du mois${streakMois >= 2 ? `, une <strong>${streakMois}e fois de suite</strong>` : ''} !!
        </td>
      </tr>
    </table>` : ''}

    ${participantsActifs > 0 ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family: Calibri, Arial, sans-serif; background:#F7F8FA; border:1px solid #EDEFF1; border-radius:8px; margin-bottom:20px;">
      <tr>
        <td style="font-family: Calibri, Arial, sans-serif; padding:12px 18px; font-size:12.5px; color:#495260;">
          👥 <strong>${participantsActifs}</strong> participant${participantsActifs > 1 ? 's' : ''} actif${participantsActifs > 1 ? 's' : ''} ·
          ⏱️ <strong>${formatDuree(totalEquipeSecondes)}</strong> cumulées par l'équipe au total
        </td>
      </tr>
    </table>` : ''}

    ${podiumVisuel(classementFinal)}

    ${reste.length > 0 ? `
    <div style="font-family: Calibri, Arial, sans-serif; font-size:11px; text-transform:uppercase; letter-spacing:0.07em; font-weight:800; color:#6b7480; margin-bottom:2px;">
      📋 Le reste du classement
    </div>
    ${tableauClassement(reste, '')}` : ''}

    ${classementFinal.length === 0 ? `<p style="font-family: Calibri, Arial, sans-serif; color:#9aa5c0; font-size:13px;">Personne n'a bougé ce mois-ci — le prochain mois nous appartient !</p>` : ''}

    ${sectionRecordsChanges(categoriesChangees)}

    ${boutonVoirClassement(`${process.env.NEXT_PUBLIC_APP_URL}/defi-strava/?mois=${moisIso}`, 'Voir les résultats complets')}
  `;

  const pied = 'Ce courriel est envoyé automatiquement le 1er de chaque mois, par le Toolbox PEP.';

  return emailShell(contenu, pied, `Fin du mois - ${capitaliser(moisLisible)}`);
}

export async function sendFinDeMois(destinataires, { moisLisible, moisIso, classementFinal, categoriesChangees, streakMois }) {
  if (!destinataires || destinataires.length === 0) return { envoye: false, raison: 'Aucun destinataire' };

  const resultat = await resend.emails.send({
    from: 'Défi Strava PEP <defi@toolbox-pep.com>',
    to: destinataires,
    subject: `🏆 ${capitaliser(moisLisible)} est terminé — les résultats du Défi Strava`,
    html: buildFinDeMoisHtml({ moisLisible, moisIso, classementFinal, categoriesChangees, streakMois }),
  });

  if (resultat?.error) {
    throw new Error(`Resend a refusé l'envoi : ${resultat.error.message || JSON.stringify(resultat.error)}`);
  }
  return { envoye: true, id: resultat?.data?.id || null };
}

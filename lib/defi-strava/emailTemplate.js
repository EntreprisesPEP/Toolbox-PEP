import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

function buildEmailHtml(semaine, classement) {
  const lignes = classement
    .map((row) => {
      const medaille = row.rang === 1 ? '🥇' : row.rang === 2 ? '🥈' : row.rang === 3 ? '🥉' : '';
      return `
        <tr>
          <td style="padding:10px 8px;border-bottom:1px solid #e5e5e5;font-weight:600;">${medaille} #${row.rang}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #e5e5e5;">${row.nom}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #e5e5e5;text-align:right;">${row.totalFormate}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #e5e5e5;text-align:right;color:#777;">${row.diffLeaderFormate ? `−${row.diffLeaderFormate}` : '—'}</td>
        </tr>`;
    })
    .join('');

  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;">
      <h2 style="color:#1a1a1a;">Défi Strava — Semaine ${semaine}</h2>
      <p style="color:#555;">Voici le classement de la semaine. À vos souliers de course!</p>
      <table style="width:100%;border-collapse:collapse;margin-top:16px;">
        <thead>
          <tr style="background:#f5f5f5;">
            <th style="padding:10px 8px;text-align:left;">Rang</th>
            <th style="padding:10px 8px;text-align:left;">Participant</th>
            <th style="padding:10px 8px;text-align:right;">Temps total</th>
            <th style="padding:10px 8px;text-align:right;">Écart vs # 1</th>
          </tr>
        </thead>
        <tbody>${lignes}</tbody>
      </table>
      <p style="margin-top:24px;">
        <a href="${process.env.NEXT_PUBLIC_APP_URL}/defi-strava" style="color:#fc4c02;font-weight:600;">Voir le classement en direct →</a>
      </p>
    </div>`;
}

export async function sendWeeklyRankingEmail(destinataires, semaine, classement) {
  if (!destinataires || destinataires.length === 0) return;

  await resend.emails.send({
    from: 'Défi Strava PEP2000 <defi@toolbox-pep.com>', // ajuste selon ton domaine vérifié dans Resend
    to: destinataires,
    subject: `Défi Strava — Classement de la semaine ${semaine}`,
    html: buildEmailHtml(semaine, classement),
  });
}

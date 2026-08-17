import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

function ligneClassement(row, estMensuel) {
  const medaille = row.rang === 1 ? '🥇' : row.rang === 2 ? '🥈' : row.rang === 3 ? '🥉' : '';
  return `
    <tr>
      <td style="padding:10px 8px;border-bottom:1px solid #e5e5e5;font-weight:600;">${medaille} #${row.rang}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #e5e5e5;">${row.nom}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #e5e5e5;text-align:right;">${row.totalFormate}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #e5e5e5;text-align:right;color:#777;">${row.diffLeaderFormate ? `−${row.diffLeaderFormate}` : '—'}</td>
    </tr>`;
}

function buildEmailHtml({ semaine, top3Semaine, moisLisible, classementMois }) {
  const ligneTop3 = top3Semaine.map((r) => ligneClassement(r, false)).join('');
  const ligneMois = classementMois.map((r) => ligneClassement(r, true)).join('');

  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;">
      <h2 style="color:#1a1a1a;">Défi Strava — résumé du lundi</h2>
      <p style="color:#555;">
        Le défi, ça reste simple : peu importe le sport, c'est la <strong>somme du temps</strong>
        d'activité physique qui compte. Objectif : finir <strong>${moisLisible}</strong>
        avec le plus d'heures possible.
      </p>

      <h3 style="color:#1a1a1a;margin-top:28px;">🏅 Top 3 de la semaine passée (${semaine})</h3>
      <table style="width:100%;border-collapse:collapse;margin-top:8px;">
        <thead>
          <tr style="background:#f5f5f5;">
            <th style="padding:10px 8px;text-align:left;">Rang</th>
            <th style="padding:10px 8px;text-align:left;">Participant</th>
            <th style="padding:10px 8px;text-align:right;">Temps</th>
            <th style="padding:10px 8px;text-align:right;">Écart # 1</th>
          </tr>
        </thead>
        <tbody>${ligneTop3 || '<tr><td colspan="4" style="padding:10px 8px;color:#777;">Personne n\'a bougé cette semaine.</td></tr>'}</tbody>
      </table>

      <h3 style="color:#1a1a1a;margin-top:28px;">📅 Classement complet de ${moisLisible}</h3>
      <table style="width:100%;border-collapse:collapse;margin-top:8px;">
        <thead>
          <tr style="background:#f5f5f5;">
            <th style="padding:10px 8px;text-align:left;">Rang</th>
            <th style="padding:10px 8px;text-align:left;">Participant</th>
            <th style="padding:10px 8px;text-align:right;">Temps total</th>
            <th style="padding:10px 8px;text-align:right;">Écart # 1</th>
          </tr>
        </thead>
        <tbody>${ligneMois || '<tr><td colspan="4" style="padding:10px 8px;color:#777;">Personne n\'a encore bougé ce mois-ci.</td></tr>'}</tbody>
      </table>

      <p style="margin-top:24px;">
        <a href="${process.env.NEXT_PUBLIC_APP_URL}/defi-strava" style="color:#fc4c02;font-weight:600;">Voir le classement en direct →</a>
      </p>
      <p style="margin-top:16px;font-size:12px;color:#999;">
        Tu reçois aussi une notification instantanée chaque fois que quelqu'un
        prend la première place du mois.
      </p>
    </div>`;
}

export async function sendResumeHebdomadaire(destinataires, { semaine, top3Semaine, moisLisible, classementMois }) {
  if (!destinataires || destinataires.length === 0) return { envoye: false, raison: 'Aucun destinataire' };

  const resultat = await resend.emails.send({
    from: 'Défi Strava PEP2000 <defi@toolbox-pep.com>', // ajuste selon ton domaine vérifié dans Resend
    to: destinataires,
    subject: `Défi Strava — résumé du ${semaine} et classement de ${moisLisible}`,
    html: buildEmailHtml({ semaine, top3Semaine, moisLisible, classementMois }),
  });

  // Le SDK Resend ne lève PAS toujours une exception en cas de refus — il
  // renvoie souvent { data: null, error: {...} } silencieusement. Sans
  // cette vérification, un envoi refusé par Resend passait inaperçu et le
  // code croyait avoir réussi.
  if (resultat?.error) {
    throw new Error(`Resend a refusé l'envoi : ${resultat.error.message || JSON.stringify(resultat.error)}`);
  }

  return { envoye: true, id: resultat?.data?.id || null };
}

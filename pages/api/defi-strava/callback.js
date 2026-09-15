import { getSupabaseAdmin } from '../../../lib/defi-strava/supabaseAdmin';
import { exchangeCodeForTokens } from '../../../lib/defi-strava/stravaClient';
import { porteeDonneAccesAuxActivites } from '../../../lib/defi-strava/etatBranchement';

export default async function handler(req, res) {
  const { code, state: participantId, error } = req.query;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (error) {
    res.redirect(`${appUrl}/defi-strava?connexion=refusee`);
    return;
  }

  if (!code || !participantId) {
    res.redirect(`${appUrl}/defi-strava?connexion=erreur`);
    return;
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const supabase = getSupabaseAdmin();

    await supabase
      .from('participants')
      .update({ strava_athlete_id: tokens.athlete.id })
      .eq('id', participantId);

    // On demande « read,activity:read_all », mais l'ecran de Strava presente
    // ces permissions en cases a cocher : la personne peut les decocher.
    // Strava emet quand meme un jeton valide -- un jeton qui ne donne acces
    // a rien. Avant ce correctif on ne gardait pas la portee accordee, donc
    // quelqu'un dans ce cas apparaissait « connecte » comme tout le monde
    // alors qu'aucune de ses activites ne pouvait jamais entrer.
    const portee = tokens.scope || '';

    await supabase.from('strava_tokens').upsert({
      participant_id: participantId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: new Date(tokens.expires_at * 1000).toISOString(),
      scope: portee,
      updated_at: new Date().toISOString(),
    });

    // Sans « activity:read_all », on ne verra jamais une seule activite.
    // On le dit tout de suite, pendant que la personne est encore devant
    // son ecran, plutot que de la laisser croire que c'est fait.
    //
    // Revision 54 : ce test decoupait sur la virgule seulement. Or Strava
    // RENVOIE la portee separee par des espaces (« activity:read_all read »)
    // meme si on la DEMANDE avec des virgules. Tout le monde se faisait donc
    // dire que ses permissions etaient incompletes alors qu'elles etaient
    // bonnes -- un faux avertissement qui apprend a ignorer les vrais.
    if (porteeDonneAccesAuxActivites(portee) === false) {
      res.redirect(`${appUrl}/defi-strava?connexion=permissions-incompletes`);
      return;
    }

    res.redirect(`${appUrl}/defi-strava?connexion=reussie`);
  } catch (err) {
    console.error('Erreur callback Strava:', err); // eslint-disable-line no-console
    res.redirect(`${appUrl}/defi-strava?connexion=erreur`);
  }
}

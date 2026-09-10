import { getStravaAuthUrl } from '../../../lib/defi-strava/stravaClient';
import { verifierSession } from '../../../lib/commun/gardeApi';
import { getSupabaseAdmin } from '../../../lib/defi-strava/supabaseAdmin';

// ---------------------------------------------------------------------------
// DEMARRER LA CONNEXION STRAVA
//
// Revision 46. Avant, c'etait un simple lien :
//     /api/defi-strava/connect?participant_id=<n importe quoi>
// La route prenait le numero tel quel, sans rien verifier — ni session, ni
// appartenance. Le numero voyage ensuite dans le parametre « state » de
// Strava et revient tel quel dans /callback, qui ecrit
//     participants.strava_athlete_id = <le compte Strava qui vient d autoriser>
// Autrement dit : n importe qui, meme sans compte Toolbox, pouvait brancher
// SON compte Strava sur le profil de quelqu un d autre et lui faire porter
// ses kilometres. Les numeros de participants sont sequentiels, donc il n y
// avait meme rien a deviner.
//
// Le numero ne vient donc plus de l appelant. Il est retrouve ICI, a partir
// du courriel de la session — la meme resolution que fait AuthGate cote
// navigateur. On ne peut plus se connecter que sur son propre profil.
//
// Consequence : ce n est plus un lien, c est un POST avec le jeton, et la
// page fait la redirection elle-meme avec l adresse renvoyee. Un <a href>
// ordinaire ne peut pas porter d en-tete Authorization, et la session
// Supabase vit dans le stockage local, pas dans un cookie : il n y avait
// aucun moyen d authentifier une navigation simple.
// ---------------------------------------------------------------------------

const APP_SLUG = 'defi-strava';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: "Cette adresse s'appelle en POST depuis la page du Defi Strava.",
    });
  }

  const acces = await verifierSession(req, APP_SLUG);
  if (acces.erreur) {
    return res.status(acces.erreur.status).json({ error: acces.erreur.message });
  }

  const supabase = getSupabaseAdmin();
  const { data: participant } = await supabase
    .from('participants')
    .select('id')
    .eq('email', acces.email)
    .maybeSingle();

  if (!participant) {
    return res.status(404).json({
      error:
        "Aucun profil participant n'est associe a ton courriel dans le Defi Strava. Contacte William pour qu'il t'ajoute a la liste.",
    });
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/defi-strava/callback`;
  return res.status(200).json({ url: getStravaAuthUrl(redirectUri, participant.id) });
}

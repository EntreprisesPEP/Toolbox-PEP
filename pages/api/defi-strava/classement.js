import { createClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '../../../lib/defi-strava/supabaseAdmin';
import { getMonthlyRanking } from '../../../lib/defi-strava/getMonthlyRanking';
import { getRankingPourPeriode } from '../../../lib/defi-strava/getRanking';
import { semainesDuMois, labelSemaine } from '../../../lib/defi-strava/weekUtils';
import { formatMoisLisible, getCurrentIsoMonth } from '../../../lib/defi-strava/monthUtils';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function estAutorise(authHeader) {
  if (!authHeader) return false;
  const supabaseAuth = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await supabaseAuth.auth.getUser();
  return !error && !!data?.user;
}

export default async function handler(req, res) {
  if (!(await estAutorise(req.headers.authorization))) {
    res.status(401).json({ error: 'Non autorisé' });
    return;
  }

  const moisIso = req.query.mois || getCurrentIsoMonth();
  const [anneeStr, moisStr] = moisIso.split('-');
  const annee = parseInt(anneeStr, 10);
  const moisIndex0 = parseInt(moisStr, 10) - 1;

  try {
    const admin = getSupabaseAdmin();
    const { data: premiereActivite } = await admin
      .from('activities')
      .select('date_debut')
      .order('date_debut', { ascending: true })
      .limit(1)
      .maybeSingle();

    const moisDisponibles = [];
    if (premiereActivite) {
      const debut = new Date(premiereActivite.date_debut);
      const curseur = new Date(debut.getFullYear(), debut.getMonth(), 1);
      const maintenant = new Date();
      const limite = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1);
      while (curseur <= limite) {
        moisDisponibles.push(`${curseur.getFullYear()}-${String(curseur.getMonth() + 1).padStart(2, '0')}`);
        curseur.setMonth(curseur.getMonth() + 1);
      }
    } else {
      moisDisponibles.push(getCurrentIsoMonth());
    }

    const classementMois = await getMonthlyRanking(moisIso);

    const semainesBrutes = semainesDuMois(annee, moisIndex0);
    const semaines = await Promise.all(
      semainesBrutes.map(async (s) => {
        const { texte, plage } = labelSemaine(s, annee, moisIndex0);
        const classement = await getRankingPourPeriode(s.debut, s.fin);
        return {
          numero: s.numero,
          debut: s.debut.toISOString().slice(0, 10),
          fin: s.fin.toISOString().slice(0, 10),
          label: texte,
          plage,
          classement,
        };
      })
    );

    res.status(200).json({
      moisIso,
      moisLisible: formatMoisLisible(moisIso),
      moisDisponibles,
      classementMois,
      semaines,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

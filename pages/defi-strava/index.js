import { useEffect, useState } from 'react';
import Head from 'next/head';
import { supabaseDefiStrava } from '../../lib/defi-strava/supabaseClient';
import { getCurrentIsoWeek } from '../../lib/defi-strava/weekUtils';
import { formatDuree } from '../../lib/defi-strava/format';

export default function DefiStravaPage() {
  const [classement, setClassement] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [dernierAjout, setDernierAjout] = useState(null);
  const semaine = getCurrentIsoWeek();

  async function chargerClassement() {
    const { data } = await supabaseDefiStrava
      .from('weekly_totals')
      .select('*')
      .eq('semaine_iso', semaine)
      .order('rang', { ascending: true });

    setClassement(
      (data || []).map((row) => ({
        rang: row.rang,
        nom: row.nom,
        totalFormate: formatDuree(row.total_secondes),
        diffLeaderFormate: row.rang === 1 ? null : formatDuree(row.diff_leader_secondes || 0),
      }))
    );
    setChargement(false);
  }

  useEffect(() => {
    chargerClassement();

    const channel = supabaseDefiStrava
      .channel('defi-strava-activites')
      .on(
        'postgres_changes',
        { event: '*', schema: 'strava_challenge', table: 'activities' },
        () => {
          chargerClassement();
          setDernierAjout(new Date().toLocaleTimeString('fr-CA'));
        }
      )
      .subscribe();

    return () => {
      supabaseDefiStrava.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="defi-scope">
      <Head>
        <title>Défi Strava - PEP2000</title>
      </Head>

      <main className="defi-strava-page">
        <header className="defi-header">
          <span className="defi-eyebrow">Semaine {semaine}</span>
          <h1>Défi Strava</h1>
          <p>Le classement se met à jour tout seul dès qu&apos;une activité est enregistrée.</p>
        </header>

        {chargement ? (
          <div className="etat-vide">
            <p>Chargement du classement...</p>
          </div>
        ) : classement.length === 0 ? (
          <div className="etat-vide">
            <p>Personne n&apos;a encore bougé cette semaine — sois le premier sur le tableau.</p>
          </div>
        ) : (
          <div>
            <table className="leaderboard-table">
              <thead>
                <tr>
                  <th>Rang</th>
                  <th>Coureur</th>
                  <th className="align-right">Temps total</th>
                  <th className="align-right">Écart # 1</th>
                </tr>
              </thead>
              <tbody>
                {classement.map((row) => (
                  <tr key={row.nom} className={row.rang <= 3 ? `podium podium-${row.rang}` : ''}>
                    <td className="rang-cell">
                      {row.rang === 1 ? '🥇' : row.rang === 2 ? '🥈' : row.rang === 3 ? '🥉' : ''} #{row.rang}
                    </td>
                    <td>{row.nom}</td>
                    <td className="align-right">{row.totalFormate}</td>
                    <td className="align-right diff-cell">
                      {row.diffLeaderFormate ? `−${row.diffLeaderFormate}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {dernierAjout && <p className="maj-indicator">Mise à jour reçue à {dernierAjout}</p>}
          </div>
        )}

        <footer className="defi-footer">
          <p>Pas encore connecté? Contacte William pour recevoir ton lien d&apos;autorisation Strava.</p>
        </footer>
      </main>
    </div>
  );
}

import { useEffect, useState } from 'react';
import Head from 'next/head';
import { supabaseDefiStrava } from '../../lib/defi-strava/supabaseClient';
import { getCurrentIsoWeek } from '../../lib/defi-strava/weekUtils';
import { getCurrentIsoMonth, formatMoisLisible } from '../../lib/defi-strava/monthUtils';
import { formatDuree } from '../../lib/defi-strava/format';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_DEFI_STRAVA_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

function mapRows(data) {
  return (data || []).map((row) => ({
    rang: row.rang,
    nom: row.nom,
    totalFormate: formatDuree(row.total_secondes),
    diffLeaderFormate: row.rang === 1 ? null : formatDuree(row.diff_leader_secondes || 0),
  }));
}

export default function DefiStravaPage() {
  const [classementMois, setClassementMois] = useState([]);
  const [classementSemaine, setClassementSemaine] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [notifState, setNotifState] = useState('inconnu'); // inconnu | non-supporte | inactif | actif | refuse
  const semaine = getCurrentIsoWeek();
  const moisIso = getCurrentIsoMonth();
  const moisLisible = formatMoisLisible(moisIso);

  async function chargerClassements() {
    const [{ data: dataMois }, { data: dataSemaine }] = await Promise.all([
      supabaseDefiStrava.from('monthly_totals').select('*').eq('mois_iso', moisIso).order('rang', { ascending: true }),
      supabaseDefiStrava.from('weekly_totals').select('*').eq('semaine_iso', semaine).order('rang', { ascending: true }),
    ]);
    setClassementMois(mapRows(dataMois));
    setClassementSemaine(mapRows(dataSemaine));
    setChargement(false);
  }

  useEffect(() => {
    chargerClassements();

    const channel = supabaseDefiStrava
      .channel('defi-strava-activites')
      .on(
        'postgres_changes',
        { event: '*', schema: 'strava_challenge', table: 'activities' },
        () => chargerClassements()
      )
      .subscribe();

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setNotifState('non-supporte');
    } else {
      navigator.serviceWorker.getRegistration('/sw-defi-strava.js').then(async (reg) => {
        if (reg) {
          const sub = await reg.pushManager.getSubscription();
          setNotifState(sub ? 'actif' : 'inactif');
        } else {
          setNotifState('inactif');
        }
      });
    }

    return () => {
      supabaseDefiStrava.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function activerNotifications() {
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setNotifState('refuse');
        return;
      }

      const registration = await navigator.serviceWorker.register('/sw-defi-strava.js');
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      await fetch('/api/defi-strava/push-subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription }),
      });

      setNotifState('actif');
    } catch (err) {
      console.error('Erreur activation notifications:', err); // eslint-disable-line no-console
      setNotifState('refuse');
    }
  }

  return (
    <div className="defi-scope">
      <Head>
        <title>Défi Strava - PEP2000</title>
      </Head>

      <main className="defi-strava-page">
        <header className="defi-header">
          <span className="defi-eyebrow">{moisLisible}</span>
          <h1>Défi Strava</h1>
          <p className="defi-intro">
            Le principe est simple : peu importe le sport — course, vélo, marche,
            musculation — c&apos;est <strong>la somme du temps</strong> qui compte.
            L&apos;objectif : finir le mois avec le plus d&apos;heures d&apos;activité possible.
          </p>
          <p className="defi-intro-secondaire">
            Un résumé de la semaine et du classement du mois est envoyé chaque{' '}
            <strong>lundi à 8 h</strong>, et une notification part en temps réel dès qu&apos;un
            nouveau meneur prend la première place du mois.
          </p>
        </header>

        {notifState !== 'non-supporte' && (
          <div className="defi-notif-bar">
            {notifState === 'actif' ? (
              <span className="notif-ok">🔔 Notifications activées sur cet appareil</span>
            ) : (
              <button className="notif-btn" onClick={activerNotifications}>
                🔔 Activer les notifications
              </button>
            )}
            {notifState === 'refuse' && (
              <span className="notif-refuse">
                Notifications bloquées — active-les dans les réglages de ton navigateur.
              </span>
            )}
          </div>
        )}

        <section className="defi-section">
          <h2 className="defi-section-title">Classement du mois — l&apos;objectif</h2>
          {chargement ? (
            <div className="etat-vide"><p>Chargement...</p></div>
          ) : classementMois.length === 0 ? (
            <div className="etat-vide">
              <p>Personne n&apos;a encore bougé ce mois-ci — sois le premier sur le tableau.</p>
            </div>
          ) : (
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
                {classementMois.map((row) => (
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
          )}
        </section>

        <section className="defi-section defi-section-secondaire">
          <h2 className="defi-section-title-petit">Cette semaine ({semaine})</h2>
          {classementSemaine.length === 0 ? (
            <p className="defi-texte-discret">Personne n&apos;a encore bougé cette semaine.</p>
          ) : (
            <table className="leaderboard-table leaderboard-table-compact">
              <tbody>
                {classementSemaine.slice(0, 5).map((row) => (
                  <tr key={row.nom}>
                    <td className="rang-cell">#{row.rang}</td>
                    <td>{row.nom}</td>
                    <td className="align-right">{row.totalFormate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <footer className="defi-footer">
          <p>Pas encore connecté? Contacte William pour recevoir ton lien d&apos;autorisation Strava.</p>
        </footer>
      </main>
    </div>
  );
}

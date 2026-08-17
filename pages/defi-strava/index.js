import { useEffect, useState } from 'react';
import Head from 'next/head';
import AuthGate from '../../components/defi-strava/AuthGate';
import { formatDuree } from '../../lib/defi-strava/format';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_DEFI_STRAVA_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

const MEDAILLES = { 1: '🥇', 2: '🥈', 3: '🥉' };
const BLAGUES_3 = [
  "Officiellement invincible (jusqu'au 1er du mois prochain)",
  'Deuxième, mais premier dans nos cœurs',
  "La bronze, c'est presque de l'or vu de loin",
];
const BLAGUES_RESTE = [
  'Solide. La Terre a tremblé (un peu).',
  'Encore un petit effort et le podium te tend les bras.',
];

async function fetchJson(url, accessToken, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  return data;
}

// Trouve, dans le mois affiché, la semaine qui contient AUJOURD'HUI —
// et non systématiquement la dernière semaine du mois. Si le mois affiché
// est un mois passé (navigation), retombe sur sa dernière semaine ; si
// c'est un mois futur, sur sa première.
function indexSemaineParDefaut(semaines) {
  const aujourdHuiISO = new Date().toISOString().slice(0, 10);
  const idx = semaines.findIndex((s) => s.debut <= aujourdHuiISO && aujourdHuiISO <= s.fin);
  if (idx !== -1) return idx;
  return aujourdHuiISO < semaines[0]?.debut ? 0 : semaines.length - 1;
}

function Callout({ classement, participantId, nom, libellePeriode, libellePeriodeCourt }) {
  const moi = classement.find((r) => r.participantId === participantId);
  if (!moi) return null;

  if (moi.rang === 1) {
    return (
      <div className="callout-perso visible">
        🎉 <b>{nom}</b>, tu es actuellement en tête {libellePeriode} !
      </div>
    );
  }

  const premier = classement[0];
  const precedent = classement[moi.rang - 2];
  const ecartPremier = premier.total - moi.total;
  const ecartPrecedent = precedent ? precedent.total - moi.total : 0;

  return (
    <div className="callout-perso visible">
      📊 <b>{nom}</b>, tu es à <b>{formatDuree(ecartPremier)}</b> derrière {premier.nom} (1er{libellePeriodeCourt})
      {precedent && precedent.nom !== premier.nom && (
        <> et à <b>{formatDuree(ecartPrecedent)}</b> derrière {precedent.nom} (juste au-dessus de toi).</>
      )}
      {(!precedent || precedent.nom === premier.nom) && '.'}
    </div>
  );
}

function DefiStravaApp({ nom, participantId, accessToken }) {
  const [mode, setMode] = useState('jour');
  const [ongletActif, setOngletActif] = useState('podium');

  const [donneesMois, setDonneesMois] = useState(null);
  const [indexSemaine, setIndexSemaine] = useState(0);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [moisDropdownOuvert, setMoisDropdownOuvert] = useState(false);
  const [semDropdownOuvert, setSemDropdownOuvert] = useState(false);

  const [hallOfFame, setHallOfFame] = useState(null);
  const [carteOuverte, setCarteOuverte] = useState(null);

  const [voteData, setVoteData] = useState(null);
  const [voteEnCours, setVoteEnCours] = useState(false);

  const [notifState, setNotifState] = useState('inconnu');

  async function chargerMois(moisIso) {
    setChargement(true);
    setErreur('');
    try {
      const data = await fetchJson(
        `/api/defi-strava/classement/${moisIso ? `?mois=${moisIso}` : ''}`,
        accessToken
      );
      setDonneesMois(data);
      setIndexSemaine(indexSemaineParDefaut(data.semaines));
    } catch (e) {
      setErreur(e.message);
    } finally {
      setChargement(false);
    }
  }

  async function chargerHallOfFame() {
    try {
      const data = await fetchJson('/api/defi-strava/hall-of-fame/', accessToken);
      setHallOfFame(data);
    } catch (e) { /* pas critique, on laisse juste l'onglet vide */ }
  }

  async function chargerVote() {
    try {
      const data = await fetchJson('/api/defi-strava/vote/', accessToken);
      setVoteData(data);
    } catch (e) { /* pas critique */ }
  }

  useEffect(() => {
    chargerMois();
    chargerHallOfFame();
    chargerVote();

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
      await fetch('/api/defi-strava/push-subscribe/', {
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

  async function changerMois(delta) {
    if (!donneesMois) return;
    const idx = donneesMois.moisDisponibles.indexOf(donneesMois.moisIso);
    const nouvelIdx = idx + delta;
    if (nouvelIdx >= 0 && nouvelIdx < donneesMois.moisDisponibles.length) {
      await chargerMois(donneesMois.moisDisponibles[nouvelIdx]);
    }
  }

  async function soumettreVote(votePourParticipantId) {
    setVoteEnCours(true);
    try {
      await fetchJson('/api/defi-strava/vote/', accessToken, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ votePourParticipantId }),
      });
      await chargerVote();
    } catch (e) {
      // silencieux — le bouton reste actif, la personne peut réessayer
    } finally {
      setVoteEnCours(false);
    }
  }

  const classementMois = donneesMois?.classementMois || [];
  const semaineActuelle = donneesMois?.semaines?.[indexSemaine];
  const classementSemaine = semaineActuelle?.classement || [];

  return (
    <div className="defi-scope" data-theme={mode}>
      <Head>
        <title>Défi Strava - PEP2000</title>
      </Head>

      <div className="page">
        <a href="/" className="retour-toolbox">← Retour au Toolbox PEP</a>

        <div className="barre-controle">
          <div className="onglets">
            {[
              { id: 'podium', label: 'Vue Podium' },
              { id: 'palmares', label: '🏆 Hall of Fame / Shame' },
            ].map((o) => (
              <button
                key={o.id}
                className={`onglet${ongletActif === o.id ? ' actif' : ''}`}
                onClick={() => setOngletActif(o.id)}
              >
                {o.label}
              </button>
            ))}
          </div>
          <div className="toggle-theme">
            <button className={mode === 'jour' ? 'actif' : ''} onClick={() => setMode('jour')}>JOUR</button>
            <button className={mode === 'nuit' ? 'actif' : ''} onClick={() => setMode('nuit')}>NUIT</button>
          </div>
        </div>

        <div className="carte">
          <div className="carte-entete">
            <div className="carte-entete-texte">
              <div className="eyebrow">Défi du mois</div>
              <h1>Défi Strava - PEPTalk</h1>
            </div>
            <div className="logos-header">
              <img className="logo-strava" src="/strava-logo.png" alt="Strava" />
              <img className="logo-pep" src="/pep-logo-noir.png" alt="Les Entreprises PEP" />
            </div>
          </div>

          <p className="regle">
            Bienvenue au défi mensuel d&apos;activité physique de PEP! Le but? Faire le plus de{' '}
            <b>temps d&apos;activité</b> possible dans le mois. Que ce soit un sport d&apos;équipe, individuel, du
            parachutisme jusqu&apos;à la marche, chaque minute compte pour vos heures comptabilisées!
          </p>
          <p className="horaire">
            L&apos;objectif est de se garder en forme avec une compétition amicale, histoire de se motiver à bouger!
          </p>

          {chargement && <div className="etat-vide">Chargement…</div>}
          {erreur && <div className="etat-vide">{erreur}</div>}

          {!chargement && !erreur && donneesMois && (
            <>
              <div className="nav-periode">
                <div className="titre-section">{donneesMois.moisLisible}</div>
                <div className="nav-fleches">
                  <button
                    className="nav-btn"
                    disabled={donneesMois.moisDisponibles.indexOf(donneesMois.moisIso) === 0}
                    onClick={() => changerMois(-1)}
                  >‹</button>
                  <button className="nav-label-btn" onClick={() => { setMoisDropdownOuvert((v) => !v); setSemDropdownOuvert(false); }}>
                    <span className="icone-cal">📅</span><span>{donneesMois.moisLisible}</span>
                  </button>
                  <button
                    className="nav-btn"
                    disabled={donneesMois.moisDisponibles.indexOf(donneesMois.moisIso) === donneesMois.moisDisponibles.length - 1}
                    onClick={() => changerMois(1)}
                  >›</button>
                  <div className={`dropdown-cal${moisDropdownOuvert ? ' ouvert' : ''}`}>
                    {donneesMois.moisDisponibles.map((m) => (
                      <button
                        key={m}
                        className={m === donneesMois.moisIso ? 'actif' : ''}
                        onClick={() => { chargerMois(m); setMoisDropdownOuvert(false); }}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {ongletActif === 'podium' && (
                <div className="vue actif">
                  <div className="podium-zone">
                    {classementMois.slice(0, 3).map((r, i) => (
                      <div key={r.nom} className={`colonne-podium col-r${r.rang}`}>
                        <div className="marche-info">
                          <span className="medaille">{MEDAILLES[r.rang]}</span>
                          <div className="nom-p">{r.nom}</div>
                          <div className="temps-p">{r.totalFormate}</div>
                          <div className="blague">{BLAGUES_3[i]}</div>
                        </div>
                        <div className={`marche-bloc bloc-${r.rang}`} />
                      </div>
                    ))}
                  </div>
                  <div className="reste-liste">
                    {classementMois.slice(3).length === 0 ? (
                      <p style={{ padding: '10px 0', color: 'var(--text-dim)', fontSize: 12.5 }}>
                        Pas assez de participants pour le reste du classement.
                      </p>
                    ) : classementMois.slice(3).map((r, i) => (
                      <div key={r.nom} className="reste-ligne">
                        <div className="reste-rang">#{r.rang}</div>
                        <div className="reste-nom">
                          {r.nom} <span className="reste-blague">— {BLAGUES_RESTE[i] || "On t'aime pareil."}</span>
                        </div>
                        <div className="reste-temps">{r.totalFormate}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {ongletActif !== 'palmares' && (
                <>
                  <Callout
                    classement={classementMois}
                    participantId={participantId}
                    nom={nom}
                    libellePeriode={`du classement de ${donneesMois.moisLisible}`}
                    libellePeriodeCourt=""
                  />

                  <div className="bloc-semaine">
                    <div className="nav-periode" style={{ marginBottom: 10 }}>
                      <div className="titre-section">Cette semaine</div>
                      <div className="nav-fleches">
                        <button className="nav-btn" disabled={indexSemaine === 0} onClick={() => setIndexSemaine((i) => i - 1)}>‹</button>
                        <button className="nav-label-btn" onClick={() => { setSemDropdownOuvert((v) => !v); setMoisDropdownOuvert(false); }}>
                          <span className="icone-cal">📅</span>
                          <span>{semaineActuelle ? `${semaineActuelle.label} · ${semaineActuelle.plage}` : ''}</span>
                        </button>
                        <button className="nav-btn" disabled={indexSemaine === (donneesMois.semaines.length - 1)} onClick={() => setIndexSemaine((i) => i + 1)}>›</button>
                        <div className={`dropdown-cal${semDropdownOuvert ? ' ouvert' : ''}`}>
                          {donneesMois.semaines.map((s, i) => (
                            <button key={s.numero} className={i === indexSemaine ? 'actif' : ''} onClick={() => { setIndexSemaine(i); setSemDropdownOuvert(false); }}>
                              {s.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div>
                      {classementSemaine.length === 0 ? (
                        <p style={{ color: 'var(--text-dim)', fontSize: 13, margin: 0 }}>Personne n&apos;a encore bougé cette semaine.</p>
                      ) : classementSemaine.map((r) => (
                        <div key={r.nom} className="semaine-ligne">
                          <div className="semaine-rang">#{r.rang}</div>
                          <div className="semaine-nom">{r.nom}</div>
                          <div className="semaine-temps">{r.totalFormate}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Callout
                    classement={classementSemaine}
                    participantId={participantId}
                    nom={nom}
                    libellePeriode="du classement de cette semaine"
                    libellePeriodeCourt=" cette semaine"
                  />

                  {voteData && (
                    <div className="bloc-vote">
                      <div className="titre-section" style={{ marginBottom: 8 }}>
                        👏 Vote — {voteData.semaineDebut} au {voteData.semaineFin}
                      </div>
                      <p className="vote-intro">
                        Qui a mérité une main d&apos;applaudissement la semaine dernière? (tu ne peux pas voter pour toi-même)
                      </p>
                      <div>
                        {voteData.candidats.map((c) => (
                          <div key={c.participantId} className="vote-ligne">
                            <div className="vote-nom">{c.nom}</div>
                            <div className="vote-temps">{c.totalFormate}</div>
                            <button
                              className={`vote-btn${voteData.dejaVotePour === c.participantId ? ' vote-actif' : ''}`}
                              disabled={!!voteData.dejaVotePour || voteEnCours}
                              onClick={() => soumettreVote(c.participantId)}
                            >
                              {voteData.dejaVotePour === c.participantId ? '👏 Voté !' : '👏 Voter'}
                            </button>
                          </div>
                        ))}
                      </div>
                      {voteData.dejaVotePour && (
                        <p className="vote-resultat">Merci d&apos;avoir voté !</p>
                      )}
                    </div>
                  )}
                </>
              )}

              {ongletActif === 'palmares' && (
                <div className="vue actif">
                  <p className="palmares-intro">
                    Les records du défi depuis le tout début — et des prix &quot;citron&quot; 🍋 pour l&apos;humour.
                  </p>
                  {!hallOfFame ? (
                    <div className="etat-vide">Chargement…</div>
                  ) : hallOfFame.pretePasEncore ? (
                    <div className="etat-vide">Pas encore assez de données pour établir le palmarès.</div>
                  ) : (
                    <div className="hf-grille">
                      {hallOfFame.categories.map((r, i) => (
                        <div
                          key={i}
                          className={`hf-carte${r.citron ? ' citron' : ''}${carteOuverte === i ? ' ouvert' : ''}`}
                          data-icone={r.icone}
                          onClick={() => setCarteOuverte(carteOuverte === i ? null : i)}
                        >
                          <div className="hf-titre">{r.titre}</div>
                          <div className="hf-sous-titre">{r.sousTitre}</div>
                          <div className="hf-valeur">{r.valeur}</div>
                          <div className="hf-detenteur">{r.detenteur}</div>
                          <div className="hf-contexte">{r.contexte}</div>
                          <div className="hf-voir-plus">Voir le classement complet ▾</div>
                          <div className="hf-detail">
                            {r.classement.map((c, j) => (
                              <div key={j} className="hf-detail-ligne">
                                <span>{j + 1}. {c.nom}</span>
                                <span>{c.v}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          <div className="bloc-notif">
            <div className="titre-section" style={{ marginBottom: 8 }}>🔔 Notifications</div>
            <p className="horaire">
              Si vous voulez joindre l&apos;expérience à 100&nbsp;%, cochez le bouton «&nbsp;Activer les
              notifications&nbsp;»! L&apos;app va envoyer, à tous ceux qui auront décidé de joindre, le résumé de la
              dernière semaine à 8&nbsp;h&nbsp;00 les lundis matin, ainsi qu&apos;un suivi sur les progrès du mois. De
              plus, à chaque fois qu&apos;un changement aura lieu à la tête du classement, des éloges seront lancés
              pour féliciter la personne ayant pris les devants, et motiver le reste du groupe à la dépasser!
            </p>
            {notifState !== 'non-supporte' && (
              notifState === 'actif' ? (
                <span>🔔 Notifications activées sur cet appareil</span>
              ) : (
                <button className="btn-notif" onClick={activerNotifications}>🔔 Activer les notifications</button>
              )
            )}
            {notifState === 'refuse' && (
              <p style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                Notifications bloquées — active-les dans les réglages de ton navigateur.
              </p>
            )}
          </div>

          <p className="pied">Pas encore connecté? Contacte William pour recevoir ton lien d&apos;autorisation Strava.</p>
        </div>
      </div>
    </div>
  );
}

export default function DefiStravaPage() {
  const [session, setSession] = useState(null);

  if (!session) {
    return <AuthGate onDone={(s) => setSession(s)} />;
  }

  return <DefiStravaApp nom={session.nom} participantId={session.participantId} accessToken={session.accessToken} />;
}

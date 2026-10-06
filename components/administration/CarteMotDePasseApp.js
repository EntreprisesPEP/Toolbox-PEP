import { useState, useEffect } from 'react';
import { usePalette } from '../commun/ThemeToolbox';

// ---------------------------------------------------------------------------
// MOT DE PASSE ADMIN D'UNE APP — revision 73
//
// Le mot de passe du mode admin de la Planification hebdomadaire se change
// ici, sans passer par Vercel ni par un redeploiement.
//
// Ce qu'on affiche : s'il est defini, qui l'a change et quand. Jamais le mot
// de passe lui-meme — il n'est pas enregistre en clair, donc il n'y a rien a
// afficher. Celui qui l'oublie en met un nouveau; c'est la bonne reponse, pas
// une limitation.
//
// Double saisie obligatoire : une faute de frappe dans un mot de passe qu'on
// ne peut pas relire ensuite, c'est tout le monde dehors jusqu'a ce que
// quelqu'un s'en apercoive.
// ---------------------------------------------------------------------------

const ROUGE = '#C41230';
const VERT = '#2E9F58';

function champ(th, extra) {
  return {
    padding: '8px 10px', borderRadius: 6, border: `1px solid ${th.line}`,
    fontFamily: 'inherit', background: th.inputBg, color: th.text, ...extra,
  };
}

function quand(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function CarteMotDePasseApp({ appSlug, nomApp, jetonDeSession }) {
  const th = usePalette();
  const [etat, setEtat] = useState(null);
  const [mdp, setMdp] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [afficher, setAfficher] = useState(false);
  const [message, setMessage] = useState(null);
  const [enCours, setEnCours] = useState(false);

  async function appeler(methode, corps) {
    const jeton = await jetonDeSession();
    const url = methode === 'GET'
      ? `/api/administration/mot-de-passe-app?appSlug=${encodeURIComponent(appSlug)}`
      : '/api/administration/mot-de-passe-app';
    const res = await fetch(url, {
      method: methode,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jeton}` },
      body: methode === 'GET' ? undefined : JSON.stringify({ appSlug, ...corps }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'Erreur serveur');
    return json;
  }

  useEffect(() => {
    let vivant = true;
    appeler('GET')
      .then((d) => vivant && setEtat(d))
      .catch((e) => vivant && setMessage({ ok: false, texte: e.message }));
    return () => { vivant = false; };
  }, [appSlug]); // eslint-disable-line react-hooks/exhaustive-deps

  const tropCourt = mdp.trim().length > 0 && mdp.trim().length < 6;
  const discordance = confirmation.length > 0 && mdp.trim() !== confirmation.trim();
  const peutEnregistrer = mdp.trim().length >= 6 && mdp.trim() === confirmation.trim() && !enCours;

  async function enregistrer() {
    setEnCours(true);
    setMessage(null);
    try {
      const d = await appeler('POST', { password: mdp.trim() });
      setEtat({ defini: true, majPar: d.majPar, majLe: d.majLe });
      setMdp('');
      setConfirmation('');
      setMessage({ ok: true, texte: 'Mot de passe enregistré. Il est actif immédiatement.' });
    } catch (e) {
      setMessage({ ok: false, texte: e.message });
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div style={{ background: th.panel, borderRadius: 10, padding: 20, marginBottom: 20, boxShadow: th.ombre }}>
      <h2 style={{ color: ROUGE, fontSize: 16, marginTop: 0 }}>Mot de passe admin — {nomApp}</h2>

      <p style={{ fontSize: 13, color: th.textDim, marginTop: -6 }}>
        Ce mot de passe fait passer quelqu&rsquo;un du mode <strong>participant</strong> (lecture seule)
        au mode <strong>admin</strong> (modification du tableau). William Dubreuil n&rsquo;en a jamais
        besoin — son compte entre directement. Tous les autres doivent le saisir.
      </p>

      <div style={{ fontSize: 13, marginBottom: 14 }}>
        {etat === null && <span style={{ color: th.textDim }}>Vérification…</span>}
        {etat && etat.defini && (
          <span>
            <span style={{ color: VERT, fontWeight: 700 }}>● Défini</span>
            {etat.majPar && <span style={{ color: th.textDim }}> — modifié par {etat.majPar}{etat.majLe ? ` le ${quand(etat.majLe)}` : ''}</span>}
          </span>
        )}
        {etat && !etat.defini && (
          <span style={{ color: ROUGE, fontWeight: 700 }}>
            ● Aucun mot de passe enregistré — l&rsquo;app utilise encore l&rsquo;ancien mot de passe du serveur.
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: th.textDim, marginBottom: 4 }}>
            Nouveau mot de passe
          </label>
          <input
            type={afficher ? 'text' : 'password'}
            value={mdp}
            onChange={(e) => setMdp(e.target.value)}
            autoComplete="new-password"
            style={champ(th, { width: 220 })}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: th.textDim, marginBottom: 4 }}>
            Répéter
          </label>
          <input
            type={afficher ? 'text' : 'password'}
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            autoComplete="new-password"
            onKeyDown={(e) => { if (e.key === 'Enter' && peutEnregistrer) enregistrer(); }}
            style={champ(th, { width: 220 })}
          />
        </div>
        <button
          onClick={enregistrer}
          disabled={!peutEnregistrer}
          style={{
            fontFamily: 'inherit', background: peutEnregistrer ? th.btnBg : th.line,
            color: '#fff', border: 'none', borderRadius: 6, padding: '9px 14px',
            cursor: peutEnregistrer ? 'pointer' : 'default', fontSize: 13, marginTop: 20,
          }}
        >{enCours ? 'Enregistrement…' : 'Enregistrer'}</button>
      </div>

      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: th.textDim, marginTop: 10 }}>
        <input type="checkbox" checked={afficher} onChange={(e) => setAfficher(e.target.checked)} />
        Afficher ce que je tape
      </label>

      {tropCourt && (
        <div style={{ fontSize: 12, color: ROUGE, marginTop: 8 }}>Au moins 6 caractères.</div>
      )}
      {discordance && (
        <div style={{ fontSize: 12, color: ROUGE, marginTop: 8 }}>Les deux saisies ne sont pas identiques.</div>
      )}
      {message && (
        <div style={{ fontSize: 13, color: message.ok ? VERT : ROUGE, marginTop: 10 }}>{message.texte}</div>
      )}

      <p style={{ fontSize: 11.5, color: th.textDim, marginTop: 12, marginBottom: 0 }}>
        Le mot de passe n&rsquo;est pas conservé en clair : impossible de le relire ici, même pour un
        administrateur. S&rsquo;il se perd, on en met simplement un nouveau. Le changement prend effet
        tout de suite, sans redéploiement — les personnes déjà en mode admin le restent jusqu&rsquo;à
        ce qu&rsquo;elles reviennent en participant.
      </p>
    </div>
  );
}

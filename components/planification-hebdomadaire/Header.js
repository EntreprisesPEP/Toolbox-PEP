import { useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import PasswordModal from './PasswordModal';

// Ce compte n'a jamais besoin du mot de passe partage pour passer en
// mode admin -- comparaison insensible a la casse par prudence.
const COMPTE_SANS_MOT_DE_PASSE = 'wdubreuil@pep2000.com';

export default function Header({ prefs, updatePrefs, nomUtilisateur, emailUtilisateur, onDeconnexion }) {
  const [pwdOpen, setPwdOpen] = useState(false);

  function toggleRole() {
    if (prefs.role === 'edit') {
      updatePrefs({ role: 'view' }); // repasser en participant ne demande jamais de mot de passe
      return;
    }
    const estExempte = (emailUtilisateur || '').trim().toLowerCase() === COMPTE_SANS_MOT_DE_PASSE;
    if (estExempte) {
      updatePrefs({ role: 'edit' });
      return;
    }
    setPwdOpen(true);
  }

  async function submitPassword(pwd) {
    setPwdOpen(false);
    try {
      const res = await fetch('/api/planification-hebdomadaire/check-password/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd }),
      });
      const data = await res.json();
      if (data.ok) {
        updatePrefs({ role: 'edit' });
      } else {
        window.alert('Mot de passe incorrect.');
      }
    } catch (e) {
      window.alert('Impossible de verifier le mot de passe pour le moment.');
    }
  }

  return (
    <>
      <div className="topline" />
      <div className="header">
        <div className="header-left">
          <div className="logo">
            <a href="/" title="Retour au Toolbox PEP">
              <img src="/_static/planification-hebdomadaire/logo-pep.png" alt="Les Entreprises PEP2000" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            </a>
          </div>
          <div>
            <p className="h-title">PLANIFICATION HEBDOMADAIRE</p>
            <p className="h-sub">Besoins et attribution des equipes</p>
            <a href="/" style={{ fontSize: 11, color: '#4a7cf6', textDecoration: 'underline' }}>→ Retour au Toolbox PEP</a>
          </div>
        </div>

        <div className="header-right-stack">
          <div className="theme-toggle" role="group" aria-label="Theme jour ou nuit">
            <button
              type="button"
              className={prefs.theme === 'jour' ? 'active' : ''}
              onClick={() => updatePrefs({ theme: 'jour' })}
              aria-label="Mode jour"
              title="Mode jour"
            ><Sun size={14} /></button>
            <button
              type="button"
              className={prefs.theme === 'nuit' ? 'active' : ''}
              onClick={() => updatePrefs({ theme: 'nuit' })}
              aria-label="Mode nuit"
              title="Mode nuit"
            ><Moon size={14} /></button>
          </div>

          <div className="role-toggle" role="group" aria-label="Mode participant ou admin">
            <button
              type="button"
              className={prefs.role !== 'edit' ? 'active' : ''}
              onClick={() => prefs.role === 'edit' && toggleRole()}
            >Participant</button>
            <button
              type="button"
              className={prefs.role === 'edit' ? 'active' : ''}
              onClick={() => prefs.role !== 'edit' && toggleRole()}
            >Admin</button>
          </div>

          <div className="h-meta-name">
            {nomUtilisateur}
            {onDeconnexion && (
              <>
                {' · '}
                <a onClick={onDeconnexion}>se déconnecter</a>
              </>
            )}
          </div>
        </div>
      </div>

      <PasswordModal
        open={pwdOpen}
        onSubmit={submitPassword}
        onCancel={() => setPwdOpen(false)}
      />
    </>
  );
}

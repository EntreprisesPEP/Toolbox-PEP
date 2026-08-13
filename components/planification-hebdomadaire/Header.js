import { useState } from 'react';
import PasswordModal from './PasswordModal';

export default function Header({ prefs, updatePrefs }) {
  const [pwdOpen, setPwdOpen] = useState(false);

  function toggleRole() {
    if (prefs.role === 'edit') {
      updatePrefs({ role: 'view' }); // repasser en participant ne demande jamais de mot de passe
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
            <a href="/" style={{ fontSize: 11, color: '#9aa3b5', textDecoration: 'none' }}>Retour au Toolbox PEP</a>
          </div>
        </div>
        <div className="header-right">
          <div className="pill-toggle">
            <button
              className={prefs.theme === 'nuit' ? 'active' : ''}
              onClick={() => updatePrefs({ theme: 'nuit' })}
            >NUIT</button>
            <button
              className={prefs.theme === 'jour' ? 'active' : ''}
              onClick={() => updatePrefs({ theme: 'jour' })}
            >JOUR</button>
          </div>
          <div className="h-meta">
            Mode <strong>{prefs.role === 'edit' ? 'animateur' : 'participant'}</strong><br />
            <a onClick={toggleRole}>
              {prefs.role === 'edit' ? 'passer en mode participant' : 'passer en mode animateur'}
            </a>
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

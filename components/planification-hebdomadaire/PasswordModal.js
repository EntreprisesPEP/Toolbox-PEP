import { useState } from 'react';

export default function PasswordModal({ open, onSubmit, onCancel }) {
  const [value, setValue] = useState('');
  const [show, setShow] = useState(false);

  if (!open) return null;

  function submit() {
    onSubmit(value);
    setValue('');
    setShow(false);
  }

  return (
    <div className="confirm-overlay">
      <div className="confirm-box">
        <p style={{ marginBottom: 10, fontWeight: 700 }}>Mot de passe animateur</p>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            type={show ? 'text' : 'password'}
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel(); }}
            style={{ flex: 1 }}
          />
          <button className="btn ghost small" type="button" onClick={() => setShow((s) => !s)}>
            {show ? 'Cacher' : 'Voir'}
          </button>
        </div>
        <div className="confirm-actions">
          <button className="btn ghost" onClick={() => { setValue(''); setShow(false); onCancel(); }}>Annuler</button>
          <button className="btn" onClick={submit}>Confirmer</button>
        </div>
      </div>
    </div>
  );
}

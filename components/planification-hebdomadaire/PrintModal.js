import { useState } from 'react';

const SHEETS = [
  { key: 'admin', label: 'Admin — Liste des projets' },
  { key: '1', label: 'Meeting 1 — Suivi des projets' },
  { key: '2', label: 'Meeting 2 — Attribution des équipes' },
  { key: '3', label: 'Projets terminés' },
  { key: 'coupes', label: 'Coupe de rue' },
  { key: 'vacances', label: 'Vacances / Congés' },
];

// Les deux formats font la meme largeur : les colonnes ne bougent pas d'un
// format a l'autre, seul le nombre de lignes par feuille change. Personne
// n'a donc a choisir entre « lisible » et « imprimable ».
const FORMATS = [
  { key: 'lettre', titre: 'Lettre 8½ × 11', detail: "s'imprime partout · environ 20 projets par feuille" },
  { key: 'tabloide', titre: 'Tabloïde 11 × 17', detail: 'imprimante grand format · tout sur une feuille' },
];

export default function PrintModal({ open, onCancel, onGenerate, generating }) {
  const [selected, setSelected] = useState(new Set(['1', '2']));
  const [format, setFormat] = useState('lettre');

  if (!open) return null;

  function toggle(key) {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key); else next.add(key);
    setSelected(next);
  }

  return (
    <div className="confirm-overlay">
      <div className="confirm-box" style={{ width: 340 }}>
        <p style={{ fontWeight: 700, marginBottom: 10 }}>Choisir les feuilles à inclure</p>
        {SHEETS.map((s) => (
          <label key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 13 }}>
            <input type="checkbox" checked={selected.has(s.key)} onChange={() => toggle(s.key)} />
            {s.label}
          </label>
        ))}

        <p style={{ fontWeight: 700, margin: '14px 0 8px' }}>Format du papier</p>
        {FORMATS.map((f) => (
          <label
            key={f.key}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 8, padding: '7px 9px',
              fontSize: 13, border: '1px solid var(--line, #D7DBE3)', borderRadius: 8,
              marginBottom: 6, cursor: 'pointer',
              borderColor: format === f.key ? 'var(--red)' : undefined,
            }}
          >
            <input
              type="radio"
              name="ph-format-pdf"
              checked={format === f.key}
              onChange={() => setFormat(f.key)}
              style={{ marginTop: 2 }}
            />
            <span>
              <strong>{f.titre}</strong>
              <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-dim)' }}>{f.detail}</span>
            </span>
          </label>
        ))}

        <p style={{ fontSize: 11, color: 'var(--ink-dim)', marginTop: 8 }}>
          Génère un vrai fichier PDF (pas la boîte d&apos;impression du navigateur). Même
          orientation pour toutes les feuilles, et une semaine de Meeting 2 n&apos;est jamais
          coupée entre deux pages. Le PDF se télécharge directement.
        </p>

        <div className="confirm-actions">
          <button className="btn ghost" onClick={onCancel} disabled={generating}>Annuler</button>
          <button
            className="btn"
            disabled={selected.size === 0 || generating}
            onClick={() => onGenerate([...selected], format)}
          >{generating ? 'Génération…' : 'Générer le PDF'}</button>
        </div>
      </div>
    </div>
  );
}

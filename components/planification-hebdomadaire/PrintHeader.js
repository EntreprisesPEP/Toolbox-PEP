export default function PrintHeader({ title, subtitle }) {
  return (
    <div
      className="print-header"
      style={{
        background: '#14213D', color: '#fff', borderRadius: 8, padding: '10px 16px',
        display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10,
      }}
    >
      <img
        src="/_static/planification-hebdomadaire/logo-pep.png"
        alt="PEP2000"
        style={{ width: 40, height: 40, objectFit: 'contain', flexShrink: 0 }}
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
      />
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '.02em' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: '#AFC2E0', marginTop: 2 }}>{subtitle}</div>}
      </div>
    </div>
  );
}

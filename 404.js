export default function Custom404() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        fontFamily: 'Calibri, sans-serif',
        color: '#14213D',
        background: '#f2f2f2',
        textAlign: 'center',
        padding: '0 20px',
      }}
    >
      <h1 style={{ fontSize: '48px', margin: 0 }}>404</h1>
      <p style={{ fontSize: '18px', margin: '10px 0 24px' }}>
        Cette page n'existe pas.
      </p>
      <a
        href="/"
        style={{
          background: '#14213D',
          color: '#fff',
          padding: '10px 20px',
          borderRadius: '6px',
          textDecoration: 'none',
        }}
      >
        Retour au Toolbox
      </a>
    </div>
  );
}

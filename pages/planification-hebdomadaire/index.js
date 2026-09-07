import { useState, useEffect } from 'react';
import Head from 'next/head';
import GardeConnexion from '../../components/commun/GardeConnexion';
import EnTeteApp from '../../components/commun/EnTeteApp';
import { useModePep } from '../../components/commun/ThemeToolbox';
import AdminView from '../../components/planification-hebdomadaire/AdminView';
import Meeting1View from '../../components/planification-hebdomadaire/Meeting1View';
import Meeting2View from '../../components/planification-hebdomadaire/Meeting2View';
import TerminesView from '../../components/planification-hebdomadaire/TerminesView';
import PrintModal from '../../components/planification-hebdomadaire/PrintModal';
import PasswordModal from '../../components/planification-hebdomadaire/PasswordModal';
import { usePrefs } from '../../hooks/planification-hebdomadaire/usePrefs';
import { useBoard } from '../../hooks/planification-hebdomadaire/useBoard';
import { mondayOf, today, dateKey } from '../../lib/planification-hebdomadaire/dates';

const TABS = [
  { key: 'admin', label: 'ADMIN' },
  { key: '1', label: 'MEETING 1 - SUIVI PROJETS' },
  { key: '2', label: 'MEETING 2 - ATTRIBUTION' },
  { key: '3', label: 'PROJETS TERMINES' },
];

// Ce compte n'a jamais besoin du mot de passe partagé pour passer en mode
// admin — comparaison insensible à la casse par prudence.
const COMPTE_SANS_MOT_DE_PASSE = 'wdubreuil@pep2000.com';

function PlanificationHebdomadaire({ nom, poste, email }) {
  const [mode, setMode] = useModePep();
  const { prefs, update, ready } = usePrefs();
  const board = useBoard();
  const [tab, setTab] = useState('1');
  const [printOpen, setPrintOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);

  // Le thème de cette app passe par une variable CSS sur la page entière
  // (data-theme = jour / nuit). On la fait suivre la bascule commune, pour que
  // le bandeau et le contenu soient toujours d'accord.
  useEffect(() => {
    const voulu = mode === 'night' ? 'nuit' : 'jour';
    if (prefs.theme !== voulu) update({ theme: voulu });
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready || board.loading) {
    return <div style={{ padding: 40, fontFamily: 'Segoe UI, Arial, sans-serif' }}>Chargement...</div>;
  }

  const editable = prefs.role === 'edit';

  function basculerRole() {
    if (prefs.role === 'edit') {
      update({ role: 'view' }); // revenir en participant ne demande jamais de mot de passe
      return;
    }
    const estExempte = (email || '').trim().toLowerCase() === COMPTE_SANS_MOT_DE_PASSE;
    if (estExempte) {
      update({ role: 'edit' });
      return;
    }
    setPwdOpen(true);
  }

  async function soumettreMotDePasse(pwd) {
    setPwdOpen(false);
    try {
      const res = await fetch('/api/planification-hebdomadaire/check-password/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd }),
      });
      const data = await res.json();
      if (data.ok) {
        update({ role: 'edit' });
      } else {
        window.alert('Mot de passe incorrect.');
      }
    } catch (e) {
      window.alert('Impossible de verifier le mot de passe pour le moment.');
    }
  }

  async function handleGeneratePdf(selection) {
    setGenerating(true);
    try {
      const { pdf } = await import('@react-pdf/renderer');
      const { default: PdfDocument } = await import('../../components/planification-hebdomadaire/pdf/PdfDocument');
      const blob = await pdf(<PdfDocument selection={selection} board={board} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const currentWeekMonday = mondayOf(new Date((board.settings.notes_week_start || dateKey(today())) + 'T00:00:00'));
      const nextMonday = new Date(currentWeekMonday);
      nextMonday.setDate(nextMonday.getDate() + 7);
      a.download = `Planification Hebdomadaire - ${dateKey(nextMonday)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setPrintOpen(false);
    } catch (e) {
      console.error(e); // eslint-disable-line no-console
      window.alert("Erreur lors de la generation du PDF. Reessaie, ou dis-le a l'equipe technique.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="ph-scope">
      <Head>
        <title>Planification Hebdomadaire - PEP2000</title>
      </Head>

      <EnTeteApp
        titre="Planification hebdomadaire"
        sousTitre="Besoins et attribution des équipes"
        mode={mode}
        onChangerMode={setMode}
        nom={nom}
        poste={poste}
        onAccueil={() => setTab('1')}
      />

      <div className="wrap">
        <div className="toolbar">
          <div className="left">
            <span className="eyebrow">Vue</span>
            <div className="pill-toggle">
              {TABS.map((t) => (
                <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Le choix participant / animateur est propre à cette app : il
                descend dans la barre d'outils, avec les autres commandes. */}
            <span className="eyebrow">Mode</span>
            <div className="pill-toggle">
              <button
                type="button"
                className={prefs.role !== 'edit' ? 'active' : ''}
                onClick={() => prefs.role === 'edit' && basculerRole()}
              >PARTICIPANT</button>
              <button
                type="button"
                className={prefs.role === 'edit' ? 'active' : ''}
                onClick={() => prefs.role !== 'edit' && basculerRole()}
              >ADMIN</button>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button className="btn ghost small" onClick={() => setPrintOpen(true)}>&#128438; PDF</button>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn ghost small" disabled={!board.canUndo} onClick={board.undo} title="Annuler">&#8630; Annuler</button>
              <button className="btn ghost small" disabled={!board.canRedo} onClick={board.redo} title="Retablir">&#8631; Retablir</button>
            </div>
            <div className="sync">
              <span className="dot" style={{ background: board.syncState === 'synchronise' ? '#2E9F58' : board.syncState === 'erreur de sync' ? '#C41230' : '#D69614' }} />
              <span>{board.syncState}</span>
            </div>
          </div>
        </div>

        {tab === 'admin' && <AdminView board={board} editable={editable} />}
        {tab === '1' && <Meeting1View board={board} editable={editable} theme={prefs.theme} nomUtilisateur={nom} />}
        {tab === '2' && <Meeting2View board={board} editable={editable} theme={prefs.theme} />}
        {tab === '3' && <TerminesView board={board} editable={editable} theme={prefs.theme} nomUtilisateur={nom} />}

        <div className="footnote">
          Donnée partagée en temps réel via Supabase entre tous ceux qui ouvrent cette page.
          Le mode participant est en lecture seule; le mode admin demande le mot de passe animateur.
        </div>
      </div>

      <PrintModal
        open={printOpen}
        onCancel={() => setPrintOpen(false)}
        onGenerate={handleGeneratePdf}
        generating={generating}
      />

      <PasswordModal
        open={pwdOpen}
        onSubmit={soumettreMotDePasse}
        onCancel={() => setPwdOpen(false)}
      />
    </div>
  );
}

export default function Page() {
  const [session, setSession] = useState(null);
  if (!session) {
    return (
      <GardeConnexion
        appSlug="planification-hebdomadaire"
        nomApp="Planification hebdomadaire"
        onPret={setSession}
      />
    );
  }
  return (
    <PlanificationHebdomadaire
      nom={session.nom}
      poste={session.poste}
      email={session.email}
    />
  );
}

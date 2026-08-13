import { useState } from 'react';
import Head from 'next/head';
import Header from '../../components/planification-hebdomadaire/Header';
import AdminView from '../../components/planification-hebdomadaire/AdminView';
import Meeting1View from '../../components/planification-hebdomadaire/Meeting1View';
import Meeting2View from '../../components/planification-hebdomadaire/Meeting2View';
import TerminesView from '../../components/planification-hebdomadaire/TerminesView';
import PrintModal from '../../components/planification-hebdomadaire/PrintModal';
import { usePrefs } from '../../hooks/planification-hebdomadaire/usePrefs';
import { useBoard } from '../../hooks/planification-hebdomadaire/useBoard';
import { mondayOf, today, dateKey } from '../../lib/planification-hebdomadaire/dates';

const TABS = [
  { key: 'admin', label: 'ADMIN PROJETS' },
  { key: '1', label: 'MEETING 1 - SUIVI PROJETS' },
  { key: '2', label: 'MEETING 2 - ATTRIBUTION' },
  { key: '3', label: 'PROJETS TERMINES' },
];

export default function PlanificationHebdomadaire() {
  const { prefs, update, ready } = usePrefs();
  const board = useBoard();
  const [tab, setTab] = useState('1');
  const [printOpen, setPrintOpen] = useState(false);
  const [generating, setGenerating] = useState(false);

  if (!ready || board.loading) {
    return <div style={{ padding: 40, fontFamily: 'Segoe UI, Arial, sans-serif' }}>Chargement...</div>;
  }

  const editable = prefs.role === 'edit';

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

      <Header prefs={prefs} updatePrefs={update} />

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
        {tab === '1' && <Meeting1View board={board} editable={editable} theme={prefs.theme} />}
        {tab === '2' && <Meeting2View board={board} editable={editable} theme={prefs.theme} />}
        {tab === '3' && <TerminesView board={board} editable={editable} theme={prefs.theme} />}

        <div className="footnote">
          Donnee partagee en temps reel via Supabase entre tous ceux qui ouvrent ce site.
          Mode participant en lecture seule. Aucun compte requis pour l&apos;instant &mdash; usage interne d&apos;equipe
          (voir le README pour ajouter une vraie authentification plus tard).
        </div>
      </div>

      <PrintModal
        open={printOpen}
        onCancel={() => setPrintOpen(false)}
        onGenerate={handleGeneratePdf}
        generating={generating}
      />
    </div>
  );
}

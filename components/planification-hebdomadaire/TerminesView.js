import ProjectsTable from './ProjectsTable';

export default function TerminesView({ board, editable, theme, nomUtilisateur }) {
  const { projects, updateProject } = board;
  const done = projects.filter((p) => p.statut === 'Termine');

  return (
    <div className="panel">
      <h2>Projets termines</h2>
      <p className="desc">Historique des projets marques termines. Change le statut pour le faire revenir dans la vue active.</p>
      <ProjectsTable
        rows={done}
        editable={editable}
        theme={theme}
        board={board}
        nomUtilisateur={nomUtilisateur}
        onUpdate={(id, patch) => updateProject(id, patch)}
        emptyLabel="Aucun projet termine pour le moment."
      />
    </div>
  );
}

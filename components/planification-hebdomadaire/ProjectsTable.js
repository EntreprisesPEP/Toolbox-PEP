import { useEffect, useMemo, useRef, useState } from 'react';
import StatusCell from './StatusCell';
import FilterDropdown from './FilterDropdown';
import CommentBadge from './CommentBadge';
import { statusColor } from '../../lib/planification-hebdomadaire/statusColors';

// Une demi-seconde après la dernière lettre : assez court pour que la base
// suive le rythme d'une réunion, assez long pour ne pas écrire à chaque touche.
const PAUSE_FRAPPE = 500;

function AutoTextarea({ value, editable, onChange, cle, onFrappe, apercu }) {
  const ref = useRef(null);
  const minuterie = useRef(null);

  function ajuster(el) {
    el.style.height = '32px';
    el.style.height = Math.max(32, el.scrollHeight) + 'px';
  }

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // NE JAMAIS écraser une case pendant que quelqu'un a le curseur dedans.
    // Sans ce garde-fou, le rechargement déclenché par la sauvegarde d'un
    // collègue effacerait le mot en cours de frappe sous les doigts.
    if (document.activeElement === el) return;
    if (el.value !== (value || '')) el.value = value || '';
    ajuster(el);
  }, [value]);

  // La minuterie en vol doit partir avec le composant, sinon elle enregistre
  // dans le vide une fois la ligne disparue de l'écran.
  useEffect(() => () => { if (minuterie.current) clearTimeout(minuterie.current); }, []);

  // En lecture : le texte en cours de frappe de l'animateur prend le dessus sur
  // la valeur enregistrée, le temps que la base rattrape.
  if (!editable) return <span>{(apercu != null ? apercu : value) || ''}</span>;

  function enregistrer(texte) {
    if (minuterie.current) { clearTimeout(minuterie.current); minuterie.current = null; }
    if (texte !== (value || '')) onChange(texte);
  }

  return (
    <textarea
      ref={ref}
      defaultValue={value || ''}
      onInput={(e) => {
        ajuster(e.target);
        const texte = e.target.value;
        if (onFrappe && cle) onFrappe(cle, texte);
        if (minuterie.current) clearTimeout(minuterie.current);
        minuterie.current = setTimeout(() => { minuterie.current = null; enregistrer(texte); }, PAUSE_FRAPPE);
      }}
      onBlur={(e) => enregistrer(e.target.value)}
    />
  );
}

export default function ProjectsTable({ rows, editable, theme, onUpdate, board, emptyLabel, highlightedId, onHighlight, nomUtilisateur, onFrappe, frappes }) {
  const [sortField, setSortField] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [filterCharge, setFilterCharge] = useState(null);
  const [filterSurint, setFilterSurint] = useState(null);

  // Tri francais explicite : un .sort() nu compare des codes de caracteres, ce
  // qui rejette « Francois Ouellet » apres « Fred Belec » des qu'il y a une
  // cedille. Depuis que les noms sont complets, ils sont presque tous accentues.
  const parNomFr = (a, b) => a.localeCompare(b, 'fr');
  const chargeOptions = useMemo(() => [...new Set(rows.map((r) => r.charge).filter(Boolean))].sort(parNomFr), [rows]);
  const surintOptions = useMemo(() => [...new Set(rows.map((r) => r.surintendant).filter(Boolean))].sort(parNomFr), [rows]);

  const visible = useMemo(() => {
    let list = rows.filter(
      (r) => (!filterCharge || filterCharge.includes(r.charge)) && (!filterSurint || filterSurint.includes(r.surintendant))
    );
    if (sortField) {
      list = [...list].sort((a, b) => (a[sortField] || '').localeCompare(b[sortField] || '', 'fr'));
      if (sortDir === 'desc') list.reverse();
    }
    return list;
  }, [rows, filterCharge, filterSurint, sortField, sortDir]);

  function sortBy(field, dir) {
    setSortField(field);
    setSortDir(dir);
  }

  return (
    <div className="scrollx">
      <table className="projtable">
        {/* Statut, Chargé et Surintendant tiennent sur une seule ligne (voir la
            règle .nowrap-col dans planification-hebdomadaire.css). Il leur faut
            donc la largeur d'un nom complet et d'une date écrite au long ;
            c'est Commentaire, la seule colonne qui s'enroule sans nuire, qui
            cède la place. */}
        <colgroup>
          <col style={{ width: '15%' }} /><col style={{ width: '17%' }} /><col style={{ width: '28%' }} />
          <col style={{ width: '5%' }} /><col style={{ width: '5%' }} /><col style={{ width: '12%' }} />
          <col style={{ width: '13%' }} /><col style={{ width: '5%' }} />
        </colgroup>
        <thead>
          <tr>
            <th>No / Projet</th>
            <th>Statut</th>
            <th>Commentaire</th>
            <th style={{ textAlign: 'right' }}>Sem 1</th>
            <th style={{ textAlign: 'right' }}>Sem 2</th>
            <th>
              Charge
              <FilterDropdown
                label="charge de projet"
                options={chargeOptions}
                value={filterCharge}
                onSort={(dir) => sortBy('charge', dir)}
                onFilter={setFilterCharge}
              />
            </th>
            <th>
              Surintendant
              <FilterDropdown
                label="surintendant"
                options={surintOptions}
                value={filterSurint}
                onSort={(dir) => sortBy('surintendant', dir)}
                onFilter={setFilterSurint}
              />
            </th>
            <th />
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 && <tr><td colSpan={8} className="empty">{emptyLabel || 'Aucun projet.'}</td></tr>}
          {visible.map((p) => {
            const col = statusColor(p.statut, theme);
            const projComments = board.commentsFor(p.id);
            const isHighlighted = highlightedId && p.id === highlightedId;
            const rowStyle = isHighlighted ? { background: '#FFF3B0' } : (col ? { background: col.bg } : undefined);
            return (
              <tr key={p.id} style={rowStyle}>
                <td
                  data-label="Projet"
                  className="cell-titre"
                  onClick={onHighlight ? () => onHighlight(p.id) : undefined}
                  style={onHighlight ? { cursor: 'pointer' } : undefined}
                  title={onHighlight ? 'Cliquer pour surligner ce projet pour tout le monde' : undefined}
                >
                  <span className="jobline" title={`${p.no} ${p.projet}`}>
                    <span className="no">{p.no}</span>{p.projet}
                  </span>
                </td>
                <td className="nowrap-col" data-label="Statut">
                  <StatusCell project={p} editable={editable} onChange={(patch) => onUpdate(p.id, patch)} />
                </td>
                <td data-label="Commentaire" className="cell-large">
                  <AutoTextarea
                    value={p.commentaire}
                    editable={editable}
                    onChange={(v) => onUpdate(p.id, { commentaire: v })}
                    cle={`c:${p.id}`}
                    onFrappe={onFrappe}
                    apercu={frappes ? frappes[`c:${p.id}`] : undefined}
                  />
                </td>
                <td style={{ textAlign: 'right' }} data-label="Sem 1" className="cell-sem">
                  <span
                    className={`need-chip ${p.s1 ? 'need-yes' : 'need-no'} ${editable ? '' : 'readonly'}`}
                    onClick={() => editable && onUpdate(p.id, { s1: !p.s1 })}
                  >{p.s1 ? 'OUI' : 'NON'}</span>
                </td>
                <td style={{ textAlign: 'right' }} data-label="Sem 2" className="cell-sem">
                  <span
                    className={`need-chip ${p.s2 ? 'need-yes' : 'need-no'} ${editable ? '' : 'readonly'}`}
                    onClick={() => editable && onUpdate(p.id, { s2: !p.s2 })}
                  >{p.s2 ? 'OUI' : 'NON'}</span>
                </td>
                <td className="nowrap-col" data-label="Chargé">{p.charge}</td>
                <td className="nowrap-col" data-label="Surintendant">{p.surintendant}</td>
                <td style={{ textAlign: 'center' }} className="cell-action" data-label="Commentaires">
                  <CommentBadge
                    project={p}
                    comments={projComments}
                    onAdd={(body) => board.addComment(p.id, body, nomUtilisateur)}
                    onDelete={(id) => board.deleteComment(id)}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

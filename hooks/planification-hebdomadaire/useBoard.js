import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '../../lib/planification-hebdomadaire/supabaseClient';
import { dateKey, mondayOf, today, weekDates } from '../../lib/planification-hebdomadaire/dates';

const MAX_HISTORY = 50;

export function useBoard() {
  const [projects, setProjects] = useState([]);
  const [contremaitres, setContremaitres] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [nameOverrides, setNameOverrides] = useState([]);
  const [charges, setCharges] = useState([]);
  const [surintendants, setSurintendants] = useState([]);
  const [comments, setComments] = useState([]); // project_comments rows
  const [settings, setSettings] = useState({ range_start: null, notes_week_start: null });
  const [loading, setLoading] = useState(true);
  const [syncState, setSyncState] = useState('synchronise');

  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  const mounted = useRef(true);
  const projectsRef = useRef([]);
  const contremaitresRef = useRef([]);
  const assignmentsRef = useRef([]);
  const nameOverridesRef = useRef([]);
  projectsRef.current = projects;
  contremaitresRef.current = contremaitres;
  assignmentsRef.current = assignments;
  nameOverridesRef.current = nameOverrides;

  const loadAll = useCallback(async () => {
    const [p, cm, asg, ch, su, st, cmts, no] = await Promise.all([
      supabase.from('projects').select('*').order('sort_order', { ascending: true }),
      supabase.from('contremaitres').select('*').order('sort_order', { ascending: true }),
      supabase.from('assignments').select('*'),
      supabase.from('charges').select('*').order('nom', { ascending: true }),
      supabase.from('surintendants').select('*').order('nom', { ascending: true }),
      supabase.from('app_settings').select('*').eq('id', 1).maybeSingle(),
      supabase.from('project_comments').select('*').order('created_at', { ascending: false }),
      supabase.from('contremaitre_name_overrides').select('*'),
    ]);
    if (!mounted.current) return;
    if (p.data) setProjects(p.data);
    if (cm.data) setContremaitres(cm.data);
    if (asg.data) setAssignments(asg.data);
    if (ch.data) setCharges(ch.data.map((c) => c.nom));
    if (su.data) setSurintendants(su.data.map((s) => s.nom));
    if (cmts.data) setComments(cmts.data);
    if (no.data) setNameOverrides(no.data);
    if (st.data) {
      setSettings(st.data);
    } else {
      const wk = dateKey(mondayOf(today()));
      await supabase.from('app_settings').upsert({ id: 1, range_start: wk, notes_week_start: wk });
      setSettings({ range_start: wk, notes_week_start: wk });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    mounted.current = true;
    loadAll();
    const channel = supabase
      .channel('board-changes')
      .on('postgres_changes', { event: '*', schema: 'planif_hebdo', table: 'projects' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'planif_hebdo', table: 'contremaitres' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'planif_hebdo', table: 'assignments' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'planif_hebdo', table: 'charges' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'planif_hebdo', table: 'surintendants' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'planif_hebdo', table: 'app_settings' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'planif_hebdo', table: 'project_comments' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'planif_hebdo', table: 'contremaitre_name_overrides' }, loadAll)
      .subscribe();
    return () => { mounted.current = false; supabase.removeChannel(channel); };
  }, [loadAll]);

  async function withSync(fn) {
    setSyncState('enregistrement...');
    try { await fn(); setSyncState('synchronise'); }
    catch (e) { console.error(e); setSyncState('erreur de sync'); } // eslint-disable-line no-console
  }

  function pushHistory(entry) {
    setUndoStack((s) => [...s, entry].slice(-MAX_HISTORY));
    setRedoStack([]);
  }
  async function undo() {
    if (undoStack.length === 0) return;
    const entry = undoStack[undoStack.length - 1];
    setUndoStack((s) => s.slice(0, -1));
    setRedoStack((s) => [...s, entry]);
    await withSync(async () => { await entry.undo(); await loadAll(); });
  }
  async function redo() {
    if (redoStack.length === 0) return;
    const entry = redoStack[redoStack.length - 1];
    setRedoStack((s) => s.slice(0, -1));
    setUndoStack((s) => [...s, entry]);
    await withSync(async () => { await entry.redo(); await loadAll(); });
  }

  // ---------- raw (no history) ----------
  async function rawUpdateProject(id, patch) {
    const { error } = await supabase.from('projects').update(patch).eq('id', id);
    if (error) throw error;
  }
  async function rawDeleteProject(id) {
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) throw error;
  }
  async function rawInsertProjectRow(row) {
    const { error } = await supabase.from('projects').insert(row);
    if (error) throw error;
  }

  // ---------- Projects ----------
  async function addProject({ no, projet, charge, surintendant }) {
    await withSync(async () => {
      const sortOrder = projectsRef.current.length ? Math.max(...projectsRef.current.map((p) => p.sort_order || 0)) + 1 : 0;
      const row = {
        no: no || '00-000', projet, charge: charge || '', surintendant: surintendant || '',
        statut: 'A venir', s1: false, s2: false, commentaire: '', sort_order: sortOrder,
      };
      const { data, error } = await supabase.from('projects').insert(row).select().single();
      if (error) throw error;
      pushHistory({ undo: () => rawDeleteProject(data.id), redo: () => rawInsertProjectRow(data) });
      await loadAll();
    });
  }
  async function updateProject(id, patch) {
    const prev = projectsRef.current.find((p) => p.id === id);
    const prevPatch = {};
    Object.keys(patch).forEach((k) => { prevPatch[k] = prev ? prev[k] : null; });
    pushHistory({ undo: () => rawUpdateProject(id, prevPatch), redo: () => rawUpdateProject(id, patch) });
    await withSync(async () => { await rawUpdateProject(id, patch); await loadAll(); });
  }
  async function deleteProject(id) {
    const row = projectsRef.current.find((p) => p.id === id);
    if (row) pushHistory({ undo: () => rawInsertProjectRow(row), redo: () => rawDeleteProject(id) });
    await withSync(async () => { await rawDeleteProject(id); await loadAll(); });
  }

  // ---------- Charges / Surintendants ----------
  async function addCharge(nom) {
    pushHistory({
      undo: () => supabase.from('charges').delete().eq('nom', nom),
      redo: () => supabase.from('charges').insert({ nom }),
    });
    await withSync(async () => {
      const { error } = await supabase.from('charges').insert({ nom });
      if (error && error.code !== '23505') throw error;
      await loadAll();
    });
  }
  async function deleteCharge(nom) {
    pushHistory({
      undo: () => supabase.from('charges').insert({ nom }),
      redo: () => supabase.from('charges').delete().eq('nom', nom),
    });
    await withSync(async () => {
      const { error } = await supabase.from('charges').delete().eq('nom', nom);
      if (error) throw error;
      await loadAll();
    });
  }
  async function addSurintendant(nom) {
    pushHistory({
      undo: () => supabase.from('surintendants').delete().eq('nom', nom),
      redo: () => supabase.from('surintendants').insert({ nom }),
    });
    await withSync(async () => {
      const { error } = await supabase.from('surintendants').insert({ nom });
      if (error && error.code !== '23505') throw error;
      await loadAll();
    });
  }
  async function deleteSurintendant(nom) {
    pushHistory({
      undo: () => supabase.from('surintendants').insert({ nom }),
      redo: () => supabase.from('surintendants').delete().eq('nom', nom),
    });
    await withSync(async () => {
      const { error } = await supabase.from('surintendants').delete().eq('nom', nom);
      if (error) throw error;
      await loadAll();
    });
  }

  // ---------- Contremaitres ----------
  async function rawDeleteContremaitre(id) {
    const { error } = await supabase.from('contremaitres').delete().eq('id', id);
    if (error) throw error;
  }
  async function rawInsertContremaitreRow(row) {
    const { error } = await supabase.from('contremaitres').insert(row);
    if (error) throw error;
  }
  async function addContremaitre(nom) {
    await withSync(async () => {
      const sortOrder = contremaitresRef.current.length ? Math.max(...contremaitresRef.current.map((c) => c.sort_order || 0)) + 1 : 0;
      const { data, error } = await supabase.from('contremaitres').insert({ nom, sort_order: sortOrder }).select().single();
      if (error) throw error;
      pushHistory({ undo: () => rawDeleteContremaitre(data.id), redo: () => rawInsertContremaitreRow(data) });
      await loadAll();
    });
  }
  async function updateContremaitre(id, nom) {
    const prev = contremaitresRef.current.find((c) => c.id === id);
    const prevNom = prev ? prev.nom : '';
    pushHistory({
      undo: () => supabase.from('contremaitres').update({ nom: prevNom }).eq('id', id),
      redo: () => supabase.from('contremaitres').update({ nom }).eq('id', id),
    });
    await withSync(async () => {
      const { error } = await supabase.from('contremaitres').update({ nom }).eq('id', id);
      if (error) throw error;
      await loadAll();
    });
  }
  async function deleteContremaitre(id) {
    const row = contremaitresRef.current.find((c) => c.id === id);
    if (row) pushHistory({ undo: () => rawInsertContremaitreRow(row), redo: () => rawDeleteContremaitre(id) });
    await withSync(async () => { await rawDeleteContremaitre(id); await loadAll(); });
  }

  // ---------- Noms d'equipe par semaine ----------
  // Le nom affiche pour une semaine donnee est le dernier renommage dont
  // la semaine de depart est <= la semaine consultee (sinon le nom de base).
  function getContremaitreName(contremaitreId, weekStartIso) {
    const base = contremaitresRef.current.find((c) => c.id === contremaitreId);
    const applicable = nameOverridesRef.current
      .filter((o) => o.contremaitre_id === contremaitreId && o.week_start <= weekStartIso)
      .sort((a, b) => (a.week_start < b.week_start ? 1 : -1));
    if (applicable.length > 0) return applicable[0].nom;
    return base ? base.nom : '';
  }
  async function setContremaitreNameForWeek(contremaitreId, weekStartIso, nom) {
    await withSync(async () => {
      const { error } = await supabase
        .from('contremaitre_name_overrides')
        .upsert({ contremaitre_id: contremaitreId, week_start: weekStartIso, nom }, { onConflict: 'contremaitre_id,week_start' });
      if (error) throw error;
      await loadAll();
    });
  }

  // ---------- Assignments ----------
  function getAssignment(contremaitreId, dayIso) {
    const row = assignments.find((a) => a.contremaitre_id === contremaitreId && a.day === dayIso);
    return row ? row.project_id : null;
  }
  async function rawSetAssignment(contremaitreId, dayIso, projectId) {
    if (!projectId) {
      const { error } = await supabase.from('assignments').delete().eq('contremaitre_id', contremaitreId).eq('day', dayIso);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('assignments')
        .upsert({ contremaitre_id: contremaitreId, day: dayIso, project_id: projectId }, { onConflict: 'contremaitre_id,day' });
      if (error) throw error;
    }
  }
  async function setAssignment(contremaitreId, dayIso, projectId) {
    const prevProjectId = getAssignment(contremaitreId, dayIso);
    pushHistory({
      undo: () => rawSetAssignment(contremaitreId, dayIso, prevProjectId),
      redo: () => rawSetAssignment(contremaitreId, dayIso, projectId),
    });
    await withSync(async () => { await rawSetAssignment(contremaitreId, dayIso, projectId); await loadAll(); });
  }

  // ---------- Settings ----------
  async function updateSettings(patch) {
    await withSync(async () => {
      const { error } = await supabase.from('app_settings').update(patch).eq('id', 1);
      if (error) throw error;
      await loadAll();
    });
  }

  async function importPreviousWeekAssignments() {
    const currentMonday = new Date(settings.range_start + 'T00:00:00');
    const prevMonday = new Date(currentMonday);
    prevMonday.setDate(prevMonday.getDate() - 7);
    const currentDates = weekDates(currentMonday).map(dateKey);
    const prevDates = weekDates(prevMonday).map(dateKey);

    const { data: prevAssignments, error } = await supabase
      .from('assignments')
      .select('*')
      .in('day', prevDates);
    if (error) throw error;

    let imported = 0;
    await withSync(async () => {
      const rowsToUpsert = [];
      (prevAssignments || []).forEach((a) => {
        const offset = prevDates.indexOf(a.day);
        if (offset === -1) return;
        const targetDay = currentDates[offset];
        rowsToUpsert.push({ contremaitre_id: a.contremaitre_id, day: targetDay, project_id: a.project_id });
        imported++;
      });
      if (rowsToUpsert.length > 0) {
        const { error: upsertError } = await supabase
          .from('assignments')
          .upsert(rowsToUpsert, { onConflict: 'contremaitre_id,day' });
        if (upsertError) throw upsertError;
      }
      await loadAll();
    });
    return imported;
  }

  async function clearMeeting1Week() {
    await withSync(async () => {
      await Promise.all(
        projectsRef.current.map((p) =>
          supabase.from('projects').update({ statut: 'A venir', commentaire: '', date_valeur: null }).eq('id', p.id)
        )
      );
      await loadAll();
    });
  }

  async function clearMeeting2Week(weekIso) {
    const dates = weekDates(new Date(weekIso + 'T00:00:00')).map(dateKey);
    await withSync(async () => {
      const { error } = await supabase.from('assignments').delete().in('day', dates);
      if (error) throw error;
      await loadAll();
    });
  }

  // ---------- Notes hebdomadaires ----------
  async function switchNotesWeek(newWeekIso) {
    const oldWeekIso = settings.notes_week_start;
    if (newWeekIso === oldWeekIso) return;
    await withSync(async () => {
      await Promise.all(
        projectsRef.current.map((p) =>
          supabase.from('weekly_notes').upsert(
            { project_id: p.id, week_start: oldWeekIso, statut: p.statut, commentaire: p.commentaire, date_valeur: p.date_valeur },
            { onConflict: 'project_id,week_start' }
          )
        )
      );
      const { data: notes } = await supabase.from('weekly_notes').select('*').eq('week_start', newWeekIso);
      const noteByProject = new Map((notes || []).map((n) => [n.project_id, n]));
      await Promise.all(
        projectsRef.current.map((p) => {
          const note = noteByProject.get(p.id);
          const patch = note
            ? { statut: note.statut, commentaire: note.commentaire, date_valeur: note.date_valeur }
            : { statut: 'A venir', commentaire: '', date_valeur: null };
          return supabase.from('projects').update(patch).eq('id', p.id);
        })
      );
      const { error } = await supabase.from('app_settings').update({ notes_week_start: newWeekIso }).eq('id', 1);
      if (error) throw error;
      await loadAll();
    });
  }

  async function importPreviousWeek() {
    const current = new Date(settings.notes_week_start + 'T00:00:00');
    const prev = new Date(current);
    prev.setDate(prev.getDate() - 7);
    const prevIso = dateKey(prev);
    let imported = 0;
    await withSync(async () => {
      const { data: notes } = await supabase.from('weekly_notes').select('*').eq('week_start', prevIso);
      const noteByProject = new Map((notes || []).map((n) => [n.project_id, n]));
      await Promise.all(
        projectsRef.current.map((p) => {
          const note = noteByProject.get(p.id);
          if (!note) return null;
          imported++;
          return supabase.from('projects').update({ statut: note.statut, commentaire: note.commentaire, date_valeur: note.date_valeur }).eq('id', p.id);
        })
      );
      await loadAll();
    });
    return imported;
  }

  // ---------- Notes libres (commentaires "pastille", pas d'undo - conversationnel) ----------
  function commentsFor(projectId) {
    return comments.filter((c) => c.project_id === projectId);
  }
  async function addComment(projectId, body, author) {
    await withSync(async () => {
      const { error } = await supabase.from('project_comments').insert({ project_id: projectId, body, author: author || null });
      if (error) throw error;
      await loadAll();
    });
  }
  async function deleteComment(id) {
    await withSync(async () => {
      const { error } = await supabase.from('project_comments').delete().eq('id', id);
      if (error) throw error;
      await loadAll();
    });
  }

  return {
    projects, contremaitres, assignments, charges, surintendants, settings, loading, syncState,
    addProject, updateProject, deleteProject,
    addCharge, deleteCharge, addSurintendant, deleteSurintendant,
    addContremaitre, updateContremaitre, deleteContremaitre,
    getContremaitreName, setContremaitreNameForWeek,
    getAssignment, setAssignment,
    updateSettings, switchNotesWeek, importPreviousWeek, importPreviousWeekAssignments,
    clearMeeting1Week, clearMeeting2Week,
    commentsFor, addComment, deleteComment,
    undo, redo, canUndo: undoStack.length > 0, canRedo: redoStack.length > 0,
    reload: loadAll,
  };
}

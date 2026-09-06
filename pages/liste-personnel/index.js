import { useState, useEffect, useMemo } from 'react';
import Head from 'next/head';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const supabasePers = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { db: { schema: 'personnel' } });

const NAVY = '#14213D';
const RED = '#C41230';
const BG = '#EDEFF1';
const LOGO_PEP = '/_static/planification-hebdomadaire/logo-pep.png';
const TELEPHONE_PRINCIPAL = '450-661-5050';
const SANS_DEPARTEMENT = 'Sans département';

const btn = { fontFamily: 'inherit', background: NAVY, color: '#fff', border: 'none', borderRadius: 5, padding: '7px 14px', cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap' };
const btnGhost = { ...btn, background: '#fff', color: NAVY, border: `1px solid ${NAVY}` };
const btnDanger = { ...btn, background: RED };
const btnSmall = { padding: '4px 10px', fontSize: 12 };
const input = { padding: '7px 9px', borderRadius: 5, border: '1px solid #ccc', fontFamily: 'inherit', fontSize: 13, width: '100%', boxSizing: 'border-box' };
const td = { padding: '8px 12px', verticalAlign: 'middle', fontSize: 13, borderBottom: '1px solid #EDEFF1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const thDept = {
  textAlign: 'left', padding: '7px 12px', fontSize: 11, fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '0.05em', color: '#8a93a0',
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};

function Center({ children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '80vh', gap: 12, fontFamily: 'Calibri, sans-serif' }}>
      {children}
    </div>
  );
}
function Spinner() {
  return (
    <>
      <div style={{ border: '3px solid #ddd', borderTopColor: NAVY, borderRadius: '50%', width: 28, height: 28, animation: 'spin 0.8s linear infinite' }} />
      <style jsx>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}

function sansAccents(s) {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export default function ListePersonnel() {
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [session, setSession] = useState(null);
  const [peutModifier, setPeutModifier] = useState(false);

  const [departements, setDepartements] = useState([]);
  const [personnes, setPersonnes] = useState([]);
  const [recherche, setRecherche] = useState('');
  const [erreur, setErreur] = useState('');
  const [saving, setSaving] = useState(false);

  const [editPersonne, setEditPersonne] = useState(null);
  const [confirmSuppr, setConfirmSuppr] = useState(null);
  const [gererDepts, setGererDepts] = useState(false);
  const [fiche, setFiche] = useState(null);
  const [estPhone, setEstPhone] = useState(false);

  useEffect(() => {
    function mesurer() { setEstPhone(window.innerWidth < 760); }
    mesurer();
    window.addEventListener('resize', mesurer);
    return () => window.removeEventListener('resize', mesurer);
  }, []);

  // --- Accès : même mécanisme que Liste des projets --------------------
  useEffect(() => {
    (async () => {
      const { data: { session: s } } = await supabase.auth.getSession();
      if (!s) { setLoading(false); return; }
      setSession(s);

      const { data: appAccess } = await supabase
        .from('pep_user_apps').select('app_slug')
        .eq('user_id', s.user.id).eq('app_slug', 'liste-personnel').maybeSingle();

      const { data: roleRow } = await supabase
        .from('pep_user_roles').select('role').eq('user_id', s.user.id).maybeSingle();
      const estAdmin = roleRow?.role === 'admin';

      if (!appAccess && !estAdmin) { setDenied(true); setLoading(false); return; }

      const { data: featureRow } = await supabase
        .from('pep_user_features').select('feature_key')
        .eq('user_id', s.user.id).eq('app_slug', 'liste-personnel').eq('feature_key', 'modifier').maybeSingle();
      setPeutModifier(!!featureRow || estAdmin);

      await chargerTout();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function chargerTout() {
    const [resDepts, resPers] = await Promise.all([
      supabasePers.from('departements').select('*').order('ordre'),
      supabasePers.from('personnes').select('*').order('nom'),
    ]);
    if (resDepts.error || resPers.error) {
      setErreur("Impossible de charger la liste. Réessaie dans un instant, ou avertis William si ça persiste.");
      return;
    }
    setDepartements(resDepts.data || []);
    setPersonnes(resPers.data || []);
  }

  // --- Regroupement par département, dans l'ordre choisi ----------------
  const groupes = useMemo(() => {
    const terme = sansAccents(recherche.trim());
    const correspond = (p) => !terme || [p.nom, p.titre, p.courriel, p.cellulaire, p.poste]
      .some((v) => sansAccents(v).includes(terme));

    const parDept = new Map(departements.map((d) => [d.nom, []]));
    const sansDept = [];
    for (const p of personnes) {
      if (!correspond(p)) continue;
      if (p.departement && parDept.has(p.departement)) parDept.get(p.departement).push(p);
      else sansDept.push(p);
    }
    // Hors recherche, on garde les départements vides : sinon ils
    // disparaîtraient de l'écran et leur bouton "+" deviendrait inatteignable.
    // Pendant une recherche, au contraire, on ne montre que ce qui correspond.
    const liste = departements
      .map((d) => ({ dept: d.nom, membres: parDept.get(d.nom) || [] }))
      .filter((g) => g.membres.length > 0 || !terme);
    if (sansDept.length > 0) liste.push({ dept: SANS_DEPARTEMENT, membres: sansDept });
    return liste;
  }, [departements, personnes, recherche]);

  const nbAffiches = groupes.reduce((n, g) => n + g.membres.length, 0);

  // Largeurs fixes : sans ça, chaque département calcule ses colonnes selon
  // son propre contenu et les blocs ne s'alignent pas entre eux.
  const colonnes = estPhone
    ? ['46%', '30%', '24%']
    : peutModifier
      ? ['19%', '27%', '13%', '25%', '16%']
      : ['22%', '32%', '15%', '31%'];

  // --- Écritures --------------------------------------------------------
  async function sauvegarderPersonne(form) {
    setSaving(true);
    setErreur('');
    const payload = {
      nom: form.nom.trim(),
      titre: form.titre?.trim() || null,
      departement: form.departement || null,
      courriel: form.courriel?.trim() || null,
      cellulaire: form.cellulaire?.trim() || null,
      poste: form.poste?.trim() || null,
      actif: !!form.actif,
    };
    const { error } = form.id
      ? await supabasePers.from('personnes').update(payload).eq('id', form.id)
      : await supabasePers.from('personnes').insert(payload);
    setSaving(false);
    if (error) {
      setErreur(error.message.includes('personnes_nom_unique')
        ? `Une personne nommée « ${payload.nom} » existe déjà dans la liste.`
        : "L'enregistrement a échoué. Réessaie dans un instant.");
      return;
    }
    setEditPersonne(null);
    await chargerTout();
  }

  async function supprimerPersonne(id) {
    setSaving(true);
    const { error } = await supabasePers.from('personnes').delete().eq('id', id);
    setSaving(false);
    setConfirmSuppr(null);
    if (error) { setErreur("La suppression a échoué."); return; }
    await chargerTout();
  }

  // --- Rendu ------------------------------------------------------------
  if (loading) return <Center><Spinner /><div>Chargement…</div></Center>;
  if (!session) return (
    <Center>
      <div style={{ fontSize: 15 }}>Tu dois être connecté au Toolbox PEP pour voir cette page.</div>
      <a href="/" style={{ ...btn, textDecoration: 'none' }}>Retour au Toolbox PEP</a>
    </Center>
  );
  if (denied) return (
    <Center>
      <div style={{ fontSize: 15 }}>Ton compte existe, mais tu n&apos;as pas accès à Liste de personnel.</div>
      <div style={{ fontSize: 13, color: '#666' }}>Demande à William de cocher l&apos;accès dans le panneau d&apos;administration.</div>
      <a href="/" style={{ ...btn, textDecoration: 'none' }}>Retour au Toolbox PEP</a>
    </Center>
  );

  return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: 'Calibri, sans-serif', color: NAVY }}>
      <Head><title>Liste de personnel - Toolbox PEP</title></Head>

      <header style={{ background: NAVY, borderTop: `4px solid ${RED}`, padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <img src={LOGO_PEP} alt="Les Entreprises PEP" style={{ height: 46, width: 'auto' }} />
          <div>
            <div style={{ color: '#fff', fontSize: 18, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em' }}>Liste de personnel</div>
            <div style={{ color: '#9AA5C0', fontSize: 12.5 }}>Les Entreprises PEP2000 inc.</div>
          </div>
        </div>
        <a href="/" style={{ ...btnGhost, textDecoration: 'none', display: 'inline-block' }}>&#8592; Retour au Toolbox PEP</a>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 16px 60px' }}>

        {erreur && (
          <div style={{ background: '#fff', border: `1px solid ${RED}`, borderLeft: `3px solid ${RED}`, color: RED, padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>
            {erreur}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
          <div style={{ fontSize: 13, color: '#5c6478' }}>
            {nbAffiches} personne{nbAffiches > 1 ? 's' : ''}
            {recherche.trim() ? ` sur ${personnes.length}` : ''}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              placeholder="Rechercher un nom, un titre, un courriel…"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              style={{ ...input, width: 280 }}
            />
            {peutModifier && (
              <>
                <button style={btnGhost} onClick={() => setGererDepts(true)}>Départements</button>
                <button style={btn} onClick={() => setEditPersonne({ nom: '', titre: '', departement: departements[0]?.nom || '', courriel: '', cellulaire: '', poste: '', actif: true })}>
                  + Nouvelle personne
                </button>
              </>
            )}
          </div>
        </div>

        <div style={{ marginBottom: 16, padding: '10px 14px', background: '#FFF6E5', border: '1px solid #E4A11B', borderLeft: '3px solid #E4A11B', fontSize: 13, color: '#7a5000' }}>
          Tout numéro indiqué avec un poste est accessible via le numéro principal : <strong>{TELEPHONE_PRINCIPAL}</strong> + le numéro de poste.
        </div>

        {!peutModifier && (
          <div style={{ marginBottom: 16, fontSize: 12.5, color: '#5c6478' }}>
            Lecture seule. Pour pouvoir modifier la liste, demande à William d&apos;activer la permission « modifier ».
          </div>
        )}

        {groupes.length === 0 && (
          <div style={{ background: '#fff', border: '1px solid #D7DBE0', padding: 24, fontSize: 13.5, color: '#5c6478' }}>
            Aucune personne ne correspond à cette recherche.
          </div>
        )}

        {groupes.map((groupe) => (
          <div key={groupe.dept} style={{ marginBottom: 20 }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
              fontWeight: 700, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.06em',
              color: NAVY, background: '#E8ECF0', padding: '6px 10px 6px 14px', borderLeft: `3px solid ${RED}`,
            }}>
              <span>
                {groupe.dept} <span style={{ color: '#8a93a0', fontWeight: 600 }}>({groupe.membres.length})</span>
              </span>
              {peutModifier && (
                <button
                  type="button"
                  title={`Ajouter une personne dans ${groupe.dept}`}
                  onClick={() => setEditPersonne({
                    nom: '', titre: '',
                    // Le département est pré-rempli avec celui de l'en-tête cliqué.
                    // "Sans département" n'est pas un vrai département : on laisse
                    // le champ vide plutôt que d'inventer une valeur.
                    departement: groupe.dept === SANS_DEPARTEMENT ? '' : groupe.dept,
                    courriel: '', cellulaire: '', poste: '', actif: true,
                  })}
                  style={{
                    ...btn, padding: '3px 11px', fontSize: 16, lineHeight: 1.2,
                    fontWeight: 700, flexShrink: 0,
                  }}
                >
                  +
                </button>
              )}
            </div>
            <div style={{ background: '#fff', border: '1px solid #D7DBE0', borderTop: 'none' }}>
              {groupe.membres.length === 0 ? (
                <div style={{ padding: '14px', fontSize: 12.5, color: '#8a93a0' }}>
                  Aucune personne dans ce département. Utilise le « + » ci-dessus pour en ajouter une.
                </div>
              ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <colgroup>
                  {colonnes.map((largeur, i) => <col key={i} style={{ width: largeur }} />)}
                </colgroup>
                <thead>
                  <tr style={{ background: '#F7F8F9', borderBottom: '1px solid #D7DBE0' }}>
                    <th style={thDept}>Nom</th>
                    {!estPhone && <th style={thDept}>Titre</th>}
                    <th style={thDept}>Cellulaire</th>
                    {!estPhone && <th style={thDept}>Courriel</th>}
                    {estPhone && <th style={{ ...thDept, textAlign: 'center' }}>Info</th>}
                    {peutModifier && !estPhone && <th style={thDept} />}
                  </tr>
                </thead>
                <tbody>
                  {groupe.membres.map((p, i) => (
                    <tr key={p.id} style={{ background: i % 2 === 0 ? '#fff' : '#FAFBFC' }}>
                      <td style={{ ...td, fontWeight: 600 }}>
                        {p.nom}
                        {!p.actif && <span style={{ color: '#8a93a0', fontWeight: 400 }}> (inactif)</span>}
                      </td>
                      {!estPhone && <td style={{ ...td, color: '#495260' }} title={p.titre || ''}>{p.titre || '—'}</td>}
                      <td style={td}>
                        {p.cellulaire
                          ? <a href={`tel:${p.cellulaire}`} style={{ color: NAVY, textDecoration: 'none', fontWeight: 600 }}>{p.cellulaire}</a>
                          : p.poste ? <span style={{ color: '#8a93a0' }}>Poste {p.poste}</span> : '—'}
                      </td>
                      {!estPhone && (
                        <td style={td}>
                          {p.courriel
                            ? <a href={`mailto:${p.courriel}`} title={p.courriel} style={{ color: '#2E86C1', textDecoration: 'none' }}>{p.courriel}</a>
                            : <span style={{ color: '#c0c7d0' }}>—</span>}
                        </td>
                      )}
                      {estPhone && (
                        <td style={{ ...td, textAlign: 'center' }}>
                          <button style={{ ...btnGhost, ...btnSmall }} onClick={() => setFiche(p)}>Voir</button>
                        </td>
                      )}
                      {peutModifier && !estPhone && (
                        <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button style={{ ...btnGhost, ...btnSmall, marginRight: 6 }} onClick={() => setEditPersonne({ ...p })}>Modifier</button>
                          <button style={{ ...btnDanger, ...btnSmall }} onClick={() => setConfirmSuppr(p)}>Suppr.</button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              )}
            </div>
          </div>
        ))}
      </main>

      {fiche && (
        <FichePersonne
          personne={fiche}
          peutModifier={peutModifier}
          onModifier={() => { setEditPersonne({ ...fiche }); setFiche(null); }}
          onFermer={() => setFiche(null)}
        />
      )}

      {editPersonne && (
        <ModalPersonne
          personne={editPersonne}
          departements={departements}
          onSave={sauvegarderPersonne}
          onCancel={() => setEditPersonne(null)}
          saving={saving}
        />
      )}

      {gererDepts && (
        <ModalDepartements
          departements={departements}
          personnes={personnes}
          onFerme={async () => { setGererDepts(false); await chargerTout(); }}
          setErreur={setErreur}
        />
      )}

      {confirmSuppr && (
        <Modal titre="Supprimer cette personne?">
          <p style={{ fontSize: 14, marginTop: 0 }}>
            <strong>{confirmSuppr.nom}</strong> sera retirée définitivement de la liste.
          </p>
          <p style={{ fontSize: 12.5, color: '#5c6478' }}>
            Si la personne a simplement quitté, il vaut mieux la passer à « inactif » : elle reste
            consultable et son historique n&apos;est pas perdu.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
            <button style={btnGhost} onClick={() => setConfirmSuppr(null)}>Annuler</button>
            <button style={btnDanger} disabled={saving} onClick={() => supprimerPersonne(confirmSuppr.id)}>
              {saving ? 'Suppression…' : 'Supprimer'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ titre, children, large }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 8, padding: 22, width: '100%', maxWidth: large ? 620 : 460, maxHeight: '88vh', overflowY: 'auto', fontFamily: 'Calibri, sans-serif' }}>
        <h3 style={{ marginTop: 0, color: NAVY }}>{titre}</h3>
        {children}
      </div>
    </div>
  );
}

function Champ({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#5c6478', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

function FichePersonne({ personne, peutModifier, onModifier, onFermer }) {
  return (
    <div onClick={onFermer} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', width: '100%', maxWidth: 460, padding: 22, borderTopLeftRadius: 10, borderTopRightRadius: 10, fontFamily: 'Calibri, sans-serif' }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: NAVY }}>{personne.nom}</div>
        {personne.titre && <div style={{ fontSize: 13, color: '#6b7480', marginBottom: 16 }}>{personne.titre}</div>}

        {personne.cellulaire && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: '#8a93a0', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Cellulaire</div>
            <a href={`tel:${personne.cellulaire}`} style={{ fontSize: 17, fontWeight: 600, color: NAVY, textDecoration: 'none' }}>{personne.cellulaire}</a>
          </div>
        )}
        {personne.poste && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: '#8a93a0', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Poste</div>
            <a href={`tel:${TELEPHONE_PRINCIPAL},${personne.poste}`} style={{ fontSize: 15, color: '#495260', textDecoration: 'none' }}>
              {TELEPHONE_PRINCIPAL} p.{personne.poste}
            </a>
          </div>
        )}
        {personne.courriel && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: '#8a93a0', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Courriel</div>
            <a href={`mailto:${personne.courriel}`} style={{ fontSize: 14, color: '#2E86C1', textDecoration: 'none', wordBreak: 'break-all' }}>{personne.courriel}</a>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          {peutModifier && <button style={{ ...btnGhost, flex: 1 }} onClick={onModifier}>Modifier</button>}
          <button style={{ ...btn, flex: 1 }} onClick={onFermer}>Fermer</button>
        </div>
      </div>
    </div>
  );
}

function ModalPersonne({ personne, departements, onSave, onCancel, saving }) {
  const [form, setForm] = useState(personne);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const nomValide = form.nom?.trim().length > 0;

  return (
    <Modal titre={form.id ? `Modifier ${personne.nom}` : 'Nouvelle personne'}>
      <Champ label="Nom">
        <input style={input} value={form.nom || ''} onChange={(e) => set('nom', e.target.value)} placeholder="Prénom Nom" />
      </Champ>
      <Champ label="Titre">
        <input style={input} value={form.titre || ''} onChange={(e) => set('titre', e.target.value)} placeholder="ex. Chargé de projets" />
      </Champ>
      <Champ label="Département">
        <select style={input} value={form.departement || ''} onChange={(e) => set('departement', e.target.value)}>
          <option value="">— Sans département —</option>
          {departements.map((d) => <option key={d.nom} value={d.nom}>{d.nom}</option>)}
        </select>
      </Champ>
      <Champ label="Courriel">
        <input style={input} value={form.courriel || ''} onChange={(e) => set('courriel', e.target.value)} placeholder="prenom@pep2000.com" />
      </Champ>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Champ label="Cellulaire">
            <input style={input} value={form.cellulaire || ''} onChange={(e) => set('cellulaire', e.target.value)} placeholder="514-000-0000" />
          </Champ>
        </div>
        <div style={{ width: 110 }}>
          <Champ label="Poste">
            <input style={input} value={form.poste || ''} onChange={(e) => set('poste', e.target.value)} placeholder="000" />
          </Champ>
        </div>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, marginTop: 4, cursor: 'pointer' }}>
        <input type="checkbox" checked={!!form.actif} onChange={(e) => set('actif', e.target.checked)} style={{ accentColor: NAVY }} />
        Personne active
      </label>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
        <button style={btnGhost} onClick={onCancel}>Annuler</button>
        <button style={btn} disabled={saving || !nomValide} onClick={() => onSave(form)}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </Modal>
  );
}

function ModalDepartements({ departements, personnes, onFerme, setErreur }) {
  const [liste, setListe] = useState(departements);
  const [nouveau, setNouveau] = useState('');
  const [occupe, setOccupe] = useState(false);

  const compte = (nom) => personnes.filter((p) => p.departement === nom).length;

  async function ajouter() {
    const nom = nouveau.trim();
    if (!nom) return;
    setOccupe(true);
    const ordre = (liste.length ? Math.max(...liste.map((d) => d.ordre)) : 0) + 10;
    const { error } = await supabasePers.from('departements').insert({ nom, ordre });
    setOccupe(false);
    if (error) { setErreur("Ce département existe déjà, ou l'ajout a échoué."); return; }
    setListe([...liste, { nom, ordre }]);
    setNouveau('');
  }

  async function deplacer(index, direction) {
    const cible = index + direction;
    if (cible < 0 || cible >= liste.length) return;
    const copie = [...liste];
    [copie[index], copie[cible]] = [copie[cible], copie[index]];
    // On réécrit tous les ordres pour rester cohérent même après plusieurs
    // déplacements successifs.
    const renumerotee = copie.map((d, i) => ({ ...d, ordre: (i + 1) * 10 }));
    setListe(renumerotee);
    setOccupe(true);
    await Promise.all(renumerotee.map((d) =>
      supabasePers.from('departements').update({ ordre: d.ordre }).eq('nom', d.nom)));
    setOccupe(false);
  }

  async function supprimer(nom) {
    if (compte(nom) > 0) {
      setErreur(`Impossible de supprimer « ${nom} » : des personnes y sont encore rattachées.`);
      return;
    }
    setOccupe(true);
    const { error } = await supabasePers.from('departements').delete().eq('nom', nom);
    setOccupe(false);
    if (error) { setErreur("La suppression du département a échoué."); return; }
    setListe(liste.filter((d) => d.nom !== nom));
  }

  return (
    <Modal titre="Départements" large>
      <p style={{ fontSize: 12.5, color: '#5c6478', marginTop: 0 }}>
        L&apos;ordre ci-dessous est celui utilisé pour afficher la liste. Un département ne peut
        être supprimé que s&apos;il ne contient plus personne.
      </p>

      {liste.map((d, i) => (
        <div key={d.nom} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid #EDEFF1' }}>
          <div style={{ flex: 1, fontSize: 13.5 }}>
            {d.nom} <span style={{ color: '#8a93a0' }}>({compte(d.nom)})</span>
          </div>
          <button style={{ ...btnGhost, ...btnSmall }} disabled={occupe || i === 0} onClick={() => deplacer(i, -1)}>&#8593;</button>
          <button style={{ ...btnGhost, ...btnSmall }} disabled={occupe || i === liste.length - 1} onClick={() => deplacer(i, 1)}>&#8595;</button>
          <button style={{ ...btnDanger, ...btnSmall }} disabled={occupe} onClick={() => supprimer(d.nom)}>Suppr.</button>
        </div>
      ))}

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <input style={input} value={nouveau} onChange={(e) => setNouveau(e.target.value)} placeholder="Nom d'un nouveau département" />
        <button style={btn} disabled={occupe || !nouveau.trim()} onClick={ajouter}>Ajouter</button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
        <button style={btn} onClick={onFerme}>Fermer</button>
      </div>
    </Modal>
  );
}
